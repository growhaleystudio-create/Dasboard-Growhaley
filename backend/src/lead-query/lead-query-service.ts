/**
 * Lead_Query_Service (R9, R7.4, R7.5).
 *
 * Exposes:
 * - `listDefault` (Task 14.1): the canonical default-ordered listing.
 * - `list` (Task 14.3 / 14.6): filtered + paginated listing returning a
 *   {@link Page} of Leads. Combines the substring search, status, source and
 *   score-range filters as an intersection (logical AND, R9.7), rejects an
 *   invalid score range WITHOUT changing results (R9.8), and paginates the
 *   filtered set at 25 items per page (R9.1).
 *
 * Ordering is delegated to the repository SQL, which orders by
 * `score DESC NULLS LAST, discovered_at DESC, id ASC` via
 * `idx_lead_default_sort`. The pure comparator in `./default-sort.ts` is the
 * executable specification of that ordering and is what the Property 8 test
 * pins down; this class keeps the two in lock-step.
 *
 * ---------------------------------------------------------------------------
 * Implementation note — in-memory filtering (perf follow-up: Task 21)
 * ---------------------------------------------------------------------------
 * `list` currently loads the Team's canonical Leads via
 * `leads.listForTeam` (already ordered + duplicate-excluded by SQL) and then
 * applies {@link matchesFilter} in-memory before paginating. This keeps the
 * filter semantics in ONE pure place ({@link matchesFilter}), which is what
 * the Property 25 / 27 tests exercise, and is correct for the data sizes the
 * functional tasks target. Pushing the predicate down into SQL (using
 * `idx_lead_search_trgm` for search and indexed range scans for score) is a
 * later performance optimization (R12.2, Task 21) that must preserve exactly
 * the semantics encoded here.
 */

import type { Lead } from '@leads-generator/shared';
import { type Result, err, ok } from '@leads-generator/shared';

import type { LeadRepository } from '../repository/lead-repository.js';

import { sortLeadsDefault } from './default-sort.js';
import { type LeadFilter, matchesFilter, validateLeadFilter } from './lead-filter.js';

/**
 * Options for {@link LeadQueryService.listDefault}. Mirrors the
 * pagination knobs accepted by the repository; defaults (page size 25,
 * offset 0) live in the repository layer.
 */
export interface ListDefaultOptions {
  limit?: number;
  offset?: number;
}

/**
 * Canonical page size for the Lead list (R9.1): at most 25 Leads per page.
 */
export const LEAD_PAGE_SIZE = 25;

/**
 * A single page of results. `page` is the 0-indexed page number that was
 * requested (clamped to >= 0), `total` is the size of the full filtered set
 * (NOT just the current page), and `pageSize` is fixed at 25 (R9.1).
 */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Upper bound on the number of candidate Leads loaded for in-memory
 * filtering. Generous enough for the functional tasks; the SQL push-down
 * (Task 21) removes the need to materialize the whole set.
 */
const CANDIDATE_LOAD_LIMIT = 100_000;

/**
 * Query-side service for Leads. Read-only; never mutates Lead state.
 */
export class LeadQueryService {
  constructor(private readonly leads: LeadRepository) {}

  /**
   * Return canonical (non-duplicate) Leads for the Team in the default
   * order (R7.4, R7.5). Duplicates are excluded to match the Lead list and
   * metric defaults (R6.1, R10.1).
   */
  async listDefault(teamId: string, opts: ListDefaultOptions = {}): Promise<Lead[]> {
    return this.leads.listForTeam(teamId, { includeDuplicates: false, ...opts });
  }

  /**
   * Filtered + paginated Lead listing (R9.1–R9.8).
   *
   * Steps:
   * 1. Validate `filter` (R9.2 search length, R9.8 score range). An invalid
   *    filter yields `err({ code: 'VALIDATION', messages })` and the caller
   *    keeps showing the previous results unchanged (R9.8).
   * 2. Load the Team's canonical Leads in default order.
   * 3. Apply the (normalized) filter as an intersection of predicates
   *    (R9.7) via {@link matchesFilter}.
   * 4. Paginate at {@link LEAD_PAGE_SIZE} (25, R9.1). `page` is 0-indexed
   *    and clamped to >= 0. `total` is the size of the full filtered set, so
   *    an empty filtered set yields `items: []`, `total: 0` (R9.6).
   */
  async list(teamId: string, filter: LeadFilter, page: number, pageSize = LEAD_PAGE_SIZE): Promise<Result<Page<Lead>>> {
    const validation = validateLeadFilter(filter);
    if (!validation.ok) {
      return err({ code: 'VALIDATION', messages: validation.messages });
    }
    const normalized = validation.normalized;

    // Default ordering comes from the repository SQL; re-sort defensively so
    // the page sequence matches the pure comparator even if a future caller
    // supplies an unordered candidate source.
    const candidates = await this.leads.listForTeam(teamId, {
      includeDuplicates: false,
      limit: CANDIDATE_LOAD_LIMIT,
      offset: 0,
    });
    const ordered = sortLeadsDefault(candidates);
    const filtered = ordered.filter((lead) => matchesFilter(lead, normalized));

    const safePage = page < 0 ? 0 : Math.trunc(page);
    const safePageSize = Math.min(LEAD_PAGE_SIZE, Math.max(1, Math.trunc(pageSize)));
    const start = safePage * safePageSize;
    const items = filtered.slice(start, start + safePageSize);

    return ok({
      items,
      page: safePage,
      pageSize: safePageSize,
      total: filtered.length,
    });
  }
}
