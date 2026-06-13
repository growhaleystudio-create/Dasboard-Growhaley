/**
 * Unit tests for the {@link JobScheduler} (Task 12.6, R5.6, R5.8).
 *
 * These example-based tests pin the scheduler behaviour that the Property 22
 * PBT generalizes:
 * - DUE DETECTION (R5.6): a Configuration is due when its interval has
 *   elapsed since its last run (or it has never run); fresh Configurations
 *   are not due.
 * - FAST-PATH OVERLAP (R5.8): a due Configuration with an already-`running`
 *   job is recorded `skipped` (not run).
 * - RACE OVERLAP (R5.8): when the `running` insert loses the `uniq_running_job`
 *   race the engine raises Postgres `23505`; the scheduler catches it and
 *   records `skipped`.
 * - LAUNCH (R5.6): a due Configuration with no running job is launched via
 *   `runScan` with `trigger='scheduled'`.
 * - NON-OVERLAP ERRORS bubble: a non-`23505` failure from `runScan` is not
 *   swallowed.
 *
 * In-memory fakes only — no database, no engine, no Redis.
 */

import { describe, it, expect } from 'vitest';
import type { Result, ScanJob } from '@leads-generator/shared';

import {
  JobScheduler,
  isDue,
  selectDue,
  isUniqueRunningJobViolation,
  type JobSchedulerDeps,
  type ScheduledConfiguration,
  type SkipRecord,
} from '../../src/scan/index.js';
import type { ScanJobInsert } from '../../src/repository/scan-job-repository.js';
import type { RunScanJobInput, ScanJobRunResult } from '../../src/scan/scan-job-runner.js';

const MS_PER_MINUTE = 60_000;
const NOW = new Date('2024-06-01T12:00:00.000Z');
const TEAM = 'team-1';

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * MS_PER_MINUTE);
}

function makeConfig(overrides: Partial<ScheduledConfiguration> = {}): ScheduledConfiguration {
  return {
    teamId: TEAM,
    configurationId: 'config-1',
    intervalMinutes: 60,
    lastRunStartedAt: null,
    query: { keywords: ['design'] },
    sourceIds: ['google'],
    ...overrides,
  };
}

/**
 * In-memory job store + run launcher. `running` seeds Configurations that
 * already have a `running` job (fast path). `raceConfigs` are Configurations
 * whose `runScan` should simulate losing the `uniq_running_job` race.
 */
class FakeWorld {
  readonly inserted: ScanJobInsert[] = [];
  readonly finishedAt = new Map<string, Date | null>();
  readonly launched: RunScanJobInput[] = [];
  readonly skips: SkipRecord[] = [];
  private seq = 0;

  constructor(
    private readonly runningByConfig: Set<string> = new Set(),
    private readonly raceConfigs: Set<string> = new Set(),
    private readonly hardErrorConfigs: Set<string> = new Set(),
  ) {}

  jobs = {
    listRunningForConfiguration: async (
      _teamId: string,
      configurationId: string,
    ): Promise<ScanJob[]> => {
      if (this.runningByConfig.has(configurationId)) {
        return [{ id: `running-${configurationId}`, status: 'running' } as unknown as ScanJob];
      }
      return [];
    },
    insert: async (input: ScanJobInsert): Promise<ScanJob> => {
      this.seq += 1;
      const id = `job-${this.seq}`;
      this.inserted.push(input);
      return { id, status: input.status } as unknown as ScanJob;
    },
    setFinishedAt: async (_teamId: string, jobId: string, at: Date | null): Promise<void> => {
      this.finishedAt.set(jobId, at);
    },
  };

  runScan = async (input: RunScanJobInput): Promise<Result<ScanJobRunResult>> => {
    if (this.hardErrorConfigs.has(input.configurationId)) {
      throw new Error('engine exploded');
    }
    if (this.raceConfigs.has(input.configurationId)) {
      // Simulate the DB rejecting a second `running` insert.
      throw Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
        constraint: 'uniq_running_job',
      });
    }
    this.launched.push(input);
    return {
      ok: true,
      value: { jobId: `run-${input.configurationId}`, status: 'succeeded', summary: null },
    };
  };

  deps(configs: ScheduledConfiguration[]): JobSchedulerDeps {
    return {
      loadScheduled: async () => configs,
      jobs: this.jobs,
      runScan: this.runScan,
      now: () => NOW,
      logSkip: (record) => this.skips.push(record),
    };
  }
}

describe('isDue / selectDue (R5.6)', () => {
  it('is due when the Configuration has never run', () => {
    expect(isDue(makeConfig({ lastRunStartedAt: null }), NOW)).toBe(true);
  });

  it('is due exactly at the interval boundary (>=)', () => {
    expect(isDue(makeConfig({ intervalMinutes: 60, lastRunStartedAt: minutesAgo(60) }), NOW)).toBe(
      true,
    );
  });

  it('is not due before the interval elapses', () => {
    expect(isDue(makeConfig({ intervalMinutes: 60, lastRunStartedAt: minutesAgo(59) }), NOW)).toBe(
      false,
    );
  });

  it('is not due with a non-positive interval', () => {
    expect(isDue(makeConfig({ intervalMinutes: 0, lastRunStartedAt: null }), NOW)).toBe(false);
  });

  it('selectDue keeps only the due Configurations preserving order', () => {
    const fresh = makeConfig({ configurationId: 'fresh', lastRunStartedAt: minutesAgo(5) });
    const due1 = makeConfig({ configurationId: 'due-1', lastRunStartedAt: null });
    const due2 = makeConfig({ configurationId: 'due-2', lastRunStartedAt: minutesAgo(120) });
    expect(selectDue([fresh, due1, due2], NOW).map((c) => c.configurationId)).toEqual([
      'due-1',
      'due-2',
    ]);
  });
});

