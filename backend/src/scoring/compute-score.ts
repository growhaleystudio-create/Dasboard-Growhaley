/**
 * `computeScore` — pure deterministic scoring (Task 10.1, R7.2, R7.6, R7.7).
 *
 * Implements the weighted-factor algorithm from
 * `design.md → Desain Scoring_Model → Model Faktor Berbobot`:
 *
 * ```
 * weightedValue_i = clamp(rawValue_i, 0, 1) * weight_i
 * rawScore        = Σ weightedValue_i
 * normalized      = rawScore / Σ weight_i           (only when Σ weight_i > 0)
 * score           = clamp(roundHalfUp(normalized * 100), 0, 100)
 * ```
 *
 * The function is intentionally free of I/O, randomness, and `Date.now()`;
 * its output depends solely on its inputs (R7.7). All `referenceTime`
 * inputs are captured by the caller. The function is also defensive
 * against `NaN`/`Infinity` showing up in either `factor.weight`,
 * `factor.params`, or any computed `rawValue`: such values are coerced to
 * `0` so a single misconfigured factor cannot poison the entire score.
 */

import type {
  FactorContribution,
  ScoreResult,
  ScoringFactor,
  ScoringFactorKind,
} from '@leads-generator/shared';

import type { ScorableLead } from './scorable-lead.js';

/** One day in milliseconds. Extracted so the recency math stays readable. */
const MS_PER_DAY = 86_400_000;

/** Default keyword target before {@link clamp} (used by `keyword_match`). */
const DEFAULT_KEYWORD_TARGET = 5;

/** Default source ceiling before {@link clamp} (used by `source_weight`). */
const DEFAULT_MAX_SOURCES = 3;

/** Default half-life in days for the `recency` exponential decay. */
const DEFAULT_HALF_LIFE_DAYS = 30;

/**
 * Round half up. For non-negative inputs (the only ones we feed it after
 * clamping to `[0, 100]`), `Math.floor(n + 0.5)` matches the design's
 * specified rounding rule: `0.5 → 1`, `1.5 → 2`, etc.
 *
 * Exported for unit tests; production code calls it transitively via
 * {@link computeScore}.
 */
export function roundHalfUp(n: number): number {
  return Math.floor(n + 0.5);
}

/**
 * Defensive clamp that also collapses `NaN`/`±Infinity` to the lower bound.
 *
 * The bounds order (`min`, `max`) mirrors `Math.min`/`Math.max`. We avoid
 * `Math.min(Math.max(...))` because that produces `NaN` when the input is
 * `NaN`, defeating the "garbage in → 0 out" defensiveness we want.
 */
function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * Coerce a `params` value to a finite number, falling back to `fallback`
 * when the value is missing, non-numeric, or `NaN`/`±Infinity`.
 */
