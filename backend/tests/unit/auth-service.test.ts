/**
 * Unit tests for {@link DefaultAuthService} (Task 3.3 / R1.1, R1.2, R1.4,
 * R1.6).
 *
 * The tests use:
 * - A Map-backed in-memory {@link AppUserRepository} fake so we can
 *   inspect the `failed_login_count` / `locked_until` mutations the
 *   service performs.
 * - A Map-backed in-memory {@link SessionStore} fake so we can verify
 *   that successful logins create sessions and that logout destroys
 *   them, without spinning up Redis.
 * - Real argon2 hashing — we *want* the verify path to exercise the
 *   real implementation so timing-safe behaviour is observed end-to-end.
 *   We pass low-cost argon2 parameters (timeCost: 2, memoryCost: 1024,
 *   parallelism: 1) so each hash is fast enough to run in a unit suite.
 *
 * Design refs:
 * - design.md → Components and Interfaces → Auth_Service
 * - design.md → Auth_Service → Aturan kunci akun
 * - design.md → Error Handling → Auth
 *
 * Requirements: R1.1, R1.2, R1.4, R1.6.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import argon2 from 'argon2';
import type { AuthSession } from '@leads-generator/shared';

import {
  DefaultAuthService,
  FAILED_ATTEMPT_THRESHOLD,
  LOCKOUT_DURATION_MINUTES,
} from '../../src/auth/auth-service.js';
import type { SessionStore } from '../../src/auth/session-store.js';
import type {
  AppUserRepository,
  AppUserRow,
} from '../../src/auth/user-repository.js';

/**
 * Cheap argon2 parameters tuned for unit-test latency. We're not
 * testing argon2 itself — only that the AuthService wires verify in
 * correctly — so the production-grade timeCost/memoryCost defaults
 * would needlessly slow this suite. timeCost must be ≥ 2 per argon2's
 * own assertion.
 */
const TEST_HASH_OPTS = {
  timeCost: 2,
  memoryCost: 1024,
  parallelism: 1,
} as const;

/**
 * Hash a plaintext with the cheap test options so individual cases
 * stay fast (< ~30ms each).
 */
async function hashTestPassword(plain: string): Promise<string> {
  return argon2.hash(plain, TEST_HASH_OPTS);
}

/**
 * Map-backed AppUserRepository that records every mutation. Tests
 * inspect both the row state AND the spies (e.g. to confirm
 * `incrementFailedAttempts` was/wasn't called on a given branch).
 */
class FakeUserRepository implements AppUserRepository {
  // The `db` field on the real class is private so we don't reproduce
  // it here — duck-typing via the `implements` clause is enough for
  // the AuthService to use this fake.
  public readonly users = new Map<string, AppUserRow>();
  public readonly findByEmail = vi.fn(this.findByEmailImpl.bind(this));
  public readonly incrementFailedAttempts = vi.fn(
    this.incrementFailedAttemptsImpl.bind(this),
  );
  public readonly resetFailedAttempts = vi.fn(
    this.resetFailedAttemptsImpl.bind(this),
  );
  public readonly setLockedUntil = vi.fn(this.setLockedUntilImpl.bind(this));
  public readonly create = vi.fn(this.createImpl.bind(this));

  /** Insert a pre-built row into the in-memory store. */
  seed(row: AppUserRow): void {
    this.users.set(row.id, row);
  }

  private async findByEmailImpl(email: string): Promise<AppUserRow | null> {
    const target = email.toLowerCase();
    for (const row of this.users.values()) {
      if (row.email.toLowerCase() === target) return row;
    }
    return null;
  }

  private async incrementFailedAttemptsImpl(userId: string): Promise<number> {
    const row = this.users.get(userId);
    if (!row) {
      throw new Error(`user not found: ${userId}`);
    }
    row.failed_login_count += 1;
    return row.failed_login_count;
  }

  private async resetFailedAttemptsImpl(userId: string): Promise<void> {
    const row = this.users.get(userId);
    if (!row) return;
    row.failed_login_count = 0;
    row.locked_until = null;
  }

  private async setLockedUntilImpl(
    userId: string,
    lockedUntil: Date | null,
  ): Promise<void> {
    const row = this.users.get(userId);
    if (!row) return;
    row.locked_until = lockedUntil;
  }

  private async createImpl(input: {
    email: string;
    passwordHash: string;
  }): Promise<AppUserRow> {
    const row: AppUserRow = {
      id: `user-${this.users.size + 1}`,
      email: input.email,
      password_hash: input.passwordHash,
      failed_login_count: 0,
      locked_until: null,
    };
    this.users.set(row.id, row);
    return row;
  }
}

