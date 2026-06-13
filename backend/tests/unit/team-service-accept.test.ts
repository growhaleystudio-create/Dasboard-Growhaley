/**
 * Unit tests for {@link TeamService.acceptInvitation} and
 * {@link TeamService.changeRole} (Task 5.3, R2.2, R2.3, R2.10).
 *
 * Covers:
 * 1. acceptInvitation — valid `pending` token, not yet expired:
 *    - membership upserted as `active` with the invitation's role,
 *    - invitation flipped to `active`,
 *    - returns ok(membership).
 * 2. acceptInvitation — token unknown → NOT_FOUND, no writes.
 * 3. acceptInvitation — invitation past `expiresAt`:
 *    - invitation marked `expired` (best-effort),
 *    - membership NOT touched,
 *    - returns AUTHORIZATION error 'Invitation expired' (R2.10).
 * 4. acceptInvitation — invitation already `active` → CONFLICT, no writes.
 * 5. changeRole — updates membership role; if a CachedEffectiveRoleResolver
 *    is provided, `invalidate(userId, teamId)` is invoked so R2.3's
 *    "next authorized request" guarantee is preserved.
 *
 * Repositories and the cache resolver are stubbed via Vitest mocks
 * because the unit under test is the service-level orchestration logic;
 * SQL behaviour is exercised separately in integration tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Invitation } from '@leads-generator/shared';

import { CachedEffectiveRoleResolver } from '../../src/auth/effective-role.js';
import { MembershipRepository } from '../../src/auth/membership-repository.js';
import { InvitationRepository } from '../../src/team/invitation-repository.js';
import {
  INVITATION_TTL_HOURS,
  TeamService,
} from '../../src/team/team-service.js';

/** Fixed wall-clock used by every test for deterministic decisions. */
const FIXED_NOW = new Date('2024-06-01T12:00:00.000Z');

const TEAM_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const TOKEN = 'token-fixture';

/**
 * Build a {@link TeamService} backed by Vitest spies so each test can
 * tailor the repository return values without touching a real database.
 */
function buildHarness(overrides: {
  findInvitation?: Invitation | null;
  cache?: CachedEffectiveRoleResolver | null;
} = {}) {
  const invitationsFindByToken = vi
    .fn()
    .mockResolvedValue(overrides.findInvitation ?? null);
  const invitationsSetStatus = vi.fn().mockResolvedValue(undefined);

  const membershipsUpsert = vi.fn().mockResolvedValue(undefined);
  const membershipsUpdateRole = vi.fn().mockResolvedValue(undefined);

  const invitations = {
    findByToken: invitationsFindByToken,
    setStatus: invitationsSetStatus,
    insert: vi.fn(),
    findActiveOrPendingByEmail: vi.fn(),
  } as unknown as InvitationRepository;

  const memberships = {
    upsert: membershipsUpsert,
    updateRole: membershipsUpdateRole,
    findActive: vi.fn(),
    findActiveOrPendingByEmail: vi.fn(),
    listForUser: vi.fn(),
    setStatus: vi.fn(),
  } as unknown as MembershipRepository;

  const cache = overrides.cache ?? null;

  const service = new TeamService(invitations, memberships, cache, () => FIXED_NOW);

  return {
    service,
    invitationsFindByToken,
    invitationsSetStatus,
    membershipsUpsert,
    membershipsUpdateRole,
  };
}

/** Build a `pending` invitation that expires 1ms after `FIXED_NOW`. */
function pendingInvitation(role: 'admin' | 'member' | 'viewer' = 'member'): Invitation {
  const createdAt = new Date(FIXED_NOW.getTime() - 60_000);
  const expiresAt = new Date(
    createdAt.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000,
  );
  return {
    id: 'invite-1',
    teamId: TEAM_ID,
    email: 'recipient@example.com',
    role,
    status: 'pending',
    createdAt,
    expiresAt,
  };
}

