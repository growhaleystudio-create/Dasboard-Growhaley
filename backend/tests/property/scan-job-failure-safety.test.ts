/**
 * Property-based test for Scan_Job total-failure safety (Task 12.5).
 *
 * - **Property 36: Keamanan kegagalan Scan_Job total** (R12.3, R12.4) — for
 *   ANY initial Team Lead state, a Scan_Job that fails TOTALLY (no connector
 *   returns results) SHALL:
 *   * leave every pre-existing Lead unchanged (R12.3), and
 *   * end with persisted status `failed` (R12.4),
 *   * REGARDLESS of whether the notification (Outbox) delivery would succeed
 *     or fail — the status is decided by the actual outcome, not by the
 *     notification (Outbox pattern / Catatan R12.4).
 *
 * No real database or network is used. A commit/rollback-aware fake
 * transaction runner stages all in-tx writes (the finalize job writes, the
 * Outbox row, and any Lead creation) and merges them only on success,
 * discarding them on a throw — so a rolled-back domain transaction provably
 * preserves the pre-existing committed Lead store. Every connector is made
 * to fail (rejecting with a generic error or a `RateLimitError`), so each
 * generated run is a genuine total failure (no Source returns results); the
 * `notificationWillFail` toggle independently forces the Outbox enqueue to
 * throw, exercising the "status independent of notification" clause.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';

import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';
import type {
  ConnectorStatus,
  NormalizedLead,
  RawProspect,
  Result,
  ScanJob,
  ScanJobStatus,
  ScanSummary,
  ScoringModel,
} from '@leads-generator/shared';

import {
  RateLimitError,
  runScanJob,
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
import type { Tx } from '../../src/db/transaction.js';

const TEAM = 'team-1';
const CONFIG = 'config-1';
const MODEL: ScoringModel = { teamId: TEAM, version: 1, factors: [] };

// ---------------------------------------------------------------------------
// Fakes (self-contained; mirror the unit-test world but add a Lead store and
// a notification-fault toggle).
// ---------------------------------------------------------------------------

interface StoredJob {
  id: string;
  status: ScanJobStatus;
  summary: ScanSummary | null;
}

interface Staging {
  jobStatus?: ScanJobStatus;
  jobSummary?: ScanSummary;
  outbox: OutboxMessage[];
  /** Lead ids "created" within this tx (none in a total failure). */
  createdLeads: string[];
}

/** How a single connector fails (both yield zero results). */
type FailKind = 'error' | 'rate_limited';

class FakeWorld {
  readonly jobs = new Map<string, StoredJob>();
  readonly committedOutbox: OutboxMessage[] = [];
  /** Durable Lead store: leadId → score. Seeded with pre-existing Leads. */
  readonly committedLeads = new Map<string, number>();
  private seq = 0;

  constructor(
    private readonly notificationWillFail: boolean,
  ) {}

  seedLead(id: string, score: number): void {
    this.committedLeads.set(id, score);
  }

  jobWriter = {
    insert: async (input: ScanJobInsert): Promise<ScanJob> => {
      this.seq += 1;
      const id = `job-${this.seq}`;
      this.jobs.set(id, { id, status: input.status, summary: null });
      return { id, status: input.status } as unknown as ScanJob;
    },
    setStatus: async (_t: string, jobId: string, status: ScanJobStatus): Promise<void> => {
      const job = this.jobs.get(jobId);
      if (job) job.status = status;
    },
    setFinishedAt: async (): Promise<void> => {},
  };

  outbox = {
    enqueue: async (tx: Tx, message: OutboxMessage): Promise<void> => {
      if (this.notificationWillFail) {
        // Notification delivery cannot be persisted — forces the domain
        // transaction to roll back. The status must STILL end `failed`.
        throw new Error('outbox unavailable');
      }
      (tx as unknown as Staging).outbox.push(message);
    },
  };

  txJobs = (tx: Tx): TxJobWriter => {
    const staging = tx as unknown as Staging;
    return {
      setStatus: async (_t: string, _id: string, status: ScanJobStatus): Promise<void> => {
        staging.jobStatus = status;
      },
      setSummary: async (_t: string, _id: string, summary: ScanSummary): Promise<void> => {
        staging.jobSummary = summary;
      },
      setFinishedAt: async (): Promise<void> => {},
    };
  };

  /** Dedup fake: stages a Lead creation into the active tx (never called in a total failure). */
  dedup = {
    ingestCalls: 0,
    ingest: async (tx: Tx, _n: NormalizedLead): Promise<DedupResult> => {
      this.dedup.ingestCalls += 1;
      const leadId = `new-${this.dedup.ingestCalls}`;
      (tx as unknown as Staging).createdLeads.push(leadId);
      return { outcome: 'created', leadId };
    },
  };

