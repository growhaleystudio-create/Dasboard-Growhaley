/**
 * Tenant-scoped repository for Lead rows.
 *
 * Design references:
 * - design.md → Components and Interfaces → Auth/RBAC Guard & Tenant Guard
 *   (R2.8): every public method REQUIRES `teamId` and SQL filters by it.
 * - design.md → Data Models → Skema PostgreSQL: column names, default sort,
 *   and is_duplicate semantics (R6.1, R10.1).
 * - design.md → Lead_Query_Service: default ordering is `score DESC,
 *   discovered_at DESC, id ASC` (R7.4, R7.5) and the page size is 25 (R9.1).
 *
 * This module is intentionally a thin data-access layer:
 * - No validation, scoring, or merging — those belong to domain services.
 * - All queries use parameterized placeholders (`$1`, `$2`, …); no string
 *   interpolation of values.
 * - The constructor takes a {@link DbExecutor} so the same instance can be
 *   used inside `withTransaction(tx => …)`.
 */

import type {
  AIState,
  AIUnavailableReason,
  Lead,
  LeadAuditAttributes,
  LeadStatus,
  WhatsAppVerificationStatus,
} from '@leads-generator/shared';

import { mapLeadRow, type LeadRow } from './mapping.js';
import { query, type DbExecutor } from './types.js';

/** Columns returned by every Lead select — kept as one constant so the
 * row shape always matches the {@link mapLeadRow} contract. */
const LEAD_COLUMNS = `
  id,
  team_id,
  name,
  public_contact,
  profile_url,
  location,
  whatsapp_url,
  whatsapp_number,
  whatsapp_verification_status,
  matched_keywords,
  status,
  score,
  score_state,
  audit_attributes,
  is_duplicate,
  duplicate_of,
  discovered_at,
  acquired_source,
  acquired_at,
  ai_intent_score,
  ai_insight,
  ai_state,
  ai_unavailable_reason,
  ai_analyzed_at,
  created_at
`;

/**
 * Default page size for `listForTeam`. Aligned with R9.1 (25 per page) so
 * callers that don't specify `limit` still get the canonical pagination.
 */
const DEFAULT_LIMIT = 25;

/**
 * Options accepted by {@link LeadRepository.listForTeam}.
 */
export interface ListLeadsOptions {
  limit?: number;
  offset?: number;
  /** When false (default) only canonical Leads (`is_duplicate = false`) are
   * returned — matches R6.1 and the metric/list defaults. */
  includeDuplicates?: boolean;
}

/**
 * Options accepted by {@link LeadRepository.countForTeam}.
 */
export interface CountLeadsOptions {
  includeDuplicates?: boolean;
}

/**
 * Insert payload — a `Lead` minus the columns that PostgreSQL fills in via
 * defaults (`id` via `gen_random_uuid()` and `createdAt` via `now()`).
 */
export type LeadInsert = Omit<Lead, 'id' | 'createdAt'>;

/**
 * Partial patch applied to a canonical Lead during attribute-merge
 * (R6.5 / R6.7). Limited to the public Personal_Data attributes that the
 * Deduplication_Service is allowed to fill in from an incoming duplicate;
 * scoring / AI / status columns are never touched by a merge.
 */
export type LeadAttributePatch = Partial<
  Pick<Lead, 'name' | 'publicContact' | 'profileUrl' | 'location' | 'whatsappUrl' | 'whatsappNumber'>
>;

/**
 * Identity criteria used by {@link LeadRepository.findIdsByPersonalData} to
 * locate the Leads whose Personal_Data belongs to a data subject (R11.3).
 *
 * Both fields are optional; a non-empty criterion matches a Lead when the
 * corresponding column equals it after `lower(btrim(...))` normalisation
 * (the same case-insensitive, trim-first rule used by deduplication, R6.3).
 * When BOTH are absent the query matches nothing (a no-op safe default).
 */
