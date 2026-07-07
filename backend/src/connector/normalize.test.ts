import { describe, expect, it } from 'vitest';
import { normalizeRawProspect } from './normalize.js';

describe('normalizeRawProspect', () => {
  it('preserves explicit whatsapp fields', () => {
    const lead = normalizeRawProspect(
      {
        name: 'Biz',
        publicContact: '08123456789',
        whatsappUrl: 'https://wa.me/628123456789',
        whatsappNumber: '628123456789',
        profileUrl: 'https://biz.test',
        location: 'Jakarta',
        matchedKeyword: 'coffee',
        acquiredAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        teamId: 'team_1',
        sourceId: 'google',
      },
    );

    expect(lead.whatsappUrl).toBe('https://wa.me/628123456789');
    expect(lead.whatsappNumber).toBe('628123456789');
  });
});
