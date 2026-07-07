export const LEAD_OPPORTUNITY_SCORING_VERSION = '2026-07-v1';

export const CATEGORY_FIT_BONUS: Record<string, number> = {
  clinic: 5,
  dental: 5,
  contractor: 5,
  lawyer: 5,
  wedding: 5,
  salon: 2,
  restaurant: 2,
  cafe: 2,
  hotel: 2,
};

export const CATEGORY_NEED_SCORE: Record<string, number> = {
  clinic: 90,
  dental: 90,
  contractor: 88,
  lawyer: 85,
  wedding: 85,
  salon: 72,
  restaurant: 68,
  cafe: 65,
  hotel: 80,
};

export const WEBSITE_SCORING_WEIGHTS = {
  hasWebsite: {
    businessValue: 0.35,
    websiteNeed: 0.45,
    reachability: 0.15,
    confidence: 0.05,
  },
  noWebsite: {
    businessValue: 0.45,
    websiteNeed: 0.3,
    reachability: 0.2,
    confidence: 0.05,
  },
} as const;