describe('TeamService.acceptInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('activates membership and invitation when the token is valid and not expired', async () => {
    const invitation = pendingInvitation('member');
    const harness = buildHarness({ findInvitation: invitation });

    const result = await harness.service.acceptInvitation({
      token: TOKEN,
      userId: USER_ID,
    });

    expect(harness.invitationsFindByToken).toHaveBeenCalledWith(TOKEN);

    // Membership upserted with role from invitation and status = 'active'.
    expect(harness.membershipsUpsert).toHaveBeenCalledTimes(1);
    expect(harness.membershipsUpsert).toHaveBeenCalledWith({
      teamId: invitation.teamId,
      userId: USER_ID,
      role: invitation.role,
      status: 'active',
    });

    // Invitation lifecycle flipped to 'active'.
    expect(harness.invitationsSetStatus).toHaveBeenCalledTimes(1);
    expect(harness.invitationsSetStatus).toHaveBeenCalledWith(invitation.id, 'active');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        teamId: invitation.teamId,
        userId: USER_ID,
        role: invitation.role,
        status: 'active',
      });
    }
  });

  it('returns NOT_FOUND when the token is unknown', async () => {
    const harness = buildHarness({ findInvitation: null });

    const result = await harness.service.acceptInvitation({
      token: TOKEN,
      userId: USER_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }

    // No mutations on unknown tokens.
    expect(harness.membershipsUpsert).not.toHaveBeenCalled();
    expect(harness.invitationsSetStatus).not.toHaveBeenCalled();
  });

  it('marks the invitation expired and returns AUTHORIZATION when past expiresAt (R2.10)', async () => {
    const expired: Invitation = {
      ...pendingInvitation(),
      // Force expiry strictly before FIXED_NOW.
      expiresAt: new Date(FIXED_NOW.getTime() - 1),
    };
    const harness = buildHarness({ findInvitation: expired });

    const result = await harness.service.acceptInvitation({
      token: TOKEN,
      userId: USER_ID,
    });

    // Best-effort lifecycle update to 'expired'.
    expect(harness.invitationsSetStatus).toHaveBeenCalledTimes(1);
    expect(harness.invitationsSetStatus).toHaveBeenCalledWith(expired.id, 'expired');

    // Membership must NOT be created when the invitation has expired.
    expect(harness.membershipsUpsert).not.toHaveBeenCalled();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTHORIZATION');
      if (result.error.code === 'AUTHORIZATION') {
        expect(result.error.message).toBe('Invitation expired');
      }
    }
  });

  it('returns CONFLICT when the invitation status is already active', async () => {
    const alreadyAccepted: Invitation = {
      ...pendingInvitation(),
      status: 'active',
    };
    const harness = buildHarness({ findInvitation: alreadyAccepted });

    const result = await harness.service.acceptInvitation({
      token: TOKEN,
      userId: USER_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }

    // No writes on a non-pending invitation.
    expect(harness.membershipsUpsert).not.toHaveBeenCalled();
    expect(harness.invitationsSetStatus).not.toHaveBeenCalled();
  });
});

describe('TeamService.changeRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the membership role and invalidates the cache when a resolver is provided (R2.3)', async () => {
    const cache = new CachedEffectiveRoleResolver({
      get: vi.fn().mockResolvedValue(null),
    });
    const invalidateSpy = vi.spyOn(cache, 'invalidate');

    const harness = buildHarness({ cache });

    const result = await harness.service.changeRole(TEAM_ID, USER_ID, 'admin');

    expect(harness.membershipsUpdateRole).toHaveBeenCalledTimes(1);
    expect(harness.membershipsUpdateRole).toHaveBeenCalledWith(TEAM_ID, USER_ID, 'admin');

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith(USER_ID, TEAM_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it('updates the membership role without touching a cache when none is provided', async () => {
    const harness = buildHarness({ cache: null });

    const result = await harness.service.changeRole(TEAM_ID, USER_ID, 'viewer');

    expect(harness.membershipsUpdateRole).toHaveBeenCalledWith(TEAM_ID, USER_ID, 'viewer');
    expect(result.ok).toBe(true);
  });
});
