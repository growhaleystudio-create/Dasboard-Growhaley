import { describe, expect, it, vi } from 'vitest';
import type { Lead } from '@leads-generator/shared';

import { backfillLeadScoringBreakdowns } from '../../src/scoring/backfill-lead-scoring-breakdowns.js';
import type { BackfillLeadScoringBreakdownsDeps } from '../../src/scoring/backfill-lead-scoring-breakdowns.js';

function makeLeadReader(ids: readonly string[]) {
  return {
    async listForTeam(_teamId: string, opts: { limit?: number; offset?: number } = {}): Promise<Lead[]> {
      const limit = opts.limit ?? 25;
      const offset = opts.offset ?? 0;
      return ids.slice(offset, offset + limit).map((id) => ({ id }) as Lead);
    },
  };
}

describe('backfillLeadScoringBreakdowns', () => {
  it('collects canonical leads in pages of 500 and recomputes each lead once', async () => {
    const ids = Array.from({ length: 1200 }, (_, index) => `lead-${index}`);
    const listSpy = vi.fn(makeLeadReader(ids).listForTeam);
    const recomputeLead = vi.fn(async () => undefined);

    const deps: BackfillLeadScoringBreakdownsDeps = {
      leads: { listForTeam: listSpy },
      scorer: { recomputeLead },
    };

    const report = await backfillLeadScoringBreakdowns(deps, 'team-1');

    expect(report).toEqual({ total: 1200, recomputed: 1200, failed: 0 });
    expect(recomputeLead).toHaveBeenCalledTimes(1200);
    expect(listSpy.mock.calls.map((call) => call[1]?.offset)).toEqual([0, 500, 1000]);
  });

  it('continues after per-lead failures and counts them in the report', async () => {
    const ids = ['lead-1', 'lead-2', 'lead-3'];
    const recomputeLead = vi.fn(async (_teamId: string, leadId: string) => {
      if (leadId === 'lead-2') {
        throw new Error('boom');
      }
    });

    const report = await backfillLeadScoringBreakdowns(
      {
        leads: makeLeadReader(ids),
        scorer: { recomputeLead },
      },
      'team-1',
    );

    expect(report).toEqual({ total: 3, recomputed: 2, failed: 1 });
    expect(recomputeLead.mock.calls.map((call) => call[1])).toEqual(ids);
  });
});
