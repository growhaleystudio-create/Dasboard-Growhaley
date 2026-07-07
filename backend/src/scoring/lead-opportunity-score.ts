import type { LeadOpportunityScore } from '@leads-generator/shared';

import { computeBusinessValue } from './business-value.js';
import { computeConfidence } from './confidence.js';
import { finalizeLeadOpportunityScore } from './finalize.js';
import { computeReachability } from './reachability.js';
import type { LeadOpportunityScoringInput } from './types.js';
import { computeWebsiteNeed } from './website-need.js';

export function computeLeadOpportunityScore(
  input: LeadOpportunityScoringInput,
): LeadOpportunityScore {
  const businessValue = computeBusinessValue(input);
  const websiteNeed = computeWebsiteNeed(input);
  const reachability = computeReachability(input);
  const confidence = computeConfidence(input);

  return finalizeLeadOpportunityScore(
    input,
    businessValue,
    websiteNeed,
    reachability,
    confidence,
  );
}
