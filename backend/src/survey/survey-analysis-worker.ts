import { Worker, type Job, type Queue } from 'bullmq';
import type { RedisOptions } from 'ioredis';

export const SURVEY_ANALYSIS_QUEUE_NAME = 'survey-analysis';

export interface SurveyAnalysisJobData {
  teamId: string;
  surveyId: string;
  analysisId: string;
  trigger: 'manual' | 'refresh';
}

export interface SurveyAnalysisWorkerDeps {
  redisUrl: string;
  runAnalysis: (data: SurveyAnalysisJobData) => Promise<void>;
}

export async function enqueueSurveyAnalysis(
  queue: Queue<SurveyAnalysisJobData>,
  data: SurveyAnalysisJobData,
): Promise<void> {
  await queue.add('analyze', data, {
    jobId: `${data.teamId}:${data.surveyId}:${data.analysisId}:${data.trigger}`,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
  });
}

export function createSurveyAnalysisWorker(
  deps: SurveyAnalysisWorkerDeps,
): Worker<SurveyAnalysisJobData> {
  const connection = new URL(deps.redisUrl);
  const connectionOptions: RedisOptions = {
    host: connection.hostname,
    port: Number(connection.port || 6379),
    maxRetriesPerRequest: null,
  };
  if (connection.username) connectionOptions.username = connection.username;
  if (connection.password) connectionOptions.password = connection.password;
  if (connection.protocol === 'rediss:') connectionOptions.tls = {};

  return new Worker<SurveyAnalysisJobData>(
    SURVEY_ANALYSIS_QUEUE_NAME,
    async (job: Job<SurveyAnalysisJobData>) => {
      try {
        await deps.runAnalysis(job.data);
      } catch (error) {
        console.error(`Survey analysis worker error for ${job.data.analysisId}:`, error);
      }
    },
    {
      connection: connectionOptions,
      concurrency: 3,
    },
  );
}
