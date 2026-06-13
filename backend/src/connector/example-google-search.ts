/**
 * Demo {@link Source_Connector} backed by a deterministic in-memory
 * generator.
 *
 * This connector is shipped as a built-in example so the rest of the
 * system (Scan_Engine, Connector_Registry, Deduplication_Service, …)
 * has at least one working Source_Connector to exercise during demos
 * and tests, without depending on a live third-party API. A real
 * Google Search connector would call the official Custom Search JSON
 * API, honor the provided `AbortSignal`, and surface upstream errors
 * — this stub mimics the contract while keeping `fetch` synchronous
 * and side-effect-free.
 *
 * Design references:
 * - design.md → Components and Interfaces → Source_Connector
 *   (`checkAvailability`, `fetch` with AbortSignal, `normalize`).
 * - design.md → Privacy & Kepatuhan → Penegakan ToS Source (R11.9):
 *   the connector advertises a {@link UsagePolicy} that the
 *   normalizer consults to strip `disallowFields` and that the
 *   Retention_Worker (Task 16.5) consults for `allowedRetentionDays`.
 *
 * Why retention is not enforced inside `normalize`:
 * `allowedRetentionDays` describes a maximum age for persisted Lead
 * rows. Enforcing retention requires deletion of already-stored Leads
 * — that is the job of the Retention_Worker, not of a pure normalizer
 * that has no DB handle and no clock. `normalize` therefore enforces
 * `disallowFields` only (R11.1, R11.9 field-level part); the
 * Retention_Worker reads {@link UsagePolicy.allowedRetentionDays}
 * (R11.9 retention part) when sweeping Leads.
 */
import type {
  ConnectorStatus,
  NormalizedLead,
  RawProspect,
  UsagePolicy,
} from '@leads-generator/shared';

import { normalizeRawProspect } from './normalize.js';
import type { ScanQuery, Source_Connector } from './source-connector.js';

/**
 * Maximum number of synthetic prospects produced by {@link
 * ExampleGoogleSearchConnector.fetch}. A tiny ceiling keeps the demo
 * payload deterministic and bounded so tests can assert exact shapes.
 */
const MAX_SYNTHETIC_PROSPECTS = 3;

/**
 * Fixed `acquiredAt` used by every synthetic prospect. Using the Unix
 * epoch keeps `fetch` deterministic — the same query always produces
 * the same {@link RawProspect}s, which in turn makes
 * {@link normalizeRawProspect} fully reproducible (no wall-clock reads
 * leak into `discoveredAt`).
 */
const SYNTHETIC_ACQUIRED_AT = new Date(0);

/**
 * Synthesize the `email` placeholder for a keyword. Lower-cased to
 * mimic real public-contact normalization without taking a hard
 * dependency on the upstream casing.
 */
function syntheticEmail(keyword: string): string {
  return `contact-${keyword}@example.com`;
}

/**
 * Synthesize the `profileUrl` placeholder for a keyword. The
 * `example.com` domain is reserved by IANA for documentation, so it is
 * safe to embed in tests and demo data.
 */
function syntheticProfileUrl(keyword: string): string {
  return `https://example.com/${keyword}`;
}

/**
 * Demo connector that pretends to query Google Search.
 *
 * `fetch` returns synthetic prospects derived from `query.keywords`
 * (capped at {@link MAX_SYNTHETIC_PROSPECTS}). Each entry carries the
 * originating keyword in `matchedKeyword` so the Scan_Engine can later
 * tie the resulting Lead back to the keyword that surfaced it (R5.2,
 * R6.5).
 *
 * `checkAvailability` is a stub that always reports `'available'`. A
 * production implementation would issue a HEAD request against the
 * upstream endpoint (or check API quota) and return
 * `'requires_configuration'` when credentials are missing or
 * `'unavailable'` when the upstream is down (R3.1, R3.8).
 */
export class ExampleGoogleSearchConnector implements Source_Connector {
  /** Stable Source identifier persisted on `lead.acquired_source`. */
  public readonly sourceId = 'google';

  /** Human-readable label rendered in the Connector admin UI (R3.1). */
  public readonly displayName = 'Google Search (example)';

  /**
   * Per-Source ToS-driven policy applied during normalization (R11.9).
   *
   * - `allowedRetentionDays: 90` is read by the Retention_Worker
   *   (Task 16.5) when sweeping Leads acquired from this Source.
   * - `disallowFields: []` declares that this Source allows the full
   *   public-field whitelist; the array is kept (rather than omitted)
   *   so consumers don't have to special-case `undefined` when
   *   inspecting the policy.
   */
  public readonly usagePolicy: UsagePolicy = {
    allowedRetentionDays: 90,
    disallowFields: [],
  };

  /**
   * Stub availability check (R3.8). Always returns `'available'`.
   *
   * A real connector would HEAD an upstream endpoint and translate
   * non-2xx responses into `'unavailable'` with a populated
   * `unavailableReason` on the Team's `team_connector` row (R3.3).
   */
  public async checkAvailability(): Promise<ConnectorStatus> {
    return 'available';
  }

  /**
   * Returns up to {@link MAX_SYNTHETIC_PROSPECTS} deterministic
   * {@link RawProspect}s, one per keyword in `query.keywords` (in
   * order). Honors `signal`: if the Scan_Engine has already aborted
   * by the time `fetch` is entered (R5.1), this method throws an
   * `Error('aborted')` instead of producing data.
   */
  public async fetch(
    query: ScanQuery,
    signal: AbortSignal,
  ): Promise<RawProspect[]> {
    if (signal.aborted) {
      // Scan_Engine aborts after the 60-second budget (R5.1). Surface
      // the cancellation as a plain Error so the caller can short-
      // circuit the loop without depending on platform-specific
      // AbortError types.
      throw new Error('aborted');
    }

    const limited = query.keywords.slice(0, MAX_SYNTHETIC_PROSPECTS);
    return limited.map((keyword) => ({
      name: `${keyword}-prospect`,
      publicContact: syntheticEmail(keyword),
      profileUrl: syntheticProfileUrl(keyword),
      location: 'Jakarta',
      matchedKeyword: keyword,
      acquiredAt: SYNTHETIC_ACQUIRED_AT,
    }));
  }

  /**
   * Delegates to the shared {@link normalizeRawProspect} helper so
   * this connector inherits the public-field whitelist (R11.1) and
   * `usagePolicy.disallowFields` enforcement (R11.9) for free.
   */
  public normalize(raw: RawProspect, teamId: string): NormalizedLead {
    return normalizeRawProspect(raw, {
      teamId,
      sourceId: this.sourceId,
      usagePolicy: this.usagePolicy,
    });
  }
}
