import type { LeadScoreBreakdown } from '@leads-generator/shared';

import {
  mapLeadScoreBreakdownRow,
  type LeadScoreBreakdownRow,
} from './mapping.js';
import { query, type DbExecutor } from './types.js';

const LEAD_SCORING_BREAKDOWN_COLUMNS = `
  lead_id,
  team_id,
  scoring_version,
  has_website,
  business_value_score,
  website_need_score,
  reachability_score,
  confidence_score,
  confidence_modifier,
  base_score,
  final_score,
  audit_source,
  computed_at
`;

export class LeadScoringBreakdownRepository {
  constructor(private readonly db: DbExecutor) {}

  async findForLead(teamId: string, leadId: string): Promise<LeadScoreBreakdown | null> {
    const rows = await query<LeadScoreBreakdownRow>(
      this.db,
      `SELECT ${LEAD_SCORING_BREAKDOWN_COLUMNS}
         FROM lead_scoring_breakdown
        WHERE team_id = $1 AND lead_id = $2`,
      [teamId, leadId],
    );
    if (rows.length === 0) return null;
    return mapLeadScoreBreakdownRow(rows[0]!);
  }

  async findForLeads(teamId: string, leadIds: string[]): Promise<Map<string, LeadScoreBreakdown>> {
    if (leadIds.length === 0) {
      return new Map();
    }

    const rows = await query<LeadScoreBreakdownRow>(
      this.db,
      `SELECT ${LEAD_SCORING_BREAKDOWN_COLUMNS}
         FROM lead_scoring_breakdown
        WHERE team_id = $1 AND lead_id = ANY($2::uuid[])`,
      [teamId, leadIds],
    );

    return new Map(rows.map((row) => {
      const breakdown = mapLeadScoreBreakdownRow(row);
      return [breakdown.leadId, breakdown] as const;
    }));
  }

  async upsertForLead(breakdown: LeadScoreBreakdown): Promise<LeadScoreBreakdown> {
    const rows = await query<LeadScoreBreakdownRow>(
      this.db,
      `INSERT INTO lead_scoring_breakdown (
         lead_id,
         team_id,
         scoring_version,
         has_website,
         business_value_score,
         website_need_score,
         reachability_score,
         confidence_score,
         confidence_modifier,
         base_score,
         final_score,
         audit_source,
         computed_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
       )
       ON CONFLICT (lead_id) DO UPDATE
         SET scoring_version = EXCLUDED.scoring_version,
             has_website = EXCLUDED.has_website,
             business_value_score = EXCLUDED.business_value_score,
             website_need_score = EXCLUDED.website_need_score,
             reachability_score = EXCLUDED.reachability_score,
             confidence_score = EXCLUDED.confidence_score,
             confidence_modifier = EXCLUDED.confidence_modifier,
             base_score = EXCLUDED.base_score,
             final_score = EXCLUDED.final_score,
             audit_source = EXCLUDED.audit_source,
             computed_at = EXCLUDED.computed_at
       RETURNING ${LEAD_SCORING_BREAKDOWN_COLUMNS}`,
      [
        breakdown.leadId,
        breakdown.teamId,
        breakdown.scoringVersion,
        breakdown.hasWebsite,
        breakdown.businessValueScore,
        breakdown.websiteNeedScore,
        breakdown.reachabilityScore,
        breakdown.confidenceScore,
        breakdown.confidenceModifier,
        breakdown.baseScore,
        breakdown.finalScore,
        breakdown.auditSource ?? null,
        breakdown.computedAt,
      ],
    );
    return mapLeadScoreBreakdownRow(rows[0]!);
  }
}
