/**
 * Property-based test for retention eligibility — the pure decision that
 * drives the Retention_Worker (Task 16.5, R11.7).
 *
 * Design reference:
 * - design.md → Correctness Properties → **Property 31: Kelayakan
 *   penghapusan retensi**: "Untuk setiap kumpulan Lead dengan `acquired_at`
 *   acak dan Data_Retention_Period Team, sweep retensi SHALL menghapus tepat
 *   Lead yang umur penyimpanannya melampaui periode retensi dan tidak
 *   menghapus Lead lainnya." (Validates: Requirements 11.7)
 *
 * The property exercises {@link selectExpired} directly — no database, no
 * worker — because the "which Leads expired?" decision is the testable core
 * of R11.7. The reference set is computed independently from the
 * implementation: a Lead is expected to be selected exactly when
 * `now - acquiredAt > retentionDays * 86_400_000` (strict, matching
 * "melebihi"). We assert set-equality both ways: every expected id is
 * returned, and no unexpected id is returned.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';

import {
  isRetentionEligible,
  selectExpired,
  type RetentionCandidate,
} from '../../src/privacy/retention.js';

const MS_PER_DAY = 86_400_000;

/**
 * Anchor `now` so generated `acquiredAt` values straddle the retention
 * window: ages are drawn relative to the anchor across a window of several
 * years (in ms), giving a healthy mix of expired and still-retained Leads
 * for any plausible `retentionDays`.
 */
const NOW = new Date('2024-06-01T00:00:00Z');

/** Up to ~5 years of age in either direction, in milliseconds. */
const MAX_AGE_MS = 5 * 365 * MS_PER_DAY;

/**
 * Arbitrary candidate: a unique-ish leadId paired with an `acquiredAt`
 * offset from {@link NOW} by an arbitrary number of milliseconds. Negative
 * offsets (future acquisition) are allowed so the strict-inequality and
 * never-eligible edges are exercised.
 */
function candidateArb(): fc.Arbitrary<RetentionCandidate> {
  return fc.record({
    leadId: fc.uuid(),
    ageMs: fc.integer({ min: -MAX_AGE_MS, max: MAX_AGE_MS }),
  }).map(({ leadId, ageMs }) => ({
    leadId,
    acquiredAt: new Date(NOW.getTime() - ageMs),
  }));
}

const candidatesArb: fc.Arbitrary<RetentionCandidate[]> = fc.array(candidateArb(), {
  maxLength: 200,
});

/** Retention windows from "very aggressive" (0 days) to multi-year. */
const retentionDaysArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 5 * 365 });

describe('retention eligibility (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 31: Kelayakan penghapusan retensi
  // Validates: Requirements 11.7
  propertyTest(it, 31, 'Kelayakan penghapusan retensi', () => {
    pbt.assert(
      pbt.property(candidatesArb, retentionDaysArb, (candidates, retentionDays) => {
        const selected = selectExpired(candidates, retentionDays, NOW);
        const selectedSet = new Set(selected);

        // Independent reference: a Lead is expired exactly when its age in ms
        // strictly exceeds the retention window in ms.
        const windowMs = retentionDays * MS_PER_DAY;
        const expectedSet = new Set(
          candidates
            .filter((c) => NOW.getTime() - c.acquiredAt.getTime() > windowMs)
            .map((c) => c.leadId),
        );

        // Exactly the expired Leads — no more, no fewer.
        if (selectedSet.size !== expectedSet.size) return false;
        for (const id of expectedSet) {
          if (!selectedSet.has(id)) return false;
        }
        for (const id of selectedSet) {
          if (!expectedSet.has(id)) return false;
        }

        // Every returned id maps back to an eligible candidate, and every
        // non-returned candidate is genuinely ineligible.
        for (const c of candidates) {
          const eligible = isRetentionEligible(c.acquiredAt, retentionDays, NOW);
          if (eligible !== expectedSet.has(c.leadId)) return false;
        }

        return true;
      }),
      defaultPbtParams,
    );
  });
});

describe('retention eligibility (examples)', () => {
  it('does not select a Lead whose age exactly equals the window (strict >)', () => {
    const acquiredAt = new Date(NOW.getTime() - 30 * MS_PER_DAY);
    expect(isRetentionEligible(acquiredAt, 30, NOW)).toBe(false);
    expect(selectExpired([{ leadId: 'a', acquiredAt }], 30, NOW)).toEqual([]);
  });

  it('selects a Lead one millisecond past the window', () => {
    const acquiredAt = new Date(NOW.getTime() - (30 * MS_PER_DAY + 1));
    expect(isRetentionEligible(acquiredAt, 30, NOW)).toBe(true);
    expect(selectExpired([{ leadId: 'a', acquiredAt }], 30, NOW)).toEqual(['a']);
  });

  it('never selects a Lead acquired in the future', () => {
    const acquiredAt = new Date(NOW.getTime() + MS_PER_DAY);
    expect(isRetentionEligible(acquiredAt, 0, NOW)).toBe(false);
  });

  it('with retentionDays = 0, selects any Lead with positive age', () => {
    const acquiredAt = new Date(NOW.getTime() - 1);
    expect(isRetentionEligible(acquiredAt, 0, NOW)).toBe(true);
  });

  it('returns [] for an empty candidate list', () => {
    expect(selectExpired([], 365, NOW)).toEqual([]);
  });

  it('preserves input order of the eligible ids', () => {
    const candidates: RetentionCandidate[] = [
      { leadId: 'old-1', acquiredAt: new Date(NOW.getTime() - 400 * MS_PER_DAY) },
      { leadId: 'fresh', acquiredAt: new Date(NOW.getTime() - 10 * MS_PER_DAY) },
      { leadId: 'old-2', acquiredAt: new Date(NOW.getTime() - 800 * MS_PER_DAY) },
    ];
    expect(selectExpired(candidates, 365, NOW)).toEqual(['old-1', 'old-2']);
  });
});
