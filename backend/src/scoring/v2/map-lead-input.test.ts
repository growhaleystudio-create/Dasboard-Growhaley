import type { Lead, PublicWebsiteAudit, WebsiteAuditSummary } from '@leads-generator/shared';
import { describe, expect, it } from 'vitest';

import { computeLeadScoreV2 } from './index.js';
import {
  fromCustomAudit,
  fromLighthouseAudit,
  mapLeadToScoreInputV2,
} from './map-lead-input.js';

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

const lighthouseAudit: PublicWebsiteAudit = {
  status: 'ok',
  url: 'https://example.com',
  httpsEnabled: true,
  lighthouse: {
    performanceScore: 34,
    accessibilityScore: 61,
    bestPracticesScore: 70,
    seoScore: 58,
  },
  signals: {
    hasViewport: true,
    hasContactLink: true,
    hasWhatsapp: false,
    hasEmailLink: false,
    hasPhoneLink: true,
    hasForm: false,
    ctaLabels: ['Hubungi Kami'],
    headings: ['Beranda'],
    imageCount: 10,
    imagesMissingAlt: 3,
    scriptCount: 5,
    stylesheetCount: 2,
  },
  issues: [],
  solutions: [],
  uxFlowSignals: [],
  visualSignals: [],
};

describe('fromLighthouseAudit', () => {
  it('maps Lighthouse category scores (already 0–100) and conversion signals', () => {
    const v2 = fromLighthouseAudit(lighthouseAudit);
    expect(v2.source).toBe('lighthouse');
    expect(v2.status).toBe('ok');
    expect(v2.lighthouse).toEqual({
      performance: 34,
      seo: 58,
      accessibility: 61,
      bestPractices: 70,
    });
    expect(v2.conversion).toEqual({
      hasContactChannel: true, // hasPhoneLink OR hasContactLink
      hasCta: true, // ctaLabels non-empty
      hasContactForm: false,
    });
  });

  it('maps null Lighthouse scores through as null', () => {
    const { lighthouse: _omit, ...withoutLighthouse } = lighthouseAudit;
    void _omit;
    const v2 = fromLighthouseAudit(withoutLighthouse);
    expect(v2.lighthouse).toEqual({
      performance: null,
      seo: null,
      accessibility: null,
      bestPractices: null,
    });
  });
});

const customAudit: WebsiteAuditSummary = {
  status: 'parked',
  url: 'https://example.com',
  httpsEnabled: true,
  hasViewport: false,
  hasTitle: true,
  hasMetaDescription: false,
  hasCanonical: false,
  hasRobotsTxt: false,
  hasSitemap: false,
  h1Count: 0,
  hasContactLink: false,
  hasWhatsappLink: false,
  hasPhoneLink: false,
  hasEmailLink: false,
  hasContactForm: false,
  ctaCount: 0,
  imageCount: 4,
  imagesMissingAlt: 4,
  securityHeaderCount: 0,
  mixedContentDetected: false,
  parkedSignals: ['body:parked-keyword'],
  issues: [],
};

describe('fromCustomAudit', () => {
  it('maps status and fallback SEO/UX signals for the parser path', () => {
    const v2 = fromCustomAudit(customAudit);
    expect(v2.source).toBe('custom-parser');
    expect(v2.status).toBe('parked');
    expect(v2.fallbackSeo).toEqual({
      hasTitle: true,
      hasMetaDescription: false,
      hasCanonical: false,
      h1Count: 0,
      hasRobotsTxt: false,
      hasSitemap: false,
    });
    expect(v2.fallbackUx?.hasViewport).toBe(false);
    expect(v2.conversion.hasContactChannel).toBe(false);
  });
});

describe('mapLeadToScoreInputV2', () => {
  it('extracts business, contact, and freshness from a Lead', () => {
    const lead = makeLead({
      profileUrl: 'https://klinikgigi.com',
      location: 'Bandung',
      publicContact: '6281234567890',
      whatsappNumber: '6281234567890',
      auditAttributes: { rating: 4.8, reviewCount: 214, category: 'dental clinic' },
      acquiredAt: new Date('2026-07-02T00:00:00.000Z'),
    });

    const input = mapLeadToScoreInputV2(lead, { audit: fromLighthouseAudit(lighthouseAudit) });

    expect(input.hasWebsite).toBe(true);
    expect(input.business).toEqual({
      rating: 4.8,
      reviewCount: 214,
      category: 'dental clinic',
      location: 'Bandung',
    });
    expect(input.contact.whatsappNumber).toBe('6281234567890');
    expect(input.hasTimestamp).toBe(true);
    expect(input.audit?.source).toBe('lighthouse');
    // End-to-end: the mapped input scores without throwing.
    expect(computeLeadScoreV2(input).finalScore).toBeGreaterThan(0);
  });

  it('treats a social-only profile URL as no website (no audit attached)', () => {
    const lead = makeLead({ profileUrl: 'https://instagram.com/kliniksehat' });
    const input = mapLeadToScoreInputV2(lead, { audit: fromLighthouseAudit(lighthouseAudit) });
    expect(input.hasWebsite).toBe(false);
    expect(input.audit).toBeUndefined();
    expect(computeLeadScoreV2(input).digitalGap.branch).toBe('no-website');
  });

  it('respects an explicit no_website audit attribute even with a business URL', () => {
    const lead = makeLead({
      profileUrl: 'https://klinikgigi.com',
      auditAttributes: { websiteStatus: 'no_website' },
    });
    const input = mapLeadToScoreInputV2(lead);
    expect(input.hasWebsite).toBe(false);
  });

  it('has a website but no audit → provisional unknown audit, confidence dented', () => {
    const lead = makeLead({
      profileUrl: 'https://klinikgigi.com',
      auditAttributes: { rating: 4.5, reviewCount: 50 },
      publicContact: '6281234567890',
      acquiredAt: new Date('2026-07-02T00:00:00.000Z'),
    });
    const input = mapLeadToScoreInputV2(lead);
    expect(input.hasWebsite).toBe(true);
    expect(input.audit?.status).toBe('unknown');
    // Partial audit → website-resolution check earns only 15, so multiplier < 1.
    expect(computeLeadScoreV2(input).confidence.multiplier).toBeLessThan(1);
  });
});
