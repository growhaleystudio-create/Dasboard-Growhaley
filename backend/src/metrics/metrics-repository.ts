/**
 * Tenant-scoped data access for dashboard metrics (Task 15.1, R10).
 *
 * Design references:
 * - design.md → Metrics_Service (R10): metrics are computed over a Team's
 *   non-duplicate leads.
 * - design.md → Aturan Konsistensi Penting (R6.1, R10.1, R10.3): every
 *   metric query filters `is_duplicate = false`.
 * - design.md → Auth/RBAC Guard & Tenant Guard (R2.8): the query is always
 *   scoped by `team_id`.
 *
 * This repository only LOADS the lead facts needed for aggregation; the
 * actual counting lives in the pure {@link computeMetrics} so the same
 * rules are shared by production and property tests. An optional inclusive
 * date range is plumbed through here for Task 15.4 (date-range recompute);
 * for Task 15.1 the range is simply forwarded when present.
 */

import { query, type DbExecutor } from '../repository/types.js';

/**
 * A single non-duplicate lead fact used to compute dashboard metrics:
 * its workflow `status`, origin `source` (NULL when unknown), and
 * `discoveredAt` timestamp (used by the date-range filter, R10.6).
 */
export interface LeadFact {
  status: string;
  source: string | null;
  discoveredAt: Date;
}

/** Raw row shape returned by {@link MetricsRepository.loadLeadFacts}. */
interface LeadFactRow {
  status: string;
  source: string | null;
  discovered_at: Date;
}

/**
 * Repository that loads the non-duplicate lead facts for a Team's metrics.
 */
export class MetricsRepository {
  constructor(private readonly db: DbExecutor) {}

  /**
   * Load non-duplicate lead facts (`status`, `source`, `discoveredAt`) for
   * `teamId`. Duplicates are excluded in SQL (R10.1, R10.3). When `range`
   * is supplied, only leads whose `discovered_at` falls within the
   * inclusive `[from, to]` range are returned (R10.6); for Task 15.1 the
   * range is optional and typically omitted.
   *
   * Fully parameterized — no value is interpolated into the SQL string.
   */
  async loadLeadFacts(
    teamId: string,
    range?: { from: Date; to: Date },
  ): Promise<LeadFact[]> {
    const params: unknown[] = [teamId];
    let rangeClause = '';
    if (range !== undefined) {
      params.push(range.from, range.to);
      rangeClause = ' AND discovered_at BETWEEN $2 AND $3';
    }

    const rows = await query<LeadFactRow>(
      this.db,
      `SELECT status, acquired_source AS source, discovered_at
         FROM lead
        WHERE team_id = $1
          AND is_duplicate = false${rangeClause}`,
      params,
    );

    return rows.map((row) => ({
      status: row.status,
      source: row.source,
      discoveredAt: row.discovered_at,
    }));
  }
}
