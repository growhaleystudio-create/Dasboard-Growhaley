/**
 * Dry-run harness (implementation plan Phase 2, step 1).
 *
 * Recomputes every lead with the v2 engine WITHOUT persisting anything, and
 * emits a calibration report: per-lead rows, a band histogram, and a v1→v2
 * comparison. This is what turns "≥95% accurate" from a claim into something
 * you can inspect and label before any user-visible score changes.
 *
 * Pure and side-effect-free (the caller supplies leads and an optional audit
 * function) so it can be unit-tested; the CLI wrapper lives in
 * `src/dev/dry-run-scoring-v2.ts`.
 */

import type { Lead } from '@leads-generator/shared';

import { computeLeadScoreV2 } from './index.js';
import { mapLeadToScoreInputV2 } from './map-lead-input.js';
import type { ScoreBand, WebsiteAuditInputV2 } from './types.js';

export interface DryRunRow {
  leadId: string;
  name: string;
  category: string;
  hasWebsite: boolean;
  v1Score: number | null;
  v2Score: number;
  v2Band: ScoreBand;
  businessValue: number;
  digitalGap: number;
  reachability: number;
  confidenceMultiplier: number;
}

export interface DryRunReport {
  count: number;
  rows: DryRunRow[];
  bandHistogram: Record<ScoreBand, number>;
  /** Comparison over leads that already had a v1 score. */
  comparison: {
    compared: number;
    movedUp: number;
    movedDown: number;
    unchanged: number;
    meanAbsDelta: number;
  };
}

/** Optional per-lead audit resolver (e.g. a live custom-parser audit). */
export type AuditResolver = (lead: Lead) => Promise<WebsiteAuditInputV2 | undefined>;

const EMPTY_HISTOGRAM: Record<ScoreBand, number> = { hot: 0, warm: 0, nurture: 0, cold: 0 };

export async function buildDryRunReport(
  leads: Lead[],
  resolveAudit?: AuditResolver,
): Promise<DryRunReport> {
  const rows: DryRunRow[] = [];
  const bandHistogram: Record<ScoreBand, number> = { ...EMPTY_HISTOGRAM };

  let compared = 0;
  let movedUp = 0;
  let movedDown = 0;
  let unchanged = 0;
  let absDeltaSum = 0;

  for (const lead of leads) {
    const audit = resolveAudit ? await resolveAudit(lead) : undefined;
    const input = mapLeadToScoreInputV2(lead, audit ? { audit } : {});
    const score = computeLeadScoreV2(input);

    bandHistogram[score.band] += 1;

    if (lead.score !== null) {
      compared += 1;
      const delta = score.finalScore - lead.score;
      absDeltaSum += Math.abs(delta);
      if (delta > 0) movedUp += 1;
      else if (delta < 0) movedDown += 1;
      else unchanged += 1;
    }

    rows.push({
      leadId: lead.id,
      name: lead.name ?? '',
      category: lead.auditAttributes?.category ?? '',
      hasWebsite: input.hasWebsite,
      v1Score: lead.score,
      v2Score: score.finalScore,
      v2Band: score.band,
      businessValue: score.businessValue.score,
      digitalGap: score.digitalGap.score,
      reachability: score.reachability.score,
      confidenceMultiplier: score.confidence.multiplier,
    });
  }

  return {
    count: leads.length,
    rows,
    bandHistogram,
    comparison: {
      compared,
      movedUp,
      movedDown,
      unchanged,
      meanAbsDelta: compared > 0 ? Math.round((absDeltaSum / compared) * 10) / 10 : 0,
    },
  };
}

const CSV_HEADER = [
  'lead_id',
  'name',
  'category',
  'has_website',
  'v1_score',
  'v2_score',
  'v2_band',
  'business_value',
  'digital_gap',
  'reachability',
  'confidence_multiplier',
] as const;

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serialize the report rows to CSV (blind-labeling friendly — no v2 leaks a labeler shouldn't see). */
export function dryRunToCsv(report: DryRunReport): string {
  const lines = [CSV_HEADER.join(',')];
  for (const row of report.rows) {
    lines.push(
      [
        row.leadId,
        row.name,
        row.category,
        row.hasWebsite,
        row.v1Score,
        row.v2Score,
        row.v2Band,
        row.businessValue,
        row.digitalGap,
        row.reachability,
        row.confidenceMultiplier,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}
