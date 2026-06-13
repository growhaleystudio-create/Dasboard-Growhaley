/**
 * Barrel for the Scan_Config_Service module (R4).
 *
 * Exposes the pure validation pipeline (Task 8.1) and the
 * persistence-orchestrating {@link ScanConfigService}. Source filtering
 * and schedule-interval validation (Task 8.3) extend these in place.
 */

export {
  KEYWORD_MIN,
  KEYWORD_MAX,
  KEYWORD_LEN_MIN,
  KEYWORD_LEN_MAX,
  FILTER_LEN_MAX,
  SCHEDULE_INTERVAL_MIN,
  SCHEDULE_INTERVAL_MAX,
  VALIDATION_MESSAGES,
  validateScanConfig,
  type RawScanConfigInput,
  type NormalizedScanConfigInput,
  type ValidationOutcome,
} from './scan-config-validation.js';
export {
  ScanConfigService,
  type SaveScanConfigResult,
  type ExcludedSource,
} from './scan-config-service.js';
export {
  CONNECTOR_FETCH_TIMEOUT_MS,
  RateLimitError,
  runConnector,
  runConnectorsIsolated,
  type ConnectorRunOutput,
  type RunConnectorOptions,
} from './connector-runner.js';
export {
  runScanPipeline,
  type ScanPipelineDeps,
  type RunPipelineInput,
} from './scan-pipeline.js';
export {
  executeScan,
  NO_SOURCE_AVAILABLE_MESSAGE,
  NOT_INSTALLED_REASON,
  type ScanEngineDeps,
  type ExecuteScanInput,
} from './scan-engine.js';
export {
  runScanJob,
  SCAN_COMPLETED_NOTIFICATION,
  SCAN_FAILED_NOTIFICATION,
  type ScanJobRunnerDeps,
  type RunScanJobInput,
  type ScanJobRunResult,
  type JobLifecycleWriter,
  type TxJobWriter,
  type OutboxEnqueuer,
} from './scan-job-runner.js';
export {
  JobScheduler,
  isDue,
  selectDue,
  isUniqueRunningJobViolation,
  type JobSchedulerDeps,
  type ScheduledConfiguration,
  type SchedulerJobStore,
  type SchedulerTickResult,
  type SkipRecord,
} from './job-scheduler.js';
