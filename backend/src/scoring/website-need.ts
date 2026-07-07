import { isBusinessWebsiteUrl } from '../url/business-website.js';
import { CATEGORY_NEED_SCORE } from './constants.js';
import type { LeadOpportunityScoringInput, WebsiteNeedBreakdown } from './types.js';
import { clamp, lowerTrim, normalizeLogCount, roundScore } from './utils.js';

function categoryNeedScore(category: string | undefined): number {
  const normalized = lowerTrim(category);
  if (!normalized) return 40;

  for (const [key, score] of Object.entries(CATEGORY_NEED_SCORE)) {
    if (normalized.includes(key)) return score;
  }

  return 50;
}

function websiteNeedForExistingWebsite(input: LeadOpportunityScoringInput): WebsiteNeedBreakdown {
  const audit = input.websiteAudit;
  if (!audit) {
    return {
      hasWebsite: true,
      score: 65,
      inputs: {
        performancePenalty: 65,
        seoPenalty: 60,
        accessibilityPenalty: 55,
        bestPracticesPenalty: 45,
        basicSiteIssueScore: 60,
        siteStatusPenalty: 40,
      },
    };
  }

  const performancePenalty = clamp(
    ((audit.responseTimeMs ?? 2000) / 4000) * 100 +
      Math.min(audit.renderBlockingScriptCount ?? 0, 10) * 3 +
      Math.max(0, 20 - (audit.lazyImageRatio ?? 0) * 20),
    0,
    100,
  );

  const seoPenalty = clamp(
    (audit.hasTitle ? 0 : 25) +
      (audit.hasMetaDescription ? 0 : 25) +
      (audit.hasCanonical ? 0 : 15) +
      (audit.hasRobotsTxt ? 0 : 10) +
      (audit.hasSitemap ? 0 : 10) +
      (audit.h1Count > 0 ? 0 : 15),
    0,
    100,
  );

  const accessibilityPenalty = clamp(
    (audit.hasViewport ? 0 : 35) +
      (audit.imageCount > 0 ? ((audit.imagesMissingAlt / audit.imageCount) * 35) : 10) +
      (audit.hasContactLink ? 0 : 15) +
      (audit.hasContactForm ? 0 : 15),
    0,
    100,
  );

  const bestPracticesPenalty = clamp(
    (audit.httpsEnabled ? 0 : 35) +
      (audit.mixedContentDetected ? 25 : 0) +
      Math.max(0, 20 - audit.securityHeaderCount * 5) +
      (audit.status === 'ok' ? 0 : 20),
    0,
    100,
  );

  const basicSiteIssueScore = clamp(
    audit.issues.length * 12 +
      (audit.hasPhoneLink || audit.hasWhatsappLink || audit.hasEmailLink ? 0 : 20) +
      (audit.ctaCount > 0 ? 0 : 20),
    0,
    100,
  );

  const siteStatusPenalty =
    audit.status === 'parked'
      ? 100
      : audit.status === 'inactive'
        ? 85
        : audit.status === 'fetch_failed'
          ? 70
          : audit.status === 'timeout'
            ? 75
            : 20;

  const score = roundScore(
    (performancePenalty * 0.25) +
      (seoPenalty * 0.2) +
      (accessibilityPenalty * 0.2) +
      (bestPracticesPenalty * 0.1) +
      (basicSiteIssueScore * 0.15) +
      (siteStatusPenalty * 0.1),
  );

  return {
    hasWebsite: true,
    score,
    inputs: {
      performancePenalty: roundScore(performancePenalty),
      seoPenalty: roundScore(seoPenalty),
      accessibilityPenalty: roundScore(accessibilityPenalty),
      bestPracticesPenalty: roundScore(bestPracticesPenalty),
      basicSiteIssueScore: roundScore(basicSiteIssueScore),
      siteStatusPenalty,
    },
  };
}

function websiteNeedForNoWebsite(input: LeadOpportunityScoringInput): WebsiteNeedBreakdown {
  const categoryNeed = categoryNeedScore(input.auditAttributes?.category);
  const marketPresenceGapScore = clamp(
    normalizeLogCount(input.auditAttributes?.reviewCount ?? 0) * 0.6 +
      (((input.auditAttributes?.rating ?? 0) / 5) * 100) * 0.4,
    0,
    100,
  );
  const businessMaturityScore = clamp(
    normalizeLogCount(input.auditAttributes?.reviewCount ?? 0) * 0.7 +
      (input.matchedKeywords.length > 0 ? 20 : 0),
    0,
    100,
  );
  const competitionPressureScore = input.location ? 55 : 35;

  const score = roundScore(
    (categoryNeed * 0.35) +
      (marketPresenceGapScore * 0.25) +
      (businessMaturityScore * 0.25) +
      (competitionPressureScore * 0.15),
  );

  return {
    hasWebsite: false,
    score,
    inputs: {
      categoryNeedScore: categoryNeed,
      marketPresenceGapScore: roundScore(marketPresenceGapScore),
      businessMaturityScore: roundScore(businessMaturityScore),
      competitionPressureScore,
    },
  };
}

export function computeWebsiteNeed(input: LeadOpportunityScoringInput): WebsiteNeedBreakdown {
  const hasWebsite =
    isBusinessWebsiteUrl(input.profileUrl) && input.auditAttributes?.websiteStatus !== 'no_website';
  return hasWebsite
    ? websiteNeedForExistingWebsite(input)
    : websiteNeedForNoWebsite(input);
}
