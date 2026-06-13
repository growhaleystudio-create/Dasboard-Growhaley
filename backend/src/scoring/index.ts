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
