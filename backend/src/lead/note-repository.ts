/**
 * Tenant-aware repository for the `lead_note` table (R8.3, R8.4 follow-up
 * notes).
 *
 * Design references:
 * - design.md → Lead_Manager & Activity_Log: a follow-up note carries a
 *   `body` (1..2000 chars), the author, and the creation time
 *   (`addNote(actor, leadId, body): Result<Note>`).
 * - design.md → Data Models → Skema PostgreSQL: column names
 *   (`lead_id`, `body`, `author_id`, `created_at`) and the
 *   `CHECK (length(body) BETWEEN 1 AND 2000)` constraint.
 *
 * This module is a thin data-access layer:
 * - No validation or domain logic — the 1..2000 length rule is enforced by
 *   {@link import('./lead-manager.js').LeadManager} (and the DB CHECK is the
 *   defence-in-depth backstop).
 * - All queries use parameterized placeholders (`$1`, `$2`, …); no string
 *   interpolation of values.
 * - The constructor takes a {@link DbExecutor} so the same instance can run
 *   against the pool or inside `withTransaction(tx => …)`.
 *
 * Team isolation (R2.8): `lead_note` has no `team_id` column — a row is
 * owned by the Team that owns its `lead`. Reads therefore JOIN `lead` and
 * filter by `lead.team_id`. Writes are issued by the Lead_Manager only
 * AFTER it has verified the Lead belongs to the actor's Team.
 */

import { query, type DbExecutor } from '../repository/types.js';

/**
 * Raw `lead_note` row as returned by SQL selects. `created_at` is typed as
 * `Date | string` because `pg` may surface `timestamptz` either way
 * depending on type parsers; callers that need a `Date` should coerce.
 */
export interface NoteRow {
  id: string;
  lead_id: string;
  body: string;
  author_id: string;
  created_at: Date | string;
}

/** Bare `lead_note` columns (used by the `INSERT … RETURNING`). */
const NOTE_COLUMNS = `
  id,
  lead_id,
  body,
  author_id,
  created_at
`;

/** Same columns aliased to the `n` table in {@link NoteRepository.listForLead}. */
const NOTE_COLUMNS_ALIASED = `
  n.id,
  n.lead_id,
  n.body,
  n.author_id,
  n.created_at
`;

/**
 * Repository for the `lead_note` table.
 */
export class NoteRepository {
  constructor(private readonly db: DbExecutor) {}

  /**
   * Insert a follow-up note and return the persisted row (R8.3): captures
   * the `body`, its `author_id`, and the `created_at` stamp (DB default
   * `now()`).
   *
   * The 1..2000 length rule is enforced upstream by the Lead_Manager; the
   * DB `CHECK` constraint is the backstop. No team scoping happens here —
   * the caller must have already verified the Lead belongs to the actor's
   * Team.
   */
  async insert(leadId: string, authorId: string, body: string): Promise<NoteRow> {
    const rows = await query<NoteRow>(
      this.db,
      `INSERT INTO lead_note (lead_id, body, author_id)
       VALUES ($1, $2, $3)
       RETURNING ${NOTE_COLUMNS}`,
      [leadId, body, authorId],
    );
    return rows[0]!;
  }

  /**
   * List every note recorded for a Lead, ordered chronologically.
   *
   * Team-safe (R2.8): the JOIN onto `lead` filters by `lead.team_id`, so a
   * caller can only read notes for a Lead owned by their Team. A Lead in
   * another Team (or an unknown id) yields an empty list.
   */
  async listForLead(teamId: string, leadId: string): Promise<NoteRow[]> {
    return query<NoteRow>(
      this.db,
      `SELECT ${NOTE_COLUMNS_ALIASED}
         FROM lead_note n
         JOIN lead l ON l.id = n.lead_id
        WHERE l.team_id = $1 AND n.lead_id = $2
        ORDER BY n.created_at ASC, n.id ASC`,
      [teamId, leadId],
    );
  }
}
