/**
 * Barrel for the tenant-scoped repository layer.
 *
 * Repositories implement the Tenant Guard contract from design.md
 * (Components and Interfaces → Auth/RBAC Guard & Tenant Guard, R2.8): every
 * public method takes `teamId` as its first parameter and the underlying
 * SQL filters by it. There are no overloads or defaults that omit `teamId`.
 */

export { type DbExecutor, query } from './types.js';
export {
  mapLeadRow,
  mapScanConfigurationRow,
  mapScanJobRow,
  mapTeamConnectorRow,
  mapScoringModelRow,
  mapMembershipRow,
  mapLeadScoreBreakdownRow,
  type LeadRow,
  type LeadScoreBreakdownRow,
  type ScanConfigurationRow,
  type ScanJobRow,
  type TeamConnectorRow,
  type ScoringModelRow,
  type MembershipRow,
} from './mapping.js';
export {
  LeadRepository,
  type LeadInsert,
  type LeadAttributePatch,
  type PersonalDataCriteria,
  type ListLeadsOptions,
  type CountLeadsOptions,
} from './lead-repository.js';
export {
  ScanConfigurationRepository,
  type ScanConfigurationInsert,
  type ScanConfigurationUpdate,
} from './scan-configuration-repository.js';
export { ScanJobRepository, type ScanJobInsert } from './scan-job-repository.js';
export { TeamConnectorRepository } from './team-connector-repository.js';
export { ScoringModelRepository } from './scoring-model-repository.js';
export { LeadScoringBreakdownRepository } from './lead-scoring-breakdown-repository.js';
export {
  LeadWebsiteAuditRepository,
  cachedFromCustom,
  cachedFromLighthouse,
  toWebsiteAuditInputV2,
  type CachedWebsiteAudit,
  type CoreWebVitals,
} from './lead-website-audit-repository.js';
export { TeamAiSettingsRepository, type TeamAiSettings } from './team-ai-settings-repository.js';
export { AiCallLogRepository, type AiCallLogInsert } from './ai-call-log-repository.js';
export { MasterTemplateRepository } from './master-template-repository.js';
export { ContentProviderSettingRepository } from './content-provider-setting-repository.js';
export {
  ContentGenerationJobRepository,
  type JobInsertResult,
  type JobFullRow,
  type JobListItem,
} from './content-generation-job-repository.js';
export {
  ContentGenerationSlideRepository,
  type SlideResult,
} from './content-generation-slide-repository.js';
export {
  ApprovedExampleRepository,
  type ApprovedExampleResult,
} from './approved-example-repository.js';
export { SurveyRepository } from './survey-repository.js';
export { SurveyQuestionRepository } from './survey-question-repository.js';
export { SurveyResponseRepository } from './survey-response-repository.js';
export { SurveyAnalysisRepository } from './survey-analysis-repository.js';