export interface PersonalDataCriteria {
  readonly email?: string;
  readonly profileUrl?: string;
}

/**
 * Whitelist mapping of {@link LeadAttributePatch} keys → physical column
 * names. Declared once so {@link LeadRepository.applyAttributePatch} can
 * build its `SET` clause from a fixed, non-user-controlled set of columns
 * (no SQL injection surface — only the *values* are parameterized).
 */
const ATTRIBUTE_PATCH_COLUMNS: readonly (readonly [keyof LeadAttributePatch, string])[] = [
  ['name', 'name'],
  ['publicContact', 'public_contact'],
  ['profileUrl', 'profile_url'],
  ['location', 'location'],
  ['whatsappUrl', 'whatsapp_url'],
  ['whatsappNumber', 'whatsapp_number'],
];

/**
 * Repository for the `lead` table. All methods are team-scoped.
 */
export class LeadRepository {
  constructor(private readonly db: DbExecutor) {}

  /**
   * Look up a Lead by id, scoped to the caller's Team. Returns `null` when
   * the row does not exist OR when it exists but belongs to a different
   * Team — the second case must never leak data across tenants (R2.8).
   */
  async findById(teamId: string, leadId: string): Promise<Lead | null> {
    const rows = await query<LeadRow>(
      this.db,
      `SELECT ${LEAD_COLUMNS}
         FROM lead
        WHERE team_id = $1 AND id = $2`,
      [teamId, leadId],
    );
    if (rows.length === 0) return null;
    const row = rows[0]!;
    // Defensive double-check; the WHERE clause already enforces this.
    if (row.team_id !== teamId) return null;
    return mapLeadRow(row);
  }

  /**
   * List Leads for a Team using the canonical default ordering
   * (score DESC NULLS LAST, discovered_at DESC, id ASC) and excluding
   * duplicates by default. Pagination defaults to 25 items / offset 0.
   */
  async listForTeam(teamId: string, opts: ListLeadsOptions = {}): Promise<Lead[]> {
    const includeDuplicates = opts.includeDuplicates ?? false;
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const offset = opts.offset ?? 0;

    const rows = await query<LeadRow>(
      this.db,
      `SELECT ${LEAD_COLUMNS}
         FROM lead
        WHERE team_id = $1
          AND ($2::boolean OR is_duplicate = false)
        ORDER BY score DESC NULLS LAST, discovered_at DESC, id ASC
        LIMIT $3
        OFFSET $4`,
      [teamId, includeDuplicates, limit, offset],
    );
    return rows.map(mapLeadRow);
  }

  /**
   * Count Leads for a Team. Mirrors {@link listForTeam}'s default
   * exclusion of duplicates (R10.1).
   */
  async countForTeam(teamId: string, opts: CountLeadsOptions = {}): Promise<number> {
    const includeDuplicates = opts.includeDuplicates ?? false;
    const rows = await query<{ count: string }>(
      this.db,
      `SELECT COUNT(*)::text AS count
         FROM lead
        WHERE team_id = $1
          AND ($2::boolean OR is_duplicate = false)`,
      [teamId, includeDuplicates],
    );
    const first = rows[0];
    return first ? Number(first.count) : 0;
  }