  runInTx = async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
    const staging: Staging = { outbox: [], createdLeads: [] };
    const tx = staging as unknown as Tx;
    // Reject → propagate WITHOUT merging (ROLLBACK): staged writes dropped.
    const result = await fn(tx);
    // COMMIT: merge staged writes into the durable stores.
    for (const job of this.jobs.values()) {
      if (staging.jobStatus !== undefined) job.status = staging.jobStatus;
      if (staging.jobSummary !== undefined) job.summary = staging.jobSummary;
    }
    this.committedOutbox.push(...staging.outbox);
    for (const leadId of staging.createdLeads) this.committedLeads.set(leadId, 0);
    return result;
  };
}

function makeFailingConnector(sourceId: string, kind: FailKind): Source_Connector {
  return {
    sourceId,
    displayName: sourceId,
    checkAvailability: (): Promise<ConnectorStatus> => Promise.resolve('available'),
    fetch: (_q: ScanQuery, _s: AbortSignal): Promise<RawProspect[]> =>
      kind === 'rate_limited'
        ? Promise.reject(new RateLimitError())
        : Promise.reject(new Error('connector failed')),
    normalize: (raw: RawProspect, teamId: string): NormalizedLead => ({
      teamId,
      sources: [sourceId],
      matchedKeywords: [raw.matchedKeyword],
      discoveredAt: raw.acquiredAt,
    }),
  };
}

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

class FakeScorer {
  async scoreAndPersist(): Promise<Result<{ score: number | null; state: 'scored' | 'unscored' }>> {
    return { ok: true, value: { score: null, state: 'unscored' } };
  }
}

function makeDeps(world: FakeWorld, connectors: Source_Connector[]): ScanJobRunnerDeps {
  const scorer = new FakeScorer();
  return {
    scan: {
      registry: makeRegistry(connectors),
      loadModel: (_team: string): Promise<ScoringModel | null> => Promise.resolve(MODEL),
      pipeline: {
        dedup: (_tx: Tx): DeduplicationService => world.dedup as unknown as DeduplicationService,
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

// ---------------------------------------------------------------------------
// Generators.
// ---------------------------------------------------------------------------

/** Pre-existing Leads: unique ids with a score in 0..100. */
const preExistingLeadsArb: fc.Arbitrary<{ id: string; score: number }[]> = fc.uniqueArray(
  fc.record({ id: fc.uuid(), score: fc.integer({ min: 0, max: 100 }) }),
  { minLength: 0, maxLength: 30, selector: (l) => l.id },
);

/** At least one connector, all failing (→ guaranteed total failure). */
const failingConnectorsArb: fc.Arbitrary<{ sourceId: string; kind: FailKind }[]> = fc.uniqueArray(
  fc.record({
    sourceId: fc.stringMatching(/^[a-z]{3,10}$/),
    kind: fc.constantFrom<FailKind>('error', 'rate_limited'),
  }),
  { minLength: 1, maxLength: 5, selector: (c) => c.sourceId },
);

describe('runScanJob total-failure safety (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 36: Keamanan kegagalan Scan_Job total
  // Validates: Requirements 12.3, 12.4
  propertyTest(it, 36, 'Keamanan kegagalan Scan_Job total', async () => {
    await pbt.assert(
      fc.asyncProperty(
        preExistingLeadsArb,
        failingConnectorsArb,
        fc.boolean(),
        async (preExisting, connectorSpecs, notificationWillFail) => {
          const world = new FakeWorld(notificationWillFail);
          for (const lead of preExisting) world.seedLead(lead.id, lead.score);
          const seedSnapshot = new Map(world.committedLeads);

          const connectors = connectorSpecs.map((c) => makeFailingConnector(c.sourceId, c.kind));

          const result = await runScanJob(makeDeps(world, connectors), {
            teamId: TEAM,
            configurationId: CONFIG,
            trigger: 'manual',
            query: { keywords: ['design'] },
            sourceIds: connectorSpecs.map((c) => c.sourceId),
          });

          // There must be exactly one persisted job.
          if (world.jobs.size !== 1) return false;
          const job = [...world.jobs.values()][0]!;

          // (R12.4) The job ends `failed`, regardless of whether the
          // notification could be enqueued/delivered.
          if (job.status !== 'failed') return false;

          // (R12.3) Every pre-existing Lead is unchanged and NO new Lead was
          // created (a total failure created no prospects, and any rollback
          // discarded staged writes).
          if (world.committedLeads.size !== seedSnapshot.size) return false;
          for (const [id, score] of seedSnapshot) {
            if (world.committedLeads.get(id) !== score) return false;
          }

          // Status independence (Outbox pattern): on the committed path the
          // failure notification was enqueued; on the rollback path none was
          // — but the status is `failed` either way (already asserted).
          if (notificationWillFail) {
            // Rollback path: no Outbox row committed, runner reports the error.
            if (world.committedOutbox.length !== 0) return false;
            if (result.ok) return false;
          } else {
            // Committed path: exactly one `scan.failed` notification enqueued.
            if (world.committedOutbox.length !== 1) return false;
            if (!result.ok || result.value.status !== 'failed') return false;
          }

          return true;
        },
      ),
      defaultPbtParams,
    );
  });
});
