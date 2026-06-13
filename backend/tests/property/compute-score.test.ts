/**
 * Property-based tests for the pure `computeScore` engine (R7.2, R7.6, R7.7).
 *
 * Three distinct property tests live here, each registered via the shared
 * {@link propertyTest} helper so they all share `numRuns: 100` and the
 * canonical `Feature: leads-generator-dashboard, Property {n}: ...` tag:
 *
 * - **Property 1: Determinisme skoring** — `computeScore` is referentially
 *   transparent: equal inputs → deeply equal outputs (R7.7).
 * - **Property 2: Batas rentang skor** — `score` is `null` (unscored) or
 *   an integer in `[0, 100]` (R7.2).
 * - **Property 4: Kontribusi faktor konsisten dengan skor** — for any
 *   `state === 'scored'` result, recomputing the normalized aggregation
 *   from `contributions` reproduces `score` (within ±1 due to rounding;
 *   we verify exact equality of the round, R7.6).
 *
 * Generators are written to constrain inputs to realistic shapes (finite
 * weights, sane keyword counts, valid factor kinds) without trivializing
 * the property — failures should still be possible if the implementation
 * regresses.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';

import {
  defaultPbtParams,
  pbt,
  propertyTest,
} from '@leads-generator/shared/testing/pbt';
import type { ScoringFactor, ScoringFactorKind } from '@leads-generator/shared';

import { computeScore, type ScorableLead } from '../../src/scoring/index.js';

/**
 * All factor kinds supported by the scoring engine. Listed explicitly so
 * the generator stays deterministic and the test fails loudly if a new
 * kind is added without test coverage.
 */
const FACTOR_KINDS: readonly ScoringFactorKind[] = [
  'keyword_match',
  'source_weight',
  'location_match',
  'has_contact',
  'recency',
  'ai_intent_match',
  'custom',
] as const;

/**
 * Generate a finite, non-negative weight in `[0, 10]`. Weights outside
 * that range are technically allowed by the type system but not by any
 * realistic Scoring_Model, and including extreme values just bloats
 * shrinking without exercising new branches.
 */
const weightArb: fc.Arbitrary<number> = fc.double({
  min: 0,
  max: 10,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Keyword corpus used for `matchedKeywords` and `params.target` strings. */
const keywordArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z]{2,12}$/);

/** Source ids — short stable lowercase tokens. */
const sourceArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z]{3,8}$/);

/** Location pool: small set so `location_match` actually triggers. */
const locationArb: fc.Arbitrary<string> = fc.constantFrom(
  'jakarta',
  'bandung',
  'surabaya',
  'yogyakarta',
);

/**
 * Build kind-specific `params` so generated factors look like something a
 * real Team would configure.
 */
function paramsArbFor(kind: ScoringFactorKind): fc.Arbitrary<Record<string, number | string>> {
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
      return fc.record({ value: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }) });
    case 'has_contact':
    case 'ai_intent_match':
      return fc.constant({});
  }
}

