/**
 * Tenant-scoped repository for `user_membership` rows.
 *
 * The membership table is the source of truth for the (User, Team) pairs
 * the RBAC Guard reads on every authorized request (see
 * `effective-role.ts` and design.md → Alur Permintaan Berbasis Peran →
 * Catatan R2.3): the effective role MUST be resolved per-request from
 * persistent state rather than from a frozen session claim, so role
 * changes (R2.3) take effect on the user's next authorized request.
 *
 * Design references:
 * - design.md → Components and Interfaces → Auth/RBAC Guard & Tenant Guard
 * - design.md → Components and Interfaces → Team_Service
 * - design.md → Data Models → Skema PostgreSQL: `user_membership`
 *
 * Persistence-only — invitation lifecycle, email validation, and role
 * authorization belong to `Team_Service` (Task 5.x) and the RBAC Guard.
 */

import type { Membership } from '@leads-generator/shared';

import { mapMembershipRow, type MembershipRow } from '../repository/mapping.js';
import { query, type DbExecutor } from '../repository/types.js';

/**
 * Columns selected by membership lookups. Kept in one constant so SELECT
 * lists stay aligned with {@link MembershipRow}.
 */
const MEMBERSHIP_COLUMNS = `
  team_id,
  user_id,
  role,
  status
`;

/**
 * Repository for the `user_membership` table.
 *
 * Every public method takes the team_id / user_id (or team_id / email)
 * keys explicitly so the Tenant Guard (R2.8) is enforced at the SQL
 * boundary — there is no overload that omits them.
 */
export class MembershipRepository {
  constructor(private readonly db: DbExecutor) {}

  /**
   * Look up the membership for a (teamId, userId) pair regardless of
   * `status`. Returns `null` when no row exists.
   *
   * The effective-role resolver (`DbEffectiveRoleResolver`) calls this on
   * every authorized request and ignores any `status !== 'active'` row,
   * which keeps the R2.5 carve-out (Viewer reads on `pending`) outside
   * the RBAC matrix and inside the membership/session layer.
   */
  async findActive(teamId: string, userId: string): Promise<Membership | null> {
    const rows = await query<MembershipRow>(
      this.db,
      `SELECT ${MEMBERSHIP_COLUMNS}
         FROM user_membership
        WHERE team_id = $1 AND user_id = $2`,
      [teamId, userId],
    );
    if (rows.length === 0) return null;
    return mapMembershipRow(rows[0]!);
  }

  /**
   * Find an `active` or `pending` membership for the given Team and
   * email. Returns `null` when the email is unknown or the user has no
   * non-revoked membership in that Team.
   *
   * Used by `Team_Service.invite` (Task 5.1) to enforce R2.9 — an invite
   * MUST be rejected when the target email already corresponds to an
   * active or pending member of the same Team.
   *
   * Email comparison is case-insensitive at the SQL layer because
   * `app_user.email` is declared `citext`.
   */
  async findActiveOrPendingByEmail(
    teamId: string,
    email: string,
  ): Promise<Membership | null> {
    const rows = await query<MembershipRow>(
      this.db,
      `SELECT m.team_id, m.user_id, m.role, m.status
         FROM user_membership m
         JOIN app_user u ON u.id = m.user_id
        WHERE m.team_id = $1
          AND u.email = $2
          AND m.status IN ('active','pending')
        LIMIT 1`,
      [teamId, email],
    );
    if (rows.length === 0) return null;
    return mapMembershipRow(rows[0]!);
  }

  /**
   * List every membership a User holds, regardless of status. Used by
   * the future "switch team" UX so the frontend can render the user's
   * available workspaces.
   *
   * Ordered by `team_id` ascending so the result is deterministic across
   * calls (no inherent ORDER BY in `user_membership`).
   */
  async listForUser(userId: string): Promise<Membership[]> {
    const rows = await query<MembershipRow>(
      this.db,
      `SELECT ${MEMBERSHIP_COLUMNS}
         FROM user_membership
        WHERE user_id = $1
        ORDER BY team_id ASC`,
      [userId],
    );
    return rows.map(mapMembershipRow);
  }

  async listForTeamMembers(teamId: string): Promise<Array<Membership & { email: string }>> {
    const rows = await query<MembershipRow & { email: string }>(
      this.db,
      `SELECT m.team_id, m.user_id, m.role, m.status, u.email
         FROM user_membership m
         JOIN app_user u ON u.id = m.user_id
        WHERE m.team_id = $1
        ORDER BY u.email ASC`,
      [teamId],
    );
    return rows.map((row) => ({ ...mapMembershipRow(row), email: row.email }));
  }

  /**
   * Insert a membership row, or update the existing row's `role` and
   * `status` when a `(team_id, user_id)` pair already exists.
   *
   * Used by Team_Service (Task 5.x) when an invitation is accepted (R2.2)
   * and on idempotent re-application of membership state.
   */
  async upsert(membership: Membership): Promise<void> {
    await this.db.query(
      `INSERT INTO user_membership (team_id, user_id, role, status)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (team_id, user_id)
       DO UPDATE SET role = EXCLUDED.role,
                     status = EXCLUDED.status`,
      [membership.teamId, membership.userId, membership.role, membership.status],
    );
  }

  /**
   * Update the `role` of an existing membership.
   *
   * Per R2.3 the new role takes effect on the User's *next* authorized
   * request because the RBAC Guard resolves the effective role from this
   * row on every request (see `effective-role.ts`). The role-change
   * endpoint (Task 5.3) MUST also call
   * `CachedEffectiveRoleResolver.invalidate(userId, teamId)` so any
   * cached read becomes stale immediately.
   */
  async updateRole(
    teamId: string,
    userId: string,
    role: Membership['role'],
  ): Promise<void> {
    await this.db.query(
      `UPDATE user_membership
          SET role = $3
        WHERE team_id = $1 AND user_id = $2`,
      [teamId, userId, role],
    );
  }

  /**
   * Update the activation status of a membership (e.g. transition from
   * `pending` to `active` on invitation acceptance, R2.2).
   */
  async setStatus(
    teamId: string,
    userId: string,
    status: 'pending' | 'active',
  ): Promise<void> {
    await this.db.query(
      `UPDATE user_membership
          SET status = $3
        WHERE team_id = $1 AND user_id = $2`,
      [teamId, userId, status],
    );
  }
}
