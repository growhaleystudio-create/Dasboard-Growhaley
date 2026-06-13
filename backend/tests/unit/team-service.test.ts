/**
 * Unit tests for {@link TeamService.invite} (Task 5.1, R2.1, R2.9).
 *
 * Covers the five behaviours required by the task brief:
 * 1. Valid email + role + no existing membership/invitation → ok with
 *    a fresh `pending` invitation; `expiresAt = now + 168h`.
 * 2. Email length > 254 chars → VALIDATION error.
 * 3. Malformed email → VALIDATION error.
 * 4. Active or pending membership already exists → CONFLICT error.
 * 5. Active or pending invitation already exists → CONFLICT error.
 *
 * Repositories are stubbed via Vitest mocks because the unit under test
 * is the service-level validation/orchestration logic; SQL behaviour is
 * exercised separately in integration tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Invitation, Membership } from '@leads-generator/shared';

import { MembershipRepository } from '../../src/auth/membership-repository.js';
import { InvitationRepository } from '../../src/team/invitation-repository.js';
import {
  INVITATION_TTL_HOURS,
  MAX_EMAIL_LENGTH,
  TeamService,
} from '../../src/team/team-service.js';

/** Fixed wall-clock used by every test for deterministic `expiresAt`. */
const FIXED_NOW = new Date('2024-01-02T03:04:05.000Z');

const TEAM_ID = '11111111-1111-1111-1111-111111111111';
const VALID_EMAIL = 'recipient@example.com';

/**
 * Build a {@link TeamService} backed by Vitest spies so each test can
 * tailor the repository return values without touching a real database.
 */
function buildService(overrides: {
  findMembership?: Membership | null;
  findInvitation?: Invitation | null;
} = {}) {
  const insertedInvitation: Invitation = {
    id: 'invite-1',
    teamId: TEAM_ID,
    email: VALID_EMAIL,
    role: 'member',
    status: 'pending',
    createdAt: FIXED_NOW,
    expiresAt: new Date(
      FIXED_NOW.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000,
    ),
  };

  const invitationsInsert = vi.fn().mockResolvedValue(insertedInvitation);
  const invitationsFindByEmail = vi
    .fn()
    .mockResolvedValue(overrides.findInvitation ?? null);
  const membershipsFindByEmail = vi
    .fn()
    .mockResolvedValue(overrides.findMembership ?? null);

  // We cast to the concrete repository types so the service constructor
  // accepts our spies; only the methods exercised by `invite` are
  // populated, which is sufficient for the unit under test.
  const invitations = {
    insert: invitationsInsert,
    findActiveOrPendingByEmail: invitationsFindByEmail,
    findByToken: vi.fn(),
    setStatus: vi.fn(),
  } as unknown as InvitationRepository;

  const memberships = {
    findActiveOrPendingByEmail: membershipsFindByEmail,
  } as unknown as MembershipRepository;

  const service = new TeamService(invitations, memberships, null, () => FIXED_NOW);

  return {
    service,
    invitationsInsert,
    invitationsFindByEmail,
    membershipsFindByEmail,
    insertedInvitation,
  };
}

