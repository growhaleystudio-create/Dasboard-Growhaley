/**
 * Property-based tests for the Lead_Query_Service filter, validation and
 * pagination (Task 14.3 / 14.6).
 *
 * Properties under test (design.md → Correctness Properties):
 * - Property 25: Filter merupakan irisan predikat (logika DAN)
 *     Validates: Requirements 9.2, 9.3, 9.4, 9.5, 9.7
 * - Property 26: Validasi rentang skor filter
 *     Validates: Requirements 9.8
 * - Property 27: Pagination mempertahankan ukuran & urutan
 *     Validates: Requirements 9.1
 *
 * The filter predicate ({@link matchesFilter}) and validation
 * ({@link validateLeadFilter}) are pure. Pagination is exercised through the
 * in-memory {@link LeadQueryService.list} backed by a fake repository that
 * returns a known set of Leads.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { LEAD_STATUSES, type Lead, type LeadStatus } from '@leads-generator/shared';
import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';

import { sortLeadsDefault } from '../../src/lead-query/default-sort.js';
import {
  type LeadFilter,
  matchesFilter,
  validateLeadFilter,
} from '../../src/lead-query/lead-filter.js';
import { LEAD_PAGE_SIZE, LeadQueryService } from '../../src/lead-query/lead-query-service.js';
import type { LeadRepository } from '../../src/repository/lead-repository.js';

const SOURCE_POOL = ['google', 'linkedin', 'twitter'] as const;

/**
 * Build a {@link Lead} carrying only the fields that participate in
 * filtering / ordering. Other required fields use fixed, irrelevant values.
 */
function makeLead(spec: {
  id: string;
  name?: string;
  publicContact?: string;
  location?: string;
  status: LeadStatus;
  acquiredSource?: string;
  score: number | null;
  discoveredAtMs: number;
}): Lead {
  return {
    id: spec.id,
    teamId: 'team-1',
    name: spec.name,
    publicContact: spec.publicContact,
    location: spec.location,
    matchedKeywords: [],
    status: spec.status,
    score: spec.score,
    scoreState: spec.score === null ? 'unscored' : 'scored',
    isDuplicate: false,
    acquiredSource: spec.acquiredSource,
    discoveredAt: new Date(spec.discoveredAtMs),
    aiIntentScore: null,
    aiState: 'none',
    createdAt: new Date(0),
  };
}

/**
 * Arbitrary array of Leads with UNIQUE ids (so the default order is
 * unambiguous). Descriptive fields are drawn from small pools so substring
 * search hits are common; statuses, sources and scores vary so every
 * predicate is exercised.
 */
const leadsArb: fc.Arbitrary<Lead[]> = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 0, maxLength: 40 })
  .chain((ids) =>
    fc.tuple(
      ...ids.map((id) =>
        fc.record({
          id: fc.constant(id),
          name: fc.option(fc.constantFrom('Alice', 'Bob', 'ACME', 'Zeta'), { nil: undefined }),
          publicContact: fc.option(fc.constantFrom('a@x.com', 'bob@y.io', '555-acme'), {
            nil: undefined,
          }),
          location: fc.option(fc.constantFrom('NYC', 'LA', 'Acme City'), { nil: undefined }),
          status: fc.constantFrom<LeadStatus>(...LEAD_STATUSES),
          acquiredSource: fc.option(fc.constantFrom(...SOURCE_POOL), { nil: undefined }),
          score: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
          discoveredAtMs: fc.integer({ min: 0, max: 5 }).map((d) => d * 86_400_000),
        }),
      ),
    ),
  )
  .map((specs) => specs.map((s) => makeLead(s)));

/** Arbitrary filter exercising every criterion (any combination, R9.7). */
const filterArb: fc.Arbitrary<LeadFilter> = fc.record(
  {
    search: fc.option(fc.constantFrom('a', 'AC', 'bob', 'z', 'xyz', '55', ''), { nil: undefined }),
    statuses: fc.option(fc.subarray([...LEAD_STATUSES]), { nil: undefined }),
    sources: fc.option(fc.subarray([...SOURCE_POOL]), { nil: undefined }),
    scoreMin: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
    scoreMax: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
  },
  { requiredKeys: [] },
);

