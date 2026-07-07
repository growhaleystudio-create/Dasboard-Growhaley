import type { AIState, Result } from '@leads-generator/shared';
import { err, ok } from '@leads-generator/shared';
import type { Queue } from 'bullmq';

import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';
import type { LeadRepository } from '../repository/lead-repository.js';
import type { LeadOpportunityScorer } from '../scoring/service/lead-opportunity-scorer.js';
import type { AiAnalysisJobData } from './ai-worker.js';
import { enqueueAiAnalysis } from './ai-worker.js';

export interface LeadAnalysisServiceDeps {
  leads: Pick<LeadRepository, 'findById' | 'setAiResult'>;
  settings: TeamAiSettingsService;
  queue: Queue<AiAnalysisJobData>;
  scorer: Pick<LeadOpportunityScorer, 'recomputeLead'>;
}

export class LeadAnalysisService {
  constructor(private readonly deps: LeadAnalysisServiceDeps) {}

  async recomputeScore(
    teamId: string,
    leadId: string,
  ): Promise<Result<{ leadId: string; scoringState: 'completed' }>> {
    const lead = await this.deps.leads.findById(teamId, leadId);
    if (!lead) {
      return err({ code: 'NOT_FOUND', message: `Lead not found: ${leadId}` });
    }

    try {
      await this.deps.scorer.recomputeLead(teamId, leadId);
      return ok({ leadId, scoringState: 'completed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'score_recompute_failed';
      return err({
        code: 'INTERNAL',
        message: `Gagal menghitung ulang score lead: ${message}`,
      });
    }
  }

  async regenerateAiInsight(
    teamId: string,
    leadId: string,
    actorId: string,
  ): Promise<Result<{ leadId: string; aiState: AIState }>> {
    const lead = await this.deps.leads.findById(teamId, leadId);
    if (!lead) {
      return err({ code: 'NOT_FOUND', message: `Lead not found: ${leadId}` });
    }

    let apiKey: string | null;
    try {
      apiKey = await this.deps.settings.loadApiKey(teamId, 'leads');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'credential_decryption_failed';
      if (message.includes('credential decryption failed')) {
        return err({
          code: 'VALIDATION',
          messages: [
            'API Key AI yang tersimpan tidak bisa dibaca dengan master key server saat ini. Simpan ulang API key AI di Settings, atau jalankan server dengan MASTER_ENCRYPTION_KEY yang sama seperti saat key itu disimpan.',
          ],
        });
      }
      return err({
        code: 'INTERNAL',
        message: `Gagal membaca API key AI: ${message}`,
      });
    }
    if (!apiKey) {
      return err({ code: 'VALIDATION', messages: ['API Key AI belum dikonfigurasi'] });
    }

    await this.deps.leads.setAiResult(teamId, leadId, null, null, 'pending');

    try {
      await enqueueAiAnalysis(this.deps.queue, {
        teamId,
        leadId,
        trigger: 'manual',
        actorId,
        action: 'regenerate_ai_insight',
      });
    } catch (error) {
      await this.deps.leads.setAiResult(
        teamId,
        leadId,
        null,
        null,
        'unavailable',
        'provider_error',
      );
      const message = error instanceof Error ? error.message : 'ai_queue_unavailable';
      if (message === 'ai_queue_unavailable_in_development') {
        return err({
          code: 'VALIDATION',
          messages: [
            'AI analysis queue belum aktif di environment ini. Jalankan Redis + worker backend untuk generate insight manual.',
          ],
        });
      }
      return err({
        code: 'INTERNAL',
        message: `Gagal memasukkan job AI insight ke queue: ${message}`,
      });
    }

    return ok({ leadId, aiState: 'pending' });
  }
}
