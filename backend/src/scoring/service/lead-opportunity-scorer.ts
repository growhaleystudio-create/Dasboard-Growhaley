import type { LeadOpportunityScore, LeadScoreBreakdown } from '@leads-generator/shared';
import type { Pool } from 'pg';

import { withTransaction, type Tx } from '../../db/transaction.js';
import type { CustomWebsiteAuditor } from '../../audit/custom-website-auditor.js';
import {
  LeadRepository,
  LeadScoringBreakdownRepository,
  LeadWebsiteAuditRepository,
  cachedFromCustom,
  toWebsiteAuditInputV2,
} from '../../repository/index.js';
import { isBusinessWebsiteUrl } from '../../url/business-website.js';
import { computeLeadScoreV2 } from '../v2/index.js';
import { mapLeadToScoreInputV2 } from '../v2/map-lead-input.js';
import type { CachedWebsiteAudit } from '../../repository/lead-website-audit-repository.js';
import type { LeadScoreV2, WebsiteAuditInputV2 } from '../v2/types.js';

/** A cached audit is reused when younger than this many days (else re-audited). */
const AUDIT_FRESHNESS_DAYS = 30;

export interface LeadOpportunityScorerDeps {
  pool?: Pool;
  runInTx?: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  leadReads?: Pick<LeadRepository, 'findById'>;
  leads?: (tx: Tx) => Pick<LeadRepository, 'findById' | 'setScore'>;
  breakdowns?: (tx: Tx) => Pick<LeadScoringBreakdownRepository, 'upsertForLead'>;
  /** Reads a fresh cached audit; defaults to a pool-backed repository. */
  auditsRead?: Pick<LeadWebsiteAuditRepository, 'findFresh'>;
  /** Writes a freshly-run audit into the cache (inside the tx). */
  audits?: (tx: Tx) => Pick<LeadWebsiteAuditRepository, 'upsertForLead'>;
  auditor?: CustomWebsiteAuditor;
}

export class LeadOpportunityScorer {
  constructor(private readonly deps: LeadOpportunityScorerDeps) {}

  private resolveRunInTx(): <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> {
    if (this.deps.runInTx !== undefined) return this.deps.runInTx;
    const pool = this.deps.pool;
    if (!pool) {
      throw new Error('LeadOpportunityScorer requires either `pool` or `runInTx` in its deps');
    }
    return (fn) => withTransaction(pool, fn);
  }

  async recomputeLead(teamId: string, leadId: string): Promise<LeadOpportunityScore> {
    const runInTx = this.resolveRunInTx();
    const makeLeads = this.deps.leads ?? ((tx: Tx) => new LeadRepository(tx));
    const makeBreakdowns =
      this.deps.breakdowns ?? ((tx: Tx) => new LeadScoringBreakdownRepository(tx));
    const makeAudits = this.deps.audits ?? ((tx: Tx) => new LeadWebsiteAuditRepository(tx));

    const leadReader =
      this.deps.leadReads ?? (this.deps.pool ? new LeadRepository(this.deps.pool) : null);
    if (!leadReader) {
      throw new Error('LeadOpportunityScorer requires `pool` or `leadReads` to load leads');
    }

    const lead = await leadReader.findById(teamId, leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    const now = new Date();
    const businessWebsiteUrl = isBusinessWebsiteUrl(lead.profileUrl) ? lead.profileUrl : undefined;

    // Resolve the audit: reuse a fresh cached one (e.g. the Lighthouse audit
    // persisted by AI analysis), else run the custom parser and cache it.
    let auditInput: WebsiteAuditInputV2 | undefined;
    let pendingCacheWrite: CachedWebsiteAudit | undefined;
    if (businessWebsiteUrl) {
      const auditsRead =
        this.deps.auditsRead ??
        (this.deps.pool ? new LeadWebsiteAuditRepository(this.deps.pool) : undefined);
      const cached = auditsRead
        ? await auditsRead.findFresh(teamId, leadId, AUDIT_FRESHNESS_DAYS, now)
        : null;
      if (cached) {
        auditInput = toWebsiteAuditInputV2(cached);
      } else if (this.deps.auditor) {
        const summary = await this.deps.auditor.audit(businessWebsiteUrl);
        pendingCacheWrite = cachedFromCustom(teamId, leadId, summary, now);
        auditInput = toWebsiteAuditInputV2(pendingCacheWrite);
      }
    }

    const scoreInput = mapLeadToScoreInputV2(lead, auditInput ? { audit: auditInput } : {});
    const v2 = computeLeadScoreV2(scoreInput);
    const breakdown = toBreakdown(teamId, leadId, v2, pendingCacheWrite?.source, now);

    await runInTx(async (tx) => {
      await makeLeads(tx).setScore(teamId, leadId, v2.finalScore, 'scored');
      await makeBreakdowns(tx).upsertForLead(breakdown);
      if (pendingCacheWrite) {
        await makeAudits(tx).upsertForLead(pendingCacheWrite);
      }
    });

    return toOpportunityScore(breakdown);
  }
}

/** Map the v2 result onto the persisted breakdown columns (digitalGap → websiteNeed). */
function toBreakdown(
  teamId: string,
  leadId: string,
  v2: LeadScoreV2,
  auditSource: 'lighthouse' | 'custom-parser' | undefined,
  computedAt: Date,
): LeadScoreBreakdown {
  const breakdown: LeadScoreBreakdown = {
    teamId,
    leadId,
    scoringVersion: v2.scoringVersion,
    hasWebsite: v2.hasWebsite,
    businessValueScore: v2.businessValue.score,
    websiteNeedScore: v2.digitalGap.score,
    reachabilityScore: v2.reachability.score,
    confidenceScore: v2.confidence.score,
    confidenceModifier: v2.confidence.multiplier,
    baseScore: v2.baseScore,
    finalScore: v2.finalScore,
    computedAt,
  };
  // The persisted column only permits 'custom-parser'; a Lighthouse source is
  // recorded in `lead_website_audit` instead, so we leave it unset here.
  if (auditSource === 'custom-parser') breakdown.auditSource = 'custom-parser';
  return breakdown;
}

function toOpportunityScore(breakdown: LeadScoreBreakdown): LeadOpportunityScore {
  return {
    businessValueScore: breakdown.businessValueScore,
    websiteNeedScore: breakdown.websiteNeedScore,
    reachabilityScore: breakdown.reachabilityScore,
    confidenceScore: breakdown.confidenceScore,
    confidenceModifier: breakdown.confidenceModifier,
    baseScore: breakdown.baseScore,
    finalScore: breakdown.finalScore,
    hasWebsite: breakdown.hasWebsite,
    breakdown,
  };
}
