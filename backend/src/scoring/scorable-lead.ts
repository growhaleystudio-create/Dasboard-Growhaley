/**
 * `ScorableLead` is the **input contract** consumed by
 * {@link import('./compute-score.js').computeScore}.
 *
 * It is a deliberate subset of the persisted `Lead` shape from
 * `@leads-generator/shared`: only the attributes that influence the
 * Lead_Scoring_Engine (R7.2, R7.6, R7.7) are exposed here. Decoupling from
 * the storage row keeps `computeScore` a pure function — independent of
 * persistence details, transaction state, or wall-clock time — which is
 * essential for determinism (R7.7).
 *
 * Notes:
 * - `referenceTime` is **passed in by the caller** (e.g. `now-at-write`)
 *   instead of being read from `Date.now()` inside the engine. This is
 *   what makes the recency factor deterministic (Property 1, R7.7).
 * - `aiIntentScore` is the AI enrichment value as already stored on the
 *   Lead. Treating it as input (rather than re-fetching it) preserves
 *   determinism even though the AI provider itself is non-deterministic
 *   (R7.7, R13.10).
 */

/**
 * Subset of a `Lead`'s attributes that affect scoring.
 *
 * Fields mirror the parts of the shared `Lead` exercised by the built-in
 * factor kinds (keyword_match, source_weight, location_match, has_contact,
 * recency, ai_intent_match, custom).
 */
export interface ScorableLead {
  /** Tenant scope. Carried for traceability; `computeScore` does not branch on it. */
  teamId: string;

  /** Keywords from the Scan_Configuration that the Lead matched. */
  matchedKeywords: string[];

  /** Source ids this Lead aggregates after deduplication (R6). */
  sources: string[];

  /** Lowercased / trimmed location. `undefined` when not provided. */
  location?: string;

  /** Lowercased / trimmed public contact. `undefined` when not provided. */
  publicContact?: string;

  /** Discovery timestamp used by the recency factor (R7.7). */
  discoveredAt: Date;

  /**
   * Reference time the recency factor decays from (typically `now`
   * captured at write-time by the caller). Passed in so `computeScore`
   * stays deterministic per R7.7.
   */
  referenceTime: Date;

  /**
   * Persisted AI intent score in `[0, 100]` integer space, or `null` when
   * AI enrichment has not yet completed for this Lead (R13.13).
   * Treated as plain input to keep `computeScore` pure (R7.7).
   */
  aiIntentScore: number | null;
}
