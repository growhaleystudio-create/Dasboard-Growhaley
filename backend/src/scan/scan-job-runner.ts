/**
 * Scan_Job runner: wraps {@link executeScan} with `scan_job` lifecycle
 * persistence, total-failure safety, and the Outbox notification write
 * (Task 12.4, R12.3, R12.4).
 *
 * Design references:
 * - design.md → Alur Eksekusi Pemindaian (the status flow: `running` →
 *   `succeeded` / `failed`) and **Catatan R12.4**: the `scan_job` status is
 *   written from the ACTUAL execution outcome, BEFORE and INDEPENDENTLY of
 *   notification delivery, so it always reflects reality even if delivery
 *   later fails.
 * - design.md → Error Handling → Pola Transaksi & Kompensasi → **Outbox
 *   pattern**: the notification row is written to the `outbox` table inside
 *   the SAME domain transaction as the Lead writes; a separate worker
 *   delivers it later. This is what decouples "status reflects reality" from
 *   "notification was delivered".
 *
 * Responsibility boundary
 * -----------------------
 * {@link executeScan} owns Source resolution (R3.8), the R5.7 "no Source
 * available" guard, and running {@link runScanPipeline} inside a
 * transaction. It deliberately does NOT touch job status or the outbox.
 * This module adds exactly that wrapper and nothing else; scheduling and
 * overlap prevention (R5.8) are Task 12.6.
 *
 * Transaction strategy (the crux of R12.4)
 * ----------------------------------------
 * 1. A `scan_job` row is inserted with status `running` against the pool —
 *    a write that is COMMITTED independently of the domain transaction, so
 *    it survives even when the domain transaction rolls back.
 * 2. The domain work runs inside a single transaction. The runner injects
 *    its own `runInTx` into {@link executeScan} so that, after the pipeline
 *    has produced its {@link ScanSummary} (the Lead writes), the SAME
 *    transaction also persists the summary, the terminal status, and the
 *    Outbox notification — all atomically (Outbox pattern). The terminal
 *    status is derived from the actual outcome: `failed` when every
 *    connector failed (R12.3 "tidak ada satu pun Source mengembalikan
 *    hasil"), otherwise `succeeded`.
 * 3. If the domain transaction THROWS (pipeline/dedup/scoring/DB error, or
 *    the Outbox enqueue itself failing), it rolls back: no partial Lead
 *    writes persist, so pre-existing Leads remain intact (R12.3). The job
 *    is then marked `failed` in a SEPARATE write against the pool that
 *    survives the rollback (R12.4). Crucially the status is decided by what
 *    really happened, never by whether the notification could be enqueued
 *    or delivered.
 *
 * Because the status lives on the committed `scan_job` row and delivery is
 * driven off the `outbox` table by a separate worker, the job status is
 * independent of notification delivery success/failure (R12.4) — this is
 * the invariant Property 36 checks.
 */

import type {
  Result,
  ScanJob,
  ScanJobStatus,
  ScanSummary,
} from '@leads-generator/shared';
import { err, ok } from '@leads-generator/shared';
import type { Pool } from 'pg';

import { withTransaction, type Tx } from '../db/transaction.js';
import { ScanJobRepository } from '../repository/scan-job-repository.js';
import type { OutboxRepository } from '../scoring/outbox-repository.js';

import type { ScanQuery } from '../connector/source-connector.js';
import { executeScan, type ScanEngineDeps, type ExecuteScanInput } from './scan-engine.js';

/**
 * Outbox notification type emitted when a Scan_Job completes (a run that was
 * not a total failure — it may still record per-connector errors in its
 * summary). Delivered by a separate worker (Outbox pattern, R12.4).
 */
export const SCAN_COMPLETED_NOTIFICATION = 'scan.completed';

/**
 * Outbox notification type emitted when a Scan_Job ends in total failure
 * (R12.3, R12.4). Only enqueued on the path where the domain transaction
 * still commits (all connectors failed but no exception was thrown); a
 * rolled-back transaction persists no Outbox row, and the status write is
 * what carries the failure forward.
 */
export const SCAN_FAILED_NOTIFICATION = 'scan.failed';

/** Subset of {@link ScanJobRepository} used for pool-bound writes. */
export type JobLifecycleWriter = Pick<
  ScanJobRepository,
  'insert' | 'setStatus' | 'setFinishedAt'
>;

/** Subset of {@link ScanJobRepository} used for transaction-bound writes. */
export type TxJobWriter = Pick<
  ScanJobRepository,
  'setStatus' | 'setSummary' | 'setFinishedAt'
>;

/** Subset of {@link OutboxRepository} the runner needs. */
export type OutboxEnqueuer = Pick<OutboxRepository, 'enqueue'>;

