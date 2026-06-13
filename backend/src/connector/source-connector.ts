/**
 * Source connector contract.
 *
 * This is the platform-side counterpart to the data types declared in
 * `@leads-generator/shared/connector` (which intentionally omit anything
 * depending on Node primitives like `AbortSignal`). The interface here is
 * what every concrete connector — Fiverr, Threads, Google, etc. —
 * implements and what {@link Connector_Registry} hands back to the
 * Scan_Engine (design.md → Components and Interfaces → Source_Connector,
 * R5, R11.9).
 *
 * Lifecycle of a connector during a scan (design.md → Alur Eksekusi
 * Pemindaian):
 * 1. Scan_Engine calls {@link Source_Connector.checkAvailability} when
 *    deciding whether to invoke this Source for the current job (R3.8).
 * 2. For `available` connectors it calls
 *    {@link Source_Connector.fetch} with a 60-second `AbortSignal` (R5.1).
 * 3. Each {@link RawProspect} returned by `fetch` is passed through
 *    {@link Source_Connector.normalize} to obtain a {@link NormalizedLead}
 *    suitable for the Deduplication_Service (R5.2, R6).
 *
 * `normalize` is intentionally synchronous and pure: it does no I/O, reads
 * no clock, and produces deterministic output for the same `(raw, teamId)`
 * pair. See {@link normalizeRawProspect} for the default implementation
 * that connectors are expected to call.
 */
import type {
  ConnectorStatus,
  NormalizedLead,
  RawProspect,
  UsagePolicy,
} from '@leads-generator/shared';

/**
 * The query a connector receives from the Scan_Engine. `keywords` is the
 * set of trimmed, validated keywords from the Scan_Configuration (R4.1,
 * R4.2). `niche` and `location` are optional context the connector may use
 * when the Source supports such filters.
 */
export interface ScanQuery {
  keywords: string[];
  niche?: string;
  location?: string;
}

/**
 * Pluggable Source connector. Implementations MUST:
 *
 * - Use only the official API of their platform (R3, R11.9). Connectors
 *   for Sources without an official API report `unavailable` from
 *   {@link checkAvailability}.
 * - Honor the supplied `AbortSignal` in {@link fetch}: the Scan_Engine
 *   aborts after 60 seconds (R5.1).
 * - Strip any field outside the public whitelist inside {@link normalize}
 *   (R11.1) and apply their own {@link usagePolicy} if declared (R11.9).
 *
 * `normalize` accepts `teamId` separately because {@link NormalizedLead}
 * is tenant-scoped (R2.8) but the Source has no notion of teams. The
 * Scan_Engine threads the current `teamId` through.
 */
export interface Source_Connector {
  /** Stable Source identifier persisted on `lead.acquired_source`. */
  readonly sourceId: string;
  /** Human-readable name shown in the Connector admin UI (R3.1). */
  readonly displayName: string;
  /**
   * Per-Source ToS-driven policy applied during normalization (R11.9).
   * When undefined, only the default public-field whitelist is enforced.
   */
  readonly usagePolicy?: UsagePolicy;

  /**
   * Reports whether this connector can currently service a scan for its
   * Source. Used by Connector_Registry and by Scan_Engine pre-flight
   * (R3.8). Implementations should be fast and side-effect-free; do not
   * attempt destructive probes.
   */
  checkAvailability(): Promise<ConnectorStatus>;

  /**
   * Calls the upstream Source API for the given query. The Scan_Engine
   * passes a 60-second `AbortSignal`; implementations MUST forward the
   * signal to the underlying HTTP client and return promptly when it
   * aborts (R5.1).
   */
  fetch(query: ScanQuery, signal: AbortSignal): Promise<RawProspect[]>;

  /**
   * Pure transformation from a {@link RawProspect} to a
   * {@link NormalizedLead}. Implementations SHOULD delegate to
   * {@link normalizeRawProspect} with their `sourceId` and `usagePolicy`.
   *
   * Note on what `normalize` does and does NOT set:
   * - SETS: `teamId`, public-field whitelist (`name`, `publicContact`,
   *   `profileUrl`, `location` — minus any `usagePolicy.disallowFields`),
   *   `sources = [sourceId]`, `matchedKeywords = [raw.matchedKeyword]`,
   *   and `discoveredAt = raw.acquiredAt` (deterministic).
   * - DOES NOT SET: `status`. {@link NormalizedLead} has no `status`
   *   field; the canonical Lead's `status = 'New'` is applied by
   *   Scan_Engine when persisting via Deduplication_Service (R8.1).
   * - DOES NOT SET: `acquiredSource` / `acquiredAt` on the Lead. Those
   *   are recorded on the persisted Lead row (R11.2) by the Scan_Engine
   *   using `sourceId` and the wall clock at insert time. The pure
   *   normalizer keeps deterministic output by avoiding `new Date()`.
   */
  normalize(raw: RawProspect, teamId: string): NormalizedLead;
}
