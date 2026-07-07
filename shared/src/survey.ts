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
  values?: Array<string | number>;
  range?: { min?: number; max?: number };
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
  createdAt: Date;
  updatedAt: Date;
}

export interface Survey {
  id: string;
  teamId: string;
  title: string;
  description?: string;
  projectGoal: string;
  backgroundContext?: string;
  targetParticipant?: string;
  primaryDecision?: string;
  status: SurveyStatus;
  publicSlug?: string;
  responseQuota?: number;
  responseCount: number;
  currentVersion: number;
  publishedAt?: Date;
  closedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SurveyAnswerValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string | number | boolean | null>
  | null;

export interface SurveyAnswer {
  questionKey: string;
  value: SurveyAnswerValue;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  teamId: string;
  surveyVersion: number;
  status: SurveyResponseStatus;
  answers: Record<string, SurveyAnswerValue>;
  metadata: Record<string, unknown>;
  analysisState: 'none' | SurveyAnalysisStatus;
  startedAt: Date;
  submittedAt?: Date;
  createdAt: Date;
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
  latestSubmittedAt?: Date;
  questions: SurveyQuestionStats[];
}

export interface SurveyAnalysis {
  id: string;
  surveyId: string;
  teamId: string;
  scope: SurveyAnalysisScope;
  questionId?: string;
  filterHash?: string;
  status: SurveyAnalysisStatus;
  inputSnapshot: Record<string, unknown>;
  result?: Record<string, unknown>;
  model?: string;
  errorMessage?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSurveyInput {
  title: string;
  description?: string;
  projectGoal: string;
  backgroundContext?: string;
  targetParticipant?: string;
  primaryDecision?: string;
  responseQuota?: number;
}

export interface UpdateSurveyInput {
  title?: string;
  description?: string;
  projectGoal?: string;
  backgroundContext?: string;
  targetParticipant?: string;
  primaryDecision?: string;
  responseQuota?: number | null;
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

export interface SubmitSurveyResponseInput {
  answers: Record<string, SurveyAnswerValue>;
  metadata?: Record<string, unknown>;
}

export interface SurveyAnswerFilter {
  questionKey: string;
  operator: 'eq' | 'includes' | 'in' | 'gte' | 'lte';
  value: unknown;
}

export interface SurveyAnalyticsFilter {
  dateFrom?: string;
  dateTo?: string;
  completionStatus?: 'completed' | 'incomplete';
  answerFilters?: SurveyAnswerFilter[];
}

export interface RunSurveyAnalysisInput {
  scope: SurveyAnalysisScope;
  questionId?: string;
  filter?: SurveyAnalyticsFilter;
}

export interface SurveyAiAnalysisResult {
  summary: string;
  keyFindings: string[];
  recommendations: string[];
  respondentInsights?: string[];
  questionInsight?: string;
  generatedAt: string;
}
