import { describe, expect, it } from 'vitest';

import { deterministicLeadScore, leadBand, LEAD_BAND_META } from './leadDisplay';

describe('leadBand', () => {
  it('maps scores to bands at the v2 thresholds (75/55/35)', () => {
    expect(leadBand(99)).toBe('hot');
    expect(leadBand(75)).toBe('hot');
    expect(leadBand(74)).toBe('warm');
    expect(leadBand(55)).toBe('warm');
    expect(leadBand(54)).toBe('nurture');
    expect(leadBand(35)).toBe('nurture');
    expect(leadBand(34)).toBe('cold');
    expect(leadBand(0)).toBe('cold');
  });

  it('returns null for a missing score', () => {
    expect(leadBand(null)).toBeNull();
    expect(leadBand(undefined)).toBeNull();
  });

  it('has display metadata for every band', () => {
    for (const band of ['hot', 'warm', 'nurture', 'cold'] as const) {
      expect(LEAD_BAND_META[band].label.length).toBeGreaterThan(0);
      expect(LEAD_BAND_META[band].className).toContain('bg-');
    }
  });
});

describe('deterministicLeadScore', () => {
  it('prefers the breakdown final score over the legacy score column', () => {
    expect(
      deterministicLeadScore({
        score: 40,
        scoringBreakdown: { finalScore: 88 } as never,
      }),
    ).toBe(88);
  });

  it('falls back to the legacy score when there is no breakdown', () => {
    expect(deterministicLeadScore({ score: 40, scoringBreakdown: undefined })).toBe(40);
  });
});
