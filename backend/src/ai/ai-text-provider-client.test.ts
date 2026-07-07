import type { PublicLeadSnapshot } from '@leads-generator/shared';
import { describe, expect, it } from 'vitest';

import { toLeadScoringInput } from './ai-text-provider-client.js';

describe('toLeadScoringInput — AI data contract (regression: rating/reviews were hardcoded 0)', () => {
  it('feeds the real rating, review count, and category to the model', () => {
    const snapshot: PublicLeadSnapshot = {
      matchedKeywords: ['klinik gigi'],
      name: 'Klinik Gigi Senyum Sehat',
      location: 'Bandung',
      businessProfile: { rating: 4.8, reviewCount: 214, category: 'Klinik Gigi' },
    };

    const input = toLeadScoringInput(snapshot) as {
      business_profile: { rating: number | null; review_count: number | null; category: string | null };
      scale_indicators: { review_count: number };
      category_or_industry: string;
    };

    expect(input.business_profile).toEqual({
      rating: 4.8,
      review_count: 214,
      category: 'Klinik Gigi',
      location: 'Bandung',
    });
    // The bug: this used to be a hardcoded 0 regardless of the lead's data.
    expect(input.scale_indicators.review_count).toBe(214);
    expect(input.category_or_industry).toBe('Klinik Gigi');
  });

  it('falls back to matched keywords for category and nulls for missing business data', () => {
    const snapshot: PublicLeadSnapshot = { matchedKeywords: ['barbershop', 'bandung'] };

    const input = toLeadScoringInput(snapshot) as {
      business_profile: { rating: number | null; review_count: number | null };
      scale_indicators: { review_count: number };
      category_or_industry: string;
    };

    expect(input.business_profile.rating).toBeNull();
    expect(input.business_profile.review_count).toBeNull();
    expect(input.scale_indicators.review_count).toBe(0);
    expect(input.category_or_industry).toBe('barbershop, bandung');
  });
});
