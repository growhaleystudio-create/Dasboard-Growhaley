import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defaultPbtParams, propertyTest } from '@leads-generator/shared/testing/pbt';

import { computeLeadScoreV2 } from './index.js';
import type {
  BusinessInputV2,
  ContactInputV2,
  LeadScoreInputV2,
  LighthouseScores,
  WebsiteAuditInputV2,
} from './types.js';

// --- Builders -------------------------------------------------------------

function lighthouseAudit(lh: LighthouseScores, conversionAll = true): WebsiteAuditInputV2 {
  return {
    status: 'ok',
    source: 'lighthouse',
    lighthouse: lh,
    conversion: {
      hasContactChannel: conversionAll,
      hasCta: conversionAll,
      hasContactForm: conversionAll,
    },
  };
}

function baseInput(overrides: Partial<LeadScoreInputV2> = {}): LeadScoreInputV2 {
  return {
    hasWebsite: false,
    business: {},
    contact: {},
    hasTimestamp: true,
    ...overrides,
  };
}

// --- Concrete anchors (hand-computed) -------------------------------------

describe('computeLeadScoreV2 — concrete anchors', () => {
  it('klinik ramai tanpa website + WA aktif → hot', () => {
    const result = computeLeadScoreV2(
      baseInput({
        hasWebsite: false,
        business: { rating: 4.8, reviewCount: 214, category: 'dental clinic' },
        contact: { whatsappNumber: '6281234567890' },
        hasTimestamp: true,
      }),
    );

    expect(result.businessValue.score).toBe(95);
    expect(result.digitalGap.branch).toBe('no-website');
    expect(result.digitalGap.score).toBe(97);
    expect(result.reachability.contactType).toBe('mobile');
    expect(result.confidence.multiplier).toBe(1);
    expect(result.finalScore).toBe(97);
    expect(result.band).toBe('hot');
  });

  it('hotel dengan website bagus → gap kecil, skor turun ke warm', () => {
    const result = computeLeadScoreV2(
      baseInput({
        hasWebsite: true,
        business: { rating: 4.5, reviewCount: 300, category: 'hotel' },
        contact: { whatsappNumber: '6281234567890' },
        audit: lighthouseAudit({ performance: 95, seo: 92, accessibility: 90, bestPractices: 88 }),
        hasTimestamp: true,
      }),
    );

    expect(result.digitalGap.branch).toBe('website');
    expect(result.digitalGap.websiteQuality?.quality).toBe(94);
    expect(result.digitalGap.score).toBe(6);
    expect(result.finalScore).toBe(60);
    expect(result.band).toBe('warm');
  });

  it('lead kosong (tanpa kontak/rating/website/timestamp) → cold, skor dipotong', () => {
    const result = computeLeadScoreV2(
      baseInput({
        hasWebsite: false,
        business: {},
        contact: {},
        hasTimestamp: false,
      }),
    );

    expect(result.businessValue.score).toBe(0);
    expect(result.digitalGap.score).toBe(78); // floor 70 + kategori default
    expect(result.reachability.contactType).toBe('missing');
    expect(result.confidence.multiplier).toBe(0.78);
    expect(result.finalScore).toBe(24);
    expect(result.band).toBe('cold');
  });

  it('website bagus mengalahkan gap-nya sendiri: no-website > mediocre-alive website (fix P7)', () => {
    const business = { rating: 4.6, reviewCount: 120, category: 'restaurant' };
    const contact = { whatsappNumber: '6281234567890' };

    const noWebsite = computeLeadScoreV2(
      baseInput({ hasWebsite: false, business, contact }),
    );
    const mediocreWebsite = computeLeadScoreV2(
      baseInput({
        hasWebsite: true,
        business,
        contact,
        audit: lighthouseAudit({ performance: 55, seo: 60, accessibility: 65, bestPractices: 60 }),
      }),
    );

    // No website is a bigger opportunity than an alive-but-mediocre one.
    expect(noWebsite.digitalGap.score).toBeGreaterThan(mediocreWebsite.digitalGap.score);
    expect(noWebsite.finalScore).toBeGreaterThan(mediocreWebsite.finalScore);
  });
});

// --- Property tests (contract A4: ranking sanity) -------------------------

const anyLighthouse: fc.Arbitrary<LighthouseScores> = fc.record({
  performance: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  seo: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  accessibility: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  bestPractices: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
});

