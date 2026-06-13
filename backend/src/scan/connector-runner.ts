/**
 * Isolated, time-bounded execution of a single {@link Source_Connector}'s
 * `fetch`, plus a fan-out helper that runs many connectors without letting
 * one failure affect the others.
 *
 * Design references:
 * - design.md → Alur Eksekusi Pemindaian: the Scan_Engine invokes each
 *   `available` connector's `fetch` with a 60-second `AbortSignal` and
 *   records a per-connector outcome line.
 * - design.md → Error Handling → Scan per-connector: a connector that
 *   errors or exceeds the timeout is logged on the Scan_Job result and
 *   does NOT abort the other connectors (R5.4). A connector that hits its
 *   Source's rate limit stops being queried and its result is marked
 *   `partial` (R5.5).
 *
 * Outcome mapping (see {@link ConnectorRunOutcome} in
 * `@leads-generator/shared`):
 * - `fetch` resolves normally → `'ok'`, `itemsFetched = prospects.length`
 *   (R5.1).
 * - the 60-second `AbortSignal` fired → `'timeout'` (R5.1, R5.4).
 * - the connector threw {@link RateLimitError} → `'rate_limited'`; the
 *   summary layer treats this as a partial Source result (R5.5).
 * - any other throw → `'error'` with the message captured (R5.4).
 *
 * The central guarantee of this module is that {@link runConnector} NEVER
 * throws: it always resolves with a {@link ConnectorRunOutput}. That is
 * what makes {@link runConnectorsIsolated} able to use a plain
 * `Promise.all` and still isolate failures — every branch is a resolution,
 * never a rejection.
 */
import type { ConnectorRunResult, RawProspect } from '@leads-generator/shared';

import type { Source_Connector, ScanQuery } from '../connector/source-connector.js';

/**
 * Per-Source timeout budget for a connector's `fetch` (R5.1). The
 * Scan_Engine aborts the supplied `AbortSignal` once this elapses; the
 * connector is expected to honor the signal and return/throw promptly.
 */
export const CONNECTOR_FETCH_TIMEOUT_MS = 60_000;

/**
 * Error a connector throws to signal it hit the Source's rate limit
 * (R5.5). The runner maps this to a `'rate_limited'` outcome so the
 * Scan_Engine stops requesting from the Source and marks its result
 * partial.
 *
 * Connectors raise this instead of a generic `Error` precisely so the
 * runner can distinguish "back off from this Source" from an ordinary
 * provider error (which maps to `'error'`).
 */
export class RateLimitError extends Error {
  public constructor(message = 'rate limited') {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Result of running a single connector. `result` is the per-Source line
 * folded into {@link ScanSummary.connectorResults}; `prospects` are the
 * raw items the connector returned (empty for any non-`ok` outcome — a
 * timed-out or errored connector contributes no usable prospects, and we
 * intentionally do not attempt to salvage a partial batch from a thrown
 * error to keep the contract simple).
 */
export interface ConnectorRunOutput {
  /** Per-Source outcome line for the Scan_Job summary (R5.3). */
  result: ConnectorRunResult;
  /** Raw prospects fetched; empty unless the outcome is `'ok'`. */
  prospects: RawProspect[];
}

/**
 * Options for {@link runConnector}. `timeoutMs` overrides the default
 * {@link CONNECTOR_FETCH_TIMEOUT_MS} (used by tests with fake timers);
 * `now` is currently unused by the implementation but accepted so callers
 * have a single options bag to thread through if timing instrumentation is
 * added later.
 */
export interface RunConnectorOptions {
  timeoutMs?: number;
  now?: () => number;
}

/**
 * Run a single connector's `fetch` under a time budget, classifying the
 * result into a {@link ConnectorRunResult}. NEVER throws — every code
 * path (success, timeout, rate limit, generic error) resolves with a
 * {@link ConnectorRunOutput}, which is what gives the caller isolation
 * across connectors (R5.4).
 *
 * Timeout handling: an {@link AbortController} is aborted after
 * `timeoutMs`. The connector receives the controller's signal and is
 * expected to reject once it fires. When the catch block observes
 * `signal.aborted`, the outcome is `'timeout'` regardless of the concrete
 * error the connector threw (R5.1, R5.4).
 */
export async function runConnector(
  connector: Source_Connector,
  query: ScanQuery,
  opts?: RunConnectorOptions,
): Promise<ConnectorRunOutput> {
  const timeoutMs = opts?.timeoutMs ?? CONNECTOR_FETCH_TIMEOUT_MS;
  const { sourceId } = connector;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const prospects = await connector.fetch(query, controller.signal);
    return {
      result: { sourceId, outcome: 'ok', itemsFetched: prospects.length },
      prospects,
    };
  } catch (error: unknown) {
    // The timeout fired: classify as 'timeout' irrespective of how the
    // connector surfaced the cancellation (R5.1, R5.4).
    if (controller.signal.aborted) {
      return {
        result: { sourceId, outcome: 'timeout', itemsFetched: 0, error: 'timeout' },
        prospects: [],
      };
    }
    // The Source rate-limited us: stop requesting and mark partial (R5.5).
    if (error instanceof RateLimitError) {
      return {
        result: {
          sourceId,
          outcome: 'rate_limited',
          itemsFetched: 0,
          error: error.message,
        },
        prospects: [],
      };
    }
    // Any other failure is a generic connector error (R5.4).
    return {
      result: { sourceId, outcome: 'error', itemsFetched: 0, error: errorMessage(error) },
      prospects: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run many connectors with per-connector isolation (R5.4). Because
 * {@link runConnector} never throws, a plain `Promise.all` suffices: one
 * connector's timeout/error/rate-limit cannot reject the aggregate, so the
 * others always complete. Results preserve input order.
 */
export async function runConnectorsIsolated(
  connectors: Source_Connector[],
  query: ScanQuery,
  opts?: RunConnectorOptions,
): Promise<ConnectorRunOutput[]> {
  return Promise.all(connectors.map((connector) => runConnector(connector, query, opts)));
}

/**
 * Extract a human-readable message from an unknown thrown value without
 * assuming it is an `Error` (connectors may throw strings or other
 * values). Falls back to `String(error)` for non-Error throws.
 */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
