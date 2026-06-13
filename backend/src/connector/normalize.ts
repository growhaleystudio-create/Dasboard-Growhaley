/**
 * Default RawProspect → NormalizedLead transformer used by every
 * Source_Connector. This is a pure function — no I/O, no clock reads, no
 * randomness — so it is fully deterministic for the same input.
 *
 * Privacy guarantees enforced here (design.md → Privacy & Kepatuhan):
 * - **Whitelist (R11.1)**: only the four public fields {@link PUBLIC_FIELDS}
 *   are copied from the raw record; anything else (e.g. internal notes,
 *   raw IDs, scraped HTML) is stripped before the lead leaves the
 *   connector boundary.
 * - **UsagePolicy enforcement (R11.9)**: a Source that declares
 *   `disallowFields` in its policy strips matching public fields too,
 *   on top of the whitelist.
 *
 * `discoveredAt` is set to `raw.acquiredAt` rather than `new Date()` so
 * that callers (and tests) get deterministic output. The Scan_Engine sets
 * `acquired_at` on the persisted Lead row separately (R11.2).
 *
 * `status` is intentionally NOT set: {@link NormalizedLead} has no
 * `status` field. The Lead's initial `status = 'New'` is applied by the
 * Scan_Engine / Deduplication_Service when materializing a canonical
 * Lead row (R8.1).
 */
import type { NormalizedLead, RawProspect, UsagePolicy } from '@leads-generator/shared';

/**
 * Public fields that may travel from a RawProspect into a NormalizedLead.
 * Anything outside this list is dropped (R11.1). Order is informational
 * only.
 */
export const PUBLIC_FIELDS = ['name', 'publicContact', 'profileUrl', 'location'] as const;

/**
 * Member of {@link PUBLIC_FIELDS}. Re-exported so downstream consumers
 * (e.g. the AI snapshot builder in Task 17.9) can reuse the same
 * whitelist without duplicating the list of literals.
 */
export type PublicField = (typeof PUBLIC_FIELDS)[number];

/**
 * Context passed to {@link normalizeRawProspect}. `teamId` is required
 * because {@link NormalizedLead} is tenant-scoped (R2.8); the Scan_Engine
 * supplies it. `sourceId` ends up in `NormalizedLead.sources`. The
 * optional `usagePolicy` further narrows the public-field whitelist
 * (R11.9).
 */
export interface NormalizeContext {
  teamId: string;
  sourceId: string;
  usagePolicy?: UsagePolicy;
}

/**
 * Returns true when `value` is a non-empty string after trimming. Used
 * to skip blank public fields so we don't store empty strings that would
 * defeat dedup keys (R6.3) and pollute exports.
 */
function isMeaningfulString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Default normalization helper. Concrete connectors are expected to call
 * this from their `normalize` method:
 *
 * ```ts
 * normalize(raw, teamId) {
 *   return normalizeRawProspect(raw, {
 *     teamId,
 *     sourceId: this.sourceId,
 *     usagePolicy: this.usagePolicy,
 *   });
 * }
 * ```
 *
 * The function is pure: same `(raw, ctx)` always yields the same
 * `NormalizedLead`. In particular, `discoveredAt` is taken from
 * `raw.acquiredAt` and never from the wall clock.
 */
export function normalizeRawProspect(
  raw: RawProspect,
  ctx: NormalizeContext,
): NormalizedLead {
  const disallowed = new Set<string>(ctx.usagePolicy?.disallowFields ?? []);

  // Build the lead by copying only whitelisted, non-blank, non-disallowed
  // fields. We assemble into a plain object first so `exactOptionalPropertyTypes`
  // is satisfied (we never assign `undefined` to an optional key).
  const publicSlice: Partial<Record<PublicField, string>> = {};
  for (const field of PUBLIC_FIELDS) {
    if (disallowed.has(field)) continue;
    const value = raw[field];
    if (isMeaningfulString(value)) {
      publicSlice[field] = value;
    }
  }

  return {
    teamId: ctx.teamId,
    ...publicSlice,
    sources: [ctx.sourceId],
    matchedKeywords: [raw.matchedKeyword],
    discoveredAt: raw.acquiredAt,
  };
}
