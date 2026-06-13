/**
 * Property-based test for scheduled Scan_Job overlap prevention (Task 12.7).
 *
 * - **Property 22: Pencegahan tumpang-tindih Scan_Job terjadwal** (R5.8) —
 *   for ANY set of concurrent/overlapping scheduled triggers aimed at the
 *   SAME Scan_Configuration, at most ONE Scan_Job is ever `running` for that
 *   Configuration at a time; every additional due trigger that arrives while
 *   a job is running is recorded as a `skipped` Scan_Job rather than run
 *   concurrently.
 *
 * The authoritative guarantee in production is the `uniq_running_job`
 * partial unique index (`scan_job (configuration_id) WHERE status =
 * 'running'`). This test models that index with an in-memory store that
 * raises a Postgres-style `23505` unique violation whenever a second
 * `running` row would be inserted for a Configuration. The
 * {@link JobScheduler} runs against a `runScan` that performs that guarded
 * insert (mirroring {@link runScanJob}'s `running`-row insert), so the test
 * exercises the REAL race path: triggers are fired in CONCURRENT batches, so
 * several can pass the scheduler's best-effort `listRunningForConfiguration`
 * fast-path check before any insert commits — and the single-threaded,
 * check-and-set insert then lets exactly one win while the rest take the
 * `23505` → `skipped` branch.
 *
 * The invariant is checked several ways across the interleavings:
 *   1. a live peak counter of `running` jobs per Configuration never exceeds
 *      1 at any observed moment,
 *   2. at most one `running` row exists after each batch, and
 *   3. every trigger ends EITHER as a launched run OR as a recorded
 *      `skipped` job — no trigger is silently lost and none becomes a second
 *      concurrent `running`.
 *
 * No real database, engine, or Redis is used.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';

import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';
import type { Result, ScanJob } from '@leads-generator/shared';

import {
  JobScheduler,
  type JobSchedulerDeps,
  type ScheduledConfiguration,
} from '../../src/scan/index.js';
import type { ScanJobInsert } from '../../src/repository/scan-job-repository.js';
import type { RunScanJobInput, ScanJobRunResult } from '../../src/scan/scan-job-runner.js';

const TEAM = 'team-1';
const CONFIG = 'config-overlap';
const NOW = new Date('2024-06-01T12:00:00.000Z');

interface StoredJob {
  id: string;
  configurationId: string;
  status: ScanJob['status'];
}

/**
 * A unique violation mirroring node-postgres' error shape for the
 * `uniq_running_job` partial index.
 */
class UniqueRunningJobError extends Error {
  readonly code = '23505';
  readonly constraint = 'uniq_running_job';
  constructor() {
    super('duplicate key value violates unique constraint "uniq_running_job"');
  }
}

/**
 * In-memory `scan_job` store that ENFORCES the `uniq_running_job` partial
 * unique index: at most one `running` row per Configuration. Also tracks the
 * historical peak of concurrently-`running` jobs per Configuration so the
 * test can assert the invariant was never momentarily violated.
 *
 * The insert's "is one already running?" check and the subsequent row
 * creation run synchronously within the async method body (no `await`
 * between them), so — exactly like a single Postgres backend applying the
 * partial unique index — concurrent inserts serialize and only the first
 * `running` row for a Configuration succeeds.
 */
class FakeJobStore {
  private readonly jobs = new Map<string, StoredJob>();
  private seq = 0;
  /** configurationId → current count of `running` rows. */
  private readonly runningCount = new Map<string, number>();
  /** configurationId → max concurrent `running` ever observed. */
  readonly peakRunning = new Map<string, number>();

  private bump(configurationId: string, delta: number): void {
    const next = (this.runningCount.get(configurationId) ?? 0) + delta;
    this.runningCount.set(configurationId, next);
    const peak = this.peakRunning.get(configurationId) ?? 0;
    if (next > peak) this.peakRunning.set(configurationId, next);
  }

  listRunningForConfiguration = async (
    _teamId: string,
    configurationId: string,
  ): Promise<ScanJob[]> => {
    const out: ScanJob[] = [];
    for (const job of this.jobs.values()) {
      if (job.configurationId === configurationId && job.status === 'running') {
        out.push(job as unknown as ScanJob);
      }
    }
    return out;
  };

  /** Insert a row, enforcing the partial unique index for `running` rows. */
  insert = async (input: ScanJobInsert): Promise<ScanJob> => {
    if (input.status === 'running') {
      const already = (this.runningCount.get(input.configurationId) ?? 0) > 0;
      if (already) throw new UniqueRunningJobError();
    }
    this.seq += 1;
    const id = `job-${this.seq}`;
    const job: StoredJob = { id, configurationId: input.configurationId, status: input.status };
    this.jobs.set(id, job);
    if (input.status === 'running') this.bump(input.configurationId, 1);
    return job as unknown as ScanJob;
  };

  setFinishedAt = async (): Promise<void> => {};

