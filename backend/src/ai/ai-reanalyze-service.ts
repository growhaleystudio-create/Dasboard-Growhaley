import type { AIState, Result } from '@leads-generator/shared';
import { err, ok } from '@leads-generator/shared';
import type { LeadRepository } from '../repository/lead-repository.js';
import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';
import type { Queue } from 'bullmq';
import type { AiAnalysisJobData } from './ai-worker.js';
import { enqueueAiAnalysis } from './ai-worker.js';

export interface AiReanalyzeServiceDeps {
  leads: Pick<LeadRepository, 'findById' | 'setAiResult'>;
  settings: TeamAiSettingsService;
  queue: Queue<AiAnalysisJobData>;
}

/**
 * Service to handle manual AI re-analysis requests for a specific Lead (Task 17.20).
 */
export class AiReanalyzeService {
  constructor(private readonly deps: AiReanalyzeServiceDeps) {}

  async reanalyze(teamId: string, leadId: string, actorId: string): Promise<Result<{ leadId: string; aiState: AIState }>> {
    // 1. Verify the lead exists in the team
    const lead = await this.deps.leads.findById(teamId, leadId);
    if (!lead) {
      return err({ code: 'NOT_FOUND', message: `Lead not found: ${leadId}` });
    }

    // 2. Pre-flight check: ensure the Team has an API key configured (R13.3)
    const apiKey = await this.deps.settings.loadApiKey(teamId, 'leads');
    if (!apiKey) {
      return err({ code: 'VALIDATION', messages: ['API Key Gemini belum dikonfigurasi'] });
    }

    // 3. Set state to pending to reflect in the UI immediately
    await this.deps.leads.setAiResult(teamId, leadId, null, null, 'pending');

    // 4. Enqueue to background worker
    await enqueueAiAnalysis(this.deps.queue, {
      teamId,
      leadId,
      trigger: 'manual',
      actorId,
    });

    return ok({ leadId, aiState: 'pending' });
  }
}
