/**
 * Persisted, reusable website audit (implementation plan Phase 0).
 *
 * The AI analyzer runs Lighthouse once and stores the result here; the scorer
 * reads it back instead of auditing again. This is the single mechanism that
 * makes "the SEO/UX/Performance numbers in AI analysis are the numbers that
 * formed the score" true, and it avoids a second Lighthouse run per rescore.
 *
 * The stored shape is the normalized {@link WebsiteAuditInputV2} (plus Core Web
 * Vitals kept only for AI insight), so callers reconstruct a scorer input with
 * zero re-derivation.
 */

import type { PublicWebsiteAudit, WebsiteAuditSummary } from '@leads-generator/shared';

import { fromCustomAudit, fromLighthouseAudit } from '../scoring/v2/map-lead-input.js';
import type {
  ConversionSignals,
  FallbackSeoSignals,
  FallbackUxSignals,
  LighthouseScores,
  WebsiteAuditInputV2,
  WebsiteAuditStatusV2,
} from '../scoring/v2/types.js';
import { query, type DbExecutor } from './types.js';

export interface CoreWebVitals {
  lcpMs?: number;
  tbtMs?: number;
  cls?: number;
  inpMs?: number;
  fcpMs?: number;
  speedIndexMs?: number;
}

export interface CachedWebsiteAudit {
  teamId: string;
  leadId: string;
  source: 'lighthouse' | 'custom-parser';
  status: WebsiteAuditStatusV2;
  lighthouse?: LighthouseScores;
  conversion: ConversionSignals;
  fallbackSeo?: FallbackSeoSignals;
  fallbackUx?: FallbackUxSignals;
  coreWebVitals?: CoreWebVitals;
  computedAt: Date;
}

/** Build a cache entity from a Lighthouse audit (the one shown in AI analysis). */
export function cachedFromLighthouse(
  teamId: string,
  leadId: string,
  audit: PublicWebsiteAudit,
  computedAt: Date,
): CachedWebsiteAudit {
  const v2 = fromLighthouseAudit(audit);
  const cache: CachedWebsiteAudit = {
    teamId,
    leadId,
    source: 'lighthouse',
    status: v2.status,
    conversion: v2.conversion,
    computedAt,
  };
  if (v2.lighthouse) cache.lighthouse = v2.lighthouse;
  const lh = audit.lighthouse;
  if (lh) {
    const cwv: CoreWebVitals = {};
    if (lh.largestContentfulPaintMs !== undefined) cwv.lcpMs = lh.largestContentfulPaintMs;
    if (lh.totalBlockingTimeMs !== undefined) cwv.tbtMs = lh.totalBlockingTimeMs;
    if (lh.cumulativeLayoutShift !== undefined) cwv.cls = lh.cumulativeLayoutShift;
    if (lh.interactionToNextPaintMs !== undefined) cwv.inpMs = lh.interactionToNextPaintMs;
    if (lh.firstContentfulPaintMs !== undefined) cwv.fcpMs = lh.firstContentfulPaintMs;
    if (lh.speedIndexMs !== undefined) cwv.speedIndexMs = lh.speedIndexMs;
    if (Object.keys(cwv).length > 0) cache.coreWebVitals = cwv;
  }
  return cache;
}

/** Build a cache entity from a custom-parser audit (the fallback). */
export function cachedFromCustom(
  teamId: string,
  leadId: string,
  audit: WebsiteAuditSummary,
  computedAt: Date,
): CachedWebsiteAudit {
  const v2 = fromCustomAudit(audit);
  const cache: CachedWebsiteAudit = {
    teamId,
    leadId,
    source: 'custom-parser',
    status: v2.status,
    conversion: v2.conversion,
    computedAt,
  };
  if (v2.fallbackSeo) cache.fallbackSeo = v2.fallbackSeo;
  if (v2.fallbackUx) cache.fallbackUx = v2.fallbackUx;
  return cache;
}

/** Reconstruct the scorer input from a cached audit. */
export function toWebsiteAuditInputV2(cache: CachedWebsiteAudit): WebsiteAuditInputV2 {
  return {
    status: cache.status,
    source: cache.source,
    conversion: cache.conversion,
    ...(cache.lighthouse ? { lighthouse: cache.lighthouse } : {}),
    ...(cache.fallbackSeo ? { fallbackSeo: cache.fallbackSeo } : {}),
    ...(cache.fallbackUx ? { fallbackUx: cache.fallbackUx } : {}),
  };
}

