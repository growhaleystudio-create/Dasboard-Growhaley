import type { AIState, AIUnavailableReason } from '@leads-generator/shared';
import type { Pool } from 'pg';
import type { Tx } from '../db/transaction.js';
import { withTransaction } from '../db/transaction.js';

import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';
import type { AiBudgetTracker } from './ai-budget-tracker.js';
import { type AiProvider, AiProviderError } from './ai-text-provider-client.js';
import { buildPublicLeadSnapshot, type SnapshotSourceLead } from './public-lead-snapshot.js';

import type { LeadRepository } from '../repository/lead-repository.js';
import type { LeadScoringBreakdownRepository } from '../repository/lead-scoring-breakdown-repository.js';
import {
  LeadWebsiteAuditRepository,
  cachedFromLighthouse,
} from '../repository/lead-website-audit-repository.js';
import type { LeadOpportunityScorer } from '../scoring/service/lead-opportunity-scorer.js';
import type { AuditLog } from '../privacy/audit-log.js';
import { inferSourceFromProfileUrl, isBusinessWebsiteUrl } from '../url/business-website.js';
import { LighthouseWebsiteAuditor, type WebsiteAuditor } from './lighthouse-website-auditor.js';

export interface AiAnalyzeResult {
  leadId: string;
  aiState: AIState;
  aiIntentScore: number | null;
  aiInsight: string | null;
  aiUnavailableReason?: AIUnavailableReason;
}

export interface AiAnalyzerServiceDeps {
  pool?: Pool;
  runInTx?: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

  settings: TeamAiSettingsService;
  budget: AiBudgetTracker;
  providerFactory: (apiKey: string, apiBaseUrl: string, model: string) => AiProvider;

  leads: Pick<LeadRepository, 'findById'>;
  breakdowns?: Pick<LeadScoringBreakdownRepository, 'findForLead'>;
  audit: Pick<AuditLog, 'recordTx'>;

  txLeads?: (tx: Tx) => Pick<LeadRepository, 'setAiResult' | 'applyAttributePatch'>;
  websiteAuditor?: WebsiteAuditor;
  /** Persists the Lighthouse audit so the scorer reuses it (no second run). */
  websiteAudits?: (tx: Tx) => Pick<LeadWebsiteAuditRepository, 'upsertForLead'>;
  /** Rescored after analysis so the lead score reflects the fresh audit. */
  scorer?: Pick<LeadOpportunityScorer, 'recomputeLead'>;
}

export class AiAnalyzerService {
  constructor(private readonly deps: AiAnalyzerServiceDeps) {}
  
  private resolveRunInTx(): <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> {
    if (this.deps.runInTx !== undefined) return this.deps.runInTx;
    const pool = this.deps.pool;
    if (pool === undefined) {
      throw new Error('AiAnalyzerService requires either `pool` or `runInTx` in its deps');
    }
    return (fn) => withTransaction(pool, fn);
  }