/**
 * Map-backed SessionStore. We don't drive the idle-timeout semantics
 * here (those are covered by the session-store suite); we just need
 * a place for {@link DefaultAuthService.login} to mint sessions.
 */
class FakeSessionStore implements SessionStore {
  public readonly sessions = new Map<string, AuthSession>();
  private counter = 0;
  public readonly create = vi.fn(this.createImpl.bind(this));
  public readonly get = vi.fn(this.getImpl.bind(this));
  public readonly touch = vi.fn(this.touchImpl.bind(this));
  public readonly destroy = vi.fn(this.destroyImpl.bind(this));
  private now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  setNow(now: () => Date): void {
    this.now = now;
  }

  private async createImpl(
    session: Omit<AuthSession, 'createdAt' | 'lastActivityAt'>,
  ): Promise<{ sessionId: string; session: AuthSession }> {
    this.counter += 1;
    const sessionId = `sid-${this.counter}`;
    const now = this.now();
    const full: AuthSession = {
      ...session,
      createdAt: now,
      lastActivityAt: now,
    };
    this.sessions.set(sessionId, full);
    return { sessionId, session: full };
  }

  private async getImpl(sessionId: string): Promise<AuthSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  private async touchImpl(sessionId: string): Promise<AuthSession | null> {
    const existing = this.sessions.get(sessionId);
    if (!existing) return null;
    const refreshed: AuthSession = { ...existing, lastActivityAt: this.now() };
    this.sessions.set(sessionId, refreshed);
    return refreshed;
  }

