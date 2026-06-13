/**
 * Job_Scheduler — drives scheduled Scan_Job execution and enforces overlap
 * prevention (Task 12.6, R5.6, R5.8).
 *
 * Design references:
 * - design.md → Scan_Engine & Job_Scheduler: `interface Job_Scheduler {
 *   markDue(): Promise<ScanConfiguration[]>; hasRunningJob(configurationId):
 *   boolean; }`. {@link JobScheduler.markDue} returns the Configurations
 *   whose scheduled interval has elapsed; overlap prevention replaces the
 *   sync `hasRunningJob` with the async, DB-authoritative guard below.
 * - design.md → Alur Eksekusi Pemindaian (the `skipped` branch): "scheduled
 *   & job lain masih running? — ya → Skip + catat, status=skipped (R5.8)".
 *   A due scheduled job that arrives while another job for the SAME
 *   Configuration is still `running` is recorded as a `skipped` Scan_Job
 *   instead of being run concurrently.
 * - requirements.md R5.6 (run automatically at each scheduled interval) and
 *   R5.8 (skip + record when a previous job for the same Configuration is
 *   still running).
 *
 * Two layers of overlap prevention
 * --------------------------------
 * 1. **Fast path (best-effort)** — {@link ScanJobRepository.listRunningForConfiguration}
 *    is consulted before attempting a run; if a `running` job already exists
 *    the due trigger is recorded `skipped` without touching the engine.
 * 2. **Authoritative guard (the real guarantee)** — the `uniq_running_job`
 *    PARTIAL UNIQUE index (`scan_job (configuration_id) WHERE status =
 *    'running'`, created in migration 1700000001000) makes it impossible for
 *    two `running` rows to coexist for one Configuration. Between the fast
 *    path read and the `running` insert another worker can win the race, so
 *    the insert (inside {@link runScanJob}) may raise Postgres unique
 *    violation `23505`. That is caught here via
 *    {@link isUniqueRunningJobViolation} and treated as an overlap → the
 *    trigger is recorded `skipped`. The DB constraint — not the application
 *    read — is the source of truth for R5.8.
 *
 * Everything is injectable (mirroring {@link RetentionWorker}) so the
 * scheduler can be unit/property-tested with in-memory fakes and run against
 * real Postgres in production. The `tick()` method is the entry point a
 * queue worker (BullMQ repeatable job) invokes on each scheduled sweep.
 */

import type { Result, ScanJob } from '@leads-generator/shared';

import type { ScanQuery } from '../connector/source-connector.js';
import type { ScanJobInsert } from '../repository/scan-job-repository.js';
import type { RunScanJobInput, ScanJobRunResult } from './scan-job-runner.js';

/** Postgres `unique_violation` SQLSTATE code. */
const PG_UNIQUE_VIOLATION = '23505';

/** Name of the partial unique index that enforces single-running-job (R5.8). */
const RUNNING_JOB_CONSTRAINT = 'uniq_running_job';

/** Milliseconds in one minute — the unit `schedule_interval_minutes` uses. */
const MS_PER_MINUTE = 60_000;

/**
 * A Scan_Configuration projected with everything the scheduler needs to
 * decide due-ness and (if due) launch a scan: its schedule interval, the
 * start time of its most recent Scan_Job (or `null` when it has never run),
 * and the query/source selection to hand to {@link runScanJob}.
 */
export interface ScheduledConfiguration {
  teamId: string;
  configurationId: string;
  /** `schedule_interval_minutes` (60..43200 per R5.6). */
  intervalMinutes: number;
  /** `started_at` of the latest Scan_Job for this Configuration, else `null`. */
  lastRunStartedAt: Date | null;
  /** Search parameters derived from the Configuration. */
  query: ScanQuery;
  /** The Configuration's selected Source ids. */
  sourceIds: string[];
}

/** A recorded scheduler skip (R5.8). */
export interface SkipRecord {
  teamId: string;
  configurationId: string;
  /** Id of the `skipped` Scan_Job written to record the skip. */
  jobId: string;
  at: Date;
}

/**
 * Subset of {@link ScanJobRepository} the scheduler needs: reading the
 * running job (fast path) and writing the `skipped` record.
 */
export interface SchedulerJobStore {
  listRunningForConfiguration(teamId: string, configurationId: string): Promise<ScanJob[]>;
  insert(input: ScanJobInsert): Promise<ScanJob>;
  setFinishedAt(teamId: string, jobId: string, finishedAt: Date | null): Promise<void>;
}

/** Collaborators for {@link JobScheduler}. */
export interface JobSchedulerDeps {
  /**
   * Load every Configuration that carries a schedule, projected with its
   * last-run time and query/source selection.
   */
  loadScheduled: () => Promise<ScheduledConfiguration[]>;
  /** Job store used for the overlap fast path and the `skipped` record. */
  jobs: SchedulerJobStore;
  /**
   * Launch a scan end-to-end. In production this is
   * `(input) => runScanJob(runnerDeps, input)`; injectable so the scheduler
   * is testable without the engine/DB. It MUST insert the `running` job so
   * the `uniq_running_job` guard applies; a unique-violation it raises is
   * interpreted as an overlap.
   */
  runScan: (input: RunScanJobInput) => Promise<Result<ScanJobRunResult>>;
  /** Clock seam; defaults to `() => new Date()`. */
  now?: () => Date;
  /** Optional sink for recorded skips (logging/metrics). */
  logSkip?: (record: SkipRecord) => void;
}

/** Outcome of a single {@link JobScheduler.tick}. */
export interface SchedulerTickResult {
  /** Configurations found due this tick. */
  dueCount: number;
  /** Due Configurations whose scan was launched. */
  startedCount: number;
  /** Due Configurations skipped because a job was already running (R5.8). */
  skippedCount: number;
}