/**
 * Collaborators required by {@link runScanJob}.
 *
 * Everything is injectable (mirroring {@link executeScan} and
 * `recomputeForTeam`) so the runner is unit/property-testable without a real
 * database. The transaction runner (`runInTx`) is the one the runner controls
 * for the DOMAIN transaction; it is wrapped before being handed to
 * {@link executeScan} so the summary/status/outbox finalization joins the
 * same transaction as the Lead writes.
 */
export interface ScanJobRunnerDeps {
  /**
   * Scan_Engine collaborators (registry, pipeline, loadModel). The runner
   * supplies its own `runInTx`, so the caller must NOT set `runInTx`/`pool`
   * here.
   */
  scan: Omit<ScanEngineDeps, 'pool' | 'runInTx'>;

  /**
   * Pool used to build the default `runInTx`. Required only when `runInTx`
   * is not supplied.
   */
  pool?: Pool;

  /**
   * Runs the domain unit of work in a transaction. Defaults to
   * `withTransaction(deps.pool, fn)`.
   */
  runInTx?: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

  /**
   * Pool-bound `scan_job` writer. Used to insert the `running` row and to
   * record `failed` after a domain rollback — both writes must be committed
   * INDEPENDENTLY of the domain transaction.
   */
  jobs: JobLifecycleWriter;

  /**
   * Factory for a transaction-bound `scan_job` writer used to finalize the
   * job inside the domain transaction. Defaults to `new ScanJobRepository(tx)`.
   */
  txJobs?: (tx: Tx) => TxJobWriter;

  /** Outbox repository; `enqueue` joins the domain transaction. */
  outbox: OutboxEnqueuer;

  /** Clock injection point for `finished_at` (defaults to `Date.now`). */
  now?: () => Date;

  /** Enqueue a Lead for AI analysis (R13.6). Defaults to a no-op if not provided. */
  enqueueAi?: (teamId: string, leadId: string, trigger: 'scan' | 'manual') => Promise<void>;
}

/** Inputs to {@link runScanJob}. */
export interface RunScanJobInput {
  teamId: string;
  configurationId: string;
  trigger: ScanJob['trigger'];
  query: ScanQuery;
  /** The Scan_Configuration's selected Source ids. */
  sourceIds: string[];
  /** Whether AI analysis is enabled for this scan (R13.6). */
  aiEnabled?: boolean;
}

/** Outcome of a {@link runScanJob} call. */
export interface ScanJobRunResult {
  /** The persisted `scan_job` id. */
  jobId: string;
  /** Terminal status persisted on the job. */
  status: ScanJobStatus;
  /** Accumulated summary, or `null` when the run never executed (R5.7). */
  summary: ScanSummary | null;
}

/**
 * Resolve the domain transaction runner, falling back to the real
 * {@link withTransaction} bound to `deps.pool`.
 */
function resolveRunInTx(deps: ScanJobRunnerDeps): <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> {
  if (deps.runInTx !== undefined) return deps.runInTx;
  const pool = deps.pool;
  if (pool === undefined) {
    throw new Error('runScanJob requires either `pool` or `runInTx` in its deps');
  }
  return (fn) => withTransaction(pool, fn);
}

/**
 * Decide whether a committed run was a TOTAL failure (R12.3): there was at
 * least one connector attempt and not one of them returned results. A
 * `partial` (rate-limited mid-fetch) or `ok` outcome counts as a non-total
 * run, so a run with even one productive connector is `succeeded` while the
 * per-connector errors remain recorded on the summary (R5.4).
 */
function isTotalFailure(summary: ScanSummary): boolean {
  const results = summary.connectorResults;
  if (results.length === 0) return false;
  return results.every((line) => line.outcome !== 'ok' && line.outcome !== 'partial');
}

/** Extract a human-readable message from an unknown thrown value. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Run a Scan_Job end-to-end with `scan_job` lifecycle persistence and the
 * Outbox notification (R12.3, R12.4).
 *
 * Returns:
 * - `ok({ status: 'succeeded' | 'failed', summary })` when the domain
 *   transaction committed. `failed` here means every connector failed yet no
 *   exception was thrown (no Lead was created, so existing Leads are intact).
 * - `err(VALIDATION)` when no Source was available (R5.7): no transaction was
 *   opened and no Lead created; the job is recorded `failed`.
 * - `err(INTERNAL)` on a hard total failure (the domain transaction threw and
 *   rolled back): pre-existing Leads are intact and the job is recorded
 *   `failed` via a separate write that survives the rollback.
 *
 * In every terminal case the persisted job status reflects the actual
 * execution outcome regardless of whether the notification can be enqueued or
 * later delivered (Outbox pattern).
 */
