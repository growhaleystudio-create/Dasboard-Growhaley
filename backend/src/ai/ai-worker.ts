import { Worker, type Job, type Queue } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import type { AiAnalyzerService } from './ai-analyzer-service.js';

export const AI_ANALYSIS_QUEUE_NAME = 'ai-analysis';

export interface AiAnalysisJobData {
  teamId: string;
  leadId: string;
  trigger: 'scan' | 'manual';
  actorId?: string;
  action?: 'analyze_scan' | 'regenerate_ai_insight';
}

export interface AiWorkerDeps {
  analyzer: AiAnalyzerService;
  redisUrl: string;
}

/**
 * Helper to enqueue a job (useful for AiReanalyzeService and ScanJobRunner)
 */
export async function enqueueAiAnalysis(
  queue: Queue<AiAnalysisJobData>,
  data: AiAnalysisJobData,
): Promise<void> {
  await queue.add('analyze', data, {
    jobId: `${data.teamId}:${data.leadId}:${data.trigger}:${data.action ?? 'analyze_scan'}:${Date.now()}`,
    attempts: 1, // Do not auto-retry. It fails to 'unavailable' state (R13.13)
    removeOnComplete: true,
    removeOnFail: true,
  });
}

/**
 * Create the BullMQ worker that consumes AI analysis jobs (R13.13).
 */
export function createAiWorker(deps: AiWorkerDeps): Worker<AiAnalysisJobData> {
  const connection = new URL(deps.redisUrl);

  const connectionOptions: RedisOptions = {
    host: connection.hostname,
    port: Number(connection.port || 6379),
    maxRetriesPerRequest: null,
  };
  if (connection.username) connectionOptions.username = connection.username;
  if (connection.password) connectionOptions.password = connection.password;
  if (connection.protocol === 'rediss:') connectionOptions.tls = {};

  return new Worker<AiAnalysisJobData>(
    AI_ANALYSIS_QUEUE_NAME,
    async (job: Job<AiAnalysisJobData>) => {
      const { teamId, leadId, trigger, actorId } = job.data;
      
      // We don't throw from here if the analyzer throws/fails.
      // AiAnalyzerService already handles failures by marking as 'unavailable'
      // and recording to audit log.
      try {
        await deps.analyzer.analyzeLead(teamId, leadId, trigger, actorId ?? 'system');
      } catch (err) {
        console.error(`AI Worker error for lead ${leadId}:`, err);
        // It's possible we couldn't even record the failure (e.g. DB error).
        // If we throw, BullMQ will mark it as failed, but we configured attempts=1.
      }
    },
    {
      connection: connectionOptions,
      concurrency: 5,
    }
  );
}
