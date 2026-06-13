/**
 * Auth_Service — login / logout / lockout (Task 3.3).
 *
 * Implements R1.1, R1.2, R1.4, R1.6:
 *
 * - **R1.1** On valid credentials, create an authenticated session via
 *   the {@link SessionStore} and reset `failed_login_count` to 0
 *   (and clear any stale `locked_until`).
 * - **R1.2** On invalid credentials, return a *generic* AUTH error that
 *   never reveals whether the email or the password was wrong. The same
 *   error shape is returned whether the email is unknown or the
 *   password is incorrect.
 * - **R1.4** {@link DefaultAuthService.logout} simply destroys the
 *   server-side session record so subsequent `validateSession` calls
 *   return null (the request pipeline then redirects to /login).
 * - **R1.6** After {@link FAILED_ATTEMPT_THRESHOLD} consecutive failed
 *   logins, lock the account for {@link LOCKOUT_DURATION_MINUTES}
 *   minutes. While locked, every login attempt — even with the correct
 *   password — fails with the generic AUTH error. argon2.verify is NOT
 *   called during the lockout window.
 *
 * Timing-attack hardening: when {@link AppUserRepository.findByEmail}
 * returns `null` we still run `argon2.verify` against a fixed dummy
 * hash with the user-supplied password before returning the generic
 * error. This means the wall-clock time for "no such user" is
 * indistinguishable from "wrong password", so an attacker cannot probe
 * which emails are registered by measuring response time.
 *
 * Sliding-window simplification (R1.6): the design talks about a
 * rolling 15-minute window of failures. We implement that without an
 * extra event log by relying on the two columns already on `app_user`:
 *
 *   1. Each failed attempt increments `failed_login_count`.
 *   2. If the new count reaches {@link FAILED_ATTEMPT_THRESHOLD}, we
 *      set `locked_until = now + LOCKOUT_DURATION_MINUTES`.
 *   3. When a *new* login attempt arrives with the lock having
 *      expired, the lockout branch lets it through. On a successful
 *      login the counter is reset (R1.1); on a fresh failure after the
 *      lock expired the counter naturally restarts the window.
 *
 * The `role` and `teamId` parameters into {@link DefaultAuthService.login}
 * are required because the {@link AuthSession} ties a User to a
 * specific (Team, Role) pair. Real call sites resolve the active
 * membership before calling `login` (Task 18.2 wires that in); this
 * service accepts them as inputs so it remains decoupled from the
 * membership repository for the time being.
 *
 * Design refs:
 * - design.md → Components and Interfaces → Auth_Service
 * - design.md → Auth_Service → Aturan kunci akun (R1.1, R1.2, R1.4, R1.6)
 * - design.md → Error Handling → Auth
 *
 * Requirements: R1.1, R1.2, R1.4, R1.6.
 */

import argon2 from 'argon2';
import {
  ok,
  err,
  type Result,
  type AuthSession,
  type Role,
} from '@leads-generator/shared';

import type { SessionStore } from './session-store.js';
import type { AppUserRepository, AppUserRow } from './user-repository.js';

/**
 * Threshold of consecutive failed login attempts that triggers a lock
 * (R1.6). The 5th failure flips the account into the locked state.
 */
export const FAILED_ATTEMPT_THRESHOLD = 5;

/**
 * Duration of the lockout window once {@link FAILED_ATTEMPT_THRESHOLD}
 * is crossed (R1.6). 15 minutes per design.md.
 */
export const LOCKOUT_DURATION_MINUTES = 15;

/**
 * Sliding-failure window per design.md (R1.6). We don't materialise the
 * window as a separate table; see the module docstring for how the
 * `failed_login_count` + `locked_until` columns model it implicitly.
 * Exported as a named constant so future refactors that introduce a
 * proper event log can keep the same number in one place.
 */
export const LOCKOUT_WINDOW_MINUTES = 15;

/**
 * Generic error message returned for every authentication failure
 * branch (R1.2). MUST NOT mention email vs password vs lock state in
 * any way an attacker could distinguish.
 */
const GENERIC_AUTH_ERROR_MESSAGE = 'Invalid email or password';

/**
 * Distinct user-facing message for the locked-account branch (R1.6).
 * The design says we should "indicate the account is temporarily
 * locked" — that surface is allowed because the user already knows
 * their account exists. R1.2 only forbids leaking whether the credential
 * mismatch was on the email or the password.
 */
const ACCOUNT_LOCKED_MESSAGE = 'Account temporarily locked';

/**
 * Plaintext used to seed {@link DUMMY_HASH}. The actual value is
 * irrelevant — it just has to be a non-empty string we never accept as
 * a real password. We keep it readable (`__no_user__`) so memory dumps
 * during debugging are obvious.
 */
const DUMMY_PASSWORD = '__no_user__';

/**
 * Pre-computed argon2 hash of {@link DUMMY_PASSWORD}, used as a
 * timing-safe stand-in when {@link AppUserRepository.findByEmail}
 * returns null. We hash on first use (lazy) to avoid blocking module
 * load. Subsequent calls reuse the same string so the verify path runs
 * with realistic argon2 parameters.
 *
 * The hash carries the parameters in its encoded format, so
 * `argon2.verify` against this hash will perform a real argon2id
 * computation regardless of the verifying password.
 */
