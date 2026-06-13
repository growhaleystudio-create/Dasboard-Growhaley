/**
 * `recomputeForTeam` — bulk rescoring of a Team's Leads after the
 * `ScoringModel` changes (design.md → Recompute saat Model Berubah, R7.3,
 * R7.10).
 *
 * When a Team's model is updated its `version` is bumped (see
 * {@link import('./scoring-model-service.js').ScoringModelService}) and this
 * orchestrator recomputes `Lead_Score` for every canonical Lead under the
 * new model. It is meant to run as a background job so persisting a new
 * model never blocks on rescoring (R7.3).
 *
 * Per-Lead isolation (R7.10)
 * --------------------------
 * Each Lead is recomputed inside its OWN transaction. If one Lead's
 * recompute throws, that transaction rolls back — leaving its previous
 * score untouched — and the loop continues with the next Lead. The returned
 * {@link RecomputeReport} counts how many Leads were recomputed vs preserved
 * after a failure, and the invariant `recomputed + preservedOnFailure ===
 * total canonical Leads` always holds (every Lead is processed exactly once).
 *
 * Pagination strategy
 * -------------------
 * The default Lead ordering (`score DESC …`) is the very column recompute
 * mutates, so offset-paging *while* writing could re-order the window and
 * process a Lead twice or skip one. To avoid that, recompute runs in two
 * phases: first it pages through `listForTeam` (page size 500) collecting
 * the canonical Lead ids with NO writes, then it recomputes each collected
 * id in its own transaction. Reads therefore see a stable ordering.
 *
 * Unscored result during recompute (R7.10 nuance)
 * ----------------------------------------------
 * If a Lead newly evaluates to `unscored` under the new model (e.g. the new
 * model is empty or all-zero weight), recompute PRESERVES the Lead's
 * previous score rather than nulling it. The design's failure rule is
 * "preserve the previous score and continue"; an `unscored` *result* is not
 * itself a failure, but treating it as "preserve previous" keeps recompute
 * safe and simple — a model edit can never silently wipe existing scores.
 * (Initial scoring of a brand-new Lead still goes through `scoreAndPersist`,
 * which is where the `unscored` persistence + notification path lives.)
 */

import type { ScoringModel } from '@leads-generator/shared';
import type { Pool } from 'pg';

import { withTransaction, type Tx } from '../db/transaction.js';
import { LeadRepository } from '../repository/lead-repository.js';

import { computeScore } from './compute-score.js';
import type { ScorableLead } from './scorable-lead.js';
import { ScoreContributionRepository } from './score-contribution-repository.js';

/** Page size used while collecting canonical Lead ids for recompute. */
const PAGE_SIZE = 500;

/**
 * Outcome of a {@link recomputeForTeam} run.
 *
 * - `recomputed`: Leads whose per-Lead transaction committed (rescored, or
 *   intentionally left unchanged because the result was `unscored`).
 * - `preservedOnFailure`: Leads whose per-Lead transaction threw and rolled
 *   back, so their previous score is preserved (R7.10).
 */
export interface RecomputeReport {
  recomputed: number;
  preservedOnFailure: number;
}

/**
 * Maps a stored Lead row to the {@link ScorableLead} the engine consumes.
 *
 * Provided by the caller so recompute stays decoupled from the
 * Lead → ScorableLead projection (which needs the Lead row, its sources,
 * and a `referenceTime`). Returning `null` signals "no scorable view" — the
 * Lead is then left unchanged for this run.
 */
export type ScorableProjector = (leadId: string) => Promise<ScorableLead | null>;

/** Minimal write surface recompute needs from a tx-bound `LeadRepository`. */
export type TxLeadWriter = Pick<LeadRepository, 'setScore'>;

/** Minimal write surface recompute needs from a `ScoreContributionRepository`. */
export type TxContributionWriter = Pick<ScoreContributionRepository, 'replaceForLead'>;

/**
 * Collaborators for {@link recomputeForTeam}.
 *
 * The transaction runner and the tx-bound writer factories are injectable
 * so the orchestration can be unit/property-tested without a real database
 * (the defaults wire up the real `withTransaction` + repositories).
 */
export interface RecomputeDeps {
  /**
   * Pool used to build the default `runInTx`. Required only when `runInTx`
   * is not supplied.
   */
  pool?: Pool;

