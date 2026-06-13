/**
 * Pure metric aggregation for the Dashboard (Task 15.1, R10.1–R10.5).
 *
 * Design references:
 * - design.md → Lead_Query_Service (R9) & Metrics_Service (R10) →
 *   {@link DashboardMetrics}.
 * - design.md → Aturan Konsistensi Penting: "Eksklusi duplikat dari metrik
 *   & daftar utama (R6.1, R10.1, R10.3): semua query daftar/metrik
 *   memfilter `is_duplicate = false`."
 *
 * This module is intentionally a PURE function over an in-memory array of
 * lead-like records. Keeping aggregation free of I/O makes it trivially
 * property-testable (Property 28, Property 29) and lets both the production
 * SQL path (via {@link MetricsRepository}) and tests share one source of
 * truth for the consistency rules.
 */

import type { LeadStatus } from '@leads-generator/shared';
import { LEAD_STATUSES } from '@leads-generator/shared';

/**
 * Minimal lead-like record consumed by {@link computeMetrics}. Only the
 * attributes that drive the dashboard metrics are modelled; everything else
 * on a Lead is irrelevant to aggregation.
 */
export interface MetricLead {
  status: LeadStatus;
  /** When true the lead is a Duplicate_Lead and excluded from EVERY count
   * (R10.1, R10.3). */
  isDuplicate: boolean;
  /** Origin Source; `undefined` leads are excluded from `bySource` but
   * still counted in `totalLeads`/`byStatus`. */
  source?: string;
  discoveredAt: Date;
}

/**
 * Aggregate dashboard metrics for a Team (R10.1–R10.5).
 */
export interface DashboardMetrics {
  /** Count of non-duplicate leads (R10.1). */
  totalLeads: number;
  /** Per-status counts; all six {@link LEAD_STATUSES} present, 0 when none
   * (R10.2). */
  byStatus: Record<LeadStatus, number>;
  /** Per-Source counts for Sources with ≥1 non-duplicate lead, sorted by
   * `sourceId` ascending, consistent with `totalLeads` (R10.3). */
  bySource: { sourceId: string; count: number }[];
  /** (Converted / total) × 100 rounded to 2 decimals; 0 when total = 0
   * (R10.4, R10.5). */
  conversionRatePercent: number;
}

/**
 * Round to two decimal places (R10.4). Uses the standard
 * `Math.round(x * 100) / 100` scaling so e.g. `33.333…` → `33.33` and
 * `66.666…` → `66.67`.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build the `byStatus` record initialized with every status at 0 (R10.2),
 * so statuses with no leads still report `0` rather than being absent.
 */
function emptyByStatus(): Record<LeadStatus, number> {
  const byStatus = {} as Record<LeadStatus, number>;
  for (const status of LEAD_STATUSES) {
    byStatus[status] = 0;
  }
  return byStatus;
}

/**
 * Pure aggregation (R10.1–R10.5).
 *
 * Excludes duplicates from EVERY count (R10.1, R10.3): duplicates are
 * filtered out FIRST so `totalLeads`, `byStatus`, and `bySource` are all
 * computed over the same non-duplicate set and therefore stay mutually
 * consistent.
 *
 * - `totalLeads`: number of non-duplicate leads.
 * - `byStatus`: all six {@link LEAD_STATUSES} initialized to 0, then
 *   incremented per non-duplicate lead; `Σ byStatus === totalLeads`.
 * - `bySource`: non-duplicate leads grouped by `source` (leads with an
 *   `undefined` source are skipped), emitted as a `sourceId`-ascending
 *   array of `{ sourceId, count }` containing only Sources with ≥1 lead.
 * - `conversionRatePercent`: `0` when `totalLeads === 0`; otherwise
 *   `round2(converted / total * 100)`.
 */
export function computeMetrics(leads: readonly MetricLead[]): DashboardMetrics {
  // R10.1 / R10.3 consistency — exclude duplicates once, up front.
  const nonDuplicate = leads.filter((lead) => !lead.isDuplicate);

  const totalLeads = nonDuplicate.length;

  const byStatus = emptyByStatus();
  const countBySource = new Map<string, number>();

  for (const lead of nonDuplicate) {
    byStatus[lead.status] += 1;
    if (lead.source !== undefined) {
      countBySource.set(lead.source, (countBySource.get(lead.source) ?? 0) + 1);
    }
  }

  const bySource = [...countBySource.entries()]
    .map(([sourceId, count]) => ({ sourceId, count }))
    .sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));

  const conversionRatePercent =
    totalLeads === 0 ? 0 : round2((byStatus.Converted / totalLeads) * 100);

  return { totalLeads, byStatus, bySource, conversionRatePercent };
}

/**
 * Inclusive date range used to scope dashboard metrics (R10.6). `from` and
 * `to` bound the `discoveredAt` of the leads to aggregate; the range is
 * valid only when `from` is at or before `to` (see {@link isValidRange}).
 */
export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * A range is valid iff its start is at or before its end (R10.6, R10.7).
 * Validation compares epoch milliseconds so it is timezone-agnostic and
 * treats `from === to` (a single instant) as valid.
 */
export function isValidRange(range: DateRange): boolean {
  return range.from.getTime() <= range.to.getTime();
}

/**
 * Filter `leads` to those whose `discoveredAt` falls within `[from, to]`
 * inclusive (R10.6). Mirrors the SQL `discovered_at BETWEEN from AND to`
 * used by {@link MetricsRepository.loadLeadFacts}, so the in-memory filter
 * and the production query agree on boundary handling. Pure: the input is
 * not mutated.
 */
export function withinRange(leads: readonly MetricLead[], range: DateRange): MetricLead[] {
  const from = range.from.getTime();
  const to = range.to.getTime();
  return leads.filter((lead) => {
    const at = lead.discoveredAt.getTime();
    return at >= from && at <= to;
  });
}
