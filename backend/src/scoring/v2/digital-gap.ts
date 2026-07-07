/**
 * Pillar 2 — Digital Gap: "how badly do they need our web service?"
 *
 * Three branches, one output orientation (higher = more need):
 *   - website  → 100 − WebsiteQuality(Lighthouse)
 *   - dead-site→ fixed by status (parked/inactive/timeout)
 *   - no-website→ FLOOR 70 + SPAN 30 × blend(categoryNeed, marketPresence)
 *
 * The no-website FLOOR is the explicit ranking rule that fixes v1 pain point
 * P7: a business with no website is never ranked "less in need" than one whose
 * site is merely mediocre.
 */

import { clamp, lowerTrim, normalizeLogCount, roundScore } from '../utils.js';
import {
  BUSINESS_VALUE_BLEND,
  CATEGORY_NEED_SCORE_V2,
  DEAD_SITE_GAP,
  NO_WEBSITE_GAP,
} from './constants.js';
import type { DigitalGapBreakdown, LeadScoreInputV2, WebsiteAuditStatusV2 } from './types.js';
import { computeWebsiteQuality } from './website-quality.js';

const DEFAULT_CATEGORY_NEED = 50;

function categoryNeedScore(category: string | undefined): number {
  const normalized = lowerTrim(category);
  if (!normalized) return DEFAULT_CATEGORY_NEED;
  for (const [key, score] of Object.entries(CATEGORY_NEED_SCORE_V2)) {
    if (normalized.includes(key)) return score;
  }
  return DEFAULT_CATEGORY_NEED;
}

function deadSiteGap(status: Exclude<WebsiteAuditStatusV2, 'ok' | 'unknown'>): DigitalGapBreakdown {
  const score = DEAD_SITE_GAP[status];
  const label: Record<typeof status, string> = {
    parked: 'Domain parked (sudah bayar domain tapi kosong) — kebutuhan & intent tertinggi',
    inactive: 'Website tidak aktif / tidak bisa diakses',
    timeout: 'Website timeout saat diakses',
    fetch_failed: 'Website gagal diakses',
  };
  return { score, branch: 'dead-site', reasons: [label[status]] };
}

function noWebsiteGap(input: LeadScoreInputV2): DigitalGapBreakdown {
  const categoryNeedNorm = categoryNeedScore(input.business.category) / 100;

  const reviewsNorm = normalizeLogCount(input.business.reviewCount ?? 0);
  const ratingNorm = clamp(((input.business.rating ?? 0) / 5) * 100, 0, 100);
  const marketPresenceNorm =
    (reviewsNorm * BUSINESS_VALUE_BLEND.reviews + ratingNorm * BUSINESS_VALUE_BLEND.rating) / 100;

  const blended =
    categoryNeedNorm * NO_WEBSITE_GAP.categoryNeedWeight +
    marketPresenceNorm * NO_WEBSITE_GAP.marketPresenceWeight;

  const score = roundScore(NO_WEBSITE_GAP.floor + NO_WEBSITE_GAP.span * blended);

  const reasons = ['Tidak punya website — kebutuhan minimal 70/100'];
  if (categoryNeedNorm >= 0.8) reasons.push('Kategori bisnis sangat butuh kehadiran web');
  if (marketPresenceNorm >= 0.6) reasons.push('Bisnis ramai (rating/review tinggi) tapi tanpa website');

  return { score, branch: 'no-website', reasons };
}

export function computeDigitalGap(input: LeadScoreInputV2): DigitalGapBreakdown {
  if (!input.hasWebsite || !input.audit) {
    return noWebsiteGap(input);
  }

  const { status } = input.audit;
  if (status !== 'ok' && status !== 'unknown') {
    return deadSiteGap(status);
  }

  // status 'unknown' with an audit present is treated as a live site we could
  // only partially read; WebsiteQuality handles missing sub-signals via neutrals.
  const websiteQuality = computeWebsiteQuality(input.audit);
  const score = roundScore(100 - websiteQuality.quality);

  const reasons = [`Kualitas website ${websiteQuality.quality}/100 → gap ${score}/100`];
  if (websiteQuality.quality >= 75) reasons.push('Website sudah bagus — kebutuhan jasa kecil');
  else if (websiteQuality.quality < 45) reasons.push('Website bermasalah — peluang perbaikan besar');

  return { score, branch: 'website', websiteQuality, reasons };
}
