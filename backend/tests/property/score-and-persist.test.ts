/**
 * Property-based tests for `LeadScoringPersister.scoreAndPersist` (Task 10.5).
 *
 * Three design-level Correctness Properties are exercised here, all
 * registered through the shared {@link propertyTest} helper so they share
 * the canonical tag and `{ numRuns: 100 }` configuration:
 *
 * - **Property 3: Persist & recompute konsisten dengan computeScore**
 *   (R7.1, R7.3) — when scoring yields `scored`, the persisted `score`
 *   /`score_state` and the stored factor contributions match the output of
 *   the pure `computeScore`.
 * - **Property 5: Penanganan keadaan unscored** (R7.8) — for an empty model
 *   (`model_unconfigured`) or an injected compute error (`compute_error`),
 *   the Lead is persisted `null`/`unscored`, one `scoring_failure` is
 *   recorded with the right reason, and one outbox notification is enqueued.
 * - **Property 6: Atomisitas penyimpanan Lead unscored** (R7.9) — when a
 *   fault is injected into the failure-handling writes
 *   (`failures.record` or `outbox.enqueue`), `scoreAndPersist` REJECTS so
 *   the enclosing transaction would roll back; the error is never swallowed.
 *
 * The persister's collaborators are replaced with in-memory fakes that
 * capture their call arguments (and, for Property 6, can be told to throw).
 * No real database is involved — the properties constrain the persister's
 * orchestration logic, not SQL execution.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';

import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';
import type { FactorContribution, ScoringFactor, ScoringModel } from '@leads-generator/shared';

import {
  LeadScoringPersister,
  LEAD_UNSCORED_NOTIFICATION,
} from '../../src/scoring/index.js';
import type {
  ScorableLead,
  ScoreAndPersistDeps,
  ScoringFailureReason,
  OutboxMessage,
} from '../../src/scoring/index.js';
import { computeScore } from '../../src/scoring/compute-score.js';
import type { Tx } from '../../src/db/transaction.js';
import type { LeadRepository } from '../../src/repository/lead-repository.js';
import type { ScoreContributionRepository } from '../../src/scoring/score-contribution-repository.js';
import type { ScoringFailureRepository } from '../../src/scoring/scoring-failure-repository.js';
import type { OutboxRepository } from '../../src/scoring/outbox-repository.js';

// ---------------------------------------------------------------------------
// In-memory fakes capturing the persister's writes.
// ---------------------------------------------------------------------------

interface SetScoreCall {
  teamId: string;
  leadId: string;
  score: number | null;
  scoreState: 'scored' | 'unscored';
}

/** Fake {@link LeadRepository} recording every `setScore` invocation. */
class FakeLeadRepository {
  readonly setScoreCalls: SetScoreCall[] = [];

  async setScore(
    teamId: string,
    leadId: string,
    score: number | null,
    scoreState: 'scored' | 'unscored',
  ): Promise<void> {
    this.setScoreCalls.push({ teamId, leadId, score, scoreState });
  }
}

interface ReplaceCall {
  leadId: string;
  modelVersion: number;
  contributions: readonly FactorContribution[];
}

/** Fake {@link ScoreContributionRepository} recording `replaceForLead`. */
class FakeContributionRepository {
  readonly replaceCalls: ReplaceCall[] = [];

  async replaceForLead(
    _tx: Tx,
    leadId: string,
    modelVersion: number,
    contributions: readonly FactorContribution[],
  ): Promise<void> {
    this.replaceCalls.push({ leadId, modelVersion, contributions });
  }
}

interface FailureCall {
  leadId: string;
  reason: ScoringFailureReason;
}

/**
 * Fake {@link ScoringFailureRepository}. When `fault` is set, `record`
 * throws to exercise the rollback path (Property 6).
 */
class FakeFailureRepository {
  readonly recordCalls: FailureCall[] = [];
  fault = false;

  async record(_tx: Tx, leadId: string, reason: ScoringFailureReason): Promise<void> {
    if (this.fault) throw new Error('injected scoring_failure write fault');
    this.recordCalls.push({ leadId, reason });
  }
}

