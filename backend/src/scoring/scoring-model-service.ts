/**
 * `ScoringModelService` — the Scoring_Model_Service of design.md (R7.3).
 *
 * Owns the lifecycle of a Team's single `ScoringModel`. The only mutating
 * operation, {@link ScoringModelService.update}, delegates to
 * {@link ScoringModelRepository.upsertForTeam}, whose `ON CONFLICT` branch
 * auto-increments `version` on every update so recompute jobs can detect a
 * stale breakdown (R7.3). Bumping the version is therefore a property of
 * the repository SQL, not of this service — the service stays a thin,
 * tenant-scoped façade.
 *
 * `update` returns a {@link Result} rather than throwing so the (often
 * background) caller can branch explicitly. There is no factor validation
 * in this task; the only failure modelled here is an unexpected
 * persistence error, surfaced as an `INTERNAL` {@link AppError}. Should
 * factor-shape validation be added later it belongs in front of the
 * `upsertForTeam` call.
 *
 * Recompute is intentionally NOT triggered from inside `update`: the design
 * runs `recomputeForTeam` as a separate background job (see `recompute.ts`)
 * so persisting a new model never blocks on rescoring the whole Team.
 *
 * Design references:
 * - design.md → Components and Interfaces → Lead_Scoring_Engine &
 *   Scoring_Model_Service.
 * - design.md → Recompute saat Model Berubah (R7.3, R7.10).
 */

import { err, ok } from '@leads-generator/shared';
import type { AppError, Result, ScoringFactor, ScoringModel } from '@leads-generator/shared';

import type { ScoringModelRepository } from '../repository/scoring-model-repository.js';

/**
 * Tenant-scoped service that creates/updates a Team's `ScoringModel`.
 */
export class ScoringModelService {
  constructor(private readonly models: ScoringModelRepository) {}

  /**
   * Insert or update the Team's `ScoringModel` with `factors`.
   *
   * On insert the version starts at 1; on update the repository's
   * `ON CONFLICT` branch increments `version` by 1 (R7.3), so the returned
   * model always carries the new version. Returns `ok(model)` on success,
   * or `err({ code: 'INTERNAL', … })` if the upsert throws.
   */
  async update(teamId: string, factors: ScoringFactor[]): Promise<Result<ScoringModel>> {
    try {
      const model = await this.models.upsertForTeam(teamId, factors);
      return ok(model);
    } catch {
      // The repository only throws on infrastructure faults (lost
      // connection, constraint violation). Surface it as a unified
      // INTERNAL error rather than letting it escape as a raw rejection.
      return err<AppError>({
        code: 'INTERNAL',
        message: 'Gagal memperbarui Scoring_Model',
      });
    }
  }

  /** Return the Team's `ScoringModel`, or `null` when none is configured. */
  async get(teamId: string): Promise<ScoringModel | null> {
    return this.models.getForTeam(teamId);
  }
}
