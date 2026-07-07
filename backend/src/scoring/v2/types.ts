/**
 * Lead Opportunity Scoring v2 — input & output contracts.
 *
 * v2 is a self-contained scoring engine (see
 * `docs/superpowers/specs/2026-07-07-lead-scoring-v2-implementation-plan.md`).
 * It is deliberately decoupled from the persisted `WebsiteAuditSummary` /
 * `PublicWebsiteAudit` shapes: callers map whichever audit they have (the
 * Lighthouse audit shown in AI analysis, or the custom-parser fallback) into
 * the normalized {@link WebsiteAuditInputV2} below. That single normalization
 * point is what guarantees "the SEO/UX/Performance numbers a user sees in AI
 * analysis are the same numbers that formed the score".
 *
 * Every score in this module is an integer in `[0, 100]`, and every pillar is
 * oriented the same way: higher = better opportunity. The only inversion in
 * the whole system happens in one named place — `DigitalGap = 100 −
 * WebsiteQuality` — so the semantics never silently flip.
 */

/** Lighthouse category scores, each already scaled to `[0, 100]` or `null`. */
export interface LighthouseScores {
  performance: number | null;
  seo: number | null;
  accessibility: number | null;
  bestPractices: number | null;
}

/** Deterministic conversion-readiness signals (present in both audit paths). */
export interface ConversionSignals {
  /** WhatsApp OR phone OR email link present. */
  hasContactChannel: boolean;
  hasCta: boolean;
  hasContactForm: boolean;
}

/** SEO signals from the custom-parser fallback (used only when Lighthouse SEO absent). */
export interface FallbackSeoSignals {
  hasTitle: boolean;
  hasMetaDescription: boolean;
  hasCanonical: boolean;
  h1Count: number;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
}

/** UX signals from the custom-parser fallback (used only when Lighthouse a11y/BP absent). */
export interface FallbackUxSignals {
  hasViewport: boolean;
  imageCount: number;
  imagesMissingAlt: number;
  mixedContentDetected: boolean;
  httpsEnabled: boolean;
}

export type WebsiteAuditStatusV2 =
  | 'ok'
  | 'parked'
  | 'inactive'
  | 'timeout'
  | 'fetch_failed'
  | 'unknown';

/** Normalized audit input consumed by the v2 engine (Lighthouse-first, parser-fallback). */
export interface WebsiteAuditInputV2 {
  status: WebsiteAuditStatusV2;
  source: 'lighthouse' | 'custom-parser';
  /** Present (preferred) when `source === 'lighthouse'`; some categories may still be null. */
  lighthouse?: LighthouseScores;
  conversion: ConversionSignals;
  fallbackSeo?: FallbackSeoSignals;
  fallbackUx?: FallbackUxSignals;
}

export interface BusinessInputV2 {
  rating?: number;
  reviewCount?: number;
  category?: string;
  location?: string;
}

export interface ContactInputV2 {
  publicContact?: string;
  whatsappNumber?: string;
}

/** Top-level v2 scoring input. `audit` is undefined when the lead has no website. */
export interface LeadScoreInputV2 {
  hasWebsite: boolean;
  business: BusinessInputV2;
  audit?: WebsiteAuditInputV2;
  contact: ContactInputV2;
  /** True when the lead has a discovered/acquired timestamp (a freshness signal). */
  hasTimestamp: boolean;
}

/** A single 0–100 pillar plus human-readable reasons (Indonesian, sales-facing). */
export interface PillarBreakdown {
  score: number;
  reasons: string[];
}

export interface WebsiteQualityBreakdown {
  performance: number;
  seo: number;
  uiux: number;
  conversion: number;
  quality: number;
  reasons: string[];
}

export type DigitalGapBranch = 'website' | 'dead-site' | 'no-website';

export interface DigitalGapBreakdown {
  score: number;
  branch: DigitalGapBranch;
  /** Present only on the `website` branch. */
  websiteQuality?: WebsiteQualityBreakdown;
  reasons: string[];
}

export type ContactType = 'mobile' | 'landline' | 'invalid' | 'missing';

export interface ReachabilityBreakdownV2 extends PillarBreakdown {
  contactType: ContactType;
}

export interface ConfidenceBreakdownV2 extends PillarBreakdown {
  multiplier: number;
}

export type ScoreBand = 'hot' | 'warm' | 'nurture' | 'cold';

export interface LeadScoreV2 {
  finalScore: number;
  baseScore: number;
  band: ScoreBand;
  hasWebsite: boolean;
  businessValue: PillarBreakdown;
  digitalGap: DigitalGapBreakdown;
  reachability: ReachabilityBreakdownV2;
  confidence: ConfidenceBreakdownV2;
  scoringVersion: string;
}
