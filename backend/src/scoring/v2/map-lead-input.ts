/**
 * Bridge: real domain data → {@link LeadScoreInputV2}.
 *
 * This is the single place that normalizes whichever website audit we happen
 * to have (the Lighthouse audit from AI analysis, or the custom-parser
 * fallback) into the engine's audit contract. Keeping it pure and separate
 * from the engine means the dry-run harness and the eventual production wiring
 * feed the scorer through the exact same door.
 */

import type { Lead, PublicWebsiteAudit, WebsiteAuditSummary } from '@leads-generator/shared';

import { isBusinessWebsiteUrl } from '../../url/business-website.js';
import type { LeadScoreInputV2, WebsiteAuditInputV2, WebsiteAuditStatusV2 } from './types.js';

/** Map the Lighthouse audit (shown in AI analysis) into the v2 audit contract. */
export function fromLighthouseAudit(audit: PublicWebsiteAudit): WebsiteAuditInputV2 {
  const s = audit.signals;
  const lh = audit.lighthouse;
  return {
    status: mapPublicStatus(audit.status),
    source: 'lighthouse',
    lighthouse: {
      performance: lh?.performanceScore ?? null,
      seo: lh?.seoScore ?? null,
      accessibility: lh?.accessibilityScore ?? null,
      bestPractices: lh?.bestPracticesScore ?? null,
    },
    conversion: {
      hasContactChannel: s.hasWhatsapp || s.hasPhoneLink || s.hasEmailLink || s.hasContactLink,
      hasCta: s.ctaLabels.length > 0,
      hasContactForm: s.hasForm,
    },
  };
}

/** Map the custom-parser audit (fallback) into the v2 audit contract. */
export function fromCustomAudit(audit: WebsiteAuditSummary): WebsiteAuditInputV2 {
  return {
    status: audit.status,
    source: 'custom-parser',
    conversion: {
      hasContactChannel:
        audit.hasWhatsappLink || audit.hasPhoneLink || audit.hasEmailLink || audit.hasContactLink,
      hasCta: audit.ctaCount > 0,
      hasContactForm: audit.hasContactForm,
    },
    fallbackSeo: {
      hasTitle: audit.hasTitle,
      hasMetaDescription: audit.hasMetaDescription,
      hasCanonical: audit.hasCanonical,
      h1Count: audit.h1Count,
      hasRobotsTxt: audit.hasRobotsTxt,
      hasSitemap: audit.hasSitemap,
    },
    fallbackUx: {
      hasViewport: audit.hasViewport,
      imageCount: audit.imageCount,
      imagesMissingAlt: audit.imagesMissingAlt,
      mixedContentDetected: audit.mixedContentDetected,
      httpsEnabled: audit.httpsEnabled,
    },
  };
}

/**
 * Website present but never audited yet — an honest "unknown". WebsiteQuality
 * falls back to neutral sub-scores, and confidence is dented (partial audit).
 */
function unauditedWebsite(): WebsiteAuditInputV2 {
  return {
    status: 'unknown',
    source: 'custom-parser',
    conversion: { hasContactChannel: false, hasCta: false, hasContactForm: false },
  };
}

export interface MapLeadOptions {
  /** Pre-normalized audit, if the caller already has one. */
  audit?: WebsiteAuditInputV2;
}

/**
 * Build a {@link LeadScoreInputV2} from a persisted {@link Lead} plus an
 * optional normalized audit. `hasWebsite` mirrors the v1 rule so the two
 * engines agree on who counts as having a business website.
 */
export function mapLeadToScoreInputV2(lead: Lead, options: MapLeadOptions = {}): LeadScoreInputV2 {
  const hasWebsite =
    isBusinessWebsiteUrl(lead.profileUrl) && lead.auditAttributes?.websiteStatus !== 'no_website';

  const business: LeadScoreInputV2['business'] = {
    ...(lead.auditAttributes?.rating !== undefined ? { rating: lead.auditAttributes.rating } : {}),
    ...(lead.auditAttributes?.reviewCount !== undefined
      ? { reviewCount: lead.auditAttributes.reviewCount }
      : {}),
    ...(lead.auditAttributes?.category !== undefined
      ? { category: lead.auditAttributes.category }
      : {}),
    ...(lead.location !== undefined ? { location: lead.location } : {}),
  };

  const contact: LeadScoreInputV2['contact'] = {
    ...(lead.publicContact !== undefined ? { publicContact: lead.publicContact } : {}),
    ...(lead.whatsappNumber !== undefined ? { whatsappNumber: lead.whatsappNumber } : {}),
  };

  const hasTimestamp = Boolean(lead.acquiredAt ?? lead.discoveredAt);

  return {
    hasWebsite,
    business,
    contact,
    hasTimestamp,
    ...(hasWebsite ? { audit: options.audit ?? unauditedWebsite() } : {}),
  };
}

function mapPublicStatus(status: PublicWebsiteAudit['status']): WebsiteAuditStatusV2 {
  switch (status) {
    case 'ok':
      return 'ok';
    case 'timeout':
      return 'timeout';
    case 'fetch_failed':
      return 'fetch_failed';
    case 'http_error':
      return 'inactive';
    case 'not_applicable_no_website':
      return 'unknown';
  }
}