  async analyzeLead(
    teamId: string, 
    leadId: string, 
    trigger: 'scan' | 'manual', 
    actorId = 'system'
  ): Promise<AiAnalyzeResult> {
    const runInTx = this.resolveRunInTx();
    
    // Check key & budget first before marking as pending
    const settings = await this.deps.settings.getSettings(teamId);
    const apiKey = await this.deps.settings.loadApiKey(teamId, 'leads');
    if (!apiKey) {
      return this.handleFailure(teamId, leadId, trigger, 'no_api_key', actorId);
    }
    const apiBaseUrl = await this.deps.settings.loadApiBaseUrl(teamId, 'leads');
    
    const budgetCheck = await this.deps.budget.canCall(teamId);
    if (!budgetCheck.allowed) {
      return this.handleFailure(teamId, leadId, trigger, budgetCheck.reason ?? 'budget_exceeded', actorId);
    }

    const lead = await this.deps.leads.findById(teamId, leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    // Since we use background workers, we just need to use what's stored on the Lead.
    // If we wanted postSnippet, we'd have needed to store it or fetch it again. 
    // R13.7 allows it if we had it, but Lead doesn't store it, so we omit.
    const snapshotFields: SnapshotSourceLead = { matchedKeywords: lead.matchedKeywords };
    const source = lead.acquiredSource ?? inferSourceFromProfileUrl(lead.profileUrl);
    if (source) snapshotFields.source = source;
    if (lead.name) snapshotFields.name = lead.name;
    if (lead.publicContact) snapshotFields.publicContact = lead.publicContact;
    if (lead.profileUrl && isBusinessWebsiteUrl(lead.profileUrl)) snapshotFields.profileUrl = lead.profileUrl;
    if (lead.location) snapshotFields.location = lead.location;

    const websiteAudit = lead.profileUrl && isBusinessWebsiteUrl(lead.profileUrl)
      ? await (this.deps.websiteAuditor ?? new LighthouseWebsiteAuditor()).audit(lead.profileUrl)
      : undefined;

    const scoringBreakdown = this.deps.breakdowns
      ? await this.deps.breakdowns.findForLead(teamId, leadId)
      : null;

    const businessProfile = lead.auditAttributes
      ? {
          ...(lead.auditAttributes.rating !== undefined
            ? { rating: lead.auditAttributes.rating }
            : {}),
          ...(lead.auditAttributes.reviewCount !== undefined
            ? { reviewCount: lead.auditAttributes.reviewCount }
            : {}),
          ...(lead.auditAttributes.category !== undefined
            ? { category: lead.auditAttributes.category }
            : {}),
        }
      : undefined;

    const snapshot = buildPublicLeadSnapshot(snapshotFields, {
      ...(businessProfile && Object.keys(businessProfile).length > 0 ? { businessProfile } : {}),
      ...(websiteAudit !== undefined ? { websiteAudit } : {}),
      ...(scoringBreakdown !== null
        ? {
            scoringBreakdown: {
              businessValueScore: scoringBreakdown.businessValueScore,
              websiteNeedScore: scoringBreakdown.websiteNeedScore,
              reachabilityScore: scoringBreakdown.reachabilityScore,
              confidenceScore: scoringBreakdown.confidenceScore,
              confidenceModifier: scoringBreakdown.confidenceModifier,
              baseScore: scoringBreakdown.baseScore,
              finalScore: scoringBreakdown.finalScore,
              hasWebsite: scoringBreakdown.hasWebsite,
              scoringVersion: scoringBreakdown.scoringVersion,
            },
          }
        : {}),
    });


    const provider = this.deps.providerFactory(apiKey, apiBaseUrl, settings.textModel);
    
    try {
      const result = await provider.analyze(snapshot);
      
      // Success path
      const analyzeResult = await runInTx(async (tx): Promise<AiAnalyzeResult> => {
        // Late bind to avoid circular dependency in tests if missing
        const txLeads = this.deps.txLeads
          ? this.deps.txLeads(tx)
          : new (await import('../repository/lead-repository.js')).LeadRepository(tx);

        await txLeads.setAiResult(teamId, leadId, null, result.insight, 'success');

        // Cache the Lighthouse audit so the scorer reuses it (no second run)
        // and the score's SEO/UX/Performance match what AI analysis saw.
        if (websiteAudit && websiteAudit.status !== 'not_applicable_no_website') {
          const makeAudits =
            this.deps.websiteAudits ?? ((t: Tx) => new LeadWebsiteAuditRepository(t));
          await makeAudits(tx).upsertForLead(
            cachedFromLighthouse(teamId, leadId, websiteAudit, new Date()),
          );
        }

        if (websiteAudit?.whatsappUrl || websiteAudit?.whatsappNumber) {
          await txLeads.applyAttributePatch(teamId, leadId, {
            ...(websiteAudit.whatsappUrl ? { whatsappUrl: websiteAudit.whatsappUrl } : {}),
            ...(websiteAudit.whatsappNumber ? { whatsappNumber: websiteAudit.whatsappNumber } : {}),
          });
        }

        await this.deps.budget.recordCall(tx, {
          teamId,
          leadId,
          trigger,
          outcome: 'success',
          promptTokens: result.tokenUsage.promptTokens,
          outputTokens: result.tokenUsage.outputTokens,
          totalTokens: result.tokenUsage.totalTokens,
        });

        await this.deps.audit.recordTx(tx, {
          teamId,
          actorId,
          action: 'ai_call',
          objectType: 'lead',
          objectId: leadId,
          metadata: {
            trigger,
            outcome: 'success',
            tokenUsage: result.tokenUsage,
            mode: 'explainer_only',
          },
        });

        return {
          leadId,
          aiState: 'success',
          aiIntentScore: null,
          aiInsight: result.insight,
        };
      });

      // Rescore now that the Lighthouse audit is cached — best-effort so a
      // scoring hiccup never fails an otherwise-successful AI analysis.
      if (this.deps.scorer) {
        try {
          await this.deps.scorer.recomputeLead(teamId, leadId);
        } catch (scoreError) {
          console.error(`Rescore after AI analysis failed for lead ${leadId}:`, scoreError);
        }
      }

      return analyzeResult;

    } catch (e: unknown) {
      // Handle known failure reasons
      let reason: AIUnavailableReason = 'provider_error';
      if (e instanceof AiProviderError) {
        reason = e.reason;
      } else if (e instanceof Error) {
        if (e.message === 'timeout' || e.message === 'provider_error' || e.message === 'malformed_output' || e.message === 'quota_exceeded') {
          reason = e.message as AIUnavailableReason;
        }
      }
        
      return this.handleFailure(teamId, leadId, trigger, reason, actorId);
    }
  }
  
  private async handleFailure(
    teamId: string, 
    leadId: string, 
    trigger: 'scan' | 'manual', 
    reason: AIUnavailableReason,
    actorId: string
  ): Promise<AiAnalyzeResult> {
    const runInTx = this.resolveRunInTx();
    
    return runInTx(async (tx) => {
      const txLeads = this.deps.txLeads 
        ? this.deps.txLeads(tx) 
        : new (await import('../repository/lead-repository.js')).LeadRepository(tx);
        
      await txLeads.setAiResult(teamId, leadId, null, null, 'unavailable', reason);
      
      await this.deps.budget.recordCall(tx, { teamId, leadId, trigger, outcome: reason });
      
      await this.deps.audit.recordTx(tx, {
        teamId,
        actorId,
        action: 'ai_call',
        objectType: 'lead',
        objectId: leadId,
        metadata: { trigger, outcome: reason, reason }
      });
      
      return {
        leadId,
        aiState: 'unavailable',
        aiIntentScore: null,
        aiInsight: null,
        aiUnavailableReason: reason
      };
    });
  }
}

