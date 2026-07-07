/**
 * WebsiteQuality — the SEO / UI-UX / Performance / Conversion matrix.
 *
 * Lighthouse is the source of truth (same audit shown in AI analysis). Each
 * sub-score is 0–100, higher = better. When a Lighthouse category is missing we
 * fall back to the custom-parser signals; when neither exists we use a neutral
 * 50 and say so in `reasons` (and confidence is dented elsewhere).
 *
 *   WebsiteQuality = Performance×0.30 + SEO×0.25 + UI/UX×0.25 + Conversion×0.20
 *
 * The caller inverts this once, by name, into DigitalGap = 100 − WebsiteQuality.
 */

import { clamp, normalizedRatio, roundScore } from '../utils.js';
import {
  CONVERSION_POINTS,
  NEUTRAL_SUBSCORE,
  UIUX_BLEND,
  WEBSITE_QUALITY_WEIGHTS,
} from './constants.js';
import type { WebsiteAuditInputV2, WebsiteQualityBreakdown } from './types.js';

interface SubScore {
  score: number;
  reason: string;
}

function performanceSubScore(audit: WebsiteAuditInputV2): SubScore {
  const lh = audit.lighthouse?.performance;
  if (lh !== undefined && lh !== null) {
    const score = clamp(lh, 0, 100);
    const label = score >= 70 ? 'cepat' : score >= 40 ? 'sedang' : 'lambat';
    return { score, reason: `Performa ${score}/100 (${label})` };
  }
  return { score: NEUTRAL_SUBSCORE, reason: 'Skor performa belum tersedia — perlu audit Lighthouse' };
}

function seoSubScore(audit: WebsiteAuditInputV2): SubScore {
  const lh = audit.lighthouse?.seo;
  if (lh !== undefined && lh !== null) {
    const score = clamp(lh, 0, 100);
    return { score, reason: `SEO ${score}/100` };
  }
  const s = audit.fallbackSeo;
  if (s) {
    const score = clamp(
      (s.hasTitle ? 20 : 0) +
        (s.hasMetaDescription ? 20 : 0) +
        (s.hasCanonical ? 15 : 0) +
        (s.h1Count > 0 ? 15 : 0) +
        (s.hasRobotsTxt ? 15 : 0) +
        (s.hasSitemap ? 15 : 0),
      0,
      100,
    );
    const gaps: string[] = [];
    if (!s.hasTitle) gaps.push('title');
    if (!s.hasMetaDescription) gaps.push('meta description');
    if (s.h1Count === 0) gaps.push('H1');
    const reason = gaps.length > 0 ? `SEO ${score}/100 — kurang ${gaps.join(', ')}` : `SEO ${score}/100`;
    return { score, reason };
  }
  return { score: NEUTRAL_SUBSCORE, reason: 'Skor SEO belum tersedia' };
}

function uiuxSubScore(audit: WebsiteAuditInputV2): SubScore {
  const acc = audit.lighthouse?.accessibility;
  const bp = audit.lighthouse?.bestPractices;
  if ((acc !== undefined && acc !== null) || (bp !== undefined && bp !== null)) {
    const accScore = acc !== undefined && acc !== null ? clamp(acc, 0, 100) : NEUTRAL_SUBSCORE;
    const bpScore = bp !== undefined && bp !== null ? clamp(bp, 0, 100) : NEUTRAL_SUBSCORE;
    const score = roundScore(accScore * UIUX_BLEND.accessibility + bpScore * UIUX_BLEND.bestPractices);
    return { score, reason: `UI/UX ${score}/100 (aksesibilitas ${accScore}, praktik teknis ${bpScore})` };
  }
  const u = audit.fallbackUx;
  if (u) {
    const altRatio = u.imageCount > 0 ? normalizedRatio(u.imageCount - u.imagesMissingAlt, u.imageCount) : 100;
    const score = clamp(
      (u.hasViewport ? 35 : 0) +
        (altRatio / 100) * 35 +
        (u.mixedContentDetected ? 0 : 15) +
        (u.httpsEnabled ? 15 : 0),
      0,
      100,
    );
    const gaps: string[] = [];
    if (!u.hasViewport) gaps.push('viewport mobile');
    if (!u.httpsEnabled) gaps.push('HTTPS');
    const reason = gaps.length > 0 ? `UI/UX ${score}/100 — kurang ${gaps.join(', ')}` : `UI/UX ${score}/100`;
    return { score, reason };
  }
  return { score: NEUTRAL_SUBSCORE, reason: 'Skor UI/UX belum tersedia' };
}

function conversionSubScore(audit: WebsiteAuditInputV2): SubScore {
  const c = audit.conversion;
  const score = clamp(
    (c.hasContactChannel ? CONVERSION_POINTS.contactChannel : 0) +
      (c.hasCta ? CONVERSION_POINTS.cta : 0) +
      (c.hasContactForm ? CONVERSION_POINTS.contactForm : 0),
    0,
    100,
  );
  const gaps: string[] = [];
  if (!c.hasContactChannel) gaps.push('kanal kontak (WA/telp/email)');
  if (!c.hasCta) gaps.push('CTA');
  if (!c.hasContactForm) gaps.push('form kontak');
  const reason =
    gaps.length > 0
      ? `Conversion ${score}/100 — tidak ada ${gaps.join(', ')}`
      : `Conversion ${score}/100 — jalur kontak lengkap`;
  return { score, reason };
}

export function computeWebsiteQuality(audit: WebsiteAuditInputV2): WebsiteQualityBreakdown {
  const performance = performanceSubScore(audit);
  const seo = seoSubScore(audit);
  const uiux = uiuxSubScore(audit);
  const conversion = conversionSubScore(audit);

  const quality = roundScore(
    performance.score * WEBSITE_QUALITY_WEIGHTS.performance +
      seo.score * WEBSITE_QUALITY_WEIGHTS.seo +
      uiux.score * WEBSITE_QUALITY_WEIGHTS.uiux +
      conversion.score * WEBSITE_QUALITY_WEIGHTS.conversion,
  );

  return {
    performance: performance.score,
    seo: seo.score,
    uiux: uiux.score,
    conversion: conversion.score,
    quality,
    reasons: [performance.reason, seo.reason, uiux.reason, conversion.reason],
  };
}
