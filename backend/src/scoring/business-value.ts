import { CATEGORY_FIT_BONUS } from './constants.js';
import type { BusinessValueBreakdown, LeadOpportunityScoringInput } from './types.js';
import { clamp, lowerTrim, normalizeLogCount, roundScore } from './utils.js';

function categoryFitBonus(category: string | undefined): number {
  const normalized = lowerTrim(category);
  if (!normalized) return 0;

  for (const [key, bonus] of Object.entries(CATEGORY_FIT_BONUS)) {
    if (normalized.includes(key)) return bonus;
  }

  return 0;
}

export function computeBusinessValue(input: LeadOpportunityScoringInput): BusinessValueBreakdown {
  const rating = clamp(((input.auditAttributes?.rating ?? 0) / 5) * 100, 0, 100);
  const reviews = normalizeLogCount(input.auditAttributes?.reviewCount ?? 0);
  const activityScore = clamp(
    (reviews * 0.6) + (rating * 0.4),
    0,
    100,
  );
  const bonus = categoryFitBonus(input.auditAttributes?.category);

  const score = roundScore(
    (reviews * 0.5) +
      (rating * 0.3) +
      (activityScore * 0.2) +
      bonus,
  );

  return {
    reviewCountScore: roundScore(reviews),
    ratingScore: roundScore(rating),
    activityScore: roundScore(activityScore),
    categoryFitBonus: bonus,
    score,
  };
}