  /** Transition a `running` job to a terminal status (releases the slot). */
  complete(jobId: string, status: 'succeeded' | 'failed'): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') return;
    job.status = status;
    this.bump(job.configurationId, -1);
  }

  allJobs(): StoredJob[] {
    return [...this.jobs.values()];
  }
}

/**
 * Build the scheduler deps for a single trigger. `runScan` performs the
 * guarded `running` insert (like {@link runScanJob}) and leaves the job
 * `running` (the caller completes it later to model in-flight work).
 * `onStarted` reports the launched job id so the harness can track which
 * trigger won the single slot.
 */
function makeDeps(
  store: FakeJobStore,
  config: ScheduledConfiguration,
  onStarted: (jobId: string) => void,
): JobSchedulerDeps {
  const runScan = async (input: RunScanJobInput): Promise<Result<ScanJobRunResult>> => {
    // Mirrors runScanJob: insert the `running` row first (guarded by the
    // uniq_running_job index). A race loser throws 23505 here, which the
    // scheduler converts into a `skipped` record.
    const job = await store.insert({
      teamId: input.teamId,
      configurationId: input.configurationId,
      trigger: input.trigger,
      status: 'running',
    });
    onStarted(job.id);
    return { ok: true, value: { jobId: job.id, status: 'running', summary: null } };
  };

  return {
    loadScheduled: async () => [config],
    jobs: {
      listRunningForConfiguration: store.listRunningForConfiguration,
      insert: store.insert,
      setFinishedAt: store.setFinishedAt,
    },
    runScan,
    now: () => NOW,
  };
}

const dueConfig: ScheduledConfiguration = {
  teamId: TEAM,
  configurationId: CONFIG,
  intervalMinutes: 60,
  lastRunStartedAt: null, // always due
  query: { keywords: ['design'] },
  sourceIds: ['google'],
};

/**
 * A sequence of rounds. Each round fires `batchSize` triggers CONCURRENTLY
 * and optionally completes the in-flight run first (`completeBefore`),
 * freeing the single slot to model sequential vs. overlapping execution.
 */
const scheduleArb: fc.Arbitrary<
  { batchSize: number; completeBefore: boolean; completeStatus: 'succeeded' | 'failed' }[]
> = fc.array(
  fc.record({
    batchSize: fc.integer({ min: 1, max: 6 }),
    completeBefore: fc.boolean(),
    completeStatus: fc.constantFrom<'succeeded' | 'failed'>('succeeded', 'failed'),
  }),
  { minLength: 1, maxLength: 12 },
);

describe('scheduled Scan_Job overlap prevention (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 22: Pencegahan tumpang-tindih Scan_Job terjadwal
  // Validates: Requirements 5.8
  propertyTest(it, 22, 'Pencegahan tumpang-tindih Scan_Job terjadwal', async () => {
    await pbt.assert(
      fc.asyncProperty(scheduleArb, async (schedule) => {
        const store = new FakeJobStore();
        let inFlightJobId: string | null = null;
        let launchedCount = 0;
        let totalTriggers = 0;

        for (const round of schedule) {
          // Optionally free the single slot before this round's batch (models
          // a previous run finishing) so some batches overlap and some don't.
          if (round.completeBefore && inFlightJobId !== null) {
            store.complete(inFlightJobId, round.completeStatus);
            inFlightJobId = null;
          }

          const slotFreeAtStart = inFlightJobId === null;
          totalTriggers += round.batchSize;

          // Fire the whole batch concurrently. Each trigger drives its own
          // scheduler tick; the shared store is the only synchronization
          // point — exactly like many workers hitting one Postgres index.
          const startedInRound: string[] = [];
          await Promise.all(
            Array.from({ length: round.batchSize }, () =>
              new JobScheduler(
                makeDeps(store, dueConfig, (jobId) => startedInRound.push(jobId)),
              ).tick(NOW),
            ),
          );

          // Invariant (1): the `uniq_running_job` slot was never doubled.
          if ((store.peakRunning.get(CONFIG) ?? 0) > 1) return false;

          // Invariant (2): at most one `running` row exists after the batch.
          const runningRows = await store.listRunningForConfiguration(TEAM, CONFIG);
          if (runningRows.length > 1) return false;

          // At most one trigger in a batch may win the single slot. When the
          // slot was already occupied at batch start, NONE may launch.
          if (startedInRound.length > 1) return false;
          if (!slotFreeAtStart && startedInRound.length !== 0) return false;

          if (startedInRound.length === 1) {
            inFlightJobId = startedInRound[0]!;
            launchedCount += 1;
          }
        }

        // Invariant (3): every trigger produced exactly one job row, split
        // into launched runs (running/succeeded/failed) + `skipped` records —
        // no trigger silently lost, none a second concurrent `running`.
        const jobs = store.allJobs();
        const skipped = jobs.filter((j) => j.status === 'skipped').length;
        const launchedRows = jobs.filter((j) => j.status !== 'skipped').length;
        if (jobs.length !== totalTriggers) return false;
        if (launchedRows !== launchedCount) return false;
        if (launchedCount + skipped !== totalTriggers) return false;

        return true;
      }),
      defaultPbtParams,
    );
  });
});