interface FallbackJson {
  seo?: FallbackSeoSignals;
  ux?: FallbackUxSignals;
}

interface LeadWebsiteAuditRow {
  lead_id: string;
  team_id: string;
  audit_source: 'lighthouse' | 'custom-parser';
  status: WebsiteAuditStatusV2;
  performance_score: number | null;
  seo_score: number | null;
  accessibility_score: number | null;
  best_practices_score: number | null;
  conversion: ConversionSignals;
  fallback: FallbackJson | null;
  core_web_vitals: CoreWebVitals | null;
  computed_at: Date | string;
}

const COLUMNS = `
  lead_id,
  team_id,
  audit_source,
  status,
  performance_score,
  seo_score,
  accessibility_score,
  best_practices_score,
  conversion,
  fallback,
  core_web_vitals,
  computed_at
`;

const MS_PER_DAY = 86_400_000;

function mapRow(row: LeadWebsiteAuditRow): CachedWebsiteAudit {
  const cache: CachedWebsiteAudit = {
    teamId: row.team_id,
    leadId: row.lead_id,
    source: row.audit_source,
    status: row.status,
    conversion: row.conversion,
    computedAt: row.computed_at instanceof Date ? row.computed_at : new Date(row.computed_at),
  };
  if (row.audit_source === 'lighthouse') {
    cache.lighthouse = {
      performance: row.performance_score,
      seo: row.seo_score,
      accessibility: row.accessibility_score,
      bestPractices: row.best_practices_score,
    };
  }
  if (row.fallback?.seo) cache.fallbackSeo = row.fallback.seo;
  if (row.fallback?.ux) cache.fallbackUx = row.fallback.ux;
  if (row.core_web_vitals) cache.coreWebVitals = row.core_web_vitals;
  return cache;
}

export class LeadWebsiteAuditRepository {
  constructor(private readonly db: DbExecutor) {}

  async findForLead(teamId: string, leadId: string): Promise<CachedWebsiteAudit | null> {
    const rows = await query<LeadWebsiteAuditRow>(
      this.db,
      `SELECT ${COLUMNS} FROM lead_website_audit WHERE team_id = $1 AND lead_id = $2`,
      [teamId, leadId],
    );
    return rows.length > 0 ? mapRow(rows[0]!) : null;
  }

  /** Return the cached audit only if it is younger than `maxAgeDays`. */
  async findFresh(
    teamId: string,
    leadId: string,
    maxAgeDays: number,
    now: Date,
  ): Promise<CachedWebsiteAudit | null> {
    const cache = await this.findForLead(teamId, leadId);
    if (!cache) return null;
    const ageMs = now.getTime() - cache.computedAt.getTime();
    return ageMs <= maxAgeDays * MS_PER_DAY ? cache : null;
  }

  async upsertForLead(cache: CachedWebsiteAudit): Promise<void> {
    const lh = cache.lighthouse;
    const fallback: FallbackJson | null =
      cache.fallbackSeo || cache.fallbackUx
        ? {
            ...(cache.fallbackSeo ? { seo: cache.fallbackSeo } : {}),
            ...(cache.fallbackUx ? { ux: cache.fallbackUx } : {}),
          }
        : null;

    await query(
      this.db,
      `INSERT INTO lead_website_audit (
         lead_id, team_id, audit_source, status,
         performance_score, seo_score, accessibility_score, best_practices_score,
         conversion, fallback, core_web_vitals, computed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (lead_id) DO UPDATE SET
         team_id = EXCLUDED.team_id,
         audit_source = EXCLUDED.audit_source,
         status = EXCLUDED.status,
         performance_score = EXCLUDED.performance_score,
         seo_score = EXCLUDED.seo_score,
         accessibility_score = EXCLUDED.accessibility_score,
         best_practices_score = EXCLUDED.best_practices_score,
         conversion = EXCLUDED.conversion,
         fallback = EXCLUDED.fallback,
         core_web_vitals = EXCLUDED.core_web_vitals,
         computed_at = EXCLUDED.computed_at`,
      [
        cache.leadId,
        cache.teamId,
        cache.source,
        cache.status,
        lh?.performance ?? null,
        lh?.seo ?? null,
        lh?.accessibility ?? null,
        lh?.bestPractices ?? null,
        JSON.stringify(cache.conversion),
        fallback ? JSON.stringify(fallback) : null,
        cache.coreWebVitals ? JSON.stringify(cache.coreWebVitals) : null,
        cache.computedAt,
      ],
    );
  }
}