export async function runScanJob(
  deps: ScanJobRunnerDeps,
  input: RunScanJobInput,
): Promise<Result<ScanJobRunResult>> {
  const now = deps.now ?? ((): Date => new Date());
  const makeTxJobs = deps.txJobs ?? ((tx: Tx): TxJobWriter => new ScanJobRepository(tx));

  // 1. Create the `running` job. This write is committed independently of the
  //    domain transaction so the job survives a later domain rollback.
  const job = await deps.jobs.insert({
    teamId: input.teamId,
    configurationId: input.configurationId,
    trigger: input.trigger,
    status: 'running',
  });

  const realRunInTx = resolveRunInTx(deps);

  // Captured from inside the domain transaction (committed path only).
  let committedStatus: ScanJobStatus | null = null;
  let committedSummary: ScanSummary | null = null;

  // 2. Inject a `runInTx` that finalizes the job IN THE SAME transaction as
  //    the Lead writes. executeScan invokes this exactly once, with the
  //    pipeline whose resolved value is the ScanSummary.
  const finalizingRunInTx = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    realRunInTx(async (tx) => {
      const value = await fn(tx);
      // executeScan only uses runInTx to run runScanPipeline, which resolves
      // to a ScanSummary. This is the single coupling point to that contract.
      const summary = value as unknown as ScanSummary;

      const status: ScanJobStatus = isTotalFailure(summary) ? 'failed' : 'succeeded';
      const txJobs = makeTxJobs(tx);

      // Status + summary are written from the ACTUAL outcome (Catatan R12.4).
      await txJobs.setSummary(input.teamId, job.id, summary);
      await txJobs.setStatus(input.teamId, job.id, status);
      await txJobs.setFinishedAt(input.teamId, job.id, now());

      // Notification joins the same domain transaction (Outbox pattern). If
      // this throws, the whole transaction rolls back and the catch below
      // records `failed` — the status never depends on enqueue success.
      await deps.outbox.enqueue(tx, {
        teamId: input.teamId,
        type: status === 'succeeded' ? SCAN_COMPLETED_NOTIFICATION : SCAN_FAILED_NOTIFICATION,
        payload: {
          jobId: job.id,
          configurationId: input.configurationId,
          newLeads: summary.newLeads,
          duplicateLeads: summary.duplicateLeads,
        },
      });

      committedStatus = status;
      committedSummary = summary;
      return value;
    });

  try {
    const inputForEngine: ExecuteScanInput = { teamId: input.teamId, query: input.query, sourceIds: input.sourceIds };
    if (input.aiEnabled !== undefined) {
      inputForEngine.aiEnabled = input.aiEnabled;
    }

    const result = await executeScan(
      { ...deps.scan, runInTx: finalizingRunInTx },
      inputForEngine,
    );

    if (!result.ok) {
      // R5.7: no available Source → executeScan never opened a transaction
      // and created no Lead. The triggered job did not execute; record it
      // `failed` (the documented `skipped` status is reserved for scheduler
      // overlap, R5.8) in a separate write, and surface the original error.
      await deps.jobs.setStatus(input.teamId, job.id, 'failed');
      await deps.jobs.setFinishedAt(input.teamId, job.id, now());
      return err(result.error);
    }

    const finalSummary = committedSummary ?? result.value;

    // R13.6, R13.13: enqueue AI tasks AFTER the domain transaction commits.
    // If enqueue fails, the scan job is still marked succeeded.
    if (deps.enqueueAi && finalSummary.aiEnqueuedLeadIds && finalSummary.aiEnqueuedLeadIds.length > 0) {
      for (const leadId of finalSummary.aiEnqueuedLeadIds) {
        // Fire and forget (or await but catch errors so it doesn't fail the job)
        deps.enqueueAi(input.teamId, leadId, 'scan').catch((err) => {
          console.error(`Failed to enqueue AI for lead ${leadId}:`, err);
        });
      }
    }

    // Committed path: status/summary/outbox were already written in-tx.
    return ok({
      jobId: job.id,
      status: committedStatus ?? 'succeeded',
      summary: finalSummary,
    });
  } catch (error: unknown) {
    // Hard total failure: the domain transaction rolled back, so no partial
    // Lead writes persist (pre-existing Leads intact, R12.3) and no Outbox
    // row was committed. Record `failed` in a SEPARATE write that survives
    // the rollback (R12.4) — independent of any notification.
    await deps.jobs.setStatus(input.teamId, job.id, 'failed');
    await deps.jobs.setFinishedAt(input.teamId, job.id, now());
    return err({ code: 'INTERNAL', message: errorMessage(error) });
  }
}