/** Sequence of ids in current order. */
function idSequence(leads: readonly Lead[]): string[] {
  return leads.map((l) => l.id);
}

// --- Independent reference predicates (R9.2–R9.5), used by Property 25. ---

function searchPred(lead: Lead, f: LeadFilter): boolean {
  if (f.search === undefined) return true;
  const needle = f.search.trim().toLowerCase();
  const hay = `${lead.name ?? ''} ${lead.publicContact ?? ''} ${lead.location ?? ''}`.toLowerCase();
  return hay.includes(needle);
}
function statusPred(lead: Lead, f: LeadFilter): boolean {
  return f.statuses === undefined ? true : f.statuses.includes(lead.status);
}
function sourcePred(lead: Lead, f: LeadFilter): boolean {
  if (f.sources === undefined) return true;
  return lead.acquiredSource !== undefined && f.sources.includes(lead.acquiredSource);
}
function scorePred(lead: Lead, f: LeadFilter): boolean {
  if (f.scoreMin === undefined && f.scoreMax === undefined) return true;
  if (lead.score === null) return false;
  return lead.score >= (f.scoreMin ?? 0) && lead.score <= (f.scoreMax ?? 100);
}

describe('Lead filter intersection (R9.2–R9.5, R9.7)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 25: Filter merupakan
  // irisan predikat (logika DAN)
  propertyTest(it, 25, 'Filter merupakan irisan predikat (logika DAN)', () => {
    pbt.assert(
      pbt.property(leadsArb, filterArb, (leads, filter) => {
        // Reference: a Lead is included iff it satisfies ALL predicates,
        // each computed independently (logical AND, R9.7).
        const reference = leads.filter(
          (l) =>
            searchPred(l, filter) &&
            statusPred(l, filter) &&
            sourcePred(l, filter) &&
            scorePred(l, filter),
        );

        const actual = leads.filter((l) => matchesFilter(l, filter));

        // The set returned equals EXACTLY the reference intersection — same
        // members, same order, nothing outside.
        expect(idSequence(actual)).toEqual(idSequence(reference));

        // Cross-check the AND decomposition element-by-element.
        for (const l of leads) {
          const expected =
            searchPred(l, filter) &&
            statusPred(l, filter) &&
            sourcePred(l, filter) &&
            scorePred(l, filter);
          expect(matchesFilter(l, filter)).toBe(expected);
        }
        return true;
      }),
      defaultPbtParams,
    );
  });
});

describe('Lead filter score-range validation (R9.8)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 26: Validasi rentang
  // skor filter
  propertyTest(it, 26, 'Validasi rentang skor filter', () => {
    pbt.assert(
      pbt.property(
        fc.option(fc.integer({ min: -20, max: 120 }), { nil: undefined }),
        fc.option(fc.integer({ min: -20, max: 120 }), { nil: undefined }),
        (scoreMin, scoreMax) => {
          const filter: LeadFilter = {};
          if (scoreMin !== undefined) filter.scoreMin = scoreMin;
          if (scoreMax !== undefined) filter.scoreMax = scoreMax;

          const outOfRange =
            (scoreMin !== undefined && (scoreMin < 0 || scoreMin > 100)) ||
            (scoreMax !== undefined && (scoreMax < 0 || scoreMax > 100));
          const minGtMax =
            scoreMin !== undefined && scoreMax !== undefined && scoreMin > scoreMax;
          const shouldReject = outOfRange || minGtMax;

          const result = validateLeadFilter(filter);

          // Rejected IFF an out-of-range bound or min>max (R9.8).
          expect(result.ok).toBe(!shouldReject);
          if (!result.ok) {
            // On rejection there must be at least one validation message.
            expect(result.messages.length).toBeGreaterThan(0);
          }
          return true;
        },
      ),
      defaultPbtParams,
    );
  });
});