  /**
   * Insert a new Lead row scoped to `teamId`. The DB fills `id` and
   * `created_at` via defaults; any `id`/`createdAt` carried by `lead`
   * itself is ignored by virtue of being absent from {@link LeadInsert}.
   *
   * Note: this method does NOT enforce team consistency between the
   * `teamId` parameter and `lead.teamId` — the SQL writes the function
   * argument, which is the canonical source.
   */
  async insert(teamId: string, lead: LeadInsert): Promise<Lead> {
    const rows = await query<LeadRow>(
      this.db,
      `INSERT INTO lead (
         team_id, name, public_contact, profile_url, location,
         whatsapp_url, whatsapp_number, whatsapp_verification_status,
         matched_keywords, status, score, score_state, audit_attributes,
         is_duplicate, duplicate_of, discovered_at,
         acquired_source, acquired_at,
         ai_intent_score, ai_insight, ai_state, ai_unavailable_reason, ai_analyzed_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8,
         $9, $10, $11, $12, $13,
         $14, $15, $16,
         $17, $18,
         $19, $20, $21, $22, $23
       )
       RETURNING ${LEAD_COLUMNS}`,
      [
        teamId,
        lead.name ?? null,
        lead.publicContact ?? null,
        lead.profileUrl ?? null,
        lead.location ?? null,
        lead.whatsappUrl ?? null,
        lead.whatsappNumber ?? null,
        lead.whatsappVerificationStatus,
        lead.matchedKeywords,
        lead.status,
        lead.score,
        lead.scoreState,
        lead.auditAttributes ? JSON.stringify(lead.auditAttributes) : null,
        lead.isDuplicate,
        lead.duplicateOf ?? null,
        lead.discoveredAt,
        lead.acquiredSource ?? null,
        lead.acquiredAt ?? null,
        lead.aiIntentScore,
        lead.aiInsight ?? null,
        lead.aiState,
        lead.aiUnavailableReason ?? null,
        lead.aiAnalyzedAt ?? null,
      ],
    );
    return mapLeadRow(rows[0]!);
  }

  /**
   * Update the workflow status of a Lead and return the updated row, or
   * `null` if no row matched (wrong Team or unknown id).
   */
  async updateStatus(
    teamId: string,
    leadId: string,
    status: LeadStatus,
  ): Promise<Lead | null> {
    const rows = await query<LeadRow>(
      this.db,
      `UPDATE lead
          SET status = $3
        WHERE team_id = $1 AND id = $2
        RETURNING ${LEAD_COLUMNS}`,
      [teamId, leadId, status],
    );
    if (rows.length === 0) return null;
    return mapLeadRow(rows[0]!);
  }

  async updateWhatsappVerificationStatus(
    teamId: string,
    leadId: string,
    status: WhatsAppVerificationStatus,
  ): Promise<Lead | null> {
    const rows = await query<LeadRow>(
      this.db,
      `UPDATE lead
          SET whatsapp_verification_status = $3
        WHERE team_id = $1 AND id = $2
        RETURNING ${LEAD_COLUMNS}`,
      [teamId, leadId, status],
    );
    if (rows.length === 0) return null;
    return mapLeadRow(rows[0]!);
  }

  /**
   * Mark a Lead as a duplicate of `canonicalId`. Both Leads must belong to
   * the same Team — the WHERE clause checks `team_id` for the target Lead
   * and the EXISTS sub-clause checks the canonical Lead.
   */
  async markDuplicate(
    teamId: string,
    leadId: string,
    canonicalId: string,
  ): Promise<void> {
    await query(
      this.db,
      `UPDATE lead
          SET is_duplicate = true,
              duplicate_of = $3
        WHERE team_id = $1
          AND id = $2
          AND EXISTS (
            SELECT 1 FROM lead canon
             WHERE canon.team_id = $1 AND canon.id = $3
          )`,
      [teamId, leadId, canonicalId],
    );
  }