let DUMMY_HASH: string | null = null;

/**
 * Lazily initialise {@link DUMMY_HASH} on first failed-login attempt.
 *
 * argon2 hashing is a Promise; doing it lazily means we only pay the
 * cost when we actually need a timing decoy. Concurrent callers that
 * race here will all `await` the same in-flight promise, so we don't
 * end up with multiple hashes (and even if we did, any of them would
 * be a valid decoy).
 */
let dummyHashInFlight: Promise<string> | null = null;
async function getDummyHash(): Promise<string> {
  if (DUMMY_HASH !== null) return DUMMY_HASH;
  if (dummyHashInFlight !== null) return dummyHashInFlight;
  dummyHashInFlight = argon2.hash(DUMMY_PASSWORD).then((h) => {
    DUMMY_HASH = h;
    return h;
  });
  return dummyHashInFlight;
}

/**
 * Inputs to {@link AuthService.login}. Mirrors the design's
 * `Credentials` shape.
 */
export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Auth_Service login/logout contract.
 */
export interface AuthService {
  /**
   * Verify credentials and create a session, or return an AUTH error.
   *
   * `role` and `teamId` describe which (Team, Role) pair the new
   * session is bound to. They are resolved by the caller from the
   * user's `user_membership` rows.
   */
  login(
    input: LoginInput,
    role: Role,
    teamId: string,
  ): Promise<Result<{ sessionId: string; session: AuthSession }>>;

  /**
   * Destroy the session record so subsequent {@link validateSession}
   * calls return null (R1.4).
   */
  logout(sessionId: string): Promise<void>;
}

/**
 * Default {@link AuthService} implementation backed by an
 * {@link AppUserRepository} and a {@link SessionStore}.
 *
 * Constructor takes an optional `now` factory so tests can drive the
 * clock deterministically (e.g. to verify the lockout window opens and
 * closes at the right wall-times).
 */
export class DefaultAuthService implements AuthService {
  private readonly users: AppUserRepository;
  private readonly sessions: SessionStore;
  private readonly now: () => Date;

  constructor(
    users: AppUserRepository,
    sessions: SessionStore,
    now: () => Date = () => new Date(),
  ) {
    this.users = users;
    this.sessions = sessions;
    this.now = now;
  }

  async login(
    input: LoginInput,
    role: Role,
    teamId: string,
  ): Promise<Result<{ sessionId: string; session: AuthSession }>> {
    const user = await this.users.findByEmail(input.email);

    // Branch A: no such email. Run a decoy argon2.verify so wall-clock
    // time is indistinguishable from the "wrong password" branch
    // (R1.2). Ignore the boolean result.
    if (user === null) {
      const dummyHash = await getDummyHash();
      try {
        await argon2.verify(dummyHash, input.password);
      } catch {
        // Swallow — we never want this branch to leak information about
        // the failure mode, and a malformed dummy hash should not 500
        // the request.
      }
      return err({ code: 'AUTH', message: GENERIC_AUTH_ERROR_MESSAGE });
    }

    // Branch B: account is currently locked. Reject WITHOUT verifying
    // the password (R1.6) so a brute-force attacker cannot use the
    // lockout window as an oracle for argon2 timing.
    if (isLocked(user, this.now())) {
      return err({ code: 'AUTH', message: ACCOUNT_LOCKED_MESSAGE });
    }

    // Branch C: real verify against the user's stored hash.
    let valid = false;
    try {
      valid = await argon2.verify(user.password_hash, input.password);
    } catch {
      // Treat verify exceptions (corrupt hash, incompatible params,
      // etc.) as a credential mismatch. We do NOT count this as a
      // lockout-eligible failure — there's nothing the end user can do
      // about a server-side hash format problem, and incrementing the
      // counter could falsely lock the account.
      return err({ code: 'AUTH', message: GENERIC_AUTH_ERROR_MESSAGE });
    }

    if (!valid) {
      // Failed login: bump counter, possibly engage lockout (R1.6),
      // return generic error (R1.2).
      const newCount = await this.users.incrementFailedAttempts(user.id);
      if (newCount >= FAILED_ATTEMPT_THRESHOLD) {
        const lockedUntil = new Date(
          this.now().getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
        );
        await this.users.setLockedUntil(user.id, lockedUntil);
      }
      return err({ code: 'AUTH', message: GENERIC_AUTH_ERROR_MESSAGE });
    }

    // Branch D: success. Reset counter (and clear any stale lock) per
    // R1.1, then mint a fresh session.
    await this.users.resetFailedAttempts(user.id);
    const created = await this.sessions.create({
      userId: user.id,
      teamId,
      role,
    });
    return ok(created);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.destroy(sessionId);
  }
}

/**
 * `true` when `user.locked_until` is set and still in the future
 * relative to `now`. Tolerates string timestamps in case the row came
 * from a JSON round-trip.
 */
function isLocked(user: AppUserRow, now: Date): boolean {
  if (user.locked_until === null) return false;
  const lockedUntil =
    user.locked_until instanceof Date
      ? user.locked_until
      : new Date(user.locked_until);
  return lockedUntil.getTime() > now.getTime();
}
