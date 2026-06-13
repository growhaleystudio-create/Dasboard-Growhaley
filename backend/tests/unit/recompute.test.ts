/**
 * Unit tests for {@link recomputeForTeam} (Task 10.9, R7.3, R7.10).
 *
 * These example-based tests complement the Property 7 PBT
 * (`tests/property/recompute-isolation.test.ts`) by pinning specific
 * behaviours:
 * - multi-page collection via `listForTeam` (page size 500),
 * - the report counts (`recomputed` + `preservedOnFailure` === total),
 * - the "unscored result preserves previous score" nuance,
 * - rollback semantics under the REAL `withTransaction` (via a fake Pool).
 */

import { describe, it, expect, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import type { Lead, ScoringFactor, ScoringModel } from '@leads-generator/shared';

import { recomputeForTeam } from '../../src/scoring/index.js';
import type {
  RecomputeDeps,
  ScorableLead,
  TxContributionWriter,
  TxLeadWriter,
} from '../../src/scoring/index.js';
import type { LeadRepository } from '../../src/repository/lead-repository.js';

const TEAM = 'team-1';
const REF = new Date('2024-01-01T00:00:00.000Z');

function scoredModel(version = 1): ScoringModel {
  const factors: ScoringFactor[] = [{ id: 'contact', kind: 'has_contact', weight: 1 }];
  return { teamId: TEAM, version, factors };
}

/** A scorable Lead that scores 100 (has_contact present) under scoredModel. */
function scorable(): ScorableLead {
  return {
    teamId: TEAM,
    matchedKeywords: [],
    sources: [],
    publicContact: 'a@example.com',
    discoveredAt: REF,
    referenceTime: REF,
    aiIntentScore: null,
  };
}

function makeLeadReader(ids: readonly string[]): Pick<LeadRepository, 'listForTeam'> {
  return {
    async listForTeam(_teamId, opts = {}): Promise<Lead[]> {
      const limit = opts.limit ?? 25;
      const offset = opts.offset ?? 0;
      return ids.slice(offset, offset + limit).map((id) => ({ id }) as unknown as Lead);
    },
  };
}

describe('recomputeForTeam', () => {
  it('pages through all canonical Leads (page size 500) and recomputes each', async () => {
    // 1200 leads → 3 pages (500, 500, 200).
    const ids = Array.from({ length: 1200 }, (_, i) => `lead-${i}`);
    const listSpy = vi.fn(makeLeadReader(ids).listForTeam);

    const committed = new Map<string, number | null>();
    const deps: RecomputeDeps = {
      leads: { listForTeam: listSpy },
      project: async () => scorable(),
      runInTx: async (fn) => fn({} as PoolClient),
      txLeads: (): TxLeadWriter => ({
        async setScore(_t, leadId, score): Promise<void> {
          committed.set(leadId, score);
        },
      }),
      txContributions: (): TxContributionWriter => ({
        async replaceForLead(): Promise<void> {},
      }),
    };

    const report = await recomputeForTeam(deps, TEAM, scoredModel());

    expect(report).toEqual({ recomputed: 1200, preservedOnFailure: 0 });
    expect(committed.size).toBe(1200);
    expect([...committed.values()].every((s) => s === 100)).toBe(true);
    // Page offsets: 0, 500, 1000, then a 4th call only if the 3rd page was
    // full; the 3rd page had 200 (< 500) so collection stops at 3 reads.
    expect(listSpy.mock.calls.map((c) => c[1]?.offset)).toEqual([0, 500, 1000]);
  });

  it('preserves the previous score when the new result is unscored (empty model)', async () => {
    const deps: RecomputeDeps = {
      leads: makeLeadReader(['lead-0']),
      project: async () => scorable(),
      runInTx: async (fn) => fn({} as PoolClient),
      txLeads: (): TxLeadWriter => ({
        async setScore(): Promise<void> {
          throw new Error('setScore must not be called for an unscored result');
        },
      }),
      txContributions: (): TxContributionWriter => ({
        async replaceForLead(): Promise<void> {
          throw new Error('replaceForLead must not be called for an unscored result');
        },
      }),
    };

    // Empty model → computeScore returns unscored → previous score preserved.
    const emptyModel: ScoringModel = { teamId: TEAM, version: 2, factors: [] };
    const report = await recomputeForTeam(deps, TEAM, emptyModel);

    // The Lead is still counted as processed (its tx committed a no-op).
    expect(report).toEqual({ recomputed: 1, preservedOnFailure: 0 });
  });

  it('leaves a Lead unchanged when the projector returns null', async () => {
    let setScoreCalled = false;
    const deps: RecomputeDeps = {
      leads: makeLeadReader(['lead-0']),
      project: async () => null,
      runInTx: async (fn) => fn({} as PoolClient),
      txLeads: (): TxLeadWriter => ({
        async setScore(): Promise<void> {
          setScoreCalled = true;
        },
      }),
      txContributions: (): TxContributionWriter => ({
        async replaceForLead(): Promise<void> {},
      }),
    };

    const report = await recomputeForTeam(deps, TEAM, scoredModel());
    expect(report).toEqual({ recomputed: 1, preservedOnFailure: 0 });
    expect(setScoreCalled).toBe(false);
  });

  it('isolates per-Lead failures and rolls back via the real withTransaction', async () => {
    // Drive recompute through the REAL withTransaction by supplying a fake
    // Pool. The failing Lead's INSERT throws AFTER the score UPDATE, so the
    // transaction must ROLLBACK — proving previous-score preservation.
    const ids = ['ok-1', 'fail-2', 'ok-3'];

    const sqlLog: { leadId: string; sql: string }[] = [];

    // A fake client whose query records statements and throws for the
    // failing Lead's contribution insert.
    function makeClient(): PoolClient {
      let currentLead: string | null = null;
      const query = vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          if (currentLead) sqlLog.push({ leadId: currentLead, sql });
          return { rows: [], rowCount: 0 };
        }
        // Only the score UPDATE identifies the current Lead: its SQL binds
        // team_id=$1, id=$2 (so $2 is the leadId), and it is always the
        // first parameterized write per tx. The contribution DELETE/INSERT
        // that follow bind a different param shape ($2 is the model_version
        // on the INSERT), so they must NOT re-derive `currentLead` — doing
        // so would clobber it and mis-attribute the trailing COMMIT.
        if (sql.includes('UPDATE lead')) {
          const leadId = (params?.[1] as string) ?? '';
          currentLead = leadId;
          sqlLog.push({ leadId, sql: 'UPDATE' });
        } else if (sql.includes('DELETE FROM score_contribution')) {
          // First statement of replaceForLead — fail here for fail-2.
          if (currentLead === 'fail-2') {
            throw new Error('injected contribution write failure');
          }
          sqlLog.push({ leadId: currentLead ?? '', sql: 'DELETE' });
        }
        return { rows: [], rowCount: 0 };
      });
      return { query, release: vi.fn() } as unknown as PoolClient;
    }

    const pool = { connect: vi.fn(async () => makeClient()) } as unknown as Pool;

    const deps: RecomputeDeps = {
      pool,
      leads: makeLeadReader(ids),
      project: async () => scorable(),
      // Use the default txLeads / txContributions (real repositories) so the
      // real SQL flows through the fake client.
    };

    const report = await recomputeForTeam(deps, TEAM, scoredModel());

    expect(report).toEqual({ recomputed: 2, preservedOnFailure: 1 });

    // ok-1 and ok-3 committed; fail-2 rolled back.
    const byLead = (id: string): string[] =>
      sqlLog.filter((e) => e.leadId === id).map((e) => e.sql);
    expect(byLead('ok-1')).toContain('COMMIT');
    expect(byLead('ok-3')).toContain('COMMIT');
    expect(byLead('fail-2')).toContain('ROLLBACK');
    expect(byLead('fail-2')).not.toContain('COMMIT');
  });
});
