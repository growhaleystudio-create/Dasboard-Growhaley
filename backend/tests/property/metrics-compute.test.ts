/**
 * Property-based tests for the pure dashboard-metric aggregation
 * {@link computeMetrics} (Task 15.1, R10.1–R10.5).
 *
 * Two design-level Correctness Properties are exercised here, both
 * registered through the shared {@link propertyTest} helper so they share
 * the canonical tag and `{ numRuns: 100 }` configuration:
 *
 * - **Property 28: Konsistensi agregasi metrik** (R10.1, R10.2, R10.3) —
 *   for an arbitrary array of {@link MetricLead} records, the metrics
 *   exclude Duplicate_Lead, `totalLeads` equals the count of non-duplicate
 *   leads, `Σ byStatus` equals `totalLeads` (with all six statuses always
 *   present), and `Σ bySource` is consistent with `totalLeads`.
 * - **Property 29: Perhitungan tingkat konversi** (R10.4) —
 *   `conversionRatePercent` equals `round2(converted / total * 100)` when
 *   `total > 0` and equals `0` when `total === 0`.
 *
 * The properties operate on the pure function directly — no database or
 * network is involved.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';
import { LEAD_STATUSES, type LeadStatus } from '@leads-generator/shared';

import { computeMetrics, type MetricLead } from '../../src/metrics/metrics-compute.js';

/**
 * Arbitrary {@link MetricLead}. `source` is drawn from a small pool (with
 * an `undefined` option) so grouping collisions are likely, and
 * `isDuplicate` is biased to surface both duplicate and non-duplicate
 * leads in most samples.
 */
const metricLeadArb: fc.Arbitrary<MetricLead> = fc.record({
  status: fc.constantFrom<LeadStatus>(...LEAD_STATUSES),
  isDuplicate: fc.boolean(),
  source: fc.option(fc.constantFrom('fiverr', 'threads', 'linkedin', 'google', 'facebook'), {
    nil: undefined,
  }),
  discoveredAt: fc
    .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2030-01-01T00:00:00Z') })
    .filter((d) => !Number.isNaN(d.getTime())),
});

const leadsArb: fc.Arbitrary<MetricLead[]> = fc.array(metricLeadArb, { maxLength: 200 });

/** Local reference implementation of the 2-decimal rounding (R10.4). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

describe('computeMetrics aggregation (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 28: Konsistensi agregasi metrik
  // Validates: Requirements 10.1, 10.2, 10.3
  propertyTest(it, 28, 'Konsistensi agregasi metrik', () => {
    pbt.assert(
      pbt.property(leadsArb, (leads) => {
        const metrics = computeMetrics(leads);

        // R10.1 / R10.3 — duplicates excluded from every count.
        const nonDuplicateCount = leads.filter((l) => !l.isDuplicate).length;
        if (metrics.totalLeads !== nonDuplicateCount) return false;

        // R10.2 — all six statuses present, even when 0.
        for (const status of LEAD_STATUSES) {
          if (typeof metrics.byStatus[status] !== 'number') return false;
          if (metrics.byStatus[status] < 0) return false;
        }
        if (Object.keys(metrics.byStatus).length !== LEAD_STATUSES.length) return false;

        // Σ byStatus === totalLeads.
        const statusSum = LEAD_STATUSES.reduce(
          (acc, status) => acc + metrics.byStatus[status],
          0,
        );
        if (statusSum !== metrics.totalLeads) return false;

        // R10.3 — Σ bySource is consistent with totalLeads. Sources are
        // only those with a defined `source`, so the sum equals the number
        // of non-duplicate leads that carry a source (≤ totalLeads). The
        // remainder is exactly the non-duplicate leads with no source.
        const sourceSum = metrics.bySource.reduce((acc, entry) => acc + entry.count, 0);
        const nonDuplicateWithSource = leads.filter(
          (l) => !l.isDuplicate && l.source !== undefined,
        ).length;
        if (sourceSum !== nonDuplicateWithSource) return false;
        if (sourceSum > metrics.totalLeads) return false;

        // Each bySource entry has a positive count and the list is sorted
        // ascending by sourceId with no duplicate sourceIds.
        const ids = metrics.bySource.map((e) => e.sourceId);
        for (const entry of metrics.bySource) {
          if (entry.count <= 0) return false;
        }
        const sorted = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        if (JSON.stringify(ids) !== JSON.stringify(sorted)) return false;
        if (new Set(ids).size !== ids.length) return false;

        return true;
      }),
      defaultPbtParams,
    );
  });

  // Tag: Feature: leads-generator-dashboard, Property 29: Perhitungan tingkat konversi
  // Validates: Requirements 10.4
  propertyTest(it, 29, 'Perhitungan tingkat konversi', () => {
    pbt.assert(
      pbt.property(leadsArb, (leads) => {
        const metrics = computeMetrics(leads);

        const total = metrics.totalLeads;
        const converted = leads.filter(
          (l) => !l.isDuplicate && l.status === 'Converted',
        ).length;

        if (total === 0) {
          // R10.5 — 0% when there are no leads.
          return metrics.conversionRatePercent === 0;
        }

        // R10.4 — (converted / total) * 100 rounded to 2 decimals.
        const expected = round2((converted / total) * 100);
        return metrics.conversionRatePercent === expected;
      }),
      defaultPbtParams,
    );
  });
});

describe('computeMetrics aggregation (examples)', () => {
  it('returns all-zero metrics for an empty dataset (R10.2, R10.5)', () => {
    const metrics = computeMetrics([]);
    expect(metrics.totalLeads).toBe(0);
    expect(metrics.bySource).toEqual([]);
    expect(metrics.conversionRatePercent).toBe(0);
    for (const status of LEAD_STATUSES) {
      expect(metrics.byStatus[status]).toBe(0);
    }
  });

  it('excludes duplicates from every count (R10.1, R10.3)', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const metrics = computeMetrics([
      { status: 'New', isDuplicate: false, source: 'fiverr', discoveredAt: now },
      { status: 'Converted', isDuplicate: false, source: 'fiverr', discoveredAt: now },
      { status: 'New', isDuplicate: true, source: 'fiverr', discoveredAt: now },
      { status: 'Converted', isDuplicate: true, source: 'threads', discoveredAt: now },
    ]);
    expect(metrics.totalLeads).toBe(2);
    expect(metrics.byStatus.New).toBe(1);
    expect(metrics.byStatus.Converted).toBe(1);
    expect(metrics.bySource).toEqual([{ sourceId: 'fiverr', count: 2 }]);
  });

  it('rounds the conversion rate to two decimals (R10.4)', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    // 1 converted of 3 → 33.333… → 33.33
    const metrics = computeMetrics([
      { status: 'Converted', isDuplicate: false, discoveredAt: now },
      { status: 'New', isDuplicate: false, discoveredAt: now },
      { status: 'New', isDuplicate: false, discoveredAt: now },
    ]);
    expect(metrics.conversionRatePercent).toBe(33.33);
  });

  it('sorts bySource ascending by sourceId and skips undefined sources (R10.3)', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const metrics = computeMetrics([
      { status: 'New', isDuplicate: false, source: 'threads', discoveredAt: now },
      { status: 'New', isDuplicate: false, source: 'fiverr', discoveredAt: now },
      { status: 'New', isDuplicate: false, source: undefined, discoveredAt: now },
    ]);
    expect(metrics.bySource).toEqual([
      { sourceId: 'fiverr', count: 1 },
      { sourceId: 'threads', count: 1 },
    ]);
    expect(metrics.totalLeads).toBe(3);
  });
});
