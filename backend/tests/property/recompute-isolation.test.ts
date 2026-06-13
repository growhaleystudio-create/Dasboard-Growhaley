/**
 * Property-based test for `recomputeForTeam` per-Lead isolation (Task 10.10).
 *
 * - **Property 7: Isolasi kegagalan recompute** (R7.10) — for any subset of
 *   Leads that fail to recompute when the Scoring_Model changes, each
 *   failing Lead keeps its PREVIOUS score (its per-Lead transaction rolls
 *   back), every other Lead is recomputed to `computeScore(lead, model)`,
 *   and the loop processes ALL Leads
 *   (`report.recomputed + report.preservedOnFailure === total`).
 *
 * No real database is used. A fake transaction runner emulates commit /
 * rollback: each per-Lead transaction stages its writes into a private
 * buffer that is merged into the committed store ONLY if the unit of work
 * resolves. When a Lead's recompute throws, its staged buffer is discarded
 * — proving the previous committed score survives a failure.
 *
 * Failure is injected at `replaceForLead` (which runs AFTER `setScore` has
 * already staged the new score) so the test genuinely exercises rollback of
 * a partially-staged Lead rather than a no-op.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';

import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';
import type { FactorContribution, Lead, ScoringFactor, ScoringModel } from '@leads-generator/shared';

import { recomputeForTeam } from '../../src/scoring/index.js';
import type {
  RecomputeDeps,
  ScorableLead,
  TxContributionWriter,
  TxLeadWriter,
} from '../../src/scoring/index.js';
import { computeScore } from '../../src/scoring/compute-score.js';
import type { Tx } from '../../src/db/transaction.js';
import type { LeadRepository } from '../../src/repository/lead-repository.js';

// ---------------------------------------------------------------------------
// Sentinel for a Lead's PREVIOUS score. Chosen outside the valid 0..100
// scored range so any leak of a recomputed value into a failing Lead's
// committed score is unmistakable.
// ---------------------------------------------------------------------------
const PREVIOUS_SCORE = -1;

interface CommittedScore {
  score: number | null;
  scoreState: 'scored' | 'unscored';
}

interface StoredContribution {
  modelVersion: number;
  contributions: FactorContribution[];
}

/** Staging buffer threaded through a single fake transaction. */
interface Staging {
  scores: Map<string, CommittedScore>;
  contribs: Map<string, StoredContribution>;
}

/**
 * In-memory committed store + a commit/rollback-aware transaction runner.
 *
 * `committed*` represent the durable state. `runInTx` stages writes per
 * transaction and only merges them on success, discarding them on failure
 * (rollback). The tx-bound writer factories stage into the active tx.
 */
class FakeDb {
  readonly committedScores = new Map<string, CommittedScore>();
  readonly committedContribs = new Map<string, StoredContribution>();

  /** Lead ids whose `replaceForLead` should throw (inject recompute failure). */
  readonly failingIds: ReadonlySet<string>;

  constructor(failingIds: ReadonlySet<string>) {
    this.failingIds = failingIds;
  }

  /** Pre-seed a Lead's previous committed score. */
  seedPrevious(leadId: string): void {
    this.committedScores.set(leadId, { score: PREVIOUS_SCORE, scoreState: 'scored' });
  }

  runInTx = async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
    const staging: Staging = { scores: new Map(), contribs: new Map() };
    const tx = staging as unknown as Tx;
    // If `fn` rejects we simply propagate without merging — the staged
    // writes are dropped, emulating ROLLBACK.
    const result = await fn(tx);
    // COMMIT: merge staged writes into the durable store.
    for (const [id, score] of staging.scores) this.committedScores.set(id, score);
    for (const [id, contrib] of staging.contribs) this.committedContribs.set(id, contrib);
    return result;
  };

  txLeads = (tx: Tx): TxLeadWriter => {
    const staging = tx as unknown as Staging;
    return {
      async setScore(_teamId, leadId, score, scoreState): Promise<void> {
        staging.scores.set(leadId, { score, scoreState });
      },
    };
  };

  txContributions = (tx: Tx): TxContributionWriter => {
    const staging = tx as unknown as Staging;
    const failingIds = this.failingIds;
    return {
      async replaceForLead(_txArg, leadId, modelVersion, contributions): Promise<void> {
        if (failingIds.has(leadId)) {
          // Injected fault AFTER setScore staged the new score — forces the
          // per-Lead transaction to roll back (R7.10).
          throw new Error(`injected recompute failure for ${leadId}`);
        }
        staging.contribs.set(leadId, {
          modelVersion,
          contributions: [...contributions],
        });
      },
    };
  };
}

/** Fake `listForTeam` over a fixed id list, honouring limit/offset paging. */
function makeLeadReader(ids: readonly string[]): Pick<LeadRepository, 'listForTeam'> {
  return {
    async listForTeam(_teamId, opts = {}): Promise<Lead[]> {
      const limit = opts.limit ?? 25;
      const offset = opts.offset ?? 0;
      return ids
        .slice(offset, offset + limit)
        .map((id) => ({ id }) as unknown as Lead);
    },
  };
}

// ---------------------------------------------------------------------------
// Generators (mirroring score-and-persist.test.ts so models always score).
// ---------------------------------------------------------------------------

const FACTOR_KINDS: readonly ScoringFactor['kind'][] = [
  'keyword_match',
  'source_weight',
  'location_match',
  'has_contact',
  'recency',
  'ai_intent_match',
  'custom',
] as const;

const locationArb: fc.Arbitrary<string> = fc.constantFrom(
  'jakarta',
  'bandung',
  'surabaya',
  'yogyakarta',
);

