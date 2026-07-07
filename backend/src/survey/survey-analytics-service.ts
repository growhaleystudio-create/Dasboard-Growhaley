import type {
  SurveyAnalyticsFilter,
  SurveyAnalyticsSummary,
  SurveyDistributionItem,
  SurveyQuestion,
  SurveyQuestionStats,
  SurveyResponse,
} from '@leads-generator/shared';
import { SurveyQuestionRepository } from '../repository/survey-question-repository.js';
import { SurveyRepository } from '../repository/survey-repository.js';
import { SurveyResponseRepository } from '../repository/survey-response-repository.js';

function matchesFilter(response: SurveyResponse, filter?: SurveyAnalyticsFilter): boolean {
  if (!filter) return true;

  if (filter.dateFrom && response.submittedAt && response.submittedAt < new Date(filter.dateFrom)) {
    return false;
  }
  if (filter.dateTo && response.submittedAt && response.submittedAt > new Date(filter.dateTo)) {
    return false;
  }
  if (filter.completionStatus === 'completed' && response.status !== 'completed') {
    return false;
  }
  if (filter.completionStatus === 'incomplete' && response.status === 'completed') {
    return false;
  }
  for (const answerFilter of filter.answerFilters ?? []) {
    const value = response.answers[answerFilter.questionKey];
    switch (answerFilter.operator) {
      case 'eq':
        if (value !== answerFilter.value) return false;
        break;
      case 'includes':
        if (!Array.isArray(value) || !value.includes(String(answerFilter.value))) return false;
        break;
      case 'in':
        if (!Array.isArray(answerFilter.value) || !answerFilter.value.includes(value)) return false;
        break;
      case 'gte':
        if (typeof value !== 'number' || typeof answerFilter.value !== 'number' || value < answerFilter.value) return false;
        break;
      case 'lte':
        if (typeof value !== 'number' || typeof answerFilter.value !== 'number' || value > answerFilter.value) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

function percentage(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 10000) / 100;
}

function buildDistribution(counts: Map<string, number>, total: number): SurveyDistributionItem[] {
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count, percentage: percentage(count, total) }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export class SurveyAnalyticsService {
  constructor(
    private readonly surveys: SurveyRepository,
    private readonly questions: SurveyQuestionRepository,
    private readonly responses: SurveyResponseRepository,
  ) {}

  async getSummary(teamId: string, surveyId: string, filter?: SurveyAnalyticsFilter): Promise<SurveyAnalyticsSummary> {
    const survey = await this.surveys.findById(teamId, surveyId);
    if (!survey) {
      throw new Error('Survey not found');
    }
    const questions = await this.questions.listForSurvey(teamId, surveyId, survey.currentVersion);
    const allResponses = await this.responses.listForSurvey(teamId, surveyId);
    const responses = allResponses.filter((response) => matchesFilter(response, filter));
    const completedResponses = responses.filter((response) => response.status === 'completed').length;
    const latestSubmittedAt = responses
      .map((response) => response.submittedAt)
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const questionStats = questions.map((question) => this.buildQuestionStats(question, responses));

    return {
      totalResponses: responses.length,
      completedResponses,
      completionRate: responses.length === 0 ? 0 : Math.round((completedResponses / responses.length) * 10000) / 100,
      ...(latestSubmittedAt ? { latestSubmittedAt } : {}),
      questions: questionStats,
    };
  }

  private buildQuestionStats(question: SurveyQuestion, responses: SurveyResponse[]): SurveyQuestionStats {
    const values = responses
      .map((response) => response.answers[question.questionKey])
      .filter((value) => value !== undefined && value !== null);

    const base: SurveyQuestionStats = {
      questionId: question.id,
      questionKey: question.questionKey,
      type: question.type,
      title: question.title,
      totalAnswered: values.length,
    };

    if (question.type === 'multiple_choice' || question.type === 'dropdown' || question.type === 'short_text' || question.type === 'long_text') {
      const counts = new Map<string, number>();
      for (const value of values) {
        if (typeof value !== 'string') continue;
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      return { ...base, distribution: buildDistribution(counts, values.length) };
    }

    if (question.type === 'checkboxes') {
      const counts = new Map<string, number>();
      for (const value of values) {
        if (!Array.isArray(value)) continue;
        for (const item of value) {
          if (typeof item !== 'string') continue;
          counts.set(item, (counts.get(item) ?? 0) + 1);
        }
      }
      return { ...base, distribution: buildDistribution(counts, values.length) };
    }

    if (question.type === 'linear_scale') {
      const numericValues = values.filter((value): value is number => typeof value === 'number');
      const total = numericValues.reduce((sum, value) => sum + value, 0);
      return {
        ...base,
        ...(numericValues.length > 0
          ? {
              average: Math.round((total / numericValues.length) * 100) / 100,
              minimum: Math.min(...numericValues),
              maximum: Math.max(...numericValues),
            }
          : {}),
      };
    }

    if (question.type === 'matrix') {
      const matrixCounts = new Map<string, Map<string, number>>();
      for (const value of values) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
        for (const [rowKey, cellValue] of Object.entries(value)) {
          const cellMap = matrixCounts.get(rowKey) ?? new Map<string, number>();
          if (typeof cellValue === 'string' || typeof cellValue === 'number' || typeof cellValue === 'boolean') {
            const normalized = String(cellValue);
            cellMap.set(normalized, (cellMap.get(normalized) ?? 0) + 1);
          }
          matrixCounts.set(rowKey, cellMap);
        }
      }
      const matrixDistribution: Record<string, SurveyDistributionItem[]> = {};
      for (const [rowKey, counts] of matrixCounts.entries()) {
        matrixDistribution[rowKey] = buildDistribution(counts, values.length);
      }
      return { ...base, matrixDistribution };
    }

    return base;
  }
}
