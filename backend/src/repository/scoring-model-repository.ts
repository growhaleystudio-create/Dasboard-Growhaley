/**
 * Tenant-scoped repository for `scoring_model` rows.
 *
 * Design references:
 * - design.md → Components and Interfaces → Lead_Scoring_Engine &
 *   Scoring_Model_Service (R7).
 * - design.md → Data Models → Skema PostgreSQL: `scoring_model` keyed by
 *   `team_id` (one model per Team) with a monotonically increasing
 *   `version` (R7.3).
 *
 * `upsertForTeam` increments the model `version` on every update so
 * recompute jobs can detect staleness; this is enforced in SQL via
 * `version = scoring_model.version + 1` inside the conflict branch.
 */

import type { ScoringFactor, ScoringModel } from '@leads-generator/shared';

import { mapScoringModelRow, type ScoringModelRow } from './mapping.js';
import { query, type DbExecutor } from './types.js';

const SCORING_MODEL_COLUMNS = `team_id, version, factors`;

/**
 * Repository for the `scoring_model` table. All methods are team-scoped.
 */
export class ScoringModelRepository {
  constructor(private readonly db: DbExecutor) {}

  /** Return the Scoring_Model for a Team, or `null` if none has been
   * configured yet. */
  async getForTeam(teamId: string): Promise<ScoringModel | null> {
    const rows = await query<ScoringModelRow>(
      this.db,
      `SELECT ${SCORING_MODEL_COLUMNS}
         FROM scoring_model
        WHERE team_id = $1`,
      [teamId],
    );
    if (rows.length === 0) return null;
    return mapScoringModelRow(rows[0]!);
  }

  /**
   * Insert or update the Scoring_Model for a Team. On insert the version
   * starts at 1; on update the version is auto-incremented by 1 (R7.3).
   */
  async upsertForTeam(teamId: string, factors: ScoringFactor[]): Promise<ScoringModel> {
    const rows = await query<ScoringModelRow>(
      this.db,
      `INSERT INTO scoring_model (team_id, version, factors)
       VALUES ($1, 1, $2::jsonb)
       ON CONFLICT (team_id) DO UPDATE
         SET version = scoring_model.version + 1,
             factors = EXCLUDED.factors
       RETURNING ${SCORING_MODEL_COLUMNS}`,
      [teamId, JSON.stringify(factors)],
    );
    return mapScoringModelRow(rows[0]!);
  }
}