  /**
   * Add a Source to a canonical Lead's `lead_source` list (R6.2).
   *
   * Idempotent: a `(lead_id, source_id)` pair that already exists is left
   * untouched via `ON CONFLICT DO NOTHING`, so re-ingesting the same Lead
   * from the same Source does not create duplicate rows (supports the
   * idempotency property, Property 12).
   *
   * Team-safe: the insert only proceeds when the target Lead actually
   * belongs to `teamId`. This is enforced with a guarded
   * `INSERT … SELECT … WHERE EXISTS` so a caller cannot attach a Source to
   * another tenant's Lead (R2.8). Returns `true` when a row was inserted,
   * `false` when the pair already existed or the Lead was not in the Team.
   */
  async addSource(teamId: string, leadId: string, sourceId: string): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO lead_source (lead_id, source_id)
       SELECT $2, $3
        WHERE EXISTS (
          SELECT 1 FROM lead
           WHERE team_id = $1 AND id = $2
        )
       ON CONFLICT (lead_id, source_id) DO NOTHING`,
      [teamId, leadId, sourceId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Apply an attribute-merge patch to a canonical Lead (R6.5 / R6.7).
   *
   * Only the columns present in `patch` are written; the `SET` clause is
   * built from the fixed {@link ATTRIBUTE_PATCH_COLUMNS} whitelist so the
   * column list is never user-controlled. When `patch` is empty the method
   * is a no-op (no SQL is issued) — this is the common case under
   * existing-wins where the canonical already has every attribute filled.
   *
   * Team-safe: the `WHERE` clause filters by `team_id` so a patch can never
   * cross tenants (R2.8).
   */
  async applyAttributePatch(
    teamId: string,
    leadId: string,
    patch: LeadAttributePatch,
  ): Promise<void> {
    const assignments: string[] = [];
    const values: unknown[] = [teamId, leadId];

    for (const [key, column] of ATTRIBUTE_PATCH_COLUMNS) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        values.push(patch[key] ?? null);
        assignments.push(`${column} = $${values.length}`);
      }
    }

    // Nothing to update — existing-wins left no empty canonical field to
    // fill, so avoid issuing an empty `SET` clause.
    if (assignments.length === 0) return;

    await query(
      this.db,
      `UPDATE lead
          SET ${assignments.join(', ')}
        WHERE team_id = $1 AND id = $2`,
      values,
    );
  }

  /**
   * Persist the score and score_state for a Lead. `score === null` together
   * with `scoreState === 'unscored'` represents the unscored state (R7.8).
   */
  async setScore(
    teamId: string,
    leadId: string,
    score: number | null,
    scoreState: 'scored' | 'unscored',
  ): Promise<void> {
    await query(
      this.db,
      `UPDATE lead
          SET score = $3,
              score_state = $4
        WHERE team_id = $1 AND id = $2`,
      [teamId, leadId, score, scoreState],
    );
  }

  async setAuditAttributes(
    teamId: string,
    leadId: string,
    attributes: LeadAuditAttributes | null,
  ): Promise<void> {
    await query(
      this.db,
      `UPDATE lead
          SET audit_attributes = $3
        WHERE team_id = $1 AND id = $2`,
      [teamId, leadId, attributes ? JSON.stringify(attributes) : null],
    );
  }

  /**
   * Persist AI enrichment results on a Lead (R13.9, R13.13). Always sets
   * `ai_analyzed_at` to the current time; `reason` is only meaningful for
   * `state === 'unavailable'`.
   */
  async setAiResult(
    teamId: string,
    leadId: string,
    intent: number | null,
    insight: string | null,
    state: AIState,
    reason?: AIUnavailableReason,
  ): Promise<void> {
    await query(
      this.db,
      `UPDATE lead
          SET ai_intent_score = $3,
              ai_insight = $4,
              ai_state = $5,
              ai_unavailable_reason = $6,
              ai_analyzed_at = now()
        WHERE team_id = $1 AND id = $2`,
      [teamId, leadId, intent, insight, state, reason ?? null],
    );
  }

  /**
   * Retention candidates for a Team (R11.7): Leads that still carry any
   * public Personal_Data attribute and have a retention clock
   * (`acquired_at` is not null). Returns the minimal `(leadId, acquiredAt)`
   * projection consumed by the pure eligibility logic
   * (`privacy/retention.ts`), so the "which Leads expired?" decision stays
   * out of SQL.
   *
   * A Lead whose Personal_Data columns are already all NULL (e.g. cleared
   * by a previous sweep or a DSAR deletion) is excluded — there is nothing
   * left to clear, so re-selecting it would only churn no-op writes and
   * duplicate audit rows.
   *
   * Team-safe: filters by `team_id` (R2.8). Fully parameterized.
   */
  async findRetentionCandidates(
    teamId: string,
  ): Promise<{ leadId: string; acquiredAt: Date }[]> {
    const rows = await query<{ id: string; acquired_at: Date }>(
      this.db,
      `SELECT id, acquired_at
         FROM lead
        WHERE team_id = $1
          AND acquired_at IS NOT NULL
          AND (
            name IS NOT NULL
            OR public_contact IS NOT NULL
            OR profile_url IS NOT NULL
            OR location IS NOT NULL
          )`,
      [teamId],
    );
    return rows.map((row) => ({ leadId: row.id, acquiredAt: row.acquired_at }));
  }

  /**
   * Clear the public Personal_Data attributes of a Lead in place — sets
   * `name`, `public_contact`, `profile_url`, and `location` to NULL while
   * retaining the row (and its non-personal provenance/metric columns such
   * as `acquired_source`, `status`, `score`, `discovered_at`).
   *
   * This is the shared "menghapus Personal_Data" primitive used by both the
   * Retention_Worker (R11.7) and DSAR deletion (R11.3/R11.4): keeping the
   * row preserves aggregate metrics and audit traceability while removing
   * the identifying data, consistent with the DSAR design decision.
   *
   * Team-safe: the `WHERE` clause filters by `team_id` so a clear can never
   * cross tenants (R2.8). Returns `true` when a row was updated.
   */
  async clearPersonalData(teamId: string, leadId: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE lead
          SET name = NULL,
              public_contact = NULL,
              profile_url = NULL,
              location = NULL
        WHERE team_id = $1 AND id = $2`,
      [teamId, leadId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Permanently delete a Lead row. Returns `true` when a row was actually
   * deleted (matching team_id + id), `false` otherwise.
   */
  async delete(teamId: string, leadId: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM lead
        WHERE team_id = $1 AND id = $2`,
      [teamId, leadId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Find the ids of Leads within a Team whose stored Personal_Data matches
   * a data subject's identity (R11.3). A Lead matches when its
   * `public_contact` equals `criteria.email` OR its `profile_url` equals
   * `criteria.profileUrl`, compared case-insensitively after trimming
   * surrounding whitespace (`lower(btrim(...))`) — the same normalisation
   * the Deduplication_Service uses for identity (R6.3).
   *
   * Defensive emptiness handling: a criterion that is absent, or that
   * becomes empty after trimming, contributes NO predicate. When neither
   * criterion yields a usable value the method returns `[]` without issuing
   * SQL — it never degenerates into a full-table match that could clear
   * unrelated Leads.
   *
   * All values are parameterized; only `team_id`-scoped rows are returned
   * (R2.8).
   */
  async findIdsByPersonalData(
    teamId: string,
    criteria: PersonalDataCriteria,
  ): Promise<string[]> {
    const email = criteria.email?.trim();
    const profileUrl = criteria.profileUrl?.trim();

    const predicates: string[] = [];
    const values: unknown[] = [teamId];

    if (email !== undefined && email.length > 0) {
      values.push(email);
      predicates.push(`lower(btrim(public_contact)) = lower(btrim($${values.length}))`);
    }
    if (profileUrl !== undefined && profileUrl.length > 0) {
      values.push(profileUrl);
      predicates.push(`lower(btrim(profile_url)) = lower(btrim($${values.length}))`);
    }

    // No usable identity criterion → match nothing (never the whole table).
    if (predicates.length === 0) return [];

    const rows = await query<{ id: string }>(
      this.db,
      `SELECT id
         FROM lead
        WHERE team_id = $1
          AND (${predicates.join(' OR ')})`,
      values,
    );
    return rows.map((r) => r.id);
  }
}
