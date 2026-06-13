/**
 * Unit tests for {@link runScanJob} (Task 12.4, R12.3, R12.4).
 *
 * These example-based tests pin the Scan_Job lifecycle behaviour that the
 * Property 36 PBT generalizes:
 * - SUCCESS: a productive run writes `succeeded` + summary + a
 *   `scan.completed` Outbox row inside the SAME domain transaction.
 * - COMMITTED TOTAL FAILURE: every connector fails but no exception is
 *   thrown — the domain transaction commits `failed` (no Lead created) and a
 *   `scan.failed` Outbox row.
 * - HARD TOTAL FAILURE: the domain transaction throws → it rolls back (no
 *   partial Lead writes, no Outbox row) and the job is recorded `failed` via
 *   a SEPARATE pool write that survives the rollback (R12.3, R12.4).
 * - STATUS INDEPENDENT OF NOTIFICATION: when the Outbox enqueue itself
 *   throws, the domain transaction rolls back and the job still ends
 *   `failed` — the status reflects the actual outcome regardless of delivery.
 * - R5.7: no available Source → no transaction opened, no Lead created, job
 *   recorded `failed`, original VALIDATION error surfaced.
 *
 * A commit/rollback-aware fake transaction runner stages the in-tx job
 * writes + Outbox row and only merges them on success, discarding them on a
 * throw. No real database or network is involved.
 */

import { describe, expect, it } from 'vitest';
import type {
  ConnectorRunResult,
  ConnectorStatus,
  NormalizedLead,
  RawProspect,
  Result,
  ScanSummary,
  ScoringModel,
} from '@leads-generator/shared';

import {
  runScanJob,
  SCAN_COMPLETED_NOTIFICATION,
  SCAN_FAILED_NOTIFICATION,
  type ScanJobRunnerDeps,
  type TxJobWriter,
} from '../../src/scan/index.js';
import type { Connector_Registry } from '../../src/connector/registry.js';
import type { Source_Connector, ScanQuery } from '../../src/connector/source-connector.js';
import type { DeduplicationService, DedupResult } from '../../src/dedup/dedup-service.js';
import type { LeadScoringPersister } from '../../src/scoring/score-and-persist.js';
import type { OutboxMessage } from '../../src/scoring/outbox-repository.js';
import type { ScorableLead } from '../../src/scoring/scorable-lead.js';
import type { ScanJobInsert } from '../../src/repository/scan-job-repository.js';
import type { ScanJob, ScanJobStatus } from '@leads-generator/shared';
import type { Tx } from '../../src/db/transaction.js';

const TEAM = 'team-1';
const CONFIG = 'config-1';
const MODEL: ScoringModel = { teamId: TEAM, version: 1, factors: [] };

// ---------------------------------------------------------------------------
// Connector fakes.
// ---------------------------------------------------------------------------

function prospect(keyword: string): RawProspect {
  return { matchedKeyword: keyword, acquiredAt: new Date(0), name: `${keyword}-prospect` };
}

type FetchFn = (query: ScanQuery, signal: AbortSignal) => Promise<RawProspect[]>;

function makeConnector(sourceId: string, fetch: FetchFn): Source_Connector {
  return {
    sourceId,
    displayName: sourceId,
    checkAvailability: (): Promise<ConnectorStatus> => Promise.resolve('available'),
    fetch,
    normalize: (raw: RawProspect, teamId: string): NormalizedLead => ({
      teamId,
      sources: [sourceId],
      matchedKeywords: [raw.matchedKeyword],
      discoveredAt: raw.acquiredAt,
    }),
  };
}

/** Registry exposing exactly the given `available` connectors. */
function makeRegistry(connectors: Source_Connector[]): Connector_Registry {
  const byId = new Map(connectors.map((c) => [c.sourceId, c]));
  return {
    listForTeam: (_teamId: string) =>
      Promise.resolve(
        connectors.map((c) => ({
          sourceId: c.sourceId,
          displayName: c.displayName,
          status: 'available' as ConnectorStatus,
        })),
      ),
    get: (sourceId: string): Source_Connector | null => byId.get(sourceId) ?? null,
  } as unknown as Connector_Registry;
}

class FakeDedup {
  ingestCalls = 0;
  async ingest(_tx: Tx, _n: NormalizedLead): Promise<DedupResult> {
    this.ingestCalls += 1;
    return { outcome: 'created', leadId: `lead-${this.ingestCalls}` };
  }
}

class FakeScorer {
  async scoreAndPersist(): Promise<Result<{ score: number | null; state: 'scored' | 'unscored' }>> {
    return { ok: true, value: { score: null, state: 'unscored' } };
  }
}

