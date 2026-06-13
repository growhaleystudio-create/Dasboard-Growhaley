/**
 * Barrel for the Lead_Query_Service (R9, R7.4, R7.5).
 *
 * Exposes the pure default-ordering comparator/sort (Task 14.1), the pure
 * filter predicate + validation (Task 14.3), and the query service
 * entrypoint that hosts filtering (Task 14.3) and pagination (Task 14.6).
 */

export { compareLeadsDefault, sortLeadsDefault } from './default-sort.js';
export {
  type LeadFilter,
  type FilterValidation,
  SEARCH_MIN,
  SEARCH_MAX,
  matchesFilter,
  validateLeadFilter,
} from './lead-filter.js';
export {
  LeadQueryService,
  type ListDefaultOptions,
  type Page,
  LEAD_PAGE_SIZE,
} from './lead-query-service.js';
