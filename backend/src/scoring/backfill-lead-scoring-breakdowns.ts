import type { Pool } from 'pg';

import type { LeadRepository } from '../repository/lead-repository.js';
import type { LeadOpportunityScorer } from './service/lead-opportunity-scorer.js';

const PAGE_SIZE = 500;

export interface BackfillLeadScoringBreakdownsReport {
  total: number;
  recomputed: number;
  failed: number;
}

export interface BackfillLeadScoringBreakdownsDeps {
  pool?: Pool;
  leads: Pick<LeadRepository, 'listForTeam'>;
  scorer: Pick<LeadOpportunityScorer, 'recomputeLead'>;
}

async function collectCanonicalLeadIds(
  deps: BackfillLeadScoringBreakdownsDeps,
  teamId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;

  for (;;) {
    const page = await deps.leads.listForTeam(teamId, {
      includeDuplicates: false,
      limit: PAGE_SIZE,
      offset,
    });

    for (const lead of page) {
      ids.push(lead.id);
    }

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return ids;
}

export async function backfillLeadScoringBreakdowns(
  deps: BackfillLeadScoringBreakdownsDeps,
  teamId: string,
): Promise<BackfillLeadScoringBreakdownsReport> {
  const leadIds = await collectCanonicalLeadIds(deps, teamId);

  const report: BackfillLeadScoringBreakdownsReport = {
    total: leadIds.length,
    recomputed: 0,
    failed: 0,
  };

  for (const leadId of leadIds) {
    try {
      await deps.scorer.recomputeLead(teamId, leadId);
      report.recomputed += 1;
    } catch {
      report.failed += 1;
    }
  }

  return report;
}
