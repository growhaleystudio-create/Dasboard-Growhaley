import type { LeadOpportunityInput, WebsiteAuditSummary } from '@leads-generator/shared';

export interface BusinessValueBreakdown {
  reviewCountScore: number;
  ratingScore: number;
  activityScore: number;
  categoryFitBonus: number;
  score: number;
}

export interface WebsiteNeedBreakdown {
  hasWebsite: boolean;
  score: number;
  inputs: Record<string, number>;
}

export interface ReachabilityBreakdown {
  score: number;
  contactType: 'mobile' | 'landline' | 'invalid' | 'missing';
}

export interface ConfidenceBreakdown {
  score: number;
  inputs: Record<string, number>;
}

export type LeadOpportunityScoringInput = LeadOpportunityInput;
export type WebsiteAuditInput = WebsiteAuditSummary;