// ---------------------------------------------------------------------------
// Job + Outbox fakes with a commit/rollback-aware transaction runner.
// ---------------------------------------------------------------------------

interface StoredJob {
  id: string;
  status: ScanJobStatus;
  summary: ScanSummary | null;
  finishedAt: Date | null;
}

/** Writes staged inside a single fake transaction. */
interface Staging {
  jobStatus?: ScanJobStatus;
  jobSummary?: ScanSummary;
  jobFinishedAt?: Date | null;
  outbox: OutboxMessage[];
}

class FakeWorld {
  readonly jobs = new Map<string, StoredJob>();
  readonly committedOutbox: OutboxMessage[] = [];
  private seq = 0;

  // ---- pool-bound job writer (survives domain rollback) ----
  jobWriter = {
    insert: async (input: ScanJobInsert): Promise<ScanJob> => {
      this.seq += 1;
      const id = `job-${this.seq}`;
      this.jobs.set(id, { id, status: input.status, summary: null, finishedAt: null });
      return { id, status: input.status } as unknown as ScanJob;
    },
    setStatus: async (_teamId: string, jobId: string, status: ScanJobStatus): Promise<void> => {
      const job = this.jobs.get(jobId);
      if (job) job.status = status;
    },
    setFinishedAt: async (_teamId: string, jobId: string, at: Date | null): Promise<void> => {
      const job = this.jobs.get(jobId);
      if (job) job.finishedAt = at;
    },
  };

  // ---- outbox enqueue stages into the active tx ----
  outbox = {
    enqueue: async (tx: Tx, message: OutboxMessage): Promise<void> => {
      const staging = tx as unknown as Staging;
      staging.outbox.push(message);
    },
  };

  // ---- tx-bound job writer stages into the active tx ----
  txJobs = (tx: Tx): TxJobWriter => {
    const staging = tx as unknown as Staging;
    return {
      setStatus: async (_t: string, _id: string, status: ScanJobStatus): Promise<void> => {
        staging.jobStatus = status;
      },
      setSummary: async (_t: string, _id: string, summary: ScanSummary): Promise<void> => {
        staging.jobSummary = summary;
      },
      setFinishedAt: async (_t: string, _id: string, at: Date | null): Promise<void> => {
        staging.jobFinishedAt = at;
      },
    };
  };

  // ---- commit/rollback-aware runner ----
  runInTx = async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
    const staging: Staging = { outbox: [] };
    const tx = staging as unknown as Tx;
    // If `fn` rejects, we propagate WITHOUT merging — staged writes dropped.
    const result = await fn(tx);
    // COMMIT: merge staged job writes + outbox rows into the durable store.
    for (const job of this.jobs.values()) {
      if (staging.jobStatus !== undefined) job.status = staging.jobStatus;
      if (staging.jobSummary !== undefined) job.summary = staging.jobSummary;
      if (staging.jobFinishedAt !== undefined) job.finishedAt = staging.jobFinishedAt;
    }
    this.committedOutbox.push(...staging.outbox);
    return result;
  };
}

function makeDeps(world: FakeWorld, connectors: Source_Connector[]): ScanJobRunnerDeps {
  const dedup = new FakeDedup();
  const scorer = new FakeScorer();
  return {
    scan: {
      registry: makeRegistry(connectors),
      loadModel: (_team: string): Promise<ScoringModel | null> => Promise.resolve(MODEL),
      pipeline: {
        dedup: (_tx: Tx): DeduplicationService => dedup as unknown as DeduplicationService,
        scorer: (_tx: Tx): LeadScoringPersister => scorer as unknown as LeadScoringPersister,
        project: (_leadId: string, n: NormalizedLead): ScorableLead => ({
          teamId: n.teamId,
          matchedKeywords: n.matchedKeywords,
          sources: n.sources,
          discoveredAt: n.discoveredAt,
          referenceTime: new Date(0),
          aiIntentScore: null,
        }),
      },
    },
    runInTx: world.runInTx,
    jobs: world.jobWriter,
    txJobs: world.txJobs,
    outbox: world.outbox,
    now: () => new Date('2024-01-01T00:00:00.000Z'),
  };
}

const INPUT = {
  teamId: TEAM,
  configurationId: CONFIG,
  trigger: 'manual' as const,
  query: { keywords: ['design'] },
  sourceIds: ['google'],
};

