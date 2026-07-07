import type { ConfidenceBreakdown, LeadOpportunityScoringInput } from './types.js';
import { clamp, roundScore } from './utils.js';

export function computeConfidence(input: LeadOpportunityScoringInput): ConfidenceBreakdown {
  const contactSignal = input.publicContact || input.whatsappNumber ? 100 : 0;
  const businessSignal =
    (input.auditAttributes?.rating !== undefined ? 35 : 0) +
    (input.auditAttributes?.reviewCount !== undefined ? 35 : 0) +
    (input.auditAttributes?.category ? 30 : 0);

  const websiteSignal = input.profileUrl
    ? input.websiteAudit
      ? 100
      : 40
    : input.auditAttributes?.websiteStatus === 'no_website'
      ? 70
      : 50;

  const freshnessSignal = input.acquiredAt || input.discoveredAt ? 100 : 0;

  const score = roundScore(
    clamp(
      (contactSignal * 0.2) +
        (businessSignal * 0.3) +
        (websiteSignal * 0.35) +
        (freshnessSignal * 0.15),
      0,
      100,
    ),
  );

  return {
    score,
    inputs: {
      contactSignal,
      businessSignal,
      websiteSignal,
      freshnessSignal,
    },
  };
}
