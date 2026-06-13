/**
 * Barrel for the AI_Analyzer_Service module (R13).
 *
 * Currently exposes the privacy-safe {@link buildPublicLeadSnapshot}
 * projection and its allow-list metadata (Task 17.9, R13.7). Subsequent
 * tasks add the Gemini_Client, AI_Budget_Tracker, and the queue-driven
 * analyzer that consumes these snapshots.
 */

export {
  PUBLIC_SNAPSHOT_FIELDS,
  type PublicSnapshotField,
  type SnapshotSourceLead,
  type BuildSnapshotOptions,
  buildPublicLeadSnapshot,
} from './public-lead-snapshot.js';

export {
  AiBudgetTracker,
  type BudgetCheckResult,
  type AiBudgetTrackerDeps,
} from './ai-budget-tracker.js';

export {
  GeminiClient,
  type AiProvider,
  type AiProviderResult,
} from './gemini-client.js';

export {
  AiAnalyzerService,
  type AiAnalyzeResult,
  type AiAnalyzerServiceDeps,
} from './ai-analyzer-service.js';

export {
  AiReanalyzeService,
  type AiReanalyzeServiceDeps,
} from './ai-reanalyze-service.js';

export {
  createAiWorker,
  enqueueAiAnalysis,
  AI_ANALYSIS_QUEUE_NAME,
  type AiAnalysisJobData,
  type AiWorkerDeps,
} from './ai-worker.js';