function numericParam(
  params: Record<string, number | string> | undefined,
  key: string,
  fallback: number,
): number {
  if (params === undefined) return fallback;
  const raw = params[key];
  if (raw === undefined) return fallback;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Read a string param, returning `undefined` when missing or empty.
 */
function stringParam(
  params: Record<string, number | string> | undefined,
  key: string,
): string | undefined {
  if (params === undefined) return undefined;
  const raw = params[key];
  if (typeof raw !== 'string') return undefined;
  return raw.length > 0 ? raw : undefined;
}

/**
 * Compute the `rawValue` ∈ `[0, 1]` for a single factor.
 *
 * Per-kind formulas live here so {@link computeScore} stays a thin
 * aggregator. Any `NaN`/`Infinity` produced inside this helper is mapped
 * to `0` by the call site via {@link clamp}.
 */
function rawValueFor(kind: ScoringFactorKind, lead: ScorableLead, factor: ScoringFactor): number {
  switch (kind) {
    case 'keyword_match': {
      const target = numericParam(factor.params, 'target', DEFAULT_KEYWORD_TARGET);
      const safeTarget = target > 0 ? target : DEFAULT_KEYWORD_TARGET;
      const matched = lead.matchedKeywords.length;
      if (matched <= 0) return 0;
      return Math.min(matched / safeTarget, 1);
    }

    case 'source_weight': {
      const maxSources = numericParam(factor.params, 'maxSources', DEFAULT_MAX_SOURCES);
      const safeMax = maxSources > 0 ? maxSources : DEFAULT_MAX_SOURCES;
      const count = lead.sources.length;
      if (count <= 0) return 0;
      return Math.min(count / safeMax, 1);
    }

    case 'location_match': {
      const target = stringParam(factor.params, 'target');
      if (lead.location === undefined || target === undefined) return 0;
      return lead.location === target ? 1 : 0;
    }

    case 'has_contact': {
      return lead.publicContact !== undefined && lead.publicContact.length > 0 ? 1 : 0;
    }

    case 'recency': {
      const halfLifeDays = numericParam(factor.params, 'halfLifeDays', DEFAULT_HALF_LIFE_DAYS);
      const safeHalfLifeDays = halfLifeDays > 0 ? halfLifeDays : DEFAULT_HALF_LIFE_DAYS;
      const ageMs = lead.referenceTime.getTime() - lead.discoveredAt.getTime();
      // Future-dated discoveries get the maximum freshness (1.0) instead
      // of being amplified above 1 by negative ages.
      if (!Number.isFinite(ageMs) || ageMs <= 0) return 1;
      const halfLifeMs = safeHalfLifeDays * MS_PER_DAY;
      return Math.pow(0.5, ageMs / halfLifeMs);
    }

    case 'ai_intent_match': {
      // R13.13: when AI hasn't been computed yet, the factor contributes
      // 0 — preserving the rule-based score until enrichment lands.
      if (lead.aiIntentScore === null) return 0;
      return lead.aiIntentScore / 100;
    }

    case 'custom': {
      // Caller-defined factor: value lives in `params.value`.
      return numericParam(factor.params, 'value', 0);
    }
  }
}

/**
 * Pure deterministic Lead scoring entry point (R7.7).
 *
 * Behaviour summary:
 * - Empty model OR `Σ weight === 0` → `{ score: null, contributions: [], state: 'unscored' }`.
 * - Otherwise → `{ score: integer ∈ [0, 100], contributions: [...], state: 'scored' }`
 *   with `contributions` mirroring the order of `factors`.
 *
 * @param lead    The {@link ScorableLead} input — already containing all
 *                pre-computed attributes the engine needs (no I/O).
 * @param factors The Team's `ScoringModel.factors`. The model `version` is
 *                irrelevant to the math itself and therefore not required
 *                here; persistence concerns live in `scoreAndPersist`.
 */
export function computeScore(lead: ScorableLead, factors: ScoringFactor[]): ScoreResult {
  if (factors.length === 0) {
    return { score: null, contributions: [], state: 'unscored' };
  }

  const contributions: FactorContribution[] = [];
  let weightedSum = 0;
  let weightSum = 0;

  for (const factor of factors) {
    // Defensive weight handling: NaN/Infinity → 0 contribution.
    const weight = Number.isFinite(factor.weight) ? factor.weight : 0;
    const rawCandidate = rawValueFor(factor.kind, lead, factor);
    const rawValue = clamp(rawCandidate, 0, 1);
    const weightedValue = rawValue * weight;

    contributions.push({
      factorId: factor.id,
      rawValue,
      weightedValue,
    });

    weightSum += weight;
    weightedSum += weightedValue;
  }

  if (weightSum <= 0) {
    // Empty / zero-weight model still counts as unscored per R7.8 — and
    // we deliberately return an empty `contributions` array to signal
    // "nothing actually informed this Lead".
    return { score: null, contributions: [], state: 'unscored' };
  }

  const normalized = weightedSum / weightSum;
  const scaled = clamp(normalized * 100, 0, 100);
  const score = clamp(roundHalfUp(scaled), 0, 100);

  return { score, contributions, state: 'scored' };
}