describe('TeamService.invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a pending invitation with expiresAt = now + 168h on success', async () => {
    const harness = buildService();

    const result = await harness.service.invite(TEAM_ID, VALID_EMAIL, 'member');

    // Pre-checks should both have been consulted.
    expect(harness.membershipsFindByEmail).toHaveBeenCalledWith(TEAM_ID, VALID_EMAIL);
    expect(harness.invitationsFindByEmail).toHaveBeenCalledWith(TEAM_ID, VALID_EMAIL);

    // `insert` must be called with the right team/email/role and an
    // `expiresAt` exactly 168h after the fixed `now`.
    expect(harness.invitationsInsert).toHaveBeenCalledTimes(1);
    const insertArgs = harness.invitationsInsert.mock.calls[0]![0] as {
      teamId: string;
      email: string;
      role: 'admin' | 'member' | 'viewer';
      token: string;
      expiresAt: Date;
    };
    expect(insertArgs.teamId).toBe(TEAM_ID);
    expect(insertArgs.email).toBe(VALID_EMAIL);
    expect(insertArgs.role).toBe('member');
    expect(typeof insertArgs.token).toBe('string');
    // base64url 32-byte token → 43 chars (no padding).
    expect(insertArgs.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(insertArgs.token.length).toBeGreaterThanOrEqual(43);
    const expectedExpiresAt = new Date(
      FIXED_NOW.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000,
    );
    expect(insertArgs.expiresAt.toISOString()).toBe(expectedExpiresAt.toISOString());

    // Result should be the invitation returned by the repository.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(harness.insertedInvitation);
      expect(result.value.status).toBe('pending');
      expect(result.value.expiresAt.toISOString()).toBe(expectedExpiresAt.toISOString());
    }
  });

  it('returns VALIDATION when the email exceeds 254 characters', async () => {
    const harness = buildService();
    // Build an email whose total length is 255 chars (1 over the limit)
    // while still matching the regex (so the only failing rule is length).
    const longLocal = 'a'.repeat(MAX_EMAIL_LENGTH + 1 - '@example.com'.length);
    const tooLong = `${longLocal}@example.com`;
    expect(tooLong.length).toBe(MAX_EMAIL_LENGTH + 1);

    const result = await harness.service.invite(TEAM_ID, tooLong, 'member');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      if (result.error.code === 'VALIDATION') {
        expect(
          result.error.messages.some((m) =>
            m.includes(`${MAX_EMAIL_LENGTH} karakter`),
          ),
        ).toBe(true);
      }
    }

    // Pre-checks must be skipped when validation already failed.
    expect(harness.membershipsFindByEmail).not.toHaveBeenCalled();
    expect(harness.invitationsFindByEmail).not.toHaveBeenCalled();
    expect(harness.invitationsInsert).not.toHaveBeenCalled();
  });

  it('returns VALIDATION when the email is malformed', async () => {
    const harness = buildService();

    const result = await harness.service.invite(TEAM_ID, 'not-an-email', 'member');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      if (result.error.code === 'VALIDATION') {
        expect(result.error.messages).toContain('email tidak valid');
      }
    }

    expect(harness.membershipsFindByEmail).not.toHaveBeenCalled();
    expect(harness.invitationsFindByEmail).not.toHaveBeenCalled();
    expect(harness.invitationsInsert).not.toHaveBeenCalled();
  });

  it('returns CONFLICT when an active membership already exists for the email', async () => {
    const existingMembership: Membership = {
      teamId: TEAM_ID,
      userId: 'user-1',
      role: 'member',
      status: 'active',
    };
    const harness = buildService({ findMembership: existingMembership });

    const result = await harness.service.invite(TEAM_ID, VALID_EMAIL, 'member');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }

    expect(harness.membershipsFindByEmail).toHaveBeenCalledWith(TEAM_ID, VALID_EMAIL);
    // Once the membership conflict fires, we should short-circuit.
    expect(harness.invitationsFindByEmail).not.toHaveBeenCalled();
    expect(harness.invitationsInsert).not.toHaveBeenCalled();
  });

  it('returns CONFLICT when a pending invitation already exists for the email', async () => {
    const existingInvitation: Invitation = {
      id: 'invite-existing',
      teamId: TEAM_ID,
      email: VALID_EMAIL,
      role: 'viewer',
      status: 'pending',
      createdAt: new Date(FIXED_NOW.getTime() - 60_000),
      expiresAt: new Date(
        FIXED_NOW.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000,
      ),
    };
    const harness = buildService({ findInvitation: existingInvitation });

    const result = await harness.service.invite(TEAM_ID, VALID_EMAIL, 'member');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }

    expect(harness.membershipsFindByEmail).toHaveBeenCalledWith(TEAM_ID, VALID_EMAIL);
    expect(harness.invitationsFindByEmail).toHaveBeenCalledWith(TEAM_ID, VALID_EMAIL);
    expect(harness.invitationsInsert).not.toHaveBeenCalled();
  });
});
