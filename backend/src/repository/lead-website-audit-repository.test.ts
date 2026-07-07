import { describe, expect, it } from 'vitest';

import {
  LeadWebsiteAuditRepository,
  toWebsiteAuditInputV2,
  type CachedWebsiteAudit,
} from './lead-website-audit-repository.js';
import type { DbExecutor } from './types.js';

interface Call {
  sql: string;
  params: unknown[] | undefined;
}

/** Minimal DbExecutor stub that records calls and returns canned rows. */
function fakeDb(rows: unknown[]): { db: DbExecutor; calls: Call[] } {
  const calls: Call[] = [];
  const db = {
    query: (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows });
    },
  } as unknown as DbExecutor;
  return { db, calls };
}

const lighthouseRow = {
  lead_id: 'lead-1',
  team_id: 'team-1',
  audit_source: 'lighthouse',
  status: 'ok',
  performance_score: 34,
  seo_score: 58,
  accessibility_score: 61,
  best_practices_score: 70,
  conversion: { hasContactChannel: true, hasCta: true, hasContactForm: false },
  fallback: null,
  core_web_vitals: { lcpMs: 6200, tbtMs: 1340, cls: 0.41 },
  computed_at: new Date('2026-07-01T00:00:00.000Z'),
};

describe('LeadWebsiteAuditRepository.findForLead', () => {
  it('reconstructs a Lighthouse cache row', async () => {
    const { db } = fakeDb([lighthouseRow]);
    const repo = new LeadWebsiteAuditRepository(db);

    const cache = await repo.findForLead('team-1', 'lead-1');
    expect(cache?.source).toBe('lighthouse');
    expect(cache?.lighthouse).toEqual({
      performance: 34,
      seo: 58,
      accessibility: 61,
      bestPractices: 70,
    });
    expect(cache?.coreWebVitals?.lcpMs).toBe(6200);
    // The reconstructed scorer input drops CWV (scoring doesn't use it).
    const input = toWebsiteAuditInputV2(cache!);
    expect(input.lighthouse?.performance).toBe(34);
    expect(input).not.toHaveProperty('coreWebVitals');
  });

  it('returns null when no row exists', async () => {
    const { db } = fakeDb([]);
    const repo = new LeadWebsiteAuditRepository(db);
    expect(await repo.findForLead('team-1', 'lead-x')).toBeNull();
  });
});

describe('LeadWebsiteAuditRepository.findFresh', () => {
  it('returns the cache when younger than maxAgeDays', async () => {
    const { db } = fakeDb([lighthouseRow]);
    const repo = new LeadWebsiteAuditRepository(db);
    const now = new Date('2026-07-10T00:00:00.000Z'); // 9 days later
    expect(await repo.findFresh('team-1', 'lead-1', 30, now)).not.toBeNull();
  });

  it('returns null when older than maxAgeDays', async () => {
    const { db } = fakeDb([lighthouseRow]);
    const repo = new LeadWebsiteAuditRepository(db);
    const now = new Date('2026-09-01T00:00:00.000Z'); // 62 days later
    expect(await repo.findFresh('team-1', 'lead-1', 30, now)).toBeNull();
  });
});

describe('LeadWebsiteAuditRepository.upsertForLead', () => {
  it('serializes JSON columns and passes null Lighthouse scores for the parser path', async () => {
    const { db, calls } = fakeDb([]);
    const repo = new LeadWebsiteAuditRepository(db);
    const cache: CachedWebsiteAudit = {
      teamId: 'team-1',
      leadId: 'lead-2',
      source: 'custom-parser',
      status: 'parked',
      conversion: { hasContactChannel: false, hasCta: false, hasContactForm: false },
      fallbackSeo: {
        hasTitle: true,
        hasMetaDescription: false,
        hasCanonical: false,
        h1Count: 0,
        hasRobotsTxt: false,
        hasSitemap: false,
      },
      computedAt: new Date('2026-07-01T00:00:00.000Z'),
    };

    await repo.upsertForLead(cache);

    const params = calls[0]!.params!;
    expect(params[2]).toBe('custom-parser'); // audit_source
    expect(params[4]).toBeNull(); // performance_score (no lighthouse)
    expect(typeof params[8]).toBe('string'); // conversion serialized
    expect(typeof params[9]).toBe('string'); // fallback serialized
    expect(params[10]).toBeNull(); // no core web vitals
  });
});
