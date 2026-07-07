export type SurveyStatus = 'draft' | 'published' | 'closed';

export type SurveyQuestionType =
  | 'short_text'
  | 'long_text'
  | 'multiple_choice'
  | 'checkboxes'
  | 'dropdown'
  | 'linear_scale'
  | 'matrix';

export type SurveyResponseStatus = 'in_progress' | 'completed' | 'abandoned';

export type SurveyAnalysisStatus = 'pending' | 'success' | 'failed';

export type SurveyAnalysisScope = 'overall' | 'question' | 'segment';

export interface SurveyOption {
  value: string;
  label: string;
}

export interface SurveyMatrixRow {
  key: string;
  label: string;
}

export interface SurveyMatrixColumn {
  key: string;
  label: string;
  value?: number;
}

export interface SurveyLogicCondition {
  sourceQuestionKey: string;
  operator: 'eq' | 'neq' | 'includes' | 'not_includes' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
  value?: string | number | boolean;
  values?: (string | number)[];
  range?: {
    min?: number;
    max?: number;
  };
}

export interface SurveyLogicGroup {
  effect: 'show';
  match: 'all' | 'any';
  conditions: SurveyLogicCondition[];
}

export interface ShortTextQuestionConfig {
  minLength?: number;
  maxLength?: number;
}

export interface LongTextQuestionConfig {
  minLength?: number;
  maxLength?: number;
}

export interface ChoiceQuestionConfig {
  options: SurveyOption[];
  randomizeOptions?: boolean;
}

export interface LinearScaleQuestionConfig {
  min: number;
  max: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface MatrixQuestionConfig {
  rows: SurveyMatrixRow[];
  columns: SurveyMatrixColumn[];
}

export type SurveyQuestionConfig =
  | ShortTextQuestionConfig
  | LongTextQuestionConfig
  | ChoiceQuestionConfig
  | LinearScaleQuestionConfig
  | MatrixQuestionConfig;

export interface SurveyQuestion {
  id: string;
  surveyId: string;
  teamId: string;
  version: number;
  questionKey: string;
  type: SurveyQuestionType;
  title: string;
  description?: string;
  required: boolean;
  displayOrder: number;
  config: SurveyQuestionConfig;
  logic?: SurveyLogicGroup;
  createdAt?: string;
  updatedAt?: string;
}

export interface SurveyListItem {
  id: string;
  title: string;
  description?: string;
  projectGoal: string;
  status: SurveyStatus;
  publicSlug?: string;
  responseQuota?: number;
  responseCount: number;
  publishedAt?: string;
  closedAt?: string;
  updatedAt: string;
}

export interface CreateSurveyInput {
  title: string;
  projectGoal: string;
  description?: string;
  backgroundContext?: string;
  targetParticipant?: string;
  primaryDecision?: string;
  responseQuota?: number;
}

export interface ReplaceSurveyQuestionInput {
  questionKey: string;
  type: SurveyQuestionType;
  title: string;
  description?: string;
  required?: boolean;
  displayOrder: number;
  config: SurveyQuestionConfig;
  logic?: SurveyLogicGroup;
}

export interface ReplaceSurveyQuestionsInput {
  questions: ReplaceSurveyQuestionInput[];
}

export type SurveyAnswerValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string | number | boolean | null>
  | null;

export interface SurveyResponseItem {
  id: string;
  surveyId: string;
  teamId: string;
  surveyVersion: number;
  status: SurveyResponseStatus;
  answers: Record<string, SurveyAnswerValue>;
  metadata: Record<string, unknown>;
  analysisState: 'none' | SurveyAnalysisStatus;
  startedAt: string;
  submittedAt?: string;
  createdAt: string;
}

export interface SurveyDistributionItem {
  value: string;
  count: number;
  percentage: number;
}

export interface SurveyQuestionStats {
  questionId: string;
  questionKey: string;
  type: SurveyQuestionType;
  title: string;
  totalAnswered: number;
  distribution?: SurveyDistributionItem[];
  average?: number;
  minimum?: number;
  maximum?: number;
  matrixDistribution?: Record<string, SurveyDistributionItem[]>;
}

export interface SurveyAnalyticsSummary {
  totalResponses: number;
  completedResponses: number;
  completionRate: number;
  latestSubmittedAt?: string;
  questions: SurveyQuestionStats[];
}

export interface SurveyDetailResponse {
  survey: SurveyListItem & {
    backgroundContext?: string;
    targetParticipant?: string;
    primaryDecision?: string;
    createdAt?: string;
  };
  questions: SurveyQuestion[];
}

export type SurveyPublicLinkState = 'no-link' | 'live' | 'unpublished' | 'closed';

export interface SurveyAnalysisItem {
  id: string;
  surveyId: string;
  teamId: string;
  scope: SurveyAnalysisScope;
  questionId?: string;
  status: SurveyAnalysisStatus;
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyAnalysisDetail extends SurveyAnalysisItem {
  inputSnapshot: Record<string, unknown>;
  result?: Record<string, unknown>;
  errorMessage?: string;
}

export interface TriggerSurveyAnalysisInput {
  scope: SurveyAnalysisScope;
  questionId?: string;
  filter?: Record<string, unknown>;
}

export interface PublicSurveyResponse {
  survey: SurveyListItem & {
    backgroundContext?: string;
    targetParticipant?: string;
    primaryDecision?: string;
  };
  questions: SurveyQuestion[];
}

export interface SubmitSurveyResponseInput {
  answers: Record<string, SurveyAnswerValue>;
  metadata?: Record<string, unknown>;
}
