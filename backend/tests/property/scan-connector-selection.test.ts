/**
 * Property-based test for Scan_Engine Source selection at execution time
 * (Task 12.3).
 *
 * - **Property 20: Seleksi connector available saat eksekusi** (R3.8, R5.7)
 *   — for an arbitrary set of requested Sources with random per-Team
 *   statuses, {@link executeScan}:
 *   * runs EXACTLY the connectors whose status is `available` (so
 *     `connectorResults` covers precisely those Sources), and
 *   * records EVERY non-`available` / uninstalled requested Source in
 *     `summary.excludedSources` with a reason (R3.8); and
 *   * when ZERO Sources are available, returns a `VALIDATION` error and
 *     creates NO Lead — asserted by verifying the transaction runner and
 *     the dedup/scorer collaborators are never invoked (R5.7).
 *
 * The registry, transaction runner, and pipeline collaborators are replaced
 * with in-memory fakes. The fake registry returns chosen descriptors and a
 * stub connector (per `available` Source) that yields exactly one prospect;
 * the fake dedup counts `ingest` calls so we can assert "no Lead created"
 * on the R5.7 path. No real database or network is involved.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';

import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';
import type {
  ConnectorDescriptor,
  ConnectorStatus,
  NormalizedLead,
  RawProspect,
  Result,
  ScanSummary,
  ScoringModel,
} from '@leads-generator/shared';

import {
  executeScan,
  NO_SOURCE_AVAILABLE_MESSAGE,
  NOT_INSTALLED_REASON,
  type ScanEngineDeps,
} from '../../src/scan/index.js';
import type { Connector_Registry } from '../../src/connector/registry.js';
import type { Source_Connector, ScanQuery } from '../../src/connector/source-connector.js';
import type { DeduplicationService } from '../../src/dedup/dedup-service.js';
import type { LeadScoringPersister } from '../../src/scoring/score-and-persist.js';
import type { ScorableLead } from '../../src/scoring/scorable-lead.js';
import type { Tx } from '../../src/db/transaction.js';

// ---------------------------------------------------------------------------
// Fakes.
// ---------------------------------------------------------------------------

/** A requested Source plus the per-Team status its connector reports. */
type RegistryStatus = ConnectorStatus | 'unknown';

interface SourceEntry {
  sourceId: string;
  status: RegistryStatus;
}

/** Reason recorded for a status that is present but not `available`. */
function reasonFor(status: RegistryStatus): string {
  return status === 'unknown' ? NOT_INSTALLED_REASON : status;
}

/**
 * Stub connector that yields exactly one prospect. `normalize` produces a
 * minimal {@link NormalizedLead}; the dedup fake ignores its content.
 */
function makeStubConnector(sourceId: string): Source_Connector {
  return {
    sourceId,
    displayName: `${sourceId} display`,
    checkAvailability: (): Promise<ConnectorStatus> => Promise.resolve('available'),
    fetch: (_query: ScanQuery, _signal: AbortSignal): Promise<RawProspect[]> =>
      Promise.resolve([
        { matchedKeyword: 'design', acquiredAt: new Date(0), name: `${sourceId}-prospect` },
      ]),
    normalize: (_raw: RawProspect, teamId: string): NormalizedLead => ({
      teamId,
      sources: [sourceId],
      matchedKeywords: ['design'],
      discoveredAt: new Date(0),
    }),
  };
}

/**
 * Fake {@link Connector_Registry}: `listForTeam` returns descriptors for
 * every INSTALLED Source (status !== 'unknown'); `get` returns a stub
 * connector only for installed Sources.
 */
function makeFakeRegistry(entries: SourceEntry[]): Connector_Registry {
  const descriptors: ConnectorDescriptor[] = entries
    .filter((entry) => entry.status !== 'unknown')
    .map((entry) => ({
      sourceId: entry.sourceId,
      displayName: `${entry.sourceId} display`,
      status: entry.status as ConnectorStatus,
    }));
  const installed = new Set(descriptors.map((descriptor) => descriptor.sourceId));

  return {
    listForTeam: (_teamId: string): Promise<ConnectorDescriptor[]> =>
      Promise.resolve(descriptors),
    get: (sourceId: string): Source_Connector | null =>
      installed.has(sourceId) ? makeStubConnector(sourceId) : null,
  } as unknown as Connector_Registry;
}

/** Fake dedup service counting `ingest` calls; always reports `created`. */
class FakeDedup {
  ingestCalls = 0;

