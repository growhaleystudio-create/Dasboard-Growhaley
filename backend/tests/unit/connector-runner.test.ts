/**
 * Unit tests for the isolated connector runner (Task 12.1, R5.1, R5.4,
 * R5.5).
 *
 * Verifies the outcome classification of {@link runConnector}:
 * - resolves → `'ok'` with `itemsFetched` matching the prospect count.
 * - 60s `AbortSignal` fires → `'timeout'` (driven with fake timers).
 * - {@link RateLimitError} thrown → `'rate_limited'` (R5.5).
 * - generic `Error` thrown → `'error'` with the message captured (R5.4).
 *
 * And that {@link runConnectorsIsolated} isolates failures: a throwing
 * connector in the middle of the batch does not stop the others (R5.4).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorStatus, NormalizedLead, RawProspect } from '@leads-generator/shared';

import type { ScanQuery, Source_Connector } from '../../src/connector/source-connector.js';
import {
  CONNECTOR_FETCH_TIMEOUT_MS,
  RateLimitError,
  runConnector,
  runConnectorsIsolated,
} from '../../src/scan/connector-runner.js';

const QUERY: ScanQuery = { keywords: ['design', 'logo'] };

/**
 * Build a {@link RawProspect} with the keyword baked into its identifying
 * fields. Only the fields the runner cares about (it just counts items)
 * need be present, but we keep a realistic shape.
 */
function prospect(keyword: string): RawProspect {
  return {
    name: `${keyword}-prospect`,
    publicContact: `contact-${keyword}@example.com`,
    profileUrl: `https://example.com/${keyword}`,
    location: 'Jakarta',
    matchedKeyword: keyword,
    acquiredAt: new Date(0),
  };
}

/**
 * Minimal stub connector whose `fetch` behavior is supplied per test.
 * `checkAvailability` and `normalize` are present to satisfy the
 * interface but are unused by the runner.
 */
function makeConnector(
  sourceId: string,
  fetchImpl: (query: ScanQuery, signal: AbortSignal) => Promise<RawProspect[]>,
): Source_Connector {
  return {
    sourceId,
    displayName: sourceId,
    checkAvailability(): Promise<ConnectorStatus> {
      return Promise.resolve('available');
    },
    fetch: fetchImpl,
    normalize(_raw: RawProspect, teamId: string): NormalizedLead {
      return { teamId, sources: [sourceId], matchedKeywords: [], discoveredAt: new Date(0) };
    },
  };
}

describe('runConnector', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps a resolved fetch to outcome "ok" with itemsFetched = count', async () => {
    const connector = makeConnector('google', () =>
      Promise.resolve([prospect('design'), prospect('logo')]),
    );

    const output = await runConnector(connector, QUERY);

    expect(output.result).toEqual({ sourceId: 'google', outcome: 'ok', itemsFetched: 2 });
    expect(output.prospects).toHaveLength(2);
    expect(output.prospects.map((p) => p.matchedKeyword)).toEqual(['design', 'logo']);
  });

  it('maps a timed-out fetch to outcome "timeout" (R5.1, R5.4)', async () => {
    vi.useFakeTimers();
    // Connector that only settles when its signal aborts — mirrors the
    // real pattern where fetch forwards the AbortSignal to the HTTP
    // client and rejects on cancellation.
    const connector = makeConnector(
      'slow',
      (_query, signal) =>
        new Promise<RawProspect[]>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );

    const promise = runConnector(connector, QUERY, {
      timeoutMs: CONNECTOR_FETCH_TIMEOUT_MS,
    });
    // Advance past the 60s budget so the runner's setTimeout fires
    // controller.abort(), which rejects the connector's fetch.
    await vi.advanceTimersByTimeAsync(CONNECTOR_FETCH_TIMEOUT_MS + 1);

    const output = await promise;
    expect(output.result).toEqual({
      sourceId: 'slow',
      outcome: 'timeout',
      itemsFetched: 0,
      error: 'timeout',
    });
    expect(output.prospects).toEqual([]);
  });

  it('maps a RateLimitError to outcome "rate_limited" (R5.5)', async () => {
    const connector = makeConnector('threads', () =>
      Promise.reject(new RateLimitError('429 from Threads')),
    );

    const output = await runConnector(connector, QUERY);

    expect(output.result).toEqual({
      sourceId: 'threads',
      outcome: 'rate_limited',
      itemsFetched: 0,
      error: '429 from Threads',
    });
    expect(output.prospects).toEqual([]);
  });

  it('maps a generic error to outcome "error" with the message captured (R5.4)', async () => {
    const connector = makeConnector('fiverr', () =>
      Promise.reject(new Error('boom from provider')),
    );

    const output = await runConnector(connector, QUERY);

    expect(output.result).toEqual({
      sourceId: 'fiverr',
      outcome: 'error',
      itemsFetched: 0,
      error: 'boom from provider',
    });
    expect(output.prospects).toEqual([]);
  });

  it('never throws even when the connector throws a non-Error value', async () => {
    const connector = makeConnector('weird', () => Promise.reject('plain string failure'));

    const output = await runConnector(connector, QUERY);

    expect(output.result.outcome).toBe('error');
    expect(output.result.error).toBe('plain string failure');
  });
});

describe('runConnectorsIsolated', () => {
  it('isolates a failing connector so the others still complete (R5.4)', async () => {
    const ok1 = makeConnector('google', () => Promise.resolve([prospect('design')]));
    const throwing = makeConnector('fiverr', () => Promise.reject(new Error('kaboom')));
    const ok2 = makeConnector('threads', () =>
      Promise.resolve([prospect('logo'), prospect('brand')]),
    );

    const outputs = await runConnectorsIsolated([ok1, throwing, ok2], QUERY);

    expect(outputs).toHaveLength(3);
    expect(outputs[0]?.result).toEqual({ sourceId: 'google', outcome: 'ok', itemsFetched: 1 });
    expect(outputs[1]?.result).toEqual({
      sourceId: 'fiverr',
      outcome: 'error',
      itemsFetched: 0,
      error: 'kaboom',
    });
    expect(outputs[2]?.result).toEqual({ sourceId: 'threads', outcome: 'ok', itemsFetched: 2 });
  });
});