function paramsArbFor(
  kind: ScoringFactor['kind'],
): fc.Arbitrary<Record<string, number | string>> {
  switch (kind) {
    case 'keyword_match':
      return fc.record({ target: fc.integer({ min: 1, max: 10 }) });
    case 'source_weight':
      return fc.record({ maxSources: fc.integer({ min: 1, max: 10 }) });
    case 'location_match':
      return fc.record({ target: locationArb });
    case 'recency':
      return fc.record({ halfLifeDays: fc.integer({ min: 1, max: 365 }) });
    case 'custom':
      return fc.record({
        value: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      });
    case 'has_contact':
    case 'ai_intent_match':
      return fc.constant({});
  }
}

/** Strictly-positive weight → any non-empty model yields a `scored` result. */
const scoredFactorArb: fc.Arbitrary<ScoringFactor> = fc
  .record({
    id: fc.uuid(),
    kind: fc.constantFrom(...FACTOR_KINDS),
    weight: fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
  })
  .chain((base) =>
    paramsArbFor(base.kind).map(
      (params): ScoringFactor => ({
        id: base.id,
        kind: base.kind,
        weight: base.weight,
        params,
      }),
    ),
  );

const scoredModelArb: fc.Arbitrary<ScoringModel> = fc.record({
  teamId: fc.uuid(),
  version: fc.integer({ min: 1, max: 1000 }),
  factors: fc.array(scoredFactorArb, { minLength: 1, maxLength: 6 }),
});

const referenceTimeArb: fc.Arbitrary<Date> = fc
  .integer({ min: 1_700_000_000_000, max: 1_800_000_000_000 })
  .map((ms) => new Date(ms));

function discoveredAtArbFor(reference: Date): fc.Arbitrary<Date> {
  const twoYearsMs = 2 * 365 * 86_400_000;
  return fc
    .integer({ min: -twoYearsMs, max: twoYearsMs })
    .map((delta) => new Date(reference.getTime() + delta));
}

const scorableLeadArb: fc.Arbitrary<ScorableLead> = referenceTimeArb.chain((referenceTime) =>
  fc.record({
    teamId: fc.uuid(),
    matchedKeywords: fc.array(fc.stringMatching(/^[a-z]{2,12}$/), { minLength: 0, maxLength: 8 }),
    sources: fc.array(fc.stringMatching(/^[a-z]{3,8}$/), { minLength: 0, maxLength: 5 }),
    location: fc.option(locationArb, { nil: undefined }),
    publicContact: fc.option(fc.stringMatching(/^[a-z0-9]{3,20}@example\.com$/), {
      nil: undefined,
    }),
    discoveredAt: discoveredAtArbFor(referenceTime),
    referenceTime: fc.constant(referenceTime),
    aiIntentScore: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  }),
);

/** One generated Lead: its scorable view plus whether it should fail. */
const leadCaseArb = fc.record({ scorable: scorableLeadArb, fail: fc.boolean() });

// ---------------------------------------------------------------------------
// Property.
// ---------------------------------------------------------------------------

describe('recomputeForTeam per-Lead isolation (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 7: Isolasi kegagalan recompute
  // Validates: Requirements 7.10
  propertyTest(it, 7, 'Isolasi kegagalan recompute', async () => {
    await pbt.assert(
      fc.asyncProperty(
        scoredModelArb,
        fc.array(leadCaseArb, { minLength: 0, maxLength: 30 }),
        async (model, cases) => {
          // Assign stable, unique ids by index.
          const leads = cases.map((c, i) => ({ id: `lead-${i}`, ...c }));
          const failingIds = new Set(leads.filter((l) => l.fail).map((l) => l.id));

          const db = new FakeDb(failingIds);
          // Seed each Lead's previous score so a leak is detectable.
          for (const lead of leads) db.seedPrevious(lead.id);

          const scorableById = new Map(leads.map((l) => [l.id, l.scorable]));

          const deps: RecomputeDeps = {
            leads: makeLeadReader(leads.map((l) => l.id)),
            project: async (leadId) => scorableById.get(leadId) ?? null,
            runInTx: db.runInTx,
            txLeads: db.txLeads,
            txContributions: db.txContributions,
          };

          const report = await recomputeForTeam(deps, model.teamId, model);

          // (c) Every Lead processed exactly once.
          if (report.recomputed + report.preservedOnFailure !== leads.length) return false;
          if (report.preservedOnFailure !== failingIds.size) return false;
          if (report.recomputed !== leads.length - failingIds.size) return false;

          for (const lead of leads) {
            const committed = db.committedScores.get(lead.id);
            if (committed === undefined) return false;

            if (failingIds.has(lead.id)) {
              // (a) Failing Lead keeps its previous score — rollback held.
              if (committed.score !== PREVIOUS_SCORE || committed.scoreState !== 'scored') {
                return false;
              }
              // And no contributions were committed for it.
              if (db.committedContribs.has(lead.id)) return false;
            } else {
              // (b) Non-failing Lead recomputed to computeScore(lead, model).
              const expected = computeScore(lead.scorable, model.factors);
              if (expected.state !== 'scored' || expected.score === null) return false;
              if (committed.score !== expected.score || committed.scoreState !== 'scored') {
                return false;
              }
              const storedContrib = db.committedContribs.get(lead.id);
              if (storedContrib === undefined) return false;
              if (storedContrib.modelVersion !== model.version) return false;
            }
          }

          return true;
        },
      ),
      defaultPbtParams,
    );
  });
});