describe('runScanJob', () => {
  it('persists succeeded + summary + scan.completed outbox in one tx on a productive run', async () => {
    const world = new FakeWorld();
    const connector = makeConnector('google', () => Promise.resolve([prospect('design')]));

    const result = await runScanJob(makeDeps(world, [connector]), INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('succeeded');
    expect(result.value.summary?.newLeads).toBe(1);

    const job = world.jobs.get(result.value.jobId)!;
    expect(job.status).toBe('succeeded');
    expect(job.summary?.newLeads).toBe(1);
    expect(job.finishedAt).not.toBeNull();

    expect(world.committedOutbox).toHaveLength(1);
    expect(world.committedOutbox[0]!.type).toBe(SCAN_COMPLETED_NOTIFICATION);
    expect(world.committedOutbox[0]!.teamId).toBe(TEAM);
  });

  it('commits failed + scan.failed outbox when every connector fails but nothing throws', async () => {
    const world = new FakeWorld();
    // Connector rejects → runner classifies it `error`; itemsFetched 0.
    const connector = makeConnector('google', () => Promise.reject(new Error('boom')));

    const result = await runScanJob(makeDeps(world, [connector]), INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('failed');
    // No Lead created (total failure).
    expect(result.value.summary?.newLeads).toBe(0);

    const job = world.jobs.get(result.value.jobId)!;
    expect(job.status).toBe('failed');
    expect(world.committedOutbox).toHaveLength(1);
    expect(world.committedOutbox[0]!.type).toBe(SCAN_FAILED_NOTIFICATION);
  });

  it('records failed via a separate write and rolls back the domain tx when it throws', async () => {
    const world = new FakeWorld();
    const connector = makeConnector('google', () => Promise.resolve([prospect('design')]));
    const deps = makeDeps(world, [connector]);
    // Make the in-tx finalize throw AFTER the pipeline produced its summary
    // by having the tx-bound setSummary throw — emulates a domain write
    // failure inside the transaction.
    deps.txJobs = (_tx: Tx): TxJobWriter => ({
      setStatus: async (): Promise<void> => {},
      setSummary: async (): Promise<void> => {
        throw new Error('injected in-tx failure');
      },
      setFinishedAt: async (): Promise<void> => {},
    });

    const result = await runScanJob(deps, INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INTERNAL');

    // The `running` job was recorded `failed` via the pool writer (survives
    // the rollback), and NO outbox row was committed.
    const job = [...world.jobs.values()][0]!;
    expect(job.status).toBe('failed');
    expect(job.finishedAt).not.toBeNull();
    expect(world.committedOutbox).toHaveLength(0);
  });

  it('ends failed regardless of notification: an outbox enqueue failure rolls back and marks failed', async () => {
    const world = new FakeWorld();
    const connector = makeConnector('google', () => Promise.resolve([prospect('design')]));
    const deps = makeDeps(world, [connector]);
    // Notification delivery (enqueue) fails inside the domain tx.
    deps.outbox = {
      enqueue: async (): Promise<void> => {
        throw new Error('outbox unavailable');
      },
    };

    const result = await runScanJob(deps, INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INTERNAL');

    const job = [...world.jobs.values()][0]!;
    // Status reflects the actual outcome (failed) independent of the
    // notification path; no outbox row committed.
    expect(job.status).toBe('failed');
    expect(world.committedOutbox).toHaveLength(0);
  });

  it('records failed and surfaces the VALIDATION error when no Source is available (R5.7)', async () => {
    const world = new FakeWorld();
    // Empty registry → executeScan returns VALIDATION without opening a tx.
    const result = await runScanJob(makeDeps(world, []), INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');

    const job = [...world.jobs.values()][0]!;
    expect(job.status).toBe('failed');
    expect(job.finishedAt).not.toBeNull();
    // No domain transaction → no outbox row, no summary persisted.
    expect(world.committedOutbox).toHaveLength(0);
    expect(job.summary).toBeNull();
  });

  it('marks succeeded when at least one connector is productive even if another errors (R5.4)', async () => {
    const world = new FakeWorld();
    const ok = makeConnector('google', () => Promise.resolve([prospect('design')]));
    const bad = makeConnector('bing', () => Promise.reject(new Error('boom')));

    const result = await runScanJob(makeDeps(world, [ok, bad]), {
      ...INPUT,
      sourceIds: ['google', 'bing'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('succeeded');
    const job = world.jobs.get(result.value.jobId)!;
    expect(job.status).toBe('succeeded');
    // The errored connector is still recorded on the summary (R5.4).
    const outcomes = (result.value.summary?.connectorResults ?? []).map(
      (r: ConnectorRunResult) => r.outcome,
    );
    expect(outcomes).toContain('ok');
    expect(outcomes).toContain('error');
  });
});
