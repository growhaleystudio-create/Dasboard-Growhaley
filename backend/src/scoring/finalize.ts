import type { LeadOpportunityScore } from '@leads-generator/shared';

import { WEBSITE_SCORING_WEIGHTS } from './constants.js';
import type {
  BusinessValueBreakdown,
  ConfidenceBreakdown,
  LeadOpportunityScoringInput,
  ReachabilityBreakdown,
  WebsiteNeedBreakdown,
} from './types.js';
import { confidenceModifier } from './modifier.js';
import { roundScore } from './utils.js';

export function finalizeLeadOpportunityScore(
  input: LeadOpportunityScoringInput,
  businessValue: BusinessValueBreakdown,
  websiteNeed: WebsiteNeedBreakdown,
  reachability: ReachabilityBreakdown,
  confidence: ConfidenceBreakdown,
): LeadOpportunityScore {
  const weights = websiteNeed.hasWebsite
    ? WEBSITE_SCORING_WEIGHTS.hasWebsite
    : WEBSITE_SCORING_WEIGHTS.noWebsite;

  const baseScore = roundScore(
    (businessValue.score * weights.businessValue) +
      (websiteNeed.score * weights.websiteNeed) +
      (reachability.score * weights.reachability) +
      (confidence.score * weights.confidence),
  );

  const modifier = confidenceModifier(confidence.score);
  const finalScore = roundScore(baseScore * modifier);

  return {
    businessValueScore: businessValue.score,
    websiteNeedScore: websiteNeed.score,
    reachabilityScore: reachability.score,
    confidenceScore: confidence.score,
    confidenceModifier: modifier,
    baseScore,
    finalScore,
    hasWebsite: websiteNeed.hasWebsite,
    breakdown: {
      teamId: input.teamId,
      leadId: input.leadId,
      scoringVersion: input.scoringVersion,
      hasWebsite: websiteNeed.hasWebsite,
      businessValueScore: businessValue.score,
      websiteNeedScore: websiteNeed.score,
      reachabilityScore: reachability.score,
      confidenceScore: confidence.score,
      confidenceModifier: modifier,
      baseScore,
      finalScore,
      ...(input.websiteAudit ? { auditSource: 'custom-parser' as const } : {}),
      computedAt: new Date(),
    },
  };
}
