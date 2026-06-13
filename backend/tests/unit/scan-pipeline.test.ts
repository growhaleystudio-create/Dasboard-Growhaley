/**
 * Unit tests for {@link runScanPipeline} (Task 12.2, R5.2, R5.3).
 *
 * Verifies the `normalize → dedup → score` accumulation:
 * - given two prospects where dedup reports `created` then `merged`, the
 *   summary records `newLeads = 1` / `duplicateLeads = 1`, and
 *   `scoreAndPersist` runs ONCE (only for the created Lead — a merge defers
 *   to the recompute path, R7.3);
 * - `connectorResults` reflects the connector runner's per-Source outcome;
 * - the supplied `excluded` list is surfaced verbatim as `excludedSources`
 *   (R3.8).
 *
 * The dedup service, scorer, and connector are in-memory fakes; no database
 * or network is involved.
 */

import { describe, expect, it } from 'vitest';
import type {
  ConnectorStatus,
  NormalizedLead,
  RawProspect,
  Result,
  ScoringModel,
} from '@leads-generator/shared';

import { runScanPipeline, type ScanPipelineDeps } from '../../src/scan/index.js';
import type { Source_Connector, ScanQuery } from '../../src/connector/source-connector.js';
import type { DeduplicationService, DedupResult } from '../../src/dedup/dedup-service.js';
import type { LeadScoringPersister } from '../../src/scoring/score-and-persist.js';
import type { ScorableLead } from '../../src/scoring/scorable-lead.js';
import type { Tx } from '../../src/db/transaction.js';

function prospect(keyword: string): RawProspect {
  return { matchedKeyword: keyword, acquiredAt: new Date(0), name: `${keyword}-prospect` };
}

/** Connector returning a fixed list of prospects. */
function makeConnector(sourceId: string, prospects: RawProspect[]): Source_Connector {
  return {
    sourceId,
    displayName: sourceId,
    checkAvailability: (): Promise<ConnectorStatus> => Promise.resolve('available'),
    fetch: (_query: ScanQuery, _signal: AbortSignal): Promise<RawProspect[]> =>
      Promise.resolve(prospects),
    normalize: (raw: RawProspect, teamId: string): NormalizedLead => ({
      teamId,
      sources: [sourceId],
      matchedKeywords: [raw.matchedKeyword],
      discoveredAt: raw.acquiredAt,
      ...(raw.name !== undefined ? { name: raw.name } : {}),
    }),
  };
}

/** Dedup fake returning queued outcomes in order. */
class SequencedDedup {
  ingestCalls = 0;
  constructor(private readonly outcomes: DedupResult[]) {}

  async ingest(_tx: Tx, _normalized: NormalizedLead): Promise<DedupResult> {
    const outcome = this.outcomes[this.ingestCalls];
    this.ingestCalls += 1;
    if (outcome === undefined) throw new Error('unexpected ingest call');
    return outcome;
  }
}

/** Scorer fake recording which leadIds were scored. */
class RecordingScorer {
  readonly scoredLeadIds: string[] = [];

  async scoreAndPersist(
    _tx: Tx,
    leadId: string,
  ): Promise<Result<{ score: number | null; state: 'scored' | 'unscored' }>> {
    this.scoredLeadIds.push(leadId);
    return { ok: true, value: { score: 42, state: 'scored' } };
  }
}

const MODEL: ScoringModel = { teamId: 'team-1', version: 1, factors: [] };

describe('runScanPipeline', () => {
  it('accumulates created vs merged and scores only created leads (R5.2, R5.3)', async () => {
    const connector = makeConnector('google', [prospect('design'), prospect('logo')]);

    const dedup = new SequencedDedup([
      { outcome: 'created', leadId: 'lead-new' },
      { outcome: 'merged', leadId: 'lead-canonical' },
    ]);
    const scorer = new RecordingScorer();

    const deps: ScanPipelineDeps = {
      dedup: (_tx: Tx): DeduplicationService => dedup as unknown as DeduplicationService,
      scorer: (_tx: Tx): LeadScoringPersister => scorer as unknown as LeadScoringPersister,
      project: (_leadId: string, normalized: NormalizedLead): ScorableLead => ({
        teamId: normalized.teamId,
        matchedKeywords: normalized.matchedKeywords,
        sources: normalized.sources,
        discoveredAt: normalized.discoveredAt,
        referenceTime: new Date(0),
        aiIntentScore: null,
      }),
    };

    const summary = await runScanPipeline({} as Tx, deps, {
      teamId: 'team-1',
      query: { keywords: ['design', 'logo'] },
      availableConnectors: [connector],
      excluded: [{ sourceId: 'fiverr', reason: 'unavailable' }],
      model: MODEL,
    });

    // One created + one merged.
    expect(summary.newLeads).toBe(1);
    expect(summary.duplicateLeads).toBe(1);

    // scoreAndPersist ran ONCE, for the created lead only.
    expect(dedup.ingestCalls).toBe(2);
    expect(scorer.scoredLeadIds).toEqual(['lead-new']);

    // connectorResults reflect the runner output (one `ok` line, 2 items).
    expect(summary.connectorResults).toEqual([
      { sourceId: 'google', outcome: 'ok', itemsFetched: 2 },
    ]);

    // Exclusions surfaced verbatim (R3.8).
    expect(summary.excludedSources).toEqual([{ sourceId: 'fiverr', reason: 'unavailable' }]);
  });
});
