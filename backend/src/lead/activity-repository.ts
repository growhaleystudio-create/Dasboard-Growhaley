/**
 * Tenant-aware repository for the `activity` table (R8.2 Activity_Log).
 *
 * Design references:
 * - design.md → Lead_Manager & Activity_Log: an {@link Activity} records a
 *   single event on a Lead (`status_change`, `note_added`, `deleted`) with
 *   actor and time.
 * - design.md → Data Models → Skema PostgreSQL: column names
 *   (`lead_id`, `type`, `actor_id`, `from_status`, `to_status`, `at`).
 *
 * This module is a thin data-access layer:
 * - No validation or domain logic — that belongs to {@link import('./lead-manager.js').LeadManager}.
 * - All queries use parameterized placeholders (`$1`, `$2`, …); no string
 *   interpolation of values.
 * - The constructor takes a {@link DbExecutor} so the same instance can run
 *   against the pool or inside `withTransaction(tx => …)`.
 *
 * Team isolation (R2.8): the `activity` table has no `team_id` column — a
 * row is owned by the Team that owns its `lead`. Reads therefore JOIN
 * `lead` and filter by `lead.team_id` so a caller can never read another
 * tenant's activity. Writes are issued by the Lead_Manager only AFTER it has
 * verified the Lead belongs to the actor's Team via a team-scoped lookup.
 */

import type { LeadStatus } from '@leads-generator/shared';

import { query, type DbExecutor } from '../repository/types.js';

/**
 * Raw `activity` row as returned by SQL selects. `at` is typed as
 * `Date | string` because `pg` may surface `timestamptz` either way
 * depending on type parsers; callers that need a `Date` should coerce.
 */
export interface ActivityRow {
  id: string;
  lead_id: string;
  type: string;
  actor_id: string | null;
  from_status: string | null;
  to_status: string | null;
  at: Date | string;
}

/** Columns selected by {@link ActivityRepository.listForLead}. */
const ACTIVITY_COLUMNS = `
  a.id,
  a.lead_id,
  a.type,
  a.actor_id,
  a.from_status,
  a.to_status,
  a.at
`;

/**
 * Repository for the `activity` table.
 */
export class ActivityRepository {
  constructor(private readonly db: DbExecutor) {}

  /**
   * Record a `status_change` Activity for a Lead (R8.2): captures the
   * originating status, the target status, the actor, and the time of the
   * change.
   *
   * When `at` is omitted the database default (`now()`) is used via
   * `COALESCE`, so callers that don't control the clock still get a
   * timestamp; the Lead_Manager passes an injected clock for determinism.
   */
  async recordStatusChange(
    leadId: string,
    actorId: string,
    from: LeadStatus,
    to: LeadStatus,
    at?: Date,
  ): Promise<void> {
    await query(
      this.db,
      `INSERT INTO activity (lead_id, type, actor_id, from_status, to_status, at)
       VALUES ($1, 'status_change', $2, $3, $4, COALESCE($5::timestamptz, now()))`,
      [leadId, actorId, from, to, at ?? null],
    );
  }

  /**
   * Record a `note_added` Activity for a Lead. `from_status` / `to_status`
   * are left null; `at` defaults to `now()`. Used by the follow-up note
   * flow (Task 13.3).
   */
  async recordNoteAdded(leadId: string, actorId: string, at?: Date): Promise<void> {
    await query(
      this.db,
      `INSERT INTO activity (lead_id, type, actor_id, at)
       VALUES ($1, 'note_added', $2, COALESCE($3::timestamptz, now()))`,
      [leadId, actorId, at ?? null],
    );
  }

  /**
   * List every Activity recorded for a Lead, ordered chronologically.
   *
   * Team-safe (R2.8): the JOIN onto `lead` filters by `lead.team_id`, so a
   * caller can only read activity for a Lead owned by their Team. A Lead in
   * another Team (or an unknown id) yields an empty list.
   */
  async listForLead(teamId: string, leadId: string): Promise<ActivityRow[]> {
    return query<ActivityRow>(
      this.db,
      `SELECT ${ACTIVITY_COLUMNS}
         FROM activity a
         JOIN lead l ON l.id = a.lead_id
        WHERE l.team_id = $1 AND a.lead_id = $2
        ORDER BY a.at ASC, a.id ASC`,
      [teamId, leadId],
    );
  }
}
