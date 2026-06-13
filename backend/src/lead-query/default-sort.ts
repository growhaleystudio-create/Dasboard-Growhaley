/**
 * Deterministic default ordering for the Lead list (Task 14.1).
 *
 * Design references:
 * - design.md → Lead_Query_Service: the default list ordering is
 *   `score DESC, discovered_at DESC, id ASC`.
 * - design.md → Data Models → Strategi Indeks (`idx_lead_default_sort`): the
 *   physical index that backs the same ordering in SQL.
 * - Requirements 7.4 (default ordering by Lead_Score descending) and 7.5
 *   (tie-break by discovery date newest-first, then Lead id ascending).
 *
 * The comparator below is the *executable specification* of that ordering:
 * it is a pure, total comparator (a strict-weak / total order with a
 * deterministic id tie-break) and it mirrors the `score DESC NULLS LAST,
 * discovered_at DESC, id ASC` clause used by `LeadRepository.listForTeam`.
 * Because the final tie-break is the unique Lead `id`, the order is *total*
 * and *deterministic*: any permutation of the same multiset of Leads sorts
 * to one and only one sequence.
 */

import type { Lead } from '@leads-generator/shared';

/**
 * Total order matching the default Lead list ordering (R7.4, R7.5):
 *
 *  1. `score` DESC, with a `null` (unscored) score sorting AFTER any numeric
 *     score (NULLS LAST — mirrors the SQL `idx_lead_default_sort`).
 *  2. `discoveredAt` DESC (newest first).
 *  3. `id` ASC (stable tie-break → fully deterministic total order).
 *
 * Returns a negative number when `a` should come before `b`, a positive
 * number when `a` should come after `b`, and `0` only when `a` and `b` have
 * equal score, equal `discoveredAt`, and equal `id` (i.e. the same Lead).
 */
export function compareLeadsDefault(a: Lead, b: Lead): number {
  // 1. score DESC with NULLS LAST.
  const scoreCmp = compareScoreDescNullsLast(a.score, b.score);
  if (scoreCmp !== 0) return scoreCmp;

  // 2. discovered_at DESC (newest first).
  const discoveredCmp = b.discoveredAt.getTime() - a.discoveredAt.getTime();
  if (discoveredCmp !== 0) return discoveredCmp;

  // 3. id ASC — the unique tie-break that makes the order total.
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Compare two `score` values for DESCending order with `null` sorting last
 * (NULLS LAST). A `null` score represents an unscored Lead (R7.8) and must
 * appear after every numeric score under the default ordering.
 *
 * - both `null` → `0` (tie, deferred to the next sort key).
 * - `a` null, `b` numeric → `a` sorts after `b` → returns `1`.
 * - `a` numeric, `b` null → `a` sorts before `b` → returns `-1`.
 * - both numeric → `b - a` (higher score first).
 */
function compareScoreDescNullsLast(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/**
 * Sort a COPY of `leads` by the default order. Pure: the input array is not
 * mutated. The returned array contains the same Lead references in the
 * canonical default order defined by {@link compareLeadsDefault}.
 */
export function sortLeadsDefault(leads: readonly Lead[]): Lead[] {
  return [...leads].sort(compareLeadsDefault);
}
