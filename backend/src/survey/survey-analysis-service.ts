import {
  err,
  ok,
  type Result,
  type RunSurveyAnalysisInput,
  type SurveyAiAnalysisResult,
  type SurveyAnalysis,
} from '@leads-generator/shared';
import type { Queue } from 'bullmq';
import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';
import type { SurveyRepository } from '../repository/survey-repository.js';
import type { SurveyQuestionRepository } from '../repository/survey-question-repository.js';
import type { SurveyResponseRepository } from '../repository/survey-response-repository.js';
import type { SurveyAnalysisRepository } from '../repository/survey-analysis-repository.js';
import type { SurveyAnalyticsService } from './survey-analytics-service.js';
import type { AuditLog } from '../privacy/audit-log.js';
import { enqueueSurveyAnalysis, type SurveyAnalysisJobData } from './survey-analysis-worker.js';

interface SurveyAnalysisServiceDeps {
  surveys: SurveyRepository;
  questions: SurveyQuestionRepository;
  responses: SurveyResponseRepository;
  analyses: SurveyAnalysisRepository;
  analytics: SurveyAnalyticsService;
  settings: TeamAiSettingsService;
  audit: Pick<AuditLog, 'record'>;
  queue: Queue<SurveyAnalysisJobData>;
  generateResult?: (context: SurveyAnalysisPromptContext) => Promise<SurveyAiAnalysisResult>;
  modelName?: (teamId: string) => Promise<string>;
}

interface SurveyAnalysisPromptContext {
  survey: Awaited<ReturnType<SurveyRepository['findById']>> extends infer T ? T : never;
  questions: Awaited<ReturnType<SurveyQuestionRepository['listForSurvey']>>;
  responses: Awaited<ReturnType<SurveyResponseRepository['listForSurvey']>>;
  analytics: Awaited<ReturnType<SurveyAnalyticsService['getSummary']>>;
  analysis: SurveyAnalysis;
}

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

function filterHash(input: RunSurveyAnalysisInput): string | undefined {
  if (!input.filter) return undefined;
  return stableStringify(input.filter);
}

export const sampleOpenEndedAnswers = (
  responses: Awaited<ReturnType<SurveyResponseRepository['listForSurvey']>>,
  questionKey?: string,
): string[] => {
  const result: string[] = [];
  for (const response of responses) {
    for (const [key, value] of Object.entries(response.answers)) {
      if (questionKey && key !== questionKey) continue;
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      result.push(`${key}: ${trimmed}`);
      if (result.length >= 12) return result;
    }
  }
  return result;
};

const buildFallbackResult = (context: SurveyAnalysisPromptContext): SurveyAiAnalysisResult => {
  const topQuestions = context.analytics.questions
    .filter((question) => question.totalAnswered > 0)
    .sort((a, b) => b.totalAnswered - a.totalAnswered)
    .slice(0, 3)
    .map((question) => `${question.title} (${question.totalAnswered} jawaban)`);

  const openEndedSamples = sampleOpenEndedAnswers(
    context.responses,
    context.analysis.scope === 'question'
      ? context.questions.find((question) => question.id === context.analysis.questionId)
          ?.questionKey
      : undefined,
  );

  return {
    summary:
      context.analysis.scope === 'question'
        ? `Analisis pertanyaan fokus menunjukkan ${context.analytics.totalResponses} response dengan ${context.analytics.completedResponses} response selesai.`
        : `Survey ${context.survey?.title ?? ''} memiliki ${context.analytics.totalResponses} response dengan completion rate ${context.analytics.completionRate}%.`,
    keyFindings: [
      `Completion rate: ${context.analytics.completionRate}%`,
      ...(topQuestions.length > 0
        ? [`Pertanyaan dengan jawaban terbanyak: ${topQuestions.join(', ')}`]
        : []),
      ...(openEndedSamples.length > 0
        ? [`Tersedia ${openEndedSamples.length} sampel jawaban terbuka untuk review manual.`]
        : []),
    ],
    recommendations: [
      'Validasi insight ini bersama analytics kuantitatif sebelum mengambil keputusan produk.',
      'Gunakan segment filter untuk membandingkan pola jawaban antar kelompok responden.',
    ],
    ...(openEndedSamples.length > 0 ? { respondentInsights: openEndedSamples.slice(0, 5) } : {}),
    ...(context.analysis.scope === 'question' && openEndedSamples.length > 0
      ? { questionInsight: openEndedSamples.slice(0, 3).join(' | ') }
      : {}),
    generatedAt: new Date().toISOString(),
  };
};

export class SurveyAnalysisService {
  constructor(private readonly deps: SurveyAnalysisServiceDeps) {}