  private async destroyImpl(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

/**
 * Build a fresh AuthService + its dependencies, optionally seeded with
 * a registered user. Uses a controllable clock so tests that exercise
 * the lockout window can step through it deterministically.
 */
async function makeService(opts: {
  password?: string;
  startedAt?: Date;
} = {}) {
  const password = opts.password ?? 'correct-horse-battery-staple';
  const passwordHash = await hashTestPassword(password);
  const repo = new FakeUserRepository();
  const userId = 'user-1';
  repo.seed({
    id: userId,
    email: 'alice@example.com',
    password_hash: passwordHash,
    failed_login_count: 0,
    locked_until: null,
  });

  let currentTime = opts.startedAt ?? new Date('2024-01-01T00:00:00.000Z');
  const now = (): Date => new Date(currentTime.getTime());
  const advance = (ms: number): void => {
    currentTime = new Date(currentTime.getTime() + ms);
  };

  const sessions = new FakeSessionStore(now);
  const service = new DefaultAuthService(repo, sessions, now);

  return { repo, sessions, service, password, userId, now, advance };
}

beforeEach(() => {
  // Each test is hermetic — nothing to reset globally. The lazy dummy
  // hash inside auth-service.ts is intentionally cached across tests
  // (it's just a timing decoy), so we don't reset it.
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DefaultAuthService.login (R1.1)', () => {
  it('creates a session, resets the failed counter, and returns ok on valid credentials', async () => {
    const { service, sessions, repo, password, userId } = await makeService();

    // Pre-condition: simulate a prior failed attempt so we can verify
    // resetFailedAttempts actually fires (the seed value of 0 wouldn't
    // catch a buggy implementation that simply skips the reset).
    repo.users.get(userId)!.failed_login_count = 2;

    const result = await service.login(
      { email: 'alice@example.com', password },
      'member',
      'team-1',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sessionId).toMatch(/^sid-/);
      expect(result.value.session.userId).toBe(userId);
      expect(result.value.session.teamId).toBe('team-1');
      expect(result.value.session.role).toBe('member');
    }
    expect(sessions.create).toHaveBeenCalledTimes(1);
    expect(repo.resetFailedAttempts).toHaveBeenCalledWith(userId);
    // After reset, the in-memory row should be back to a clean state.
    expect(repo.users.get(userId)!.failed_login_count).toBe(0);
    expect(repo.users.get(userId)!.locked_until).toBeNull();
  });
});

describe('DefaultAuthService.login (R1.2 — generic error messages)', () => {
  it('returns a generic AUTH error and bumps the counter on wrong password', async () => {
    const { service, repo, userId } = await makeService();

    const result = await service.login(
      { email: 'alice@example.com', password: 'WRONG-password' },
      'member',
      'team-1',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTH');
      // The message must NOT mention "email" or "password" specifically.
      expect(result.error.code === 'AUTH' && result.error.message).toBe(
        'Invalid email or password',
      );
    }
    expect(repo.incrementFailedAttempts).toHaveBeenCalledWith(userId);
    expect(repo.users.get(userId)!.failed_login_count).toBe(1);
  });

  it('returns the SAME generic AUTH error shape when the email is unknown', async () => {
    const { service, repo } = await makeService();

    const result = await service.login(
      { email: 'nobody@example.com', password: 'whatever' },
      'member',
      'team-1',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTH');
      expect(result.error.code === 'AUTH' && result.error.message).toBe(
        'Invalid email or password',
      );
    }
    // Critical: we do NOT touch the failed counter for unknown emails
    // (there's no row to attribute the failure to).
    expect(repo.incrementFailedAttempts).not.toHaveBeenCalled();
  });
});

describe('DefaultAuthService.login (R1.6 — account lockout)', () => {
  it('locks the account on the 5th consecutive failure', async () => {
    const { service, repo, userId, now } = await makeService();

    for (let i = 0; i < FAILED_ATTEMPT_THRESHOLD - 1; i += 1) {
      const r = await service.login(
        { email: 'alice@example.com', password: 'wrong' },
        'member',
        'team-1',
      );
      expect(r.ok).toBe(false);
    }
    // Up to (but not at) the threshold, no lockout.
    expect(repo.users.get(userId)!.locked_until).toBeNull();
    expect(repo.setLockedUntil).not.toHaveBeenCalled();

    // The 5th failure crosses the threshold and engages the lock.
    const fifth = await service.login(
      { email: 'alice@example.com', password: 'wrong' },
      'member',
      'team-1',
    );
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) {
      expect(fifth.error.code).toBe('AUTH');
      // Generic message — same shape as any other failure.
      expect(fifth.error.code === 'AUTH' && fifth.error.message).toBe(
        'Invalid email or password',
      );
    }

    // setLockedUntil must have been called once with now+15m.
    expect(repo.setLockedUntil).toHaveBeenCalledTimes(1);
    const [calledUserId, lockedUntil] = repo.setLockedUntil.mock.calls[0]!;
    expect(calledUserId).toBe(userId);
    expect(lockedUntil).toBeInstanceOf(Date);
    const expected = new Date(
      now().getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
    );
    expect((lockedUntil as Date).getTime()).toBe(expected.getTime());
    expect(repo.users.get(userId)!.locked_until).toEqual(expected);
  });

  it('rejects every login during the lockout window WITHOUT calling argon2.verify (even with the correct password)', async () => {
    const { service, repo, userId, now, password } = await makeService();

    // Fast-forward by setting locked_until directly so we don't have
    // to step through 5 real failures here (the previous test already
    // proved the engagement path).
    const lockedUntil = new Date(
      now().getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
    );
    repo.users.get(userId)!.locked_until = lockedUntil;

    // Spy on argon2.verify to confirm the password is never even
    // checked while the account is locked.
    const verifySpy = vi.spyOn(argon2, 'verify');

    const result = await service.login(
      { email: 'alice@example.com', password }, // CORRECT password
      'member',
      'team-1',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTH');
      // The lockout branch surfaces a distinct (still neutral wrt
      // email/password) message — design.md explicitly allows that
      // because the user already knows the account exists.
      expect(result.error.code === 'AUTH' && result.error.message).toBe(
        'Account temporarily locked',
      );
    }
    expect(verifySpy).not.toHaveBeenCalled();
    // Counter is NOT bumped during a lockout — the lock itself is the
    // throttle.
    expect(repo.incrementFailedAttempts).not.toHaveBeenCalled();
  });

  it('allows login once the lockout window has elapsed', async () => {
    const { service, repo, userId, now, advance, password } = await makeService();

    // Place the account in a locked state that has already expired.
    const expiredLock = new Date(now().getTime() - 60 * 1000); // 1 min ago
    repo.users.get(userId)!.locked_until = expiredLock;
    repo.users.get(userId)!.failed_login_count = FAILED_ATTEMPT_THRESHOLD;

    // Move the clock forward a little extra to be unambiguous.
    advance(10_000);

    const result = await service.login(
      { email: 'alice@example.com', password },
      'member',
      'team-1',
    );

    expect(result.ok).toBe(true);
    // Successful login after expired lock resets state per R1.1.
    expect(repo.users.get(userId)!.failed_login_count).toBe(0);
    expect(repo.users.get(userId)!.locked_until).toBeNull();
  });
});

describe('DefaultAuthService.logout (R1.4)', () => {
  it('destroys the session record', async () => {
    const { service, sessions, password } = await makeService();

    const login = await service.login(
      { email: 'alice@example.com', password },
      'member',
      'team-1',
    );
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    const sessionId = login.value.sessionId;

    // Pre-condition: session is present.
    expect(sessions.sessions.has(sessionId)).toBe(true);

    await service.logout(sessionId);

    expect(sessions.destroy).toHaveBeenCalledWith(sessionId);
    expect(sessions.sessions.has(sessionId)).toBe(false);
  });
});
