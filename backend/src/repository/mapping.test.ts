import { describe, expect, it } from 'vitest';
import { mapLeadRow } from './mapping.js';

describe('mapLeadRow', () => {
  it('maps whatsapp fields', () => {
    const lead = mapLeadRow({
      id: 'lead_1',
      team_id: 'team_1',
      name: null,
      public_contact: null,
      profile_url: null,
      location: null,
      whatsapp_url: 'https://wa.me/628123456789',
      whatsapp_number: '628123456789',
      whatsapp_verification_status: 'unchecked',
      matched_keywords: [],
      status: 'New',
      score: null,
      score_state: 'unscored',
      audit_attributes: null,
      is_duplicate: false,
      duplicate_of: null,
      discovered_at: '2026-01-01T00:00:00.000Z',
      acquired_source: null,
      acquired_at: null,
      ai_intent_score: null,
      ai_insight: null,
      ai_state: 'none',
      ai_unavailable_reason: null,
      ai_analyzed_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });

    expect(lead.whatsappUrl).toBe('https://wa.me/628123456789');
    expect(lead.whatsappNumber).toBe('628123456789');
    expect(lead.whatsappVerificationStatus).toBe('unchecked');
  });
});