/**
 * Fake {@link OutboxRepository}. When `fault` is set, `enqueue` throws to
 * exercise the rollback path (Property 6).
 */
class FakeOutboxRepository {
  readonly enqueueCalls: OutboxMessage[] = [];
  fault = false;

  async enqueue(_tx: Tx, message: OutboxMessage): Promise<void> {
    if (this.fault) throw new Error('injected outbox enqueue fault');
    this.enqueueCalls.push(message);
  }
}

/** Bundle of fresh fakes plus the persister wired to them. */
interface Harness {
  leads: FakeLeadRepository;
  contributions: FakeContributionRepository;
  failures: FakeFailureRepository;
  outbox: FakeOutboxRepository;
  persister: LeadScoringPersister;
}

function makeHarness(): Harness {
  const leads = new FakeLeadRepository();
  const contributions = new FakeContributionRepository();
  const failures = new FakeFailureRepository();
  const outbox = new FakeOutboxRepository();

  const deps: ScoreAndPersistDeps = {
    leads: leads as unknown as LeadRepository,
    contributions: contributions as unknown as ScoreContributionRepository,
    failures: failures as unknown as ScoringFailureRepository,
    outbox: outbox as unknown as OutboxRepository,
  };

  return { leads, contributions, failures, outbox, persister: new LeadScoringPersister(deps) };
}

/** Stand-in transaction handle; the fakes never touch it. */
const fakeTx = {} as Tx;

// ---------------------------------------------------------------------------
// Generators.
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

/**
 * A factor with a strictly-positive weight so that any non-empty model
 * built from it has `Σ weight > 0` — guaranteeing `computeScore` returns a
 * `scored` result (used by Property 3).
 */
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

