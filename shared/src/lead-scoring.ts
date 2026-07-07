/**
 * Deterministic lead-opportunity scoring types.
 *
 * These types model the refactored scoring system where AI becomes an
 * explainer, while objective scoring is computed from business, website,
 * reachability, and confidence signals.
 */

import type { LeadAuditAttributes, LeadScoreBreakdown } from './lead.js';

export interface WebsiteAuditSummary {
  status: 'ok' | 'inactive' | 'parked' | 'fetch_failed' | 'timeout' | 'unknown';
  url: string;
  finalUrl?: string;
  title?: string;
  metaDescription?: string;
  httpsEnabled: boolean;
  responseTimeMs?: number;
  htmlSizeKb?: number;
  requestLikeAssetCount?: number;
  renderBlockingScriptCount?: number;
  lazyImageRatio?: number;
  missingImageDimensionRatio?: number;
  hasViewport: boolean;
  hasTitle: boolean;
  hasMetaDescription: boolean;
  hasCanonical: boolean;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  h1Count: number;
  headingOrderScore?: number;
  hasContactLink: boolean;
  hasWhatsappLink: boolean;
  hasPhoneLink: boolean;
  hasEmailLink: boolean;
  hasContactForm: boolean;
  ctaCount: number;
  imageCount: number;
  imagesMissingAlt: number;
  securityHeaderCount: number;
  mixedContentDetected: boolean;
  parkedSignals: string[];
  issues: string[];
}

export interface LeadOpportunityInput {
  teamId: string;
  leadId: string;
  publicContact?: string;
  whatsappNumber?: string;
  matchedKeywords: string[];
  discoveredAt: Date;
  acquiredAt?: Date;
  profileUrl?: string;
  location?: string;
  auditAttributes?: LeadAuditAttributes;
  websiteAudit?: WebsiteAuditSummary;
  scoringVersion: string;
}

export interface LeadOpportunityScore {
  businessValueScore: number;
  websiteNeedScore: number;
  reachabilityScore: number;
  confidenceScore: number;
  confidenceModifier: number;
  baseScore: number;
  finalScore: number;
  hasWebsite: boolean;
  breakdown: LeadScoreBreakdown;
}
