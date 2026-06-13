/**
 * Team_Service — invite/accept/role-change entrypoints for Tasks 5.1 and
 * 5.3 (R2.1, R2.2, R2.3, R2.9, R2.10).
 *
 * Implements:
 * - `invite` (Task 5.1): validated invitation creation flow described in
 *   design.md → Components and Interfaces → Team_Service ("Validasi
 *   undangan").
 * - `acceptInvitation` (Task 5.3): links a User to a Team by token,
 *   activating the membership iff the invitation has not yet expired
 *   (R2.2, R2.10).
 * - `changeRole` (Task 5.3): updates a membership's role and invalidates
 *   the cached effective-role entry so the new role takes effect on the
 *   User's next authorized request (R2.3, design.md → Alur Permintaan
 *   Berbasis Peran → Catatan R2.3).
 *
 * Validation pipeline ordering for `invite` (per design.md):
 * 1. Email must be syntactically valid AND ≤ 254 characters.
 * 2. No active/pending membership for that email in this Team
 *    (`MembershipRepository.findActiveOrPendingByEmail`).
 * 3. No active/pending invitation for that email in this Team
 *    (`InvitationRepository.findActiveOrPendingByEmail`).
 * 4. Generate a high-entropy `token` and `expiresAt = now + 168h`.
 * 5. Persist via `InvitationRepository.insert`.
 *
 * Errors mapped to {@link AppError}:
 * - `VALIDATION`    — invalid email format or length > 254 chars.
 * - `CONFLICT`      — duplicate active/pending membership/invitation, or
 *                     accepting an invitation whose status is not `pending`.
 * - `NOT_FOUND`     — `acceptInvitation` token unknown.
 * - `AUTHORIZATION` — `acceptInvitation` after `expiresAt` (R2.10).
 *
 * Token generation uses `randomBytes(32)` (256 bits of entropy)
 * encoded as base64url so the token is URL-safe for invitation links.
 */

import { randomBytes } from 'node:crypto';

import {
  err,
  ok,
  type Invitation,
  type Membership,
  type Result,
  type Role,
} from '@leads-generator/shared';

import type { CachedEffectiveRoleResolver } from '../auth/effective-role.js';
import type { MembershipRepository } from '../auth/membership-repository.js';
import type { InvitationRepository } from './invitation-repository.js';

/**
 * Invitation lifetime in hours per R2.1 — invitations are valid for 168
 * hours (7 days) from `createdAt`.
 */
export const INVITATION_TTL_HOURS = 168;

/**
 * Maximum allowed email length per R2.1 / R2.9 (matches the `citext`
 * column constraint `length(email) <= 254` enforced at the DB layer).
 */
export const MAX_EMAIL_LENGTH = 254;

/**
 * Conservative single-line email shape: at least one non-whitespace,
 * non-`@` character on either side of an `@` and a `.` somewhere in the
 * domain. This deliberately mirrors the simple regex specified by the
 * task brief — full RFC 5322 compliance is intentionally out of scope.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Generate a 32-byte random invitation token encoded as URL-safe base64.
 * 256 bits of entropy makes brute-force guessing infeasible.
 */
function generateInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Input for {@link TeamService.acceptInvitation}.
 *
 * The `userId` is supplied by the caller because user identification /
 * registration happens upstream of this service — Team_Service only owns
 * the Team-scoped membership transition once the User is known.
 */
export interface AcceptInvitationInput {
  /** Plaintext invitation token issued by {@link TeamService.invite}. */
  token: string;
  /** Identifier of the already-authenticated/registered User. */
  userId: string;
}

/**
 * Domain service for Team membership operations.
 *
 * Construction takes the two repositories the invite flow depends on, an
 * optional cached effective-role resolver so role-change calls can purge
 * stale cache entries (R2.3), and a `now()` factory so tests can drive
 * the clock deterministically.
 */
export class TeamService {
  private readonly invitations: InvitationRepository;
  private readonly memberships: MembershipRepository;
  private readonly effectiveRoleCache: CachedEffectiveRoleResolver | null;
  private readonly now: () => Date;

  constructor(
    invitations: InvitationRepository,
    memberships: MembershipRepository,
    effectiveRoleCache: CachedEffectiveRoleResolver | null = null,
    now: () => Date = () => new Date(),
  ) {
    this.invitations = invitations;
    this.memberships = memberships;
    this.effectiveRoleCache = effectiveRoleCache;
    this.now = now;
  }