  async trigger(
    teamId: string,
    surveyId: string,
    actorId: string,
    input: RunSurveyAnalysisInput,
  ): Promise<Result<SurveyAnalysis>> {
    const survey = await this.deps.surveys.findById(teamId, surveyId);
    if (!survey) {
      return err({ code: 'NOT_FOUND', message: 'Survey not found' });
    }

    const hasApiKey = await this.deps.settings.hasApiKey(teamId, 'content_suggestion');
    if (!hasApiKey) {
      return err({
        code: 'VALIDATION',
        messages: ['API Key AI untuk survey analysis belum dikonfigurasi'],
      });
    }

    const questions = await this.deps.questions.listForSurvey(
      teamId,
      surveyId,
      survey.currentVersion,
    );
    if (input.scope === 'question') {
      const question = questions.find((item) => item.id === input.questionId);
      if (!question) {
        return err({ code: 'NOT_FOUND', message: 'Question not found' });
      }
    }

    const analytics = await this.deps.analytics.getSummary(teamId, surveyId, input.filter);
    const inputSnapshot: Record<string, unknown> = {
      scope: input.scope,
      ...(input.questionId ? { questionId: input.questionId } : {}),
      ...(input.filter ? { filter: input.filter } : {}),
      survey: {
        title: survey.title,
        projectGoal: survey.projectGoal,
        description: survey.description,
        backgroundContext: survey.backgroundContext,
        targetParticipant: survey.targetParticipant,
        primaryDecision: survey.primaryDecision,
      },
      analytics,
    };

    const analysis = await this.deps.analyses.create(
      teamId,
      surveyId,
      actorId,
      input,
      inputSnapshot,
      filterHash(input),
    );

    await this.deps.responses.setAnalysisStateForSurvey(teamId, surveyId, 'pending');

    await this.deps.audit.record({
      teamId,
      actorId,
      action: 'survey_analysis',
      objectType: 'survey_analysis',
      objectId: analysis.id,
      metadata: {
        event: 'triggered',
        surveyId,
        scope: input.scope,
        taxonomy: 'survey_analysis',
        trigger: 'manual',
        ...(input.questionId !== undefined ? { questionId: input.questionId } : {}),
        ...(input.filter !== undefined ? { filter: input.filter } : {}),
      },
    });

    await enqueueSurveyAnalysis(this.deps.queue, {
      teamId,
      surveyId,
      analysisId: analysis.id,
      trigger: 'manual',
    });

    return ok(analysis);
  }

  async list(teamId: string, surveyId: string): Promise<SurveyAnalysis[]> {
    return this.deps.analyses.listForSurvey(teamId, surveyId);
  }

  async get(teamId: string, surveyId: string, analysisId: string): Promise<SurveyAnalysis | null> {
    return this.deps.analyses.findById(teamId, surveyId, analysisId);
  }

  async processJob(data: SurveyAnalysisJobData): Promise<void> {
    const analysis = await this.deps.analyses.findById(data.teamId, data.surveyId, data.analysisId);
    if (!analysis) return;

    const survey = await this.deps.surveys.findById(data.teamId, data.surveyId);
    if (!survey) {
      await this.deps.analyses.markFailed(
        data.teamId,
        data.surveyId,
        data.analysisId,
        'Survey not found',
      );
      return;
    }

    try {
      const questions = await this.deps.questions.listForSurvey(
        data.teamId,
        data.surveyId,
        survey.currentVersion,
      );
      const responses = await this.deps.responses.listForSurvey(data.teamId, data.surveyId);
      const analytics = await this.deps.analytics.getSummary(
        data.teamId,
        data.surveyId,
        analysis.inputSnapshot.filter as RunSurveyAnalysisInput['filter'] | undefined,
      );

      const context: SurveyAnalysisPromptContext = {
        survey,
        questions,
        responses,
        analytics,
        analysis,
      };

      const result = this.deps.generateResult
        ? await this.deps.generateResult(context)
        : buildFallbackResult(context);
      const model = this.deps.modelName
        ? await this.deps.modelName(data.teamId)
        : 'survey-analysis-fallback';

      await this.deps.analyses.markSuccess(
        data.teamId,
        data.surveyId,
        data.analysisId,
        result as unknown as Record<string, unknown>,
        model,
      );
      await this.deps.responses.setAnalysisStateForSurvey(data.teamId, data.surveyId, 'success');
      await this.deps.audit.record({
        teamId: data.teamId,
        actorId: 'system',
        action: 'survey_analysis',
        objectType: 'survey_analysis',
        objectId: data.analysisId,
        metadata: {
          event: 'completed',
          surveyId: data.surveyId,
          trigger: data.trigger,
          taxonomy: 'survey_analysis',
          scope: analysis.scope,
          ...(analysis.questionId !== undefined ? { questionId: analysis.questionId } : {}),
          model,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Survey analysis failed';
      await this.deps.analyses.markFailed(data.teamId, data.surveyId, data.analysisId, message);
      await this.deps.responses.setAnalysisStateForSurvey(data.teamId, data.surveyId, 'failed');
      await this.deps.audit.record({
        teamId: data.teamId,
        actorId: 'system',
        action: 'survey_analysis',
        objectType: 'survey_analysis',
        objectId: data.analysisId,
        metadata: {
          event: 'failed',
          surveyId: data.surveyId,
          trigger: data.trigger,
          taxonomy: 'survey_analysis',
          scope: analysis.scope,
          ...(analysis.questionId !== undefined ? { questionId: analysis.questionId } : {}),
          error: message,
        },
      });
    }
  }
}
