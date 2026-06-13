/**
 * Repository for the `scoring_failure` table (R7.8).
 *
 * Records that a Lead ended up `unscored` — because scoring threw, the
 * Scoring_Model is not configured, or the result was indeterminate. Each
 * call inserts exactly one row inside the supplied transaction so the
 * record is committed atomically with the Lead's `unscored` state (R7.9).
 *
 * Design references:
 * - design.md → Data Models → Skema PostgreSQL: `scoring_failure`
 *   (reason ∈ {'compute_error','model_unconfigured','uncertain'}).
 * - design.md → Desain Scoring_Model → Penanganan unscored &
 *   Transaksionalitas (R7.8, R7.9).
 *
 * The statement is parameterized; `at` and `id` are filled by DB defaults.
 */

import type { Tx } from '../db/transaction.js';

/**
 * Reason a Lead was left `unscored`. Mirrors the `scoring_failure.reason`
 * CHECK constraint so an invalid reason fails fast at the type level rather
 * than at the database.
 */
export type ScoringFailureReason = 'compute_error' | 'model_unconfigured' | 'uncertain';

/**
 * Repository for `scoring_failure`. The method takes the active transaction
 * as its first argument so the failure record participates in the caller's
 * atomic unit (R7.9).
 */
export class ScoringFailureRepository {
  /**
   * Insert one `scoring_failure` row for `leadId` with the given `reason`.
   *
   * Runs on `tx`; if a later step in the failure-handling path (e.g. the
   * outbox enqueue) throws, the surrounding `withTransaction` rolls this
   * insert back too (R7.9).
   */
  async record(tx: Tx, leadId: string, reason: ScoringFailureReason): Promise<void> {
    await tx.query(
      `INSERT INTO scoring_failure (lead_id, reason) VALUES ($1, $2)`,
      [leadId, reason],
    );
  }
}
