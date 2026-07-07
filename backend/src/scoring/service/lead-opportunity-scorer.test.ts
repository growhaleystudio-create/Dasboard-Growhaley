import { describe, expect, it, vi } from 'vitest';

import type { Lead } from '@leads-generator/shared';
import { LeadOpportunityScorer } from './lead-opportunity-scorer.js';

describe('LeadOpportunityScorer', () => {
  const baseLead: Lead = {
    id: 'lead-1',
    teamId: 'team-1',
    name: 'One Eighty Coffee and Music',
    matchedKeywords: [],
    discoveredAt: new Date('2026-06-30T00:00:00.000Z'),
    status: 'New',
    score: null,
    scoreState: 'unscored',
    isDuplicate: false,
    aiState: 'unavailable',
    aiIntentScore: null,
    createdAt: new Date('2026-06-30T00:00:00.000Z'),
    whatsappVerificationStatus: 'unchecked',
    profileUrl: 'https://www.instagram.com/oneeightycoffee',
    auditAttributes: {
      category: 'coffee shop',
      reviewCount: 120,
      rating: 4.6,
    },
  };

  it('does not audit social-only profile URLs during recompute', async () => {
    const audit = vi.fn();
    const setScore = vi.fn(async () => undefined);
    const upsertForLead = vi.fn(async (value) => value);

    const scorer = new LeadOpportunityScorer({
      leadReads: { findById: vi.fn(async () => baseLead) },
      leads: () => ({
        findById: vi.fn(),
        setScore,
      }),
      breakdowns: () => ({ upsertForLead }),
      runInTx: async (fn) => fn({} as never),
      auditor: { audit },
    });

    const result = await scorer.recomputeLead('team-1', 'lead-1');

    expect(audit).not.toHaveBeenCalled();
    expect(result.breakdown.hasWebsite).toBe(false);
    expect(setScore).toHaveBeenCalledOnce();
    expect(upsertForLead).toHaveBeenCalledOnce();
  });
});
