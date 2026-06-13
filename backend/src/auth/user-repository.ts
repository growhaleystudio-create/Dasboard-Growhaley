/**
 * Tenant-agnostic repository for `app_user` rows.
 *
 * `app_user` holds credentials and lockout state (`failed_login_count`,
 * `locked_until`) that are independent of any single Team — a User can
 * belong to many Teams via `user_membership`. Because of that, this
 * repository lives in the `auth/` module rather than the team-scoped
 * `repository/` layer: the Tenant Guard rule (R2.8) does not apply to
 * the credential record itself, only to the team-scoped data the user
 * accesses after login.
 *
 * Design refs:
 * - design.md → Auth_Service → Aturan kunci akun (R1.6)
 * - design.md → Data Models → `app_user` schema
 * - design.md → Security → Autentikasi
 *
 * Requirements: R1.1, R1.2, R1.4, R1.6.
 *
 * SQL conventions:
 * - All queries are parameterized via `$1`, `$2`, … — never interpolate.
 * - Email lookups use the `citext` column type, so equality is
 *   case-insensitive at the database level. We still pass the raw
 *   string the user typed; PostgreSQL handles the case-folding.
 */

import { query, type DbExecutor } from '../repository/types.js';

/**
 * Row shape returned by `SELECT … FROM app_user` for the credential /
 * lockout columns this repository needs.
 *
 * Timestamps may arrive as `Date` (the `pg` default) or `string` (after
 * a JSON round-trip in tests); callers / mappers coerce as needed.
 */
export interface AppUserRow {
  id: string;
  email: string;
  password_hash: string;
  failed_login_count: number;
  locked_until: Date | string | null;
}

/**
 * Input shape for {@link AppUserRepository.create}.
 *
 * Used only by tests / first-admin signup flows — the full user
 * registration UX (R2.2) builds on top of this primitive.
 */
export interface CreateAppUserInput {
  email: string;
  passwordHash: string;
}

/**
 * Repository for the `app_user` table. Surfaces only the operations the
 * Auth_Service needs:
 *
 * - {@link findByEmail} — look up a user during login.
 * - {@link incrementFailedAttempts} — bump the lockout counter on a
 *   failed credential check (R1.6).
 * - {@link resetFailedAttempts} — reset the counter (and clear any
 *   prior lock) after a successful login (R1.1).
 * - {@link setLockedUntil} — apply / clear the lockout window (R1.6).
 * - {@link create} — insert a new credential row (tests / signup).
 */
export class AppUserRepository {
  constructor(private readonly db: DbExecutor) {}

  /**
   * Look up a user by email. The `email` column is `citext`, so the
   * comparison is case-insensitive without requiring `LOWER(...)` on
   * either side. Returns `null` when no row matches.
   */
  async findByEmail(email: string): Promise<AppUserRow | null> {
    const rows = await query<AppUserRow>(
      this.db,
      `SELECT id, email, password_hash, failed_login_count, locked_until
         FROM app_user
        WHERE email = $1
        LIMIT 1`,
      [email],
    );
    if (rows.length === 0) return null;
    return rows[0] ?? null;
  }

  /**
   * Look up a user by id. Used by authenticated routes that already have
   * the session's user id and need presentation-safe account metadata.
   */
  async findById(userId: string): Promise<AppUserRow | null> {
    const rows = await query<AppUserRow>(
      this.db,
      `SELECT id, email, password_hash, failed_login_count, locked_until
         FROM app_user
        WHERE id = $1
        LIMIT 1`,
      [userId],
    );
    if (rows.length === 0) return null;
    return rows[0] ?? null;
  }

  /**
   * Atomically increment `failed_login_count` for a given user and
   * return the new count. Used after a credential check fails so
   * Auth_Service can decide whether the failure crossed the lockout
   * threshold (R1.6).
   *
   * The increment runs server-side via `failed_login_count + 1` in a
   * single UPDATE so concurrent failed attempts can't race past each
   * other.
   *
   * Throws when the user id does not exist; callers should never call
   * this with an unknown id.
   */
  async incrementFailedAttempts(userId: string): Promise<number> {
    const rows = await query<{ failed_login_count: number }>(
      this.db,
      `UPDATE app_user
          SET failed_login_count = failed_login_count + 1
        WHERE id = $1
        RETURNING failed_login_count`,
      [userId],
    );
    if (rows.length === 0) {
      throw new Error(`AppUserRepository.incrementFailedAttempts: user not found: ${userId}`);
    }
    const row = rows[0]!;
    return row.failed_login_count;
  }

  /**
   * Reset `failed_login_count` to zero AND clear `locked_until`. Called
   * on successful login (R1.1) so the user starts fresh.
   *
   * No-op if the user id is unknown — we don't want a missing user to
   * surface as an internal error in the post-login path; the credential
   * check would have failed earlier.
   */
  async resetFailedAttempts(userId: string): Promise<void> {
    await query(
      this.db,
      `UPDATE app_user
          SET failed_login_count = 0,
              locked_until = NULL
        WHERE id = $1`,
      [userId],
    );
  }

  /**
   * Set or clear `locked_until` for a user (R1.6). Pass `null` to
   * release the lock manually; usually Auth_Service simply lets the
   * timestamp pass and resets on the next successful login.
   */
  async setLockedUntil(userId: string, lockedUntil: Date | null): Promise<void> {
    await query(
      this.db,
      `UPDATE app_user
          SET locked_until = $2
        WHERE id = $1`,
      [userId, lockedUntil],
    );
  }

  /**
   * Insert a new credential row and return the persisted shape. The
   * caller is responsible for hashing the password with argon2 before
   * passing it in — this method never sees plaintext.
   */
  async create(input: CreateAppUserInput): Promise<AppUserRow> {
    const rows = await query<AppUserRow>(
      this.db,
      `INSERT INTO app_user (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, password_hash, failed_login_count, locked_until`,
      [input.email, input.passwordHash],
    );
    const row = rows[0];
    if (!row) {
      throw new Error('AppUserRepository.create: insert returned no row');
    }
    return row;
  }
}
