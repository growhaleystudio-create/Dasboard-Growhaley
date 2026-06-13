/**
 * Property-based test for the Scan_Configuration validation pipeline
 * (Task 8.2 placeholder coverage written alongside Task 8.1).
 *
 * Validates: Requirements 4.1, 4.2, 4.4, 4.7
 *
 * Tag: Feature: leads-generator-dashboard, Property 17: Validasi &
 * normalisasi Scan_Configuration
 *
 * The property (design.md → Scan_Config_Service, R4.1/R4.2/R4.4/R4.7):
 * for any Scan_Configuration input, the System SHALL trim each keyword,
 * accept persistence ONLY when there are 1..50 non-empty keywords each
 * 2..100 characters long and niche/location ≤ 100 characters, and when
 * any rule is violated SHALL reject and return ALL applicable error
 * messages together.
 *
 * We verify, against an independently-computed expectation:
 * - trimming is applied and empty keywords are dropped;
 * - `normalized` is present IFF every rule passes;
 * - when invalid, `errors` is non-empty;
 * - the count (1..50) and length (2..100) bounds are honored;
 * - niche/location bounds (≤ 100) are honored.
 *
 * Generators deliberately mix whitespace padding, empty/whitespace-only
 * keywords, short/long keywords, and over-long filters so the input
 * space exercises every branch without trivializing the property.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';

import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';

import {
  validateScanConfig,
  KEYWORD_MIN,
  KEYWORD_MAX,
  KEYWORD_LEN_MIN,
  KEYWORD_LEN_MAX,
  FILTER_LEN_MAX,
  SCHEDULE_INTERVAL_MIN,
  SCHEDULE_INTERVAL_MAX,
  type RawScanConfigInput,
} from '../../src/scan/index.js';

/** A short run of whitespace used to pad keyword/filter values. */
const whitespaceArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 3 })
  .map((parts) => parts.join(''));

/** Non-whitespace token bodies of varying length (0..120 chars). */
const tokenBodyArb: fc.Arbitrary<string> = fc.string({ minLength: 0, maxLength: 120 }).map(
  // Strip whitespace so the body's own length is what we control; padding
  // is added separately by `paddedKeywordArb`.
  (s) => s.replace(/\s/g, ''),
);

/**
 * A keyword candidate: an (often empty) body surrounded by whitespace.
 * This produces empty-after-trim values, too-short values, in-range
 * values, and too-long values across the generated space.
 */
const paddedKeywordArb: fc.Arbitrary<string> = fc
  .tuple(whitespaceArb, tokenBodyArb, whitespaceArb)
  .map(([lead, body, trail]) => `${lead}${body}${trail}`);

/** Keyword arrays from empty up to beyond the 50-keyword bound. */
const keywordsArb: fc.Arbitrary<string[]> = fc.array(paddedKeywordArb, {
  minLength: 0,
  maxLength: 55,
});

/** Optional filter value (niche / location) with padding, up to 120 chars. */
const filterArb: fc.Arbitrary<string | undefined> = fc.option(
  fc.tuple(whitespaceArb, tokenBodyArb, whitespaceArb).map(([a, b, c]) => `${a}${b}${c}`),
  { nil: undefined },
);

const inputArb: fc.Arbitrary<RawScanConfigInput> = fc.record({
  keywords: keywordsArb,
  niche: filterArb,
  location: filterArb,
  sourceIds: fc.array(fc.stringMatching(/^[a-z]{3,8}$/), { minLength: 0, maxLength: 4 }),
  scheduleIntervalMinutes: fc.option(fc.integer({ min: 1, max: 100_000 }), { nil: undefined }),
});

/** Independent reference: trim + drop-empty. */
function expectedKeywords(keywords: string[]): string[] {
  return keywords.map((k) => k.trim()).filter((k) => k.length > 0);
}

/** Independent reference: trim, treat empty-after-trim as undefined. */
function expectedFilter(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

describe('validateScanConfig (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 17: Validasi & normalisasi Scan_Configuration
  // Validates: Requirements 4.1, 4.2, 4.4, 4.7
  propertyTest(it, 17, 'Validasi & normalisasi Scan_Configuration', () => {
    pbt.assert(
      pbt.property(inputArb, (input) => {
        const outcome = validateScanConfig(input);

        // Independently compute what a correct normalization yields.
        const keywords = expectedKeywords(input.keywords);
        const niche = expectedFilter(input.niche);
        const location = expectedFilter(input.location);

        const countOk = keywords.length >= KEYWORD_MIN && keywords.length <= KEYWORD_MAX;
        const lengthOk = keywords.every(
          (k) => k.length >= KEYWORD_LEN_MIN && k.length <= KEYWORD_LEN_MAX,
        );
        const nicheOk = niche === undefined || niche.length <= FILTER_LEN_MAX;
        const locationOk = location === undefined || location.length <= FILTER_LEN_MAX;
        // R4.3 — at least one Source selected (pure non-empty check).
        const sourceOk = input.sourceIds.length > 0;
        // R5.6 — optional schedule interval within 60..43200 minutes.
        const scheduleOk =
          input.scheduleIntervalMinutes === undefined ||
          (input.scheduleIntervalMinutes >= SCHEDULE_INTERVAL_MIN &&
            input.scheduleIntervalMinutes <= SCHEDULE_INTERVAL_MAX);
        const shouldBeValid =
          countOk && lengthOk && nicheOk && locationOk && sourceOk && scheduleOk;

        if (shouldBeValid) {
          // Valid → normalized present, no errors, trimming applied.
          if (outcome.normalized === undefined) return false;
          if (outcome.errors.length !== 0) return false;
          const n = outcome.normalized;
          if (JSON.stringify(n.keywords) !== JSON.stringify(keywords)) return false;
          // Every persisted keyword is non-empty and within bounds.
          if (
            !n.keywords.every(
              (k) => k.length >= KEYWORD_LEN_MIN && k.length <= KEYWORD_LEN_MAX,
            )
          ) {
            return false;
          }
          if (n.niche !== niche) return false;
          if (n.location !== location) return false;
          if (n.sourceIds !== input.sourceIds) return false;
          return true;
        }

        // Invalid → normalized absent and at least one error message.
        if (outcome.normalized !== undefined) return false;
        return outcome.errors.length > 0;
      }),
      defaultPbtParams,
    );
  });
});
