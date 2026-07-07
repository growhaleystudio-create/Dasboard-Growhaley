import type { Lead } from '@leads-generator/shared';
import { describe, expect, it } from 'vitest';

import { buildDryRunReport, dryRunToCsv } from './dry-run.js';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    teamId: 'team-1',
    whatsappVerificationStatus: 'unchecked',
    matchedKeywords: [],
    status: 'New',
    score: null,
    scoreState: 'unscored',
    isDuplicate: false,
    discoveredAt: new Date('2026-07-01T00:00:00.000Z'),
    aiIntentScore: null,
    aiState: 'none',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('buildDryRunReport', () => {
  it('scores every lead, builds a band histogram, and compares against v1', async () => {
    const leads = [
      makeLead({
        id: 'a',
        name: 'Klinik Ramai',
        score: 40,
        whatsappNumber: '6281234567890',
        auditAttributes: { rating: 4.8, reviewCount: 214, category: 'dental clinic' },
        acquiredAt: new Date('2026-07-02T00:00:00.000Z'),
      }),
      makeLead({ id: 'b', name: 'Sepi', score: 30 }),
    ];

    const report = await buildDryRunReport(leads);

    expect(report.count).toBe(2);
    expect(report.rows).toHaveLength(2);
    // Both leads had a v1 score → both compared.
    expect(report.comparison.compared).toBe(2);
    expect(
      report.bandHistogram.hot +
        report.bandHistogram.warm +
        report.bandHistogram.nurture +
        report.bandHistogram.cold,
    ).toBe(2);

    const klinik = report.rows.find((r) => r.leadId === 'a');
    expect(klinik?.v2Band).toBe('hot');
    expect(klinik?.v2Score).toBeGreaterThan(klinik!.v1Score!);
  });

  it('skips comparison for leads without a v1 score', async () => {
    const report = await buildDryRunReport([makeLead({ score: null })]);
    expect(report.comparison.compared).toBe(0);
    expect(report.comparison.meanAbsDelta).toBe(0);
  });

  it('applies the audit resolver when provided', async () => {
    const lead = makeLead({ id: 'c', profileUrl: 'https://example.com' });
    const report = await buildDryRunReport([lead], () =>
      Promise.resolve({
        status: 'ok',
        source: 'lighthouse',
        lighthouse: { performance: 90, seo: 90, accessibility: 90, bestPractices: 90 },
        conversion: { hasContactChannel: true, hasCta: true, hasContactForm: true },
      }),
    );
    // A great website → small digital gap.
    expect(report.rows[0]!.digitalGap).toBeLessThan(20);
  });
});

describe('dryRunToCsv', () => {
  it('emits a header and one row per lead, escaping commas in names', async () => {
    const report = await buildDryRunReport([
      makeLead({ id: 'a', name: 'Toko, Cabang 1', score: 50 }),
    ]);
    const csv = dryRunToCsv(report);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('lead_id,name,category');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Toko, Cabang 1"');
  });
});
