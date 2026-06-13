/**
 * Lead domain types for the `leads-generator-dashboard` feature.
 *
 * Includes:
 * - {@link LeadStatus} and the canonical {@link LEAD_STATUSES} list (R8.1).
 * - {@link Lead} entity contract including AI enrichment fields (R13).
 * - {@link NormalizedLead} produced by `Source_Connector.normalize` (R5.2).
 * - {@link RawProspect} as returned by source-specific `fetch`.
 * - {@link PublicLeadSnapshot} sent to the AI provider (R13.7) — strictly
 *   limited to publicly observable attributes.
 */

/**
 * The exactly-six Lead statuses.
 *
 * Order is significant only as documented; equality is the only operation
 * relied upon by the domain.
 */
export type LeadStatus =
  | 'New'
  | 'Reviewed'
  | 'Contacted'
  | 'Qualified'
  | 'Converted'
  | 'Rejected';

/**
 * Canonical immutable list of every {@link LeadStatus}. Useful for
 * iteration (e.g. metrics defaulting all six buckets to 0 per R10.2).
 */
export const LEAD_STATUSES: readonly LeadStatus[] = [
  'New',
  'Reviewed',
  'Contacted',
  'Qualified',
  'Converted',
  'Rejected',
] as const;

/**
 * Lifecycle state of the AI enrichment for a Lead.
 *
 * - `none`: AI was never attempted for this Lead.
 * - `pending`: enqueued or in-flight.
 * - `success`: a valid AI_Insight has been persisted.
 * - `unavailable`: a terminal failure occurred — see
 *   {@link AIUnavailableReason}. Lead itself is preserved (R13.13).
 */
export type AIState = 'none' | 'pending' | 'success' | 'unavailable';

/**
 * Reason an AI enrichment ended up `unavailable`.
 *
 * Tracked separately from `AppError` because these are persisted on the
 * Lead row for display in the UI.
 */
export type AIUnavailableReason =
  | 'no_api_key'
  | 'budget_exceeded'
  | 'timeout'
  | 'provider_error'
  | 'malformed_output'
  | 'quota_exceeded';

/**
 * Canonical Lead entity stored per Team.
 *
 * `score` and `aiIntentScore` are nullable because:
 * - `score === null` && `scoreState === 'unscored'` indicates scoring failed
 *   or the model was empty (R7.8).
 * - `aiIntentScore === null` while `aiState !== 'success'` indicates AI
 *   enrichment is missing or unavailable (R13.13, R13.15).
 *
 * `isDuplicate` together with `duplicateOf` implements the deduplication
 * canonicalization (R6.1).
 */
export interface Lead {
  id: string;
  teamId: string;

  /** Personal_Data publik (R11.1). */
  name?: string;
  publicContact?: string;
  profileUrl?: string;
  location?: string;

  matchedKeywords: string[];
  status: LeadStatus;

  /** 0..100 integer when scored; `null` when unscored (R7.2, R7.8). */
  score: number | null;
  scoreState: 'scored' | 'unscored';

  isDuplicate: boolean;
  duplicateOf?: string;

  discoveredAt: Date;
  acquiredSource?: string;
  acquiredAt?: Date;

  /** AI enrichment fields (R13). */
  aiIntentScore: number | null;
  aiInsight?: string;
  aiState: AIState;
  aiUnavailableReason?: AIUnavailableReason;
  aiAnalyzedAt?: Date;

  createdAt: Date;
}

/**
 * Lead in its post-normalization shape, ready to be ingested by the
 * Deduplication_Service. Contains only public data and the keywords that
 * matched the Source query.
 */
export interface NormalizedLead {
  teamId: string;
  name?: string;
  profileUrl?: string;
  publicContact?: string;
  location?: string;
  sources: string[];
  matchedKeywords: string[];
  discoveredAt: Date;
}

/**
 * Source-specific raw prospect returned by `Source_Connector.fetch` before
 * normalization. The `matchedKeyword` records which query keyword this raw
 * record was discovered for.
 */
export interface RawProspect {
  externalId?: string;
  name?: string;
  profileUrl?: string;
  publicContact?: string;
  location?: string;
  matchedKeyword: string;
  acquiredAt: Date;
  /** Optional public post excerpt usable as AI snippet (R13.7). */
  postSnippet?: string;
}

/**
 * Privacy-safe payload sent to the AI provider (R13.7).
 *
 * Strictly limited to publicly observable attributes — no internal fields,
 * notes, scores, or identifiers leak.
 */
export interface PublicLeadSnapshot {
  source?: string;
  name?: string;
  publicContact?: string;
  profileUrl?: string;
  location?: string;
  matchedKeywords: string[];
  postSnippet?: string;
  websiteAudit?: PublicWebsiteAudit;
}

export interface PublicWebsiteAudit {
  status: 'not_applicable_no_website' | 'ok' | 'http_error' | 'fetch_failed' | 'timeout';
  url: string;
  finalUrl?: string;
  httpStatus?: number;
  loadTimeSeconds?: number;
  httpsEnabled?: boolean;
  isMobileFriendly?: boolean;
  lighthouse?: {
    performanceScore?: number;
    accessibilityScore?: number;
    bestPracticesScore?: number;
    seoScore?: number;
    firstContentfulPaintMs?: number;
    largestContentfulPaintMs?: number;
    cumulativeLayoutShift?: number;
    totalBlockingTimeMs?: number;
    speedIndexMs?: number;
    timeToInteractiveMs?: number;
    interactionToNextPaintMs?: number;
  };
  title?: string;
  metaDescription?: string;
  signals: {
    hasViewport: boolean;
    hasContactLink: boolean;
    hasWhatsapp: boolean;
    hasEmailLink: boolean;
    hasPhoneLink: boolean;
    hasForm: boolean;
    ctaLabels: string[];
    headings: string[];
    imageCount: number;
    imagesMissingAlt: number;
    scriptCount: number;
    stylesheetCount: number;
  };
  issues: string[];
  solutions: string[];
  uxFlowSignals: string[];
  visualSignals: string[];
}
