/**
 * Unit tests for {@link MetricsService.compute} date-range handling
 * (Task 15.4, R10.6, R10.7).
 *
 * These example-based tests complement the Property 30 PBT
 * (`tests/property/metrics-date-range.test.ts`) by pinning the
 * service-level contract around the optional range argument:
 *
 * - R10.7 — an inverted range (`from > to`) is rejected with a
 *   `VALIDATION` error and the repository is NEVER queried, so the previous
 *   metrics view is preserved (no recompute).
 * - R10.6 — a valid range (`from <= to`) succeeds and the inclusive bounds
 *   are forwarded verbatim to the repository.
 */

import { describe, it, expect, vi } from 'vitest';

import { MetricsService } from '../../src/metrics/metrics-service.js';
import type { MetricsRepository, LeadFact } from '../../src/metrics/metrics-repository.js';

const TEAM = 'team-1';

/**
 * Build a {@link MetricsService} backed by a spy over `loadLeadFacts`. The
 * service only depends on that single method, so a minimal stub suffices.
 */
function makeService(facts: LeadFact[] = []): {
  service: MetricsService;
  loadLeadFacts: ReturnType<typeof vi.fn>;
} {
  const loadLeadFacts = vi.fn(async (): Promise<LeadFact[]> => facts);
  const repo = { loadLeadFacts } as unknown as MetricsRepository;
  return { service: new MetricsService(repo), loadLeadFacts };
}

describe('MetricsService.compute date-range validation', () => {
  it('rejects an inverted range (from > to) without querying the repository (R10.7)', async () => {
    const { service, loadLeadFacts } = makeService();
    const range = {
      from: new Date('2024-02-01T00:00:00Z'),
      to: new Date('2024-01-01T00:00:00Z'),
    };

    const result = await service.compute(TEAM, range);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a failed Result');
    expect(result.error.code).toBe('VALIDATION');
    if (result.error.code !== 'VALIDATION') throw new Error('expected a VALIDATION error');
    expect(result.error.messages).toEqual([
      'rentang tanggal tidak valid: tanggal awal melebihi tanggal akhir',
    ]);
    // R10.7 — current metrics preserved: no load / recompute happened.
    expect(loadLeadFacts).not.toHaveBeenCalled();
  });

  it('accepts a valid range (from <= to) and forwards it to the repository (R10.6)', async () => {
    const facts: LeadFact[] = [
      { status: 'New', source: 'fiverr', discoveredAt: new Date('2024-01-15T00:00:00Z') },
      {
        status: 'Converted',
        source: 'threads',
        discoveredAt: new Date('2024-01-20T00:00:00Z'),
      },
    ];
    const { service, loadLeadFacts } = makeService(facts);
    const range = {
      from: new Date('2024-01-01T00:00:00Z'),
      to: new Date('2024-02-01T00:00:00Z'),
    };

    const result = await service.compute(TEAM, range);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a successful Result');
    expect(result.value.totalLeads).toBe(2);
    expect(result.value.conversionRatePercent).toBe(50);
    // Range forwarded verbatim (inclusive bounds) alongside the teamId.
    expect(loadLeadFacts).toHaveBeenCalledTimes(1);
    expect(loadLeadFacts).toHaveBeenCalledWith(TEAM, range);
  });

  it('treats a single-instant range (from === to) as valid (R10.6)', async () => {
    const { service, loadLeadFacts } = makeService([]);
    const instant = new Date('2024-01-10T12:00:00Z');
    const range = { from: instant, to: instant };

    const result = await service.compute(TEAM, range);

    expect(result.ok).toBe(true);
    expect(loadLeadFacts).toHaveBeenCalledWith(TEAM, range);
  });
});
