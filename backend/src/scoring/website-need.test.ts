import { describe, expect, it } from 'vitest';

import { computeWebsiteNeed } from './website-need.js';

describe('computeWebsiteNeed', () => {
  it('treats social-only profile URLs as no website', () => {
    const result = computeWebsiteNeed({
      teamId: 'team-1',
      leadId: 'lead-1',
      matchedKeywords: [],
      discoveredAt: new Date('2026-06-30T00:00:00.000Z'),
      profileUrl: 'https://www.instagram.com/oneeightycoffee',
      auditAttributes: {
        category: 'coffee shop',
        reviewCount: 120,
        rating: 4.6,
      },
      scoringVersion: '2026-07-v1',
    });

    expect(result.hasWebsite).toBe(false);
    expect(result.inputs).toHaveProperty('categoryNeedScore');
    expect(result.inputs).not.toHaveProperty('performancePenalty');
  });

  it('treats standalone business domains as having a website', () => {
    const result = computeWebsiteNeed({
      teamId: 'team-1',
      leadId: 'lead-2',
      matchedKeywords: [],
      discoveredAt: new Date('2026-06-30T00:00:00.000Z'),
      profileUrl: 'https://example.com',
      auditAttributes: {
        category: 'coffee shop',
        reviewCount: 120,
        rating: 4.6,
      },
      scoringVersion: '2026-07-v1',
    });

    expect(result.hasWebsite).toBe(true);
    expect(result.inputs).toHaveProperty('performancePenalty');
  });
});
