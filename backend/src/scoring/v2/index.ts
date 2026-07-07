/**
 * Lead Opportunity Scoring v2 — public entry point.
 *
 *   BaseScore  = BusinessValue×0.35 + DigitalGap×0.40 + Reachability×0.25
 *   FinalScore = round(BaseScore × ConfidenceMultiplier)
 *
 * Pure and deterministic: same input → same output, no I/O, no clock. The
 * engine is intentionally self-contained (not wired into production yet) so it
 * can be verified in isolation before the calibration gate.
 */

import { roundScore } from '../utils.js';
import { computeBusinessValue } from './business-value.js';
import { computeConfidence } from './confidence.js';
import { computeDigitalGap } from './digital-gap.js';
import { computeReachability } from './reachability.js';
import { LEAD_SCORING_V2_VERSION, PILLAR_WEIGHTS, SCORE_BANDS } from './constants.js';
import type { LeadScoreInputV2, LeadScoreV2, ScoreBand } from './types.js';

export function bandForScore(score: number): ScoreBand {
  if (score >= SCORE_BANDS.hot) return 'hot';
  if (score >= SCORE_BANDS.warm) return 'warm';
  if (score >= SCORE_BANDS.nurture) return 'nurture';
  return 'cold';
}

export function computeLeadScoreV2(input: LeadScoreInputV2): LeadScoreV2 {
  const businessValue = computeBusinessValue(input.business);
  const digitalGap = computeDigitalGap(input);
  const reachability = computeReachability(input.contact);
  const confidence = computeConfidence(input);

  const baseScore = roundScore(
    businessValue.score * PILLAR_WEIGHTS.businessValue +
      digitalGap.score * PILLAR_WEIGHTS.digitalGap +
      reachability.score * PILLAR_WEIGHTS.reachability,
  );

  const finalScore = roundScore(baseScore * confidence.multiplier);

  return {
    finalScore,
    baseScore,
    band: bandForScore(finalScore),
    hasWebsite: input.hasWebsite,
    businessValue,
    digitalGap,
    reachability,
    confidence,
    scoringVersion: LEAD_SCORING_V2_VERSION,
  };
}

export * from './types.js';
export {
  LEAD_SCORING_V2_VERSION,
  PILLAR_WEIGHTS,
  SCORE_BANDS,
  WEBSITE_QUALITY_WEIGHTS,
} from './constants.js';