/**
 * Fake repository returning a fixed Lead set regardless of pagination opts.
 * {@link LeadQueryService.list} loads the full candidate set and paginates
 * in-memory, so the fake just hands back every Lead.
 */
function fakeRepo(leads: readonly Lead[]): LeadRepository {
  return {
    async listForTeam(): Promise<Lead[]> {
      return [...leads];
    },
  } as unknown as LeadRepository;
}

/** Arbitrary VALID filter (so `list` never rejects) for the pagination property. */
const validFilterArb: fc.Arbitrary<LeadFilter> = fc
  .record(
    {
      search: fc.option(fc.constantFrom('a', 'AC', 'bob', 'z', 'xyz'), { nil: undefined }),
      statuses: fc.option(fc.subarray([...LEAD_STATUSES]), { nil: undefined }),
      sources: fc.option(fc.subarray([...SOURCE_POOL]), { nil: undefined }),
      // A valid, ordered [min, max] sub-range within 0..100.
      range: fc.option(
        fc
          .tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }))
          .map(([a, b]) => (a <= b ? ([a, b] as const) : ([b, a] as const))),
        { nil: undefined },
      ),
    },
    { requiredKeys: [] },
  )
  .map(({ search, statuses, sources, range }) => {
    const f: LeadFilter = {};
    if (search !== undefined) f.search = search;
    if (statuses !== undefined) f.statuses = statuses;
    if (sources !== undefined) f.sources = sources;
    if (range !== undefined) {
      f.scoreMin = range[0];
      f.scoreMax = range[1];
    }
    return f;
  });

describe('Lead pagination preserves size & order (R9.1)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 27: Pagination
  // mempertahankan ukuran & urutan
  propertyTest(it, 27, 'Pagination mempertahankan ukuran & urutan', () => {
    return pbt.assert(
      fc.asyncProperty(leadsArb, validFilterArb, async (leads, filter) => {
        const service = new LeadQueryService(fakeRepo(leads));

        // Independent reference: full filtered + default-sorted set.
        const validation = validateLeadFilter(filter);
        expect(validation.ok).toBe(true);
        const normalized = validation.ok ? validation.normalized : filter;
        const expected = sortLeadsDefault(leads).filter((l) => matchesFilter(l, normalized));
        const total = expected.length;

        const pageCount = Math.max(1, Math.ceil(total / LEAD_PAGE_SIZE));
        const collected: Lead[] = [];

        for (let p = 0; p < pageCount; p += 1) {
          const res = await service.list('team-1', filter, p);
          expect(res.ok).toBe(true);
          if (!res.ok) return false;
          const page = res.value;

          // Page size never exceeds 25 (R9.1).
          expect(page.items.length).toBeLessThanOrEqual(LEAD_PAGE_SIZE);
          // `total` is the full filtered size on every page.
          expect(page.total).toBe(total);
          expect(page.pageSize).toBe(LEAD_PAGE_SIZE);
          expect(page.page).toBe(p);
          // Each page is exactly the corresponding slice of the ordered set
          // (preserves order, size and position).
          expect(idSequence(page.items)).toEqual(
            idSequence(expected.slice(p * LEAD_PAGE_SIZE, p * LEAD_PAGE_SIZE + LEAD_PAGE_SIZE)),
          );

          collected.push(...page.items);
        }

        // Concatenating all pages reproduces the full filtered+sorted list
        // with no duplication or loss.
        expect(idSequence(collected)).toEqual(idSequence(expected));

        // A page beyond the range is empty but still reports the true total.
        const beyond = await service.list('team-1', filter, pageCount);
        expect(beyond.ok).toBe(true);
        if (beyond.ok) {
          expect(beyond.value.items).toEqual([]);
          expect(beyond.value.total).toBe(total);
        }
        return true;
      }),
      defaultPbtParams,
    );
  });
});