/** Generate one {@link ScoringFactor}. */
const factorArb: fc.Arbitrary<ScoringFactor> = fc
  .record({
    id: fc.uuid(),
    kind: fc.constantFrom(...FACTOR_KINDS),
    weight: weightArb,
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

/** Generate a `ScoringFactor[]` ranging from empty to mid-sized. */
const factorsArb: fc.Arbitrary<ScoringFactor[]> = fc.array(factorArb, { minLength: 0, maxLength: 8 });

/**
 * Reference time chosen as a fixed-but-arbitrary epoch offset; the
 * recency factor only cares about the *delta* with `discoveredAt`, so a
 * fixed reference keeps shrinking minimal while still exercising both
 * "fresh" and "stale" Leads.
 */
const referenceTimeArb: fc.Arbitrary<Date> = fc
  .integer({ min: 1_700_000_000_000, max: 1_800_000_000_000 })
  .map((ms) => new Date(ms));

/** Generate `discoveredAt` within ±2 years of `referenceTime`. */
function discoveredAtArbFor(reference: Date): fc.Arbitrary<Date> {
  const twoYearsMs = 2 * 365 * 86_400_000;
  return fc
    .integer({ min: -twoYearsMs, max: twoYearsMs })
    .map((delta) => new Date(reference.getTime() + delta));
}

/** Full {@link ScorableLead} arbitrary. */
const scorableLeadArb: fc.Arbitrary<ScorableLead> = referenceTimeArb.chain((referenceTime) =>
  fc.record({
    teamId: fc.uuid(),
    matchedKeywords: fc.array(keywordArb, { minLength: 0, maxLength: 8 }),
    sources: fc.array(sourceArb, { minLength: 0, maxLength: 5 }),
    location: fc.option(locationArb, { nil: undefined }),
    publicContact: fc.option(fc.stringMatching(/^[a-z0-9]{3,20}@example\.com$/), {
      nil: undefined,
    }),
    discoveredAt: discoveredAtArbFor(referenceTime),
    referenceTime: fc.constant(referenceTime),
    aiIntentScore: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  }),
);

describe('computeScore (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 1: Determinisme skoring
  // Validates: Requirements 7.7
  propertyTest(it, 1, 'Determinisme skoring', () => {
    pbt.assert(
      pbt.property(scorableLeadArb, factorsArb, (lead, factors) => {
        const a = computeScore(lead, factors);
        const b = computeScore(lead, factors);
        // Deep equality covers `score`, `state`, and every contribution
        // entry — exactly the shape consumed downstream.
        return JSON.stringify(a) === JSON.stringify(b);
      }),
      defaultPbtParams,
    );
  });

  // Tag: Feature: leads-generator-dashboard, Property 2: Batas rentang skor
  // Validates: Requirements 7.2
  propertyTest(it, 2, 'Batas rentang skor', () => {
    pbt.assert(
      pbt.property(scorableLeadArb, factorsArb, (lead, factors) => {
        const result = computeScore(lead, factors);
        if (result.score === null) {
          return result.state === 'unscored';
        }
        return (
          Number.isInteger(result.score) &&
          result.score >= 0 &&
          result.score <= 100 &&
          result.state === 'scored'
        );
      }),
      defaultPbtParams,
    );
  });

  // Tag: Feature: leads-generator-dashboard, Property 4: Kontribusi faktor konsisten dengan skor
  // Validates: Requirements 7.6
  propertyTest(it, 4, 'Kontribusi faktor konsisten dengan skor', () => {
    pbt.assert(
      pbt.property(scorableLeadArb, factorsArb, (lead, factors) => {
        const result = computeScore(lead, factors);
        if (result.state !== 'scored' || result.score === null) {
          // Property 4 only constrains the `scored` branch.
          return true;
        }
        // One contribution per factor, in the same order as `factors`.
        if (result.contributions.length !== factors.length) return false;
        for (let i = 0; i < factors.length; i++) {
          const factor = factors[i]!;
          const contribution = result.contributions[i]!;
          if (contribution.factorId !== factor.id) return false;
        }

        // Recompute normalized score from contributions and ensure the
        // round-half-up of `normalized * 100` matches `result.score`.
        const weightSum = factors.reduce(
          (acc, f) => acc + (Number.isFinite(f.weight) ? f.weight : 0),
          0,
        );
        if (weightSum <= 0) return false; // would have been `unscored`.

        const weightedSum = result.contributions.reduce((acc, c) => acc + c.weightedValue, 0);
        const normalized = weightedSum / weightSum;
        const scaled = Math.max(0, Math.min(100, normalized * 100));
        const expectedScore = Math.max(0, Math.min(100, Math.floor(scaled + 0.5)));
        return expectedScore === result.score;
      }),
      defaultPbtParams,
    );
  });
});