  /**
   * Create a `pending` invitation for `email` to join `teamId` as
   * `role`. Implements R2.1 and R2.9.
   *
   * Validation collects every applicable email-shape error into a single
   * `VALIDATION` AppError so the caller can surface all messages in one
   * response. Conflict checks (membership / existing invitation) short
   * circuit — when either fires the function returns immediately with a
   * `CONFLICT` error and does NOT create a new invitation.
   *
   * On success, returns the persisted {@link Invitation} (without
   * `token` — see `InvitationRepository` notes; the token is sent out of
   * band by the email/notification layer).
   */
  async invite(teamId: string, email: string, role: Role): Promise<Result<Invitation>> {
    // Step 1 — email format & length validation. Collect all messages so
    // a single VALIDATION error can surface every applicable rule.
    const messages: string[] = [];
    if (email.length > MAX_EMAIL_LENGTH) {
      messages.push(`email tidak boleh melebihi ${MAX_EMAIL_LENGTH} karakter`);
    }
    if (!EMAIL_REGEX.test(email)) {
      messages.push('email tidak valid');
    }
    if (messages.length > 0) {
      return err({ code: 'VALIDATION', messages });
    }

    // Step 2 — duplicate membership check (R2.9).
    const existingMembership = await this.memberships.findActiveOrPendingByEmail(
      teamId,
      email,
    );
    if (existingMembership !== null) {
      return err({
        code: 'CONFLICT',
        message: 'sudah memiliki keanggotaan Team yang aktif atau tertunda',
      });
    }

    // Step 3 — duplicate invitation check (R2.9).
    const existingInvitation = await this.invitations.findActiveOrPendingByEmail(
      teamId,
      email,
    );
    if (existingInvitation !== null) {
      return err({
        code: 'CONFLICT',
        message: 'sudah memiliki undangan Team yang aktif atau tertunda',
      });
    }

    // Step 4 — generate token and compute expiry (R2.1).
    const token = generateInvitationToken();
    const createdAt = this.now();
    const expiresAt = new Date(
      createdAt.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000,
    );

    // Step 5 — persist.
    const invitation = await this.invitations.insert({
      teamId,
      email,
      role,
      token,
      expiresAt,
    });
    return ok(invitation);
  }

  /**
   * Activate the invitation identified by `token` for `userId`,
   * upserting the corresponding `user_membership` row to `active` with
   * the role specified on the invitation.
   *
   * Implements R2.2 and R2.10:
   * - Token unknown → `NOT_FOUND`.
   * - Invitation status is not `pending` (already accepted or marked
   *   `expired`) → `CONFLICT`.
   * - Invitation has expired (`now > expiresAt`) → best-effort flip the
   *   row's status to `expired` and return an `AUTHORIZATION` error
   *   carrying the "Invitation expired" message (R2.10).
   * - Otherwise: upsert the membership as `active`, mark the invitation
   *   `active` (R2.2), and return the resulting membership.
   *
   * The expiry-status update is best-effort because the AppError must be
   * returned even if the lifecycle write happens to fail. We deliberately
   * do not roll back; subsequent reads will still observe the row's
   * `expiresAt` and re-evaluate the same way.
   */
  async acceptInvitation(input: AcceptInvitationInput): Promise<Result<Membership>> {
    const invitation = await this.invitations.findByToken(input.token);
    if (invitation === null) {
      return err({ code: 'NOT_FOUND', message: 'invitation tidak ditemukan' });
    }

    if (invitation.status !== 'pending') {
      return err({
        code: 'CONFLICT',
        message: 'undangan sudah tidak dapat digunakan',
      });
    }

    const currentTime = this.now();
    if (currentTime.getTime() > invitation.expiresAt.getTime()) {
      // Best-effort: mark the invitation as expired so future lookups
      // short-circuit on the status check above. Errors here are
      // intentionally swallowed — we still return the AUTHORIZATION
      // error per R2.10.
      try {
        await this.invitations.setStatus(invitation.id, 'expired');
      } catch {
        // Swallow: caller still sees the authoritative AUTHORIZATION
        // result. The next acceptance attempt will re-check `expiresAt`.
      }
      return err({ code: 'AUTHORIZATION', message: 'Invitation expired' });
    }

    const membership: Membership = {
      teamId: invitation.teamId,
      userId: input.userId,
      role: invitation.role,
      status: 'active',
    };
    await this.memberships.upsert(membership);
    await this.invitations.setStatus(invitation.id, 'active');
    return ok(membership);
  }

  /**
   * Change the role of an existing membership in `teamId` for `userId`.
   *
   * Per R2.3 the new role takes effect on the User's next authorized
   * request because the RBAC Guard re-resolves the effective role on
   * every request (see `effective-role.ts`). When a
   * {@link CachedEffectiveRoleResolver} was supplied at construction we
   * also invalidate the cached `(userId, teamId)` entry so any in-flight
   * cache TTL is bypassed and the next request reads the new role
   * immediately.
   */
  async changeRole(teamId: string, userId: string, role: Role): Promise<Result<void>> {
    await this.memberships.updateRole(teamId, userId, role);
    if (this.effectiveRoleCache !== null) {
      this.effectiveRoleCache.invalidate(userId, teamId);
    }
    return ok(undefined);
  }
}
