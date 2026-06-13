/**
 * Scoring domain types for the `leads-generator-dashboard` feature.
 *
 * Mirrors the Lead_Scoring_Engine / Scoring_Model_Service sections of
 * design.md (R7). The `ai_intent_match` factor kind was added by R13.
 */

/**
 * Built-in (and `custom`) factor kinds supported by the scoring engine.
 *
 * - `keyword_match`: how well a Lead's matched keywords align with the
 *   Scan_Configuration's keywords.
 * - `source_weight`: per-source bias.
 * - `location_match`: alignment between Lead location and configuration.
 * - `has_contact`: presence of a public contact channel.
 * - `recency`: freshness of `discoveredAt` / `acquiredAt`.
 * - `ai_intent_match`: AI-derived intent score (R13.10).
 * - `custom`: Team-defined factor whose semantics live in `params`.
 */
export type ScoringFactorKind =
  | 'keyword_match'
  | 'source_weight'
  | 'location_match'
  | 'has_contact'
  | 'recency'
  | 'ai_intent_match'
  | 'custom';

/**
 * Single weighted factor within a {@link ScoringModel}.
 *
 * `params` carries kind-specific tuning knobs (e.g. recency half-life). All
 * values must be primitives so the model is JSON-serializable.
 */
export interface ScoringFactor {
  id: string;
  kind: ScoringFactorKind;
  weight: number;
  params?: Record<string, number | string>;
}

/**
 * Versioned scoring model owned by a Team. `version` is incremented on
 * every update so recompute jobs can detect staleness (R7.3).
 */
export interface ScoringModel {
  teamId: string;
  version: number;
  factors: ScoringFactor[];
}

/**
 * Per-factor breakdown explaining how a Lead's score was produced (R7.6).
 *
 * - `rawValue`: the factor's raw value in `[0, 1]` before weighting.
 * - `weightedValue`: `clamp(rawValue, 0, 1) * factor.weight`.
 */
export interface FactorContribution {
  factorId: string;
  rawValue: number;
  weightedValue: number;
}

/**
 * Output of `Lead_Scoring_Engine.computeScore` — pure and deterministic
 * given the same inputs (R7.7).
 *
 * `score === null` together with `state === 'unscored'` indicates either an
 * empty model or an indeterminate result (R7.8).
 */
export interface ScoreResult {
  score: number | null;
  contributions: FactorContribution[];
  state: 'scored' | 'unscored';
}
