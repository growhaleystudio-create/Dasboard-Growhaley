/**
 * Barrel for the Lead_Scoring_Engine (R7).
 *
 * Exports the pure {@link computeScore} entry point and its
 * {@link ScorableLead} input contract, plus the persistence-aware
 * orchestration added by Task 10.5: {@link LeadScoringPersister}
 * (`scoreAndPersist`) and the repositories it depends on
 * (`score_contribution`, `scoring_failure`, `outbox`).
 */

export { type ScorableLead } from './scorable-lead.js';
export { computeScore, roundHalfUp } from './compute-score.js';
export { computeBusinessValue } from './business-value.js';
export { computeConfidence } from './confidence.js';
export { finalizeLeadOpportunityScore } from './finalize.js';
export { computeLeadOpportunityScore } from './lead-opportunity-score.js';
export { confidenceModifier } from './modifier.js';
export { computeReachability } from './reachability.js';
export { computeWebsiteNeed } from './website-need.js';
export {
  LEAD_OPPORTUNITY_SCORING_VERSION,
  CATEGORY_FIT_BONUS,
  CATEGORY_NEED_SCORE,
  WEBSITE_SCORING_WEIGHTS,
} from './constants.js';
export type {
  BusinessValueBreakdown,
  ConfidenceBreakdown,
  LeadOpportunityScoringInput,
  ReachabilityBreakdown,
  WebsiteNeedBreakdown,
  WebsiteAuditInput,
} from './types.js';
export { ScoreContributionRepository } from './score-contribution-repository.js';
export {
  ScoringFailureRepository,
  type ScoringFailureReason,
} from './scoring-failure-repository.js';
export { OutboxRepository, type OutboxMessage } from './outbox-repository.js';
export {
  LeadScoringPersister,
  LEAD_UNSCORED_NOTIFICATION,
  type ScoreAndPersistDeps,
  type ScoreAndPersistOutcome,
} from './score-and-persist.js';
export { ScoringModelService } from './scoring-model-service.js';
export {
  recomputeForTeam,
  type RecomputeReport,
  type RecomputeDeps,
  type ScorableProjector,
  type TxLeadWriter,
  type TxContributionWriter,
} from './recompute.js';
export {
  backfillLeadScoringBreakdowns,
  type BackfillLeadScoringBreakdownsReport,
  type BackfillLeadScoringBreakdownsDeps,
} from './backfill-lead-scoring-breakdowns.js';
