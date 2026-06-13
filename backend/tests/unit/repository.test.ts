/**
 * Locks in the SQL shape of `LeadRepository.listForTeam` — specifically
 * that it filters by `team_id = $1` (Tenant Guard, R2.8) and excludes
 * duplicate Leads by default (R6.1, R10.1). The integration-level
 * coverage of pagination and ordering arrives in later sprints; this test
 * is intentionally narrow.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';

import { LeadRepository } from '../../src/repository/lead-repository.js';

/**
 * Synthetic `lead` row. Mirrors the columns the repository selects.
 * Uses ISO strings for timestamps so we can verify the mapper coerces
 * them into `Date`s.
 */
function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    team_id: 'team-1',
    name: 'Acme Co',
    public_contact: 'contact@acme.test',
    profile_url: 'https://acme.test',
    location: 'Jakarta',
    matched_keywords: ['design', 'ui'],
    status: 'New',
    score: 87,
    score_state: 'scored',
    is_duplicate: false,
    duplicate_of: null,
    discovered_at: '2024-01-02T03:04:05.000Z',
    acquired_source: 'fiverr',
    acquired_at: '2024-01-02T03:04:05.000Z',
    ai_intent_score: null,
    ai_insight: null,
    ai_state: 'none',
    ai_unavailable_reason: null,
    ai_analyzed_at: null,
    created_at: '2024-01-02T03:04:05.000Z',
    ...overrides,
  };
}

/** Build a mock pool whose `.query` we can inspect. */
function makeMockPool(rows: ReadonlyArray<Record<string, unknown>>) {
  const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  const pool = { query } as unknown as Pool;
  return { pool, query };
}

describe('LeadRepository.listForTeam', () => {
  it('parameterizes team_id and excludes duplicates by default', async () => {
    const row = makeRow();
    const { pool, query } = makeMockPool([row]);
    const repo = new LeadRepository(pool);

    const leads = await repo.listForTeam('team-1');

    // Verify the SQL shape: WHERE includes `team_id = $1` and the
    // duplicates clause references `is_duplicate = false`. We assert on
    // substrings so trivial whitespace edits don't break the test.
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(typeof sql).toBe('string');
    expect((sql as string).toLowerCase()).toContain('team_id = $1');
    expect((sql as string).toLowerCase()).toContain('is_duplicate = false');

    // Default args: includeDuplicates=false, limit=25, offset=0.
    expect(params).toEqual(['team-1', false, 25, 0]);

    // The synthetic row is mapped through to a domain Lead.
    expect(leads).toHaveLength(1);
    const lead = leads[0]!;
    expect(lead.id).toBe(row.id);
    expect(lead.teamId).toBe('team-1');
    expect(lead.score).toBe(87);
    expect(lead.scoreState).toBe('scored');
    expect(lead.isDuplicate).toBe(false);
    expect(lead.discoveredAt).toBeInstanceOf(Date);
    expect(lead.discoveredAt.toISOString()).toBe('2024-01-02T03:04:05.000Z');
  });
});
