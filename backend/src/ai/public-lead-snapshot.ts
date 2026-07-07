/**
 * Builder for the {@link PublicLeadSnapshot} — the **only** payload the
 * AI_Analyzer_Service is permitted to send to the AI_Provider (R13.7,
 * design.md → AI_Analyzer_Service → PublicLeadSnapshot / Privacy).
 *
 * Privacy contract (the reason this module exists):
 * A persisted `Lead` carries far more than publicly observable data —
 * internal identifiers (`id`, `teamId`, `duplicateOf`), lifecycle state
 * (`status`, `scoreState`, `aiState`), derived signals (`score`,
 * `aiIntentScore`, `aiInsight`), dedup flags (`isDuplicate`) and internal
 * timestamps (`discoveredAt`, `acquiredAt`, `aiAnalyzedAt`, `createdAt`).
 * NONE of those may ever leave the system boundary toward the AI_Provider.
 *
 * {@link buildPublicLeadSnapshot} guarantees this by being a pure
 * **allow-LIST projection**: it constructs a brand-new object containing
 * only the six whitelisted keys ({@link PUBLIC_SNAPSHOT_FIELDS}). It never
 * spreads the source Lead, so a field added to `Lead` in the future cannot
 * silently leak — it would have to be added here explicitly. This mirrors
 * the connector-side whitelist in `normalizeRawProspect` (R11.1).
 *
 * `postSnippet` is special: it is NOT stored on the `Lead` row. A snippet
 * is only legitimate when a Source_Connector surfaced a public post
 * excerpt (`RawProspect.postSnippet`). Callers therefore supply it
 * explicitly via {@link BuildSnapshotOptions.postSnippet}; the builder
 * never derives a snippet from any other (potentially private) field.
 */
import type {
  LeadScoreBreakdown,
  PublicLeadSnapshot,
  PublicWebsiteAudit,
} from '@leads-generator/shared';

/**
 * The exactly-six keys that may appear on a {@link PublicLeadSnapshot}
 * (R13.7). Anything outside this list is, by construction, never copied
 * into the snapshot. Exported so tests can assert the projection's key set
 * is a subset of this whitelist (Property 38).
 */
export const PUBLIC_SNAPSHOT_FIELDS = [
  'source',
  'name',
  'publicContact',
  'profileUrl',
  'location',
  'matchedKeywords',
  'postSnippet',
  'businessProfile',
  'websiteAudit',
  'scoringBreakdown',
] as const;

/**
 * Member of {@link PUBLIC_SNAPSHOT_FIELDS}.
 */
export type PublicSnapshotField = (typeof PUBLIC_SNAPSHOT_FIELDS)[number];

/**
 * Minimal subset of a stored `Lead` consumed by
 * {@link buildPublicLeadSnapshot}. A full `Lead` from
 * `@leads-generator/shared` structurally satisfies this contract, so
 * callers may pass the persisted row directly — only these public-ish
 * attributes are ever read.
 *
 * Note this deliberately excludes `postSnippet`: a snippet is not a stored
 * Lead attribute and must be provided via {@link BuildSnapshotOptions}.
 */
export interface SnapshotSourceLead {
  /** Public source channel label (Google Maps, OSM, LinkedIn, Threads, etc.). */
  source?: string;
  /** Public display name (R11.1). */
  name?: string;
  /** Public contact handle/email (R11.1). */
  publicContact?: string;
  /** Public profile URL (R11.1). */
  profileUrl?: string;
  /** Public location string (R11.1). */
  location?: string;
  /** Keywords from the Scan_Configuration that surfaced this Lead. */
  matchedKeywords: string[];
}

/**
 * Optional inputs to {@link buildPublicLeadSnapshot}.
 */
export interface BuildSnapshotOptions {
  /**
   * Public post excerpt obtained legitimately by a Source_Connector
   * (`RawProspect.postSnippet`, R13.7). Included in the snapshot only when
   * a non-blank string is supplied. The builder NEVER synthesizes this
   * from private data.
   */
  postSnippet?: string;
  /** Public business signals (rating/reviews/category) from the Google Maps audit attributes. */
  businessProfile?: {
    rating?: number;
    reviewCount?: number;
    category?: string;
  };
  /** Publicly observable website audit signals collected from the lead website URL. */
  websiteAudit?: PublicWebsiteAudit;
  /** Deterministic score breakdown safe to share with the AI explainer. */
  scoringBreakdown?: Pick<
    LeadScoreBreakdown,
    | 'businessValueScore'
    | 'websiteNeedScore'
    | 'reachabilityScore'
    | 'confidenceScore'
    | 'confidenceModifier'
    | 'baseScore'
    | 'finalScore'
    | 'hasWebsite'
    | 'scoringVersion'
  >;
}

/**
 * Returns true when `value` is a non-empty string after trimming. Used to
 * drop blank optional fields so we never ship empty strings to the
 * AI_Provider.
 */
function isMeaningfulString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Project a stored `Lead` (or {@link SnapshotSourceLead} subset) into the
 * privacy-safe {@link PublicLeadSnapshot} sent to the AI_Provider (R13.7).
 *
 * Behaviour:
 * - Builds a fresh object containing ONLY the six whitelisted keys —
 *   never spreads the source Lead (the privacy guarantee, Property 38).
 * - Optional string fields (`name`, `publicContact`, `profileUrl`,
 *   `location`, `postSnippet`) are omitted when absent or blank, satisfying
 *   `exactOptionalPropertyTypes`.
 * - `matchedKeywords` is always present as a defensive copy (possibly an
 *   empty array) so downstream consumers can rely on its shape.
 * - `postSnippet` is taken solely from `opts.postSnippet`; it is never
 *   derived from the Lead.
 */
export function buildPublicLeadSnapshot(
  lead: SnapshotSourceLead,
  opts: BuildSnapshotOptions = {},
): PublicLeadSnapshot {
  // Defensive copy: never alias the source array, and tolerate a malformed
  // (non-array) value by falling back to an empty list.
  const matchedKeywords = Array.isArray(lead.matchedKeywords)
    ? [...lead.matchedKeywords]
    : [];

  // Allow-list projection. We assemble each optional field with a
  // conditional spread so `undefined` is never assigned to an optional key
  // (exactOptionalPropertyTypes) and — crucially — so no key outside the
  // whitelist can ever be copied across.
  return {
    matchedKeywords,
    ...(isMeaningfulString(lead.source) ? { source: lead.source } : {}),
    ...(isMeaningfulString(lead.name) ? { name: lead.name } : {}),
    ...(isMeaningfulString(lead.publicContact)
      ? { publicContact: lead.publicContact }
      : {}),
    ...(isMeaningfulString(lead.profileUrl)
      ? { profileUrl: lead.profileUrl }
      : {}),
    ...(isMeaningfulString(lead.location) ? { location: lead.location } : {}),
    ...(isMeaningfulString(opts.postSnippet)
      ? { postSnippet: opts.postSnippet }
      : {}),
    ...(opts.businessProfile !== undefined ? { businessProfile: opts.businessProfile } : {}),
    ...(opts.websiteAudit !== undefined ? { websiteAudit: opts.websiteAudit } : {}),
    ...(opts.scoringBreakdown !== undefined
      ? { scoringBreakdown: opts.scoringBreakdown }
      : {}),
  };
}