/**
 * True when a Scan_Configuration is due to run at `now`: it has a positive
 * schedule interval and either has never run, or at least `intervalMinutes`
 * have elapsed since its most recent Scan_Job started.
 *
 * Pure & deterministic. A non-positive/non-finite interval is never due
 * (a Configuration without a valid schedule is not scheduled). Comparison
 * is `>=` so a Configuration becomes due exactly at the interval boundary.
 * Non-finite timestamps yield `false` rather than firing on an unusable
 * clock value.
 */
export function isDue(config: ScheduledConfiguration, now: Date): boolean {
  if (!Number.isFinite(config.intervalMinutes) || config.intervalMinutes <= 0) {
    return false;
  }
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return false;
  if (config.lastRunStartedAt === null) return true;
  const lastMs = config.lastRunStartedAt.getTime();
  if (!Number.isFinite(lastMs)) return false;
  return nowMs - lastMs >= config.intervalMinutes * MS_PER_MINUTE;
}

/**
 * Filter `configs` to those due at `now` (see {@link isDue}). Input order is
 * preserved. Pure & deterministic.
 */
export function selectDue(
  configs: readonly ScheduledConfiguration[],
  now: Date,
): ScheduledConfiguration[] {
  return configs.filter((config) => isDue(config, now));
}

/**
 * True when `error` is a Postgres unique-violation (`23505`) raised by the
 * `uniq_running_job` partial index — i.e. an attempt to start a second
 * `running` Scan_Job for a Configuration that already has one (R5.8).
 *
 * When the driver exposes the violated `constraint` name it is matched
 * exactly so unrelated unique violations are not mistaken for overlap; when
 * the name is absent the `23505` code alone is treated as overlap (the only
 * `running`-job insert the scheduler performs targets this index).
 */
export function isUniqueRunningJobViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (candidate.code !== PG_UNIQUE_VIOLATION) return false;
  if (typeof candidate.constraint === 'string' && candidate.constraint.length > 0) {
    return candidate.constraint === RUNNING_JOB_CONSTRAINT;
  }
  return true;
}

/**
 * Schedules and launches recurring Scan_Jobs, never letting two `running`
 * jobs coexist for one Configuration (R5.6, R5.8).
 */
export class JobScheduler {
  constructor(private readonly deps: JobSchedulerDeps) {}

  private clock(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  /**
   * Return the scheduled Configurations whose interval has elapsed at `now`
   * (defaults to the injected clock). This is the design's
   * `markDue(): Promise<ScanConfiguration[]>` — the due set the dispatcher
   * then attempts to launch.
   */
  async markDue(now: Date = this.clock()): Promise<ScheduledConfiguration[]> {
    const configs = await this.deps.loadScheduled();
    return selectDue(configs, now);
  }

  /**
   * One scheduler sweep: compute the due Configurations and attempt to run
   * each. A Configuration with a job already `running` (fast path) or that
   * loses the `uniq_running_job` race (authoritative guard) is recorded
   * `skipped` (R5.8) instead of run; the rest are launched (R5.6). Returns
   * the per-tick counts.
   *
   * This is the entry point a queue worker (BullMQ repeatable job) invokes.
   */
  async tick(now: Date = this.clock()): Promise<SchedulerTickResult> {
    const due = await this.markDue(now);
    let startedCount = 0;
    let skippedCount = 0;

    for (const config of due) {
      const outcome = await this.runOrSkip(config, now);
      if (outcome === 'started') {
        startedCount += 1;
      } else {
        skippedCount += 1;
      }
    }

    return { dueCount: due.length, startedCount, skippedCount };
  }

  /**
   * Launch a due Configuration's scan unless a job is already running for it.
   * Returns `'skipped'` when overlap is detected (fast path or
   * unique-violation race), `'started'` when a scan was launched.
   */
  private async runOrSkip(
    config: ScheduledConfiguration,
    now: Date,
  ): Promise<'started' | 'skipped'> {
    // Fast path (best-effort): an already-running job → skip without touching
    // the engine.
    const running = await this.deps.jobs.listRunningForConfiguration(
      config.teamId,
      config.configurationId,
    );
    if (running.length > 0) {
      await this.recordSkip(config, now);
      return 'skipped';
    }

    try {
      await this.deps.runScan({
        teamId: config.teamId,
        configurationId: config.configurationId,
        trigger: 'scheduled',
        query: config.query,
        sourceIds: config.sourceIds,
      });
      return 'started';
    } catch (error: unknown) {
      // Authoritative guard: the `running` insert lost the race to the
      // `uniq_running_job` index → treat as overlap and record `skipped`.
      if (isUniqueRunningJobViolation(error)) {
        await this.recordSkip(config, now);
        return 'skipped';
      }
      // Any other failure is a genuine error — surface it.
      throw error;
    }
  }

  /**
   * Persist a `skipped` Scan_Job recording that a scheduled run was passed
   * over because another job for the Configuration was still running (R5.8),
   * stamping it finished and notifying the optional skip sink.
   */
  private async recordSkip(config: ScheduledConfiguration, now: Date): Promise<void> {
    const job = await this.deps.jobs.insert({
      teamId: config.teamId,
      configurationId: config.configurationId,
      trigger: 'scheduled',
      status: 'skipped',
    });
    await this.deps.jobs.setFinishedAt(config.teamId, job.id, now);
    this.deps.logSkip?.({
      teamId: config.teamId,
      configurationId: config.configurationId,
      jobId: job.id,
      at: now,
    });
  }
}