/** A model guaranteed to produce a `scored` result. */
const scoredModelArb: fc.Arbitrary<ScoringModel> = fc.record({
  teamId: fc.uuid(),
  version: fc.integer({ min: 1, max: 1000 }),
  factors: fc.array(scoredFactorArb, { minLength: 1, maxLength: 8 }),
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

/**
 * A factor whose `weight` getter throws — when `computeScore` reads it, the
 * function throws, which the persister classifies as a `compute_error`
 * (R7.8). This injects the "compute error" condition without mocking the
 * scoring module.
 */
function explodingModel(teamId: string, version: number): ScoringModel {
  const boom: ScoringFactor = {
    id: 'boom',
    kind: 'custom',
    get weight(): number {
      throw new Error('injected compute error');
    },
  };
  return { teamId, version, factors: [boom] };
}

/** Structural equality for two contribution lists. */
function contributionsEqual(
  a: readonly FactorContribution[],
  b: readonly FactorContribution[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.factorId !== y.factorId || x.rawValue !== y.rawValue || x.weightedValue !== y.weightedValue) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Properties.
// ---------------------------------------------------------------------------

describe('LeadScoringPersister.scoreAndPersist (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 3: Persist & recompute konsisten dengan computeScore
  // Validates: Requirements 7.1, 7.3
  propertyTest(it, 3, 'Persist & recompute konsisten dengan computeScore', async () => {
    await pbt.assert(
      fc.asyncProperty(
        scorableLeadArb,
        scoredModelArb,
        fc.uuid(),
        async (scorable, model, leadId) => {
          const expected = computeScore(scorable, model.factors);
          const h = makeHarness();

          const result = await h.persister.scoreAndPersist(
            fakeTx,
            leadId,
            model.teamId,
            scorable,
            model,
          );

          if (!result.ok) return false;

          // The scored model always yields a `scored` outcome; this guards
          // against a regression where positive weights stop scoring.
          if (expected.state !== 'scored' || expected.score === null) return false;

          // Returned outcome mirrors the pure computeScore result.
          if (result.value.state !== 'scored' || result.value.score !== expected.score) {
            return false;
          }

          // Persisted score matches and uses the 'scored' state.
          const lastSet = h.leads.setScoreCalls.at(-1);
          if (lastSet === undefined) return false;
          if (
            lastSet.leadId !== leadId ||
            lastSet.teamId !== model.teamId ||
            lastSet.score !== expected.score ||
            lastSet.scoreState !== 'scored'
          ) {
            return false;
          }

          // Factor contributions persisted under the model's version match.
          const lastReplace = h.contributions.replaceCalls.at(-1);
          if (lastReplace === undefined) return false;
          if (lastReplace.leadId !== leadId || lastReplace.modelVersion !== model.version) {
            return false;
          }
          if (!contributionsEqual(lastReplace.contributions, expected.contributions)) {
            return false;
          }

          // Scored path must not touch the failure / notification machinery.
          return h.failures.recordCalls.length === 0 && h.outbox.enqueueCalls.length === 0;
        },
      ),
      defaultPbtParams,
    );
  });

  // Tag: Feature: leads-generator-dashboard, Property 5: Penanganan keadaan unscored
  // Validates: Requirements 7.8
  propertyTest(it, 5, 'Penanganan keadaan unscored', async () => {
    await pbt.assert(
      fc.asyncProperty(
        scorableLeadArb,
        fc.uuid(),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom<'empty' | 'compute_error'>('empty', 'compute_error'),
        async (scorable, leadId, version, scenario) => {
          const teamId = scorable.teamId;
          const model: ScoringModel =
            scenario === 'empty'
              ? { teamId, version, factors: [] }
              : explodingModel(teamId, version);
          const expectedReason: ScoringFailureReason =
            scenario === 'empty' ? 'model_unconfigured' : 'compute_error';

          const h = makeHarness();
          const result = await h.persister.scoreAndPersist(
            fakeTx,
            leadId,
            teamId,
            scorable,
            model,
          );

          if (!result.ok) return false;
          if (result.value.state !== 'unscored' || result.value.score !== null) return false;

          // Lead persisted as null / unscored.
          const lastSet = h.leads.setScoreCalls.at(-1);
          if (lastSet === undefined) return false;
          if (
            lastSet.leadId !== leadId ||
            lastSet.teamId !== teamId ||
            lastSet.score !== null ||
            lastSet.scoreState !== 'unscored'
          ) {
            return false;
          }

          // Exactly one scoring_failure recorded with the right reason.
          if (h.failures.recordCalls.length !== 1) return false;
          const failure = h.failures.recordCalls[0]!;
          if (failure.leadId !== leadId || failure.reason !== expectedReason) return false;

          // Exactly one outbox notification enqueued for this Lead.
          if (h.outbox.enqueueCalls.length !== 1) return false;
          const message = h.outbox.enqueueCalls[0]!;
          if (message.type !== LEAD_UNSCORED_NOTIFICATION || message.teamId !== teamId) {
            return false;
          }
          return message.payload['leadId'] === leadId;
        },
      ),
      defaultPbtParams,
    );
  });

  // Tag: Feature: leads-generator-dashboard, Property 6: Atomisitas penyimpanan Lead unscored
  // Validates: Requirements 7.9
  propertyTest(it, 6, 'Atomisitas penyimpanan Lead unscored', async () => {
    await pbt.assert(
      fc.asyncProperty(
        scorableLeadArb,
        fc.uuid(),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom<'failures' | 'outbox'>('failures', 'outbox'),
        async (scorable, leadId, version, faultPoint) => {
          const teamId = scorable.teamId;
          // Empty model deterministically drives the unscored path so the
          // failure-handling writes (record / enqueue) actually run.
          const model: ScoringModel = { teamId, version, factors: [] };

          const h = makeHarness();
          if (faultPoint === 'failures') h.failures.fault = true;
          else h.outbox.fault = true;

          // scoreAndPersist must REJECT — the failure-handling error is not
          // swallowed, so the enclosing withTransaction would ROLLBACK.
          let rejected = false;
          try {
            await h.persister.scoreAndPersist(fakeTx, leadId, teamId, scorable, model);
          } catch {
            rejected = true;
          }
          if (!rejected) return false;

          // No swallow: a fault on `record` short-circuits before the outbox
          // write; a fault on `enqueue` happens only after `record` ran once.
          if (faultPoint === 'failures') {
            return h.outbox.enqueueCalls.length === 0;
          }
          return h.failures.recordCalls.length === 1;
        },
      ),
      defaultPbtParams,
    );
  });
});