const anyInput: fc.Arbitrary<LeadScoreInputV2> = fc
  .record({
    hasWebsite: fc.boolean(),
    rating: fc.option(fc.float({ min: 0, max: 5, noNaN: true }), { nil: undefined }),
    reviewCount: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: undefined }),
    category: fc.option(fc.constantFrom('dental clinic', 'restaurant', 'hotel', 'toko', 'cafe'), {
      nil: undefined,
    }),
    whatsappNumber: fc.option(fc.constantFrom('6281234567890', '0215551234', 'x'), {
      nil: undefined,
    }),
    hasTimestamp: fc.boolean(),
    lighthouse: anyLighthouse,
  })
  .map((r): LeadScoreInputV2 => {
    const business: BusinessInputV2 = {
      ...(r.rating !== undefined ? { rating: r.rating } : {}),
      ...(r.reviewCount !== undefined ? { reviewCount: r.reviewCount } : {}),
      ...(r.category !== undefined ? { category: r.category } : {}),
    };
    const contact: ContactInputV2 = {
      ...(r.whatsappNumber !== undefined ? { whatsappNumber: r.whatsappNumber } : {}),
    };
    return {
      hasWebsite: r.hasWebsite,
      business,
      contact,
      hasTimestamp: r.hasTimestamp,
      ...(r.hasWebsite ? { audit: lighthouseAudit(r.lighthouse, false) } : {}),
    };
  });

describe('computeLeadScoreV2 — properties', () => {
  propertyTest(it, 71, 'Determinisme: input sama → output sama', () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        expect(computeLeadScoreV2(input)).toStrictEqual(computeLeadScoreV2(input));
      }),
      defaultPbtParams,
    );
  });

  propertyTest(it, 72, 'Semua skor integer di [0,100] dan final ≤ base', () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        const r = computeLeadScoreV2(input);
        for (const s of [
          r.finalScore,
          r.baseScore,
          r.businessValue.score,
          r.digitalGap.score,
          r.reachability.score,
          r.confidence.score,
        ]) {
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(100);
        }
        expect(r.finalScore).toBeLessThanOrEqual(r.baseScore);
      }),
      defaultPbtParams,
    );
  });

  propertyTest(it, 73, 'Lead tanpa website selalu punya digital gap ≥ 70', () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        const r = computeLeadScoreV2({
          hasWebsite: false,
          business: input.business,
          contact: input.contact,
          hasTimestamp: input.hasTimestamp,
        });
        expect(r.digitalGap.branch).toBe('no-website');
        expect(r.digitalGap.score).toBeGreaterThanOrEqual(70);
      }),
      defaultPbtParams,
    );
  });

  propertyTest(it, 74, 'Monoton: Lighthouse lebih tinggi → digital gap tidak naik', () => {
    fc.assert(
      fc.property(
        fc.record({
          performance: fc.integer({ min: 0, max: 100 }),
          seo: fc.integer({ min: 0, max: 100 }),
          accessibility: fc.integer({ min: 0, max: 100 }),
          bestPractices: fc.integer({ min: 0, max: 100 }),
        }),
        fc.record({
          dp: fc.integer({ min: 0, max: 100 }),
          ds: fc.integer({ min: 0, max: 100 }),
          da: fc.integer({ min: 0, max: 100 }),
          db: fc.integer({ min: 0, max: 100 }),
        }),
        (low, delta) => {
          const high: LighthouseScores = {
            performance: Math.min(100, low.performance + delta.dp),
            seo: Math.min(100, low.seo + delta.ds),
            accessibility: Math.min(100, low.accessibility + delta.da),
            bestPractices: Math.min(100, low.bestPractices + delta.db),
          };
          const mk = (lh: LighthouseScores) =>
            computeLeadScoreV2(
              baseInput({ hasWebsite: true, audit: lighthouseAudit(lh, true) }),
            ).digitalGap.score;
          // Better website → not a bigger gap.
          expect(mk(high)).toBeLessThanOrEqual(mk(low));
        },
      ),
      defaultPbtParams,
    );
  });

  propertyTest(it, 75, 'Monoton: data lebih lengkap (timestamp) → final tidak turun', () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        const withTs = computeLeadScoreV2({ ...input, hasTimestamp: true });
        const withoutTs = computeLeadScoreV2({ ...input, hasTimestamp: false });
        expect(withTs.finalScore).toBeGreaterThanOrEqual(withoutTs.finalScore);
      }),
      defaultPbtParams,
    );
  });

  it('urutan dead-site: parked(100) > inactive(90) > timeout(80) > website sempurna(gap 0)', () => {
    const mk = (status: WebsiteAuditInputV2['status']) =>
      computeLeadScoreV2(
        baseInput({
          hasWebsite: true,
          audit: {
            status,
            source: 'custom-parser',
            conversion: { hasContactChannel: false, hasCta: false, hasContactForm: false },
          },
        }),
      ).digitalGap.score;

    expect(mk('parked')).toBe(100);
    expect(mk('inactive')).toBe(90);
    expect(mk('timeout')).toBe(80);

    const perfect = computeLeadScoreV2(
      baseInput({
        hasWebsite: true,
        audit: lighthouseAudit(
          { performance: 100, seo: 100, accessibility: 100, bestPractices: 100 },
          true,
        ),
      }),
    ).digitalGap.score;
    expect(mk('parked')).toBeGreaterThan(perfect);
  });
});
