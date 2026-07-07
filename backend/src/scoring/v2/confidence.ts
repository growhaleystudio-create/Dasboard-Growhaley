/**
 * Confidence — NOT a pillar, only a multiplier.
 *
 * "How much do we trust this lead's data?" (not "how good is the lead?").
 * Four checks worth 25 each; the website check is two-tier so the *source* of
 * the audit affects trust: a full Lighthouse audit (or a confirmed no-website)
 * earns 25, a custom-parser-only / partial audit earns 15.
 *
 * Multiplier is linear: `0.7 + 0.3 × (confidence / 100)`.
 */

import { clamp, roundScore } from '../utils.js';
import { CONFIDENCE_MULTIPLIER, CONFIDENCE_POINTS } from './constants.js';
import type { ConfidenceBreakdownV2, LeadScoreInputV2 } from './types.js';

function websiteResolution(input: LeadScoreInputV2): { points: number; reason: string } {
  // No website, confirmed by the caller → fully resolved.
  if (!input.hasWebsite) {
    return { points: CONFIDENCE_POINTS.websiteResolvedFull, reason: 'Status website jelas: tidak punya website' };
  }
  const audit = input.audit;
  if (!audit) {
    return { points: 0, reason: 'Website belum diaudit' };
  }
  const lh = audit.lighthouse;
  const lighthouseComplete =
    audit.source === 'lighthouse' &&
    audit.status === 'ok' &&
    lh !== undefined &&
    Object.values(lh).every((value) => value !== null);

  if (lighthouseComplete) {
    return { points: CONFIDENCE_POINTS.websiteResolvedFull, reason: 'Audit Lighthouse lengkap' };
  }
  // Dead-site statuses are still a resolved fact about the website.
  if (audit.status !== 'ok' && audit.status !== 'unknown') {
    return { points: CONFIDENCE_POINTS.websiteResolvedFull, reason: `Status website jelas: ${audit.status}` };
  }
  return {
    points: CONFIDENCE_POINTS.websiteResolvedPartial,
    reason: 'Audit website hanya parsial (perlu audit lanjutan)',
  };
}

export function computeConfidence(input: LeadScoreInputV2): ConfidenceBreakdownV2 {
  const reasons: string[] = [];
  let score = 0;

  const hasContact =
    Boolean(input.contact.publicContact) || Boolean(input.contact.whatsappNumber);
  if (hasContact) {
    score += CONFIDENCE_POINTS.contact;
  } else {
    reasons.push('Tidak ada kontak publik');
  }

  const hasBusinessSignal =
    input.business.rating !== undefined || input.business.reviewCount !== undefined;
  if (hasBusinessSignal) {
    score += CONFIDENCE_POINTS.business;
  } else {
    reasons.push('Tidak ada data rating/review');
  }

  const website = websiteResolution(input);
  score += website.points;
  if (website.points < CONFIDENCE_POINTS.websiteResolvedFull) reasons.push(website.reason);

  if (input.hasTimestamp) {
    score += CONFIDENCE_POINTS.freshness;
  } else {
    reasons.push('Tidak ada timestamp penemuan lead');
  }

  const clamped = roundScore(score);
  // `+ 1e-9` keeps rounding half-up deterministic despite IEEE-754 error
  // (e.g. 0.775×100 = 77.4999… would otherwise round down to 0.77).
  const multiplier =
    Math.round(
      (CONFIDENCE_MULTIPLIER.floor + CONFIDENCE_MULTIPLIER.span * (clamped / 100)) * 100 + 1e-9,
    ) / 100;

  if (reasons.length === 0) reasons.push('Data lead lengkap — skor tidak dipotong');
  else reasons.unshift(`Skor dipotong ke ×${multiplier.toFixed(2)} karena data belum lengkap`);

  return { score: clamped, multiplier: clamp(multiplier, CONFIDENCE_MULTIPLIER.floor, 1), reasons };
}