describe('isUniqueRunningJobViolation', () => {
  it('matches a 23505 on the uniq_running_job constraint', () => {
    expect(isUniqueRunningJobViolation({ code: '23505', constraint: 'uniq_running_job' })).toBe(
      true,
    );
  });

  it('matches a bare 23505 when no constraint name is present', () => {
    expect(isUniqueRunningJobViolation({ code: '23505' })).toBe(true);
  });

  it('does not match a 23505 on a different constraint', () => {
    expect(isUniqueRunningJobViolation({ code: '23505', constraint: 'uniq_pending_invite' })).toBe(
      false,
    );
  });

  it('does not match non-unique-violation errors', () => {
    expect(isUniqueRunningJobViolation(new Error('boom'))).toBe(false);
    expect(isUniqueRunningJobViolation({ code: '23503' })).toBe(false);
    expect(isUniqueRunningJobViolation(null)).toBe(false);
  });
});

describe('JobScheduler.markDue (R5.6)', () => {
  it('returns only the due Configurations', async () => {
    const world = new FakeWorld();
    const configs = [
      makeConfig({ configurationId: 'fresh', lastRunStartedAt: minutesAgo(5) }),
      makeConfig({ configurationId: 'due', lastRunStartedAt: minutesAgo(120) }),
    ];
    const scheduler = new JobScheduler(world.deps(configs));
    const due = await scheduler.markDue();
    expect(due.map((c) => c.configurationId)).toEqual(['due']);
  });
});

describe('JobScheduler.tick (R5.6, R5.8)', () => {
  it('launches a due Configuration with no running job', async () => {
    const world = new FakeWorld();
    const config = makeConfig({ lastRunStartedAt: null });
    const scheduler = new JobScheduler(world.deps([config]));

    const result = await scheduler.tick();

    expect(result).toEqual({ dueCount: 1, startedCount: 1, skippedCount: 0 });
    expect(world.launched).toHaveLength(1);
    expect(world.launched[0]!.trigger).toBe('scheduled');
    expect(world.launched[0]!.configurationId).toBe('config-1');
    // No `skipped` job recorded.
    expect(world.inserted).toHaveLength(0);
  });

  it('records a skipped job (not run) when a job is already running (fast path, R5.8)', async () => {
    const world = new FakeWorld(new Set(['config-1']));
    const config = makeConfig({ lastRunStartedAt: null });
    const scheduler = new JobScheduler(world.deps([config]));

    const result = await scheduler.tick();

    expect(result).toEqual({ dueCount: 1, startedCount: 0, skippedCount: 1 });
    // The engine was never invoked.
    expect(world.launched).toHaveLength(0);
    // A `skipped` Scan_Job was recorded and stamped finished.
    expect(world.inserted).toHaveLength(1);
    expect(world.inserted[0]!.status).toBe('skipped');
    expect(world.inserted[0]!.trigger).toBe('scheduled');
    expect(world.skips).toHaveLength(1);
    expect([...world.finishedAt.values()][0]).toEqual(NOW);
  });

  it('records a skipped job when the running insert loses the uniq_running_job race (R5.8)', async () => {
    const world = new FakeWorld(new Set(), new Set(['config-1']));
    const config = makeConfig({ lastRunStartedAt: null });
    const scheduler = new JobScheduler(world.deps([config]));

    const result = await scheduler.tick();

    expect(result).toEqual({ dueCount: 1, startedCount: 0, skippedCount: 1 });
    expect(world.inserted).toHaveLength(1);
    expect(world.inserted[0]!.status).toBe('skipped');
    expect(world.skips).toHaveLength(1);
  });

  it('skips fresh Configurations entirely', async () => {
    const world = new FakeWorld();
    const config = makeConfig({ lastRunStartedAt: minutesAgo(5) });
    const scheduler = new JobScheduler(world.deps([config]));

    const result = await scheduler.tick();

    expect(result).toEqual({ dueCount: 0, startedCount: 0, skippedCount: 0 });
    expect(world.launched).toHaveLength(0);
    expect(world.inserted).toHaveLength(0);
  });

  it('handles a mix of due/launched, fast-path-skip, and fresh in one tick', async () => {
    const world = new FakeWorld(new Set(['busy']));
    const configs = [
      makeConfig({ configurationId: 'launch', lastRunStartedAt: null }),
      makeConfig({ configurationId: 'busy', lastRunStartedAt: minutesAgo(120) }),
      makeConfig({ configurationId: 'fresh', lastRunStartedAt: minutesAgo(1) }),
    ];
    const scheduler = new JobScheduler(world.deps(configs));

    const result = await scheduler.tick();

    expect(result).toEqual({ dueCount: 2, startedCount: 1, skippedCount: 1 });
    expect(world.launched.map((l) => l.configurationId)).toEqual(['launch']);
    expect(world.inserted.map((i) => i.status)).toEqual(['skipped']);
  });

  it('surfaces a non-overlap engine error instead of swallowing it', async () => {
    const world = new FakeWorld(new Set(), new Set(), new Set(['config-1']));
    const config = makeConfig({ lastRunStartedAt: null });
    const scheduler = new JobScheduler(world.deps([config]));

    await expect(scheduler.tick()).rejects.toThrow(/engine exploded/);
  });
});