  async ingest(_tx: Tx, _normalized: NormalizedLead): Promise<{ outcome: 'created'; leadId: string }> {
    this.ingestCalls += 1;
    return { outcome: 'created', leadId: `lead-${this.ingestCalls}` };
  }
}

/** Fake scorer counting `scoreAndPersist` calls. */
class FakeScorer {
  scoreCalls = 0;

  async scoreAndPersist(): Promise<Result<{ score: number | null; state: 'scored' | 'unscored' }>> {
    this.scoreCalls += 1;
    return { ok: true, value: { score: null, state: 'unscored' } };
  }
}

/** Records whether the transaction runner was invoked. */
class FakeTxRunner {
  invoked = 0;

  run = async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
    this.invoked += 1;
    return fn({} as Tx);
  };
}

// ---------------------------------------------------------------------------
// Generators.
// ---------------------------------------------------------------------------

const sourcesArb: fc.Arbitrary<SourceEntry[]> = fc.uniqueArray(
  fc.record({
    sourceId: fc.stringMatching(/^[a-z]{3,10}$/),
    status: fc.constantFrom<RegistryStatus>(
      'available',
      'unavailable',
      'requires_configuration',
      'unknown',
    ),
  }),
  { minLength: 1, maxLength: 6, selector: (entry) => entry.sourceId },
);

describe('executeScan connector selection (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 20: Seleksi connector available saat eksekusi
  // Validates: Requirements 3.8
  propertyTest(it, 20, 'Seleksi connector available saat eksekusi', async () => {
    await pbt.assert(
      fc.asyncProperty(sourcesArb, fc.uuid(), async (entries, teamId) => {
        const dedup = new FakeDedup();
        const scorer = new FakeScorer();
        const txRunner = new FakeTxRunner();

        const deps: ScanEngineDeps = {
          runInTx: txRunner.run,
          registry: makeFakeRegistry(entries),
          loadModel: (_team: string): Promise<ScoringModel | null> => Promise.resolve(null),
          pipeline: {
            dedup: (_tx: Tx): DeduplicationService => dedup as unknown as DeduplicationService,
            scorer: (_tx: Tx): LeadScoringPersister => scorer as unknown as LeadScoringPersister,
            project: (leadId: string, normalized: NormalizedLead): ScorableLead => ({
              teamId: normalized.teamId,
              matchedKeywords: normalized.matchedKeywords,
              sources: normalized.sources,
              discoveredAt: normalized.discoveredAt,
              referenceTime: new Date(0),
              aiIntentScore: null,
            }),
          },
        };

        const result = await executeScan(deps, {
          teamId,
          query: { keywords: ['design'] },
          sourceIds: entries.map((entry) => entry.sourceId),
        });

        // Reference partition (encounter order preserved).
        const expectedAvailable = entries
          .filter((entry) => entry.status === 'available')
          .map((entry) => entry.sourceId);
        const expectedExcluded = entries
          .filter((entry) => entry.status !== 'available')
          .map((entry) => ({ sourceId: entry.sourceId, reason: reasonFor(entry.status) }));

        if (expectedAvailable.length === 0) {
          // R5.7: no available Source → VALIDATION error, NO Lead created,
          // and NO transaction opened.
          if (result.ok) return false;
          if (result.error.code !== 'VALIDATION') return false;
          if (
            JSON.stringify(result.error.messages) !==
            JSON.stringify([NO_SOURCE_AVAILABLE_MESSAGE])
          ) {
            return false;
          }
          return txRunner.invoked === 0 && dedup.ingestCalls === 0 && scorer.scoreCalls === 0;
        }

        // R3.8: runs EXACTLY the available connectors, records the rest.
        if (!result.ok) return false;
        const summary: ScanSummary = result.value;

        const ranSources = summary.connectorResults.map((line) => line.sourceId);
        if (JSON.stringify(ranSources) !== JSON.stringify(expectedAvailable)) return false;

        if (JSON.stringify(summary.excludedSources) !== JSON.stringify(expectedExcluded)) {
          return false;
        }

        // Each available connector yielded exactly one `created` prospect.
        if (summary.newLeads !== expectedAvailable.length) return false;
        if (summary.duplicateLeads !== 0) return false;
        if (dedup.ingestCalls !== expectedAvailable.length) return false;
        if (scorer.scoreCalls !== expectedAvailable.length) return false;

        return txRunner.invoked === 1;
      }),
      defaultPbtParams,
    );
  });
});