  /** Lead reads (`listForTeam`) — expected to be bound to the pool. */
  leads: Pick<LeadRepository, 'listForTeam'>;

  /** Projects a Lead id to a {@link ScorableLead} (or `null`). */
  project: ScorableProjector;

  /**
   * Runs a unit of work inside a transaction. Defaults to
   * `withTransaction(deps.pool, fn)`. Tests inject a fake that emulates
   * rollback (discarding staged writes when `fn` rejects).
   */
  runInTx?: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

  /**
   * Factory for a transaction-bound Lead writer. Defaults to
   * `new LeadRepository(tx)`.
   */
  txLeads?: (tx: Tx) => TxLeadWriter;

  /**
   * Factory for a transaction-bound contribution writer. Defaults to
   * `new ScoreContributionRepository()` (its methods take `tx` per call).
   */
  txContributions?: (tx: Tx) => TxContributionWriter;
}

/**
 * Resolve the transaction runner, falling back to the real
 * {@link withTransaction} bound to `deps.pool`.
 */
function resolveRunInTx(deps: RecomputeDeps): <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> {
  if (deps.runInTx !== undefined) return deps.runInTx;
  const pool = deps.pool;
  if (pool === undefined) {
    throw new Error('recomputeForTeam requires either `pool` or `runInTx` in its deps');
  }
  return (fn) => withTransaction(pool, fn);
}

/**
 * Page through `listForTeam` collecting the ids of every canonical Lead for
 * the Team, with no writes. Reads use the repository's default ordering;
 * because this phase performs no updates, the ordering is stable across
 * pages.
 */
async function collectCanonicalLeadIds(
  deps: RecomputeDeps,
  teamId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;

  for (;;) {
    const page = await deps.leads.listForTeam(teamId, {
      includeDuplicates: false,
      limit: PAGE_SIZE,
      offset,
    });
    for (const lead of page) {
      ids.push(lead.id);
    }
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return ids;
}

/**
 * Recompute a single Lead inside its own transaction. Throwing here causes
 * the caller to count the Lead as preserved-on-failure (R7.10); the thrown
 * error rolls back this Lead's transaction so its previous score survives.
 */
async function recomputeOne(
  deps: RecomputeDeps,
  runInTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>,
  teamId: string,
  model: ScoringModel,
  leadId: string,
): Promise<void> {
  const makeTxLeads = deps.txLeads ?? ((tx: Tx): TxLeadWriter => new LeadRepository(tx));
  const makeTxContributions =
    deps.txContributions ?? ((_tx: Tx): TxContributionWriter => new ScoreContributionRepository());

  await runInTx(async (tx) => {
    const scorable = await deps.project(leadId);
    // No scorable view → leave the Lead unchanged for this run.
    if (scorable === null) return;

    const result = computeScore(scorable, model.factors);
    if (result.state !== 'scored' || result.score === null) {
      // Preserve the previous score on an `unscored` result (see file
      // header): a model edit must never silently wipe existing scores.
      return;
    }

    const txLeads = makeTxLeads(tx);
    const txContributions = makeTxContributions(tx);

    await txLeads.setScore(teamId, leadId, result.score, 'scored');
    await txContributions.replaceForLead(tx, leadId, model.version, result.contributions);
  });
}

/**
 * Recompute `Lead_Score` for EVERY canonical Lead of `teamId` under the new
 * `model`, with per-Lead isolation (R7.10). Returns a {@link RecomputeReport}.
 *
 * @see the module header for the pagination and unscored-result rationale.
 */
export async function recomputeForTeam(
  deps: RecomputeDeps,
  teamId: string,
  model: ScoringModel,
): Promise<RecomputeReport> {
  const runInTx = resolveRunInTx(deps);
  const leadIds = await collectCanonicalLeadIds(deps, teamId);

  const report: RecomputeReport = { recomputed: 0, preservedOnFailure: 0 };

  for (const leadId of leadIds) {
    try {
      await recomputeOne(deps, runInTx, teamId, model, leadId);
      report.recomputed += 1;
    } catch {
      // Per-Lead isolation: a failed recompute preserves the previous score
      // (its transaction rolled back) and the loop continues (R7.10).
      report.preservedOnFailure += 1;
    }
  }

  return report;
}
