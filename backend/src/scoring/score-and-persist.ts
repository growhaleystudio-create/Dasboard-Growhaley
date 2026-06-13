/**
 * `LeadScoringPersister.scoreAndPersist` — transactional persistence of a
 * Lead's score plus the failure-handling path for `unscored` Leads (R7.1,
 * R7.8, R7.9).
 *
 * Ordering note (R7.1): the Lead row is assumed to have already been
 * inserted by the Deduplication_Service step. `scoreAndPersist` only
 * UPDATEs the existing `leadId`'s score. In the scan pipeline (Task 12.2)
 * both steps — dedup creates the Lead, then scoring scores it — run inside
 * the SAME outer `withTransaction`, so the whole "save + score" unit is
 * atomic.
 *
 * Transactionality (R7.9): every write issued here participates in the
 * caller's transaction:
 * - `deps.contributions`, `deps.failures`, `deps.outbox` each take the
 *   supplied `tx` explicitly.
 * - `deps.leads` is expected to be a {@link LeadRepository} the caller
 *   constructed bound to the SAME `tx` (its `DbExecutor` is that
 *   transaction's client). The caller is responsible for this binding; the
 *   scan pipeline does `new LeadRepository(tx)` inside `withTransaction`.
 *
 * Failure handling is deliberately NOT swallowed: if `failures.record` or
 * `outbox.enqueue` throws while persisting an `unscored` Lead, the error
 * propagates out of `scoreAndPersist`. The enclosing `withTransaction` then
 * issues `ROLLBACK`, undoing the Lead's `unscored` UPDATE too — "all
 * failure-handling steps succeed together, or none do" (R7.9, Property 6).
 *
 * Design references:
 * - design.md → Desain Scoring_Model → Penanganan unscored &
 *   Transaksionalitas.
 * - design.md → Error Handling → Pola Transaksi & Kompensasi (Outbox
 *   pattern).
 */

import type { Result, ScoreResult, ScoringModel } from '@leads-generator/shared';
import { ok } from '@leads-generator/shared';

import type { Tx } from '../db/transaction.js';
import type { LeadRepository } from '../repository/lead-repository.js';

import { computeScore } from './compute-score.js';
import type { ScorableLead } from './scorable-lead.js';
import type { ScoreContributionRepository } from './score-contribution-repository.js';
import type {
  ScoringFailureReason,
  ScoringFailureRepository,
} from './scoring-failure-repository.js';
import type { OutboxRepository } from './outbox-repository.js';

/**
 * Notification type emitted when a Lead is persisted in the `unscored`
 * state so the User can be alerted that it needs review (R7.8).
 */
export const LEAD_UNSCORED_NOTIFICATION = 'lead.unscored';

/**
 * Collaborators required by {@link LeadScoringPersister}.
 *
 * `leads` MUST be bound to the same transaction passed to
 * {@link LeadScoringPersister.scoreAndPersist}; the other three accept the
 * transaction explicitly per call.
 */
export interface ScoreAndPersistDeps {
  leads: LeadRepository;
  contributions: ScoreContributionRepository;
  failures: ScoringFailureRepository;
  outbox: OutboxRepository;
}

/**
 * Successful outcome of {@link LeadScoringPersister.scoreAndPersist}: the
 * persisted `score` (null when unscored) and the resulting `state`.
 */
export interface ScoreAndPersistOutcome {
  score: number | null;
  state: 'scored' | 'unscored';
}

/**
 * Orchestrates scoring + persistence for a single, already-inserted Lead.
 */
export class LeadScoringPersister {
  constructor(private readonly deps: ScoreAndPersistDeps) {}

  /**
   * Score `scorable` against `model` and persist the result on `leadId`
   * within transaction `tx`.
   *
   * Branches:
   * - **scored**: `leads.setScore(score, 'scored')` +
   *   `contributions.replaceForLead(model.version, contributions)`.
   * - **unscored** (empty model → `model_unconfigured`; `computeScore`
   *   threw → `compute_error`; indeterminate result → `uncertain`):
   *   `leads.setScore(null, 'unscored')` + `failures.record(reason)` +
   *   `outbox.enqueue({ type: 'lead.unscored', payload: { leadId } })`.
   *
   * Returns `ok(outcome)` on success. Any error from the failure-handling
   * writes is allowed to propagate so the enclosing transaction rolls back
   * (R7.9).
   */
  async scoreAndPersist(
    tx: Tx,
    leadId: string,
    teamId: string,
    scorable: ScorableLead,
    model: ScoringModel,
  ): Promise<Result<ScoreAndPersistOutcome>> {
    // ---- 1. Determine the score (pure), classifying any unscored reason --
    let result: ScoreResult | null = null;
    let reason: ScoringFailureReason | null = null;

    if (model.factors.length === 0) {
      // Empty model: nothing to compute (R7.8).
      reason = 'model_unconfigured';
    } else {
      try {
        result = computeScore(scorable, model.factors);
      } catch {
        // A throw inside scoring must not crash the pipeline; treat the
        // Lead as unscored with a `compute_error` reason (R7.8). We avoid
        // capturing the thrown value to keep `computeScore` a pure-ish
        // boundary; the failure is recorded structurally below.
        reason = 'compute_error';
      }

      // Non-empty model that still yields `unscored` (e.g. all-zero
      // weights) is an indeterminate result rather than a hard error.
      if (reason === null && (result === null || result.state === 'unscored')) {
        reason = 'uncertain';
      }
    }

    // ---- 2a. Unscored path: persist null score + failure + notification --
    if (reason !== null) {
      // Lead is preserved with score=null/state=unscored (R7.8).
      await this.deps.leads.setScore(teamId, leadId, null, 'unscored');
      // The following two writes are the "failure handling" steps. They are
      // NOT wrapped in try/catch: if either throws, the error propagates and
      // the outer transaction rolls back the setScore above too (R7.9).
      await this.deps.failures.record(tx, leadId, reason);
      await this.deps.outbox.enqueue(tx, {
        teamId,
        type: LEAD_UNSCORED_NOTIFICATION,
        payload: { leadId },
      });
      return ok({ score: null, state: 'unscored' });
    }

    // ---- 2b. Scored path: persist score + factor breakdown ---------------
    // `result` is non-null here: reason stayed null only when computeScore
    // returned a `scored` result.
    const scored = result!;
    await this.deps.leads.setScore(teamId, leadId, scored.score, 'scored');
    await this.deps.contributions.replaceForLead(
      tx,
      leadId,
      model.version,
      scored.contributions,
    );
    return ok({ score: scored.score, state: 'scored' });
  }
}
