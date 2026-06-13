import type { AIState, AIUnavailableReason } from '@leads-generator/shared';
import type { Pool } from 'pg';
import type { Tx } from '../db/transaction.js';
import { withTransaction } from '../db/transaction.js';

import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';
import type { AiBudgetTracker } from './ai-budget-tracker.js';
import { type AiProvider, AiProviderError } from './gemini-client.js';
import { buildPublicLeadSnapshot, type SnapshotSourceLead } from './public-lead-snapshot.js';

import type { LeadRepository } from '../repository/lead-repository.js';
import type { AuditLog } from '../privacy/audit-log.js';
import type { ScoringModelRepository } from '../repository/scoring-model-repository.js';
import { computeScore } from '../scoring/compute-score.js';
import { ScoreContributionRepository } from '../scoring/score-contribution-repository.js';
import type { ScorableProjector } from '../scoring/recompute.js';
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
  audit: Pick<AuditLog, 'recordTx'>;
  models: Pick<ScoringModelRepository, 'getForTeam'>;
  
  txLeads?: (tx: Tx) => Pick<LeadRepository, 'setAiResult' | 'setScore'>;
  txContributions?: (tx: Tx) => Pick<ScoreContributionRepository, 'replaceForLead'>;
  websiteAuditor?: WebsiteAuditor;
  
  projectScorable: ScorableProjector;
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
    const source = lead.acquiredSource ?? inferSourceFromUrl(lead.profileUrl);
    if (source) snapshotFields.source = source;
    if (lead.name) snapshotFields.name = lead.name;
    if (lead.publicContact) snapshotFields.publicContact = lead.publicContact;
    if (lead.profileUrl && isBusinessWebsiteUrl(lead.profileUrl)) snapshotFields.profileUrl = lead.profileUrl;
    if (lead.location) snapshotFields.location = lead.location;

    const websiteAudit = lead.profileUrl && isBusinessWebsiteUrl(lead.profileUrl)
      ? await (this.deps.websiteAuditor ?? new LighthouseWebsiteAuditor()).audit(lead.profileUrl)
      : undefined;

    const snapshot = buildPublicLeadSnapshot(snapshotFields, {
      ...(websiteAudit !== undefined ? { websiteAudit } : {}),
    });

    const provider = this.deps.providerFactory(apiKey, apiBaseUrl, settings.textModel);
    
    try {
      const result = await provider.analyze(snapshot);
      
      // Success path
      return await runInTx(async (tx) => {
        // Late bind to avoid circular dependency in tests if missing
        const txLeads = this.deps.txLeads 
          ? this.deps.txLeads(tx) 
          : new (await import('../repository/lead-repository.js')).LeadRepository(tx);
          
        await txLeads.setAiResult(teamId, leadId, result.intentScore, result.insight, 'success');
        
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
        metadata: { trigger, outcome: 'success', tokenUsage: result.tokenUsage }
        });
        
        // Recompute score inline if model exists
        const model = await this.deps.models.getForTeam(teamId);
        if (model && model.factors.length > 0) {
          const scorable = await this.deps.projectScorable(leadId);
          if (scorable) {
            scorable.aiIntentScore = result.intentScore; 
            const scoreResult = computeScore(scorable, model.factors);
            if (scoreResult.state === 'scored' && scoreResult.score !== null) {
              await txLeads.setScore(teamId, leadId, scoreResult.score, 'scored');
              const txContributions = this.deps.txContributions
                ? this.deps.txContributions(tx)
                : new ScoreContributionRepository();
              await txContributions.replaceForLead(tx, leadId, model.version, scoreResult.contributions);
            }
          }
        }
        
        return {
          leadId,
          aiState: 'success',
          aiIntentScore: result.intentScore,
          aiInsight: result.insight
        };
      });
      
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

function isBusinessWebsiteUrl(value: string): boolean {
  return !(
    /^https?:\/\/(?:www\.)?openstreetmap\.org\//i.test(value) ||
    /instagram\.com|facebook\.com|fb\.com|threads\.net|linkedin\.com/i.test(value)
  );
}

function inferSourceFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/instagram\.com/i.test(value)) return 'instagram';
  if (/facebook\.com|fb\.com/i.test(value)) return 'facebook';
  if (/threads\.net/i.test(value)) return 'threads';
  if (/linkedin\.com/i.test(value)) return 'linkedin';
  if (/openstreetmap\.org/i.test(value)) return 'openstreetmap';
  return undefined;
}
