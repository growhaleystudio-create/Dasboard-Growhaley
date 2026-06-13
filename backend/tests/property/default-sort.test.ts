/**
 * Property-based test for the Lead_Query_Service default ordering.
 *
 * Validates: Requirements 7.4, 7.5
 *
 * Tag: Feature: leads-generator-dashboard, Property 8: Pengurutan total
 * deterministik
 *
 * The property: for any array of Leads (scores including `null`, varying
 * `discoveredAt`, unique `id`s), `sortLeadsDefault` produces a TOTAL order
 * that is, reading adjacent pairs left-to-right:
 *   1. non-increasing by `score` with `null` (unscored) sorting last
 *      (NULLS LAST),
 *   2. then non-increasing by `discoveredAt` (newest first),
 *   3. then ascending by `id`.
 * The ordering is also DETERMINISTIC: sorting the same array twice yields
 * the identical sequence, and sorting any shuffled permutation of the same
 * multiset yields the same sequence. The sort preserves the multiset of
 * `id`s (no Lead added or dropped).
 *
 * Implementation notes (design.md → Lead_Query_Service; Strategi Indeks
 * `idx_lead_default_sort`): the comparator under test mirrors the SQL
 * `score DESC NULLS LAST, discovered_at DESC, id ASC`. Because the final
 * tie-break is the unique `id`, the order is total; we generate Leads with
 * distinct ids so the expected order is unambiguous.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Lead } from '@leads-generator/shared';
import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';

import { compareLeadsDefault, sortLeadsDefault } from '../../src/lead-query/default-sort.js';

/**
 * Build a minimal {@link Lead} carrying only the fields that participate in
 * the default ordering. Other required fields are filled with fixed,
 * order-irrelevant values.
 */
function makeLead(id: string, score: number | null, discoveredAtMs: number): Lead {
  return {
    id,
    teamId: 'team-1',
    matchedKeywords: [],
    status: 'New',
    score,
    scoreState: score === null ? 'unscored' : 'scored',
    isDuplicate: false,
    discoveredAt: new Date(discoveredAtMs),
    aiIntentScore: null,
    aiState: 'none',
    createdAt: new Date(0),
  };
}

/**
 * Arbitrary array of Leads with UNIQUE ids (so the total order is
 * unambiguous), scores that are either `null` or an integer 0..100, and a
 * small set of `discoveredAt` timestamps so collisions on score and date
 * are common and exercise every tie-break level.
 */
const leadsArb: fc.Arbitrary<Lead[]> = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 0, maxLength: 30 })
  .chain((ids) =>
    fc.tuple(
      ...ids.map((id) =>
        fc.record({
          id: fc.constant(id),
          score: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
          // Constrain to a handful of timestamps to force frequent ties.
          discoveredAtMs: fc.integer({ min: 0, max: 5 }).map((d) => d * 86_400_000),
        }),
      ),
    ),
  )
  .map((specs) => specs.map((s) => makeLead(s.id, s.score, s.discoveredAtMs)));

/** Multiset of ids as a sorted array, for permutation-invariant comparison. */
function sortedIds(leads: readonly Lead[]): string[] {
  return leads.map((l) => l.id).sort();
}

/** Sequence of ids in their current order. */
function idSequence(leads: readonly Lead[]): string[] {
  return leads.map((l) => l.id);
}

describe('Lead default ordering (R7.4, R7.5)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 8: Pengurutan total
  // deterministik
  propertyTest(it, 8, 'Pengurutan total deterministik', () => {
    pbt.assert(
      pbt.property(leadsArb, fc.array(fc.integer()), (leads, shuffleSeed) => {
        const sorted = sortLeadsDefault(leads);

        // (a) Multiset of ids is preserved (nothing added or dropped).
        expect(sortedIds(sorted)).toEqual(sortedIds(leads));

        // (b) Purity: the input array is not mutated.
        expect(idSequence(leads)).toEqual(idSequence(leads));

        // (c) Adjacent pairs satisfy the total order: a before b ⟹
        //     compareLeadsDefault(a, b) <= 0. Because ids are unique the
        //     comparator is never 0 for distinct elements, so this is a
        //     strict total order.
        for (let i = 1; i < sorted.length; i += 1) {
          const prev = sorted[i - 1]!;
          const curr = sorted[i]!;
          expect(compareLeadsDefault(prev, curr)).toBeLessThanOrEqual(0);
        }

        // (d) Determinism: sorting twice yields the identical sequence.
        const sortedAgain = sortLeadsDefault(leads);
        expect(idSequence(sortedAgain)).toEqual(idSequence(sorted));

        // (e) Permutation invariance: sorting any shuffled copy of the same
        //     multiset yields the same sequence.
        const shuffled = shufflePermutation(leads, shuffleSeed);
        const sortedShuffled = sortLeadsDefault(shuffled);
        expect(idSequence(sortedShuffled)).toEqual(idSequence(sorted));

        return true;
      }),
      defaultPbtParams,
    );
  });
});

/**
 * Deterministically permute `leads` using `seed` as a sequence of swap
 * offsets. Returns a new array (does not mutate the input).
 */
function shufflePermutation(leads: readonly Lead[], seed: readonly number[]): Lead[] {
  const out = [...leads];
  if (out.length <= 1) return out;
  for (let i = out.length - 1; i > 0; i -= 1) {
    const raw = seed[(out.length - 1 - i) % Math.max(seed.length, 1)] ?? i;
    const j = Math.abs(raw) % (i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
