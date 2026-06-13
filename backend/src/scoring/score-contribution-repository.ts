/**
 * Repository for the `score_contribution` table (R7.6).
 *
 * Stores the per-factor breakdown that explains how a Lead's score was
 * produced so it can be surfaced to the User. Unlike the tenant-scoped
 * repositories under `src/repository/`, this one operates strictly inside
 * an already-open transaction (`Tx`) supplied per call: scoring persistence
 * is always part of the larger "save Lead + contributions/failure +
 * notification" transaction (R7.9), so the `Tx` is threaded through rather
 * than bound at construction time.
 *
 * Tenant isolation is enforced upstream: rows are keyed by `lead_id`, and a
 * Lead always belongs to exactly one Team. The caller
 * (`LeadScoringPersister`) is responsible for having resolved the Lead in a
 * team-scoped manner before persisting its contributions.
 *
 * Design references:
 * - design.md → Data Models → Skema PostgreSQL: `score_contribution`
 *   (PRIMARY KEY (lead_id, factor_id)).
 * - design.md → Desain Scoring_Model → Penanganan unscored &
 *   Transaksionalitas (R7.6, R7.9).
 *
 * All statements are parameterized; no value is ever interpolated.
 */

import type { FactorContribution } from '@leads-generator/shared';

import type { Tx } from '../db/transaction.js';

/**
 * Repository for `score_contribution`. Methods take the active transaction
 * as their first argument so they participate in the caller's atomic unit.
 */
export class ScoreContributionRepository {
  /**
   * Replace all stored contributions for a Lead with `contributions`.
   *
   * Implemented as DELETE-then-INSERT inside the supplied transaction so a
   * recompute never leaves stale factor rows behind: the previous model's
   * factor ids may differ from the new model's, and the table's primary key
   * is `(lead_id, factor_id)`. Both steps run on `tx`, so they commit or
   * roll back together with the rest of the scoring transaction (R7.9).
   *
   * @param tx           Active transaction (PoolClient) from `withTransaction`.
   * @param leadId       The Lead whose contributions are being replaced.
   * @param modelVersion The `ScoringModel.version` these contributions came
   *                     from — persisted so stale breakdowns are detectable.
   * @param contributions Per-factor breakdown produced by `computeScore`.
   */
  async replaceForLead(
    tx: Tx,
    leadId: string,
    modelVersion: number,
    contributions: readonly FactorContribution[],
  ): Promise<void> {
    // Clear any existing breakdown for this Lead first.
    await tx.query(`DELETE FROM score_contribution WHERE lead_id = $1`, [leadId]);

    // Insert the fresh breakdown row-by-row. The loop keeps each statement
    // fully parameterized; the contribution count per Lead is bounded by the
    // number of factors in the model (small), so a multi-row VALUES build
    // would add complexity without meaningful benefit here.
    for (const contribution of contributions) {
      await tx.query(
        `INSERT INTO score_contribution (
           lead_id, model_version, factor_id, raw_value, weighted_value
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          leadId,
          modelVersion,
          contribution.factorId,
          contribution.rawValue,
          contribution.weightedValue,
        ],
      );
    }
  }
}
