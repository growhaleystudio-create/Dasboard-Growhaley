/**
 * Unit tests for the empty filter result of {@link LeadQueryService.list}
 * (Task 14.8, R9.6).
 *
 * When a filter matches no Lead, `list` returns a successful page with an
 * empty `items` array and `total === 0`. The caller (UI) renders the
 * "tidak ada Lead yang cocok" message off this empty result; these tests
 * assert the service produces exactly that empty page.
 */

import { describe, it, expect } from 'vitest';
import type { Lead } from '@leads-generator/shared';

import { LEAD_PAGE_SIZE, LeadQueryService } from '../../src/lead-query/lead-query-service.js';
import type { LeadFilter } from '../../src/lead-query/lead-filter.js';
import type { LeadRepository } from '../../src/repository/lead-repository.js';

function makeLead(id: string, overrides: Partial<Lead> = {}): Lead {
  return {
    id,
    teamId: 'team-1',
    name: 'Alice',
    publicContact: 'alice@example.com',
    location: 'NYC',
    matchedKeywords: [],
    status: 'New',
    score: 50,
    scoreState: 'scored',
    isDuplicate: false,
    acquiredSource: 'google',
    discoveredAt: new Date(0),
    aiIntentScore: null,
    aiState: 'none',
    createdAt: new Date(0),
    ...overrides,
  };
}

function fakeRepo(leads: readonly Lead[]): LeadRepository {
  return {
    async listForTeam(): Promise<Lead[]> {
      return [...leads];
    },
  } as unknown as LeadRepository;
}

describe('LeadQueryService.list empty result (R9.6)', () => {
  it('returns an empty page (total 0) when the search matches no Lead', async () => {
    const service = new LeadQueryService(fakeRepo([makeLead('l1'), makeLead('l2')]));
    const filter: LeadFilter = { search: 'no-such-substring' };

    const res = await service.list('team-1', filter, 0);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.items).toEqual([]);
    expect(res.value.total).toBe(0);
    expect(res.value.page).toBe(0);
    expect(res.value.pageSize).toBe(LEAD_PAGE_SIZE);
  });

  it('returns an empty page when the score range excludes every Lead', async () => {
    const service = new LeadQueryService(
      fakeRepo([makeLead('l1', { score: 10 }), makeLead('l2', { score: 20 })]),
    );
    // Valid range (R9.8) that no Lead falls into.
    const filter: LeadFilter = { scoreMin: 90, scoreMax: 100 };

    const res = await service.list('team-1', filter, 0);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.items).toEqual([]);
    expect(res.value.total).toBe(0);
  });

  it('returns an empty page when the Team has no Leads at all', async () => {
    const service = new LeadQueryService(fakeRepo([]));

    const res = await service.list('team-1', {}, 0);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.items).toEqual([]);
    expect(res.value.total).toBe(0);
  });
});
