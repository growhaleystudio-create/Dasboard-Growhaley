/**
 * Metrics_Service — computes dashboard metrics for a Team (Task 15.1, R10).
 *
 * Design references:
 * - design.md → Metrics_Service (R10): `compute(teamId, range?)` returns
 *   {@link DashboardMetrics}.
 * - design.md → Aturan Konsistensi Penting (R6.1, R10.1, R10.3).
 *
 * This service is a thin orchestrator: it loads non-duplicate lead facts
 * via {@link MetricsRepository} (duplicates already excluded in SQL) and
 * delegates all counting to the pure {@link computeMetrics}. Date-range
 * recompute + validation is Task 15.4; for Task 15.1 the optional `range`
 * is simply forwarded to the repository.
 */

import { err, ok, type Result } from '@leads-generator/shared';
import type { AppError, LeadStatus } from '@leads-generator/shared';
import { LEAD_STATUSES } from '@leads-generator/shared';

import type { MetricsRepository } from './metrics-repository.js';
import {
  computeMetrics,
  isValidRange,
  type DashboardMetrics,
  type DateRange,
  type MetricLead,
} from './metrics-compute.js';

/**
 * Guarded narrowing of a database `status` string to {@link LeadStatus}.
 * The `lead.status` column is constrained by a CHECK to exactly the six
 * statuses, so any value the DB returns is valid; this guard keeps the
 * cast type-safe (no `any`) and fails loudly if the invariant is ever
 * violated.
 */
function toLeadStatus(status: string): LeadStatus {
  if ((LEAD_STATUSES as readonly string[]).includes(status)) {
    return status as LeadStatus;
  }
  throw new Error(`Unexpected lead status from database: ${status}`);
}

/**
 * Domain service that produces {@link DashboardMetrics} for a Team.
 */
export class MetricsService {
  constructor(private readonly repo: MetricsRepository) {}

  /**
   * Compute dashboard metrics for `teamId` (R10.1–R10.5). When `range` is
   * provided it is validated FIRST: a range whose start is after its end is
   * rejected with a `VALIDATION` error WITHOUT loading or recomputing, so
   * the caller keeps displaying the previous metrics unchanged (R10.7).
   * For a valid range (start ≤ end, inclusive) the bounds are forwarded to
   * the repository so only leads discovered within `[from, to]` are
   * aggregated (R10.6). The `Result` wrapper keeps the surface consistent
   * with the rest of the domain services.
   */
  async compute(
    teamId: string,
    range?: DateRange,
  ): Promise<Result<DashboardMetrics, AppError>> {
    // R10.7 — reject an inverted range up front. We do NOT load facts or
    // recompute: the previous metrics view is preserved by the caller.
    if (range !== undefined && !isValidRange(range)) {
      return err({
        code: 'VALIDATION',
        messages: ['rentang tanggal tidak valid: tanggal awal melebihi tanggal akhir'],
      });
    }

    const facts = await this.repo.loadLeadFacts(teamId, range);
    // Facts are already non-duplicate (filtered in SQL), so `isDuplicate`
    // is uniformly false here; computeMetrics re-applies the exclusion
    // defensively for callers that pass duplicates directly. `source` is
    // omitted (not set to `undefined`) when NULL to satisfy
    // exactOptionalPropertyTypes.
    const leads: MetricLead[] = facts.map((fact) => ({
      status: toLeadStatus(fact.status),
      isDuplicate: false,
      discoveredAt: fact.discoveredAt,
      ...(fact.source !== null ? { source: fact.source } : {}),
    }));
    return ok(computeMetrics(leads));
  }
}
