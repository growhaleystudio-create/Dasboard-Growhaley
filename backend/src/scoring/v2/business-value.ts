/**
 * Pillar 1 — Business Value: "is this business worth chasing?"
 *
 * `reviews (log-scaled) × 0.6 + rating × 0.4 + categoryBonus`, all clamped to
 * `[0, 100]`. v1's `activityScore` is gone: it was a re-mix of reviews+rating
 * that added no new information (implementation plan §1.2, pain point P4).
 */

import { clamp, lowerTrim, normalizeLogCount, roundScore } from '../utils.js';
import { BUSINESS_VALUE_BLEND, CATEGORY_FIT_BONUS_V2 } from './constants.js';
import type { BusinessInputV2, PillarBreakdown } from './types.js';

function categoryFitBonus(category: string | undefined): number {
  const normalized = lowerTrim(category);
  if (!normalized) return 0;
  for (const [key, bonus] of Object.entries(CATEGORY_FIT_BONUS_V2)) {
    if (normalized.includes(key)) return bonus;
  }
  return 0;
}

export function computeBusinessValue(input: BusinessInputV2): PillarBreakdown {
  const reviewCount = input.reviewCount ?? 0;
  const rating = input.rating ?? 0;

  const reviewsNorm = normalizeLogCount(reviewCount);
  const ratingNorm = clamp((rating / 5) * 100, 0, 100);
  const bonus = categoryFitBonus(input.category);

  const score = roundScore(
    reviewsNorm * BUSINESS_VALUE_BLEND.reviews +
      ratingNorm * BUSINESS_VALUE_BLEND.rating +
      bonus,
  );

  const reasons: string[] = [];
  if (reviewCount > 0 && rating > 0) {
    reasons.push(`Rating ${rating} dari ${reviewCount} review`);
  } else if (reviewCount > 0) {
    reasons.push(`${reviewCount} review`);
  } else if (rating > 0) {
    reasons.push(`Rating ${rating} (jumlah review belum diketahui)`);
  } else {
    reasons.push('Belum ada sinyal traksi (rating/review) dari sumber');
  }
  if (bonus > 0) reasons.push('Kategori bisnis bernilai tinggi untuk jasa web');

  return { score, reasons };
}
