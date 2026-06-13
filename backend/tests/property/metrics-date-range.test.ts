/**
 * Property-based test for date-range scoping of dashboard metrics
 * (Task 15.4 / 15.5, R10.6).
 *
 * **Property 30: Penyaringan metrik berdasarkan rentang tanggal** (R10.6) —
 * for an arbitrary array of {@link MetricLead} records and a VALID inclusive
 * range (`from <= to`), aggregating the range-filtered leads
 * (`computeMetrics(withinRange(leads, range))`) yields exactly the same
 * {@link DashboardMetrics} as aggregating an INDEPENDENTLY filtered subset
 * (the leads whose `discoveredAt` lies in `[from, to]` inclusive). In other
 * words, the date-range filter composes correctly with the aggregation:
 * filtering then counting equals counting over the filtered set. Duplicate
 * exclusion is handled inside {@link computeMetrics}, so this property holds
 * regardless of how the duplicates are distributed in the range.
 *
 * The property operates on the pure functions directly — no database or
 * network is involved.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';

import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';
import { LEAD_STATUSES, type LeadStatus } from '@leads-generator/shared';

import {
  computeMetrics,
  withinRange,
  type DateRange,
  type MetricLead,
} from '../../src/metrics/metrics-compute.js';

const MIN_DATE = new Date('2020-01-01T00:00:00Z');
const MAX_DATE = new Date('2030-01-01T00:00:00Z');

const dateArb: fc.Arbitrary<Date> = fc
  .date({ min: MIN_DATE, max: MAX_DATE })
  .filter((d) => !Number.isNaN(d.getTime()));

/**
 * Arbitrary {@link MetricLead}. `source` is drawn from a small pool (with an
 * `undefined` option) so grouping collisions are likely, `isDuplicate` is
 * unbiased so both duplicate and non-duplicate leads appear, and
 * `discoveredAt` spans the same window the range is drawn from so many
 * samples straddle the range boundaries.
 */
const metricLeadArb: fc.Arbitrary<MetricLead> = fc.record({
  status: fc.constantFrom<LeadStatus>(...LEAD_STATUSES),
  isDuplicate: fc.boolean(),
  source: fc.option(fc.constantFrom('fiverr', 'threads', 'linkedin', 'google', 'facebook'), {
    nil: undefined,
  }),
  discoveredAt: dateArb,
});

const leadsArb: fc.Arbitrary<MetricLead[]> = fc.array(metricLeadArb, { maxLength: 200 });

/**
 * A VALID inclusive {@link DateRange}: two dates from the same window
 * normalized so `from <= to`. Drawing both endpoints from the lead window
 * keeps non-trivial overlap (some leads inside, some outside) likely.
 */
const validRangeArb: fc.Arbitrary<DateRange> = fc
  .tuple(dateArb, dateArb)
  .map(([a, b]): DateRange =>
    a.getTime() <= b.getTime() ? { from: a, to: b } : { from: b, to: a },
  );

describe('metrics date-range filtering (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 30: Penyaringan metrik berdasarkan rentang tanggal
  // Validates: Requirements 10.6
  propertyTest(it, 30, 'Penyaringan metrik berdasarkan rentang tanggal', () => {
    pbt.assert(
      pbt.property(leadsArb, validRangeArb, (leads, range) => {
        // Metrics computed via the production filter helper.
        const viaHelper = computeMetrics(withinRange(leads, range));

        // Metrics computed over an INDEPENDENTLY filtered subset — the
        // leads whose discoveredAt lies within [from, to] inclusive.
        const from = range.from.getTime();
        const to = range.to.getTime();
        const subset = leads.filter((lead) => {
          const at = lead.discoveredAt.getTime();
          return at >= from && at <= to;
        });
        const viaSubset = computeMetrics(subset);

        // The range filter composes with aggregation: both paths agree.
        return JSON.stringify(viaHelper) === JSON.stringify(viaSubset);
      }),
      defaultPbtParams,
    );
  });
});
