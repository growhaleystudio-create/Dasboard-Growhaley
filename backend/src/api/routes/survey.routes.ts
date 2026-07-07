import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import type { AppError } from '@leads-generator/shared';
import type { SurveyService } from '../../survey/survey-service.js';
import type { SurveyAnalyticsService } from '../../survey/survey-analytics-service.js';
import type { SurveyAnalysisService } from '../../survey/survey-analysis-service.js';
import type { SurveyExportService } from '../../survey/survey-export-service.js';
import type { SurveyResponseRepository } from '../../repository/survey-response-repository.js';

export interface SurveyRoutesDeps {
  service: SurveyService;
  analytics: SurveyAnalyticsService;
  analysis: SurveyAnalysisService;
  exportService: SurveyExportService;
  responses: SurveyResponseRepository;
}

const CreateSurveySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  projectGoal: z.string().min(1),
  backgroundContext: z.string().optional(),
  targetParticipant: z.string().optional(),
  primaryDecision: z.string().optional(),
  responseQuota: z.number().int().min(1).optional(),
});

const UpdateSurveySchema = CreateSurveySchema.partial();

const ReplaceQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      questionKey: z.string().min(1),
      type: z.enum([
        'short_text',
        'long_text',
        'multiple_choice',
        'checkboxes',
        'dropdown',
        'linear_scale',
        'matrix',
      ]),
      title: z.string().min(1),
      description: z.string().optional(),
      required: z.boolean().optional(),
      displayOrder: z.number().int().min(0),
      config: z.record(z.unknown()),
      logic: z.record(z.unknown()).nullable().optional(),
    }),
  ),
});

const AnalyticsFilterSchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  completionStatus: z.enum(['completed', 'incomplete']).optional(),
  answerFilters: z
    .array(
      z.object({
        questionKey: z.string().min(1),
        operator: z.enum(['eq', 'includes', 'in', 'gte', 'lte']),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
      }),
    )
    .optional(),
});

const RunAnalysisSchema = z
  .object({
    scope: z.enum(['overall', 'question', 'segment']),
    questionId: z.string().uuid().optional(),
    filter: AnalyticsFilterSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.scope === 'question' && value.questionId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['questionId'],
        message: 'questionId is required when scope is question',
      });
    }
  });

function appValidationError(error: z.ZodError): Error & AppError {
  return Object.assign(new Error('Validation failed'), {
    code: 'VALIDATION' as const,
    messages: error.issues.map((item) => item.message),
  });
}

function toCreateSurveyInput(value: z.infer<typeof CreateSurveySchema>) {
  return {
    title: value.title,
    projectGoal: value.projectGoal,
    ...(value.description !== undefined ? { description: value.description } : {}),
    ...(value.backgroundContext !== undefined
      ? { backgroundContext: value.backgroundContext }
      : {}),
    ...(value.targetParticipant !== undefined
      ? { targetParticipant: value.targetParticipant }
      : {}),
    ...(value.primaryDecision !== undefined ? { primaryDecision: value.primaryDecision } : {}),
    ...(value.responseQuota !== undefined ? { responseQuota: value.responseQuota } : {}),
  };
}

function toUpdateSurveyInput(value: z.infer<typeof UpdateSurveySchema>) {
  return {
    ...(value.title !== undefined ? { title: value.title } : {}),
    ...(value.projectGoal !== undefined ? { projectGoal: value.projectGoal } : {}),
    ...(value.description !== undefined ? { description: value.description } : {}),
    ...(value.backgroundContext !== undefined
      ? { backgroundContext: value.backgroundContext }
      : {}),
    ...(value.targetParticipant !== undefined
      ? { targetParticipant: value.targetParticipant }
      : {}),
    ...(value.primaryDecision !== undefined ? { primaryDecision: value.primaryDecision } : {}),
    ...(value.responseQuota !== undefined ? { responseQuota: value.responseQuota } : {}),
  };
}

function toReplaceQuestionsInput(value: z.infer<typeof ReplaceQuestionsSchema>) {
  return {
    questions: value.questions.map((question) => ({
      questionKey: question.questionKey,
      type: question.type,
      title: question.title,
      displayOrder: question.displayOrder,
      config: question.config,
      ...(question.description !== undefined ? { description: question.description } : {}),
      ...(question.required !== undefined ? { required: question.required } : {}),
      ...(question.logic !== undefined && question.logic !== null
        ? { logic: question.logic as never }
        : {}),
    })),
  };
}

function toAnalyticsFilterInput(value: z.infer<typeof AnalyticsFilterSchema>) {
  return {
    ...(value.dateFrom !== undefined ? { dateFrom: value.dateFrom } : {}),
    ...(value.dateTo !== undefined ? { dateTo: value.dateTo } : {}),
    ...(value.completionStatus !== undefined ? { completionStatus: value.completionStatus } : {}),
    ...(value.answerFilters !== undefined
      ? {
          answerFilters: value.answerFilters.map((filter) => ({
            questionKey: filter.questionKey,
            operator: filter.operator,
            value: filter.value,
          })),
        }
      : {}),
  };
}

function toRunAnalysisInput(value: z.infer<typeof RunAnalysisSchema>) {
  return {
    scope: value.scope,
    ...(value.questionId !== undefined ? { questionId: value.questionId } : {}),
    ...(value.filter !== undefined ? { filter: toAnalyticsFilterInput(value.filter) } : {}),
  };
}

export const surveyRoutes =
  (deps: SurveyRoutesDeps): FastifyPluginAsync =>
  async (fastify) => {
    fastify.post(
      '/',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.write'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const parsed = CreateSurveySchema.safeParse(request.body);
        if (!parsed.success) throw appValidationError(parsed.error);
        const result = await deps.service.create(
          params.id,
          request.session!.userId,
          toCreateSurveyInput(parsed.data),
        );
        return reply.status(201).send(result);
      },
    );

    fastify.get(
      '/',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.read'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string };
        return deps.service.list(params.id);
      },
    );

    fastify.get(
      '/:surveyId',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.read'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; surveyId: string };
        return deps.service.get(params.id, params.surveyId);
      },
    );

    fastify.patch(
      '/:surveyId',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.write'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; surveyId: string };
        const parsed = UpdateSurveySchema.safeParse(request.body);
        if (!parsed.success) throw appValidationError(parsed.error);
        return deps.service.update(
          params.id,
          params.surveyId,
          request.session!.userId,
          toUpdateSurveyInput(parsed.data),
        );
      },
    );

    fastify.put(
      '/:surveyId/questions',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.write'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; surveyId: string };
        const parsed = ReplaceQuestionsSchema.safeParse(request.body);
        if (!parsed.success) throw appValidationError(parsed.error);
        return deps.service.replaceQuestions(
          params.id,
          params.surveyId,
          request.session!.userId,
          toReplaceQuestionsInput(parsed.data),
        );
      },
    );

    fastify.post(
      '/:surveyId/publish',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.publish'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; surveyId: string };
        return deps.service.publish(params.id, params.surveyId, request.session!.userId);
      },
    );

    fastify.post(
      '/:surveyId/unpublish',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.publish'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; surveyId: string };
        return deps.service.unpublish(params.id, params.surveyId, request.session!.userId);
      },
    );

    fastify.post(
      '/:surveyId/close',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.publish'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; surveyId: string };
        return deps.service.close(params.id, params.surveyId, request.session!.userId);
      },
    );

    fastify.get(
      '/:surveyId/analytics',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.analyze'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; surveyId: string };
        return deps.analytics.getSummary(params.id, params.surveyId);
      },
    );

    fastify.post(
      '/:surveyId/analytics/query',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.analyze'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; surveyId: string };
        const parsed = AnalyticsFilterSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw appValidationError(parsed.error);
        return deps.analytics.getSummary(
          params.id,
          params.surveyId,
          toAnalyticsFilterInput(parsed.data),
        );
      },
    );

    fastify.get(
      '/:surveyId/analysis',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.analyze'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; surveyId: string };
        return deps.analysis.list(params.id, params.surveyId);
      },
    );

    fastify.get(
      '/:surveyId/analysis/:analysisId',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.analyze'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; surveyId: string; analysisId: string };
        return deps.analysis.get(params.id, params.surveyId, params.analysisId);
      },
    );

    fastify.post(
      '/:surveyId/analysis',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.write'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string; surveyId: string };
        const parsed = RunAnalysisSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(appValidationError(parsed.error));
        }
        const result = await deps.analysis.trigger(
          params.id,
          params.surveyId,
          request.session!.userId,
          toRunAnalysisInput(parsed.data),
        );
        if (!result.ok) throw Object.assign(new Error('Survey analysis trigger failed'), result.error);
        return reply.status(202).send(result.value);
      },
    );

    fastify.get(
      '/:surveyId/export/json',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.export'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string; surveyId: string };
        const result = await deps.exportService.exportJson(
          params.id,
          params.surveyId,
          request.session!.userId,
        );
        if (!result.ok) throw Object.assign(new Error('Survey export json failed'), result.error);
        reply.header('Content-Disposition', `attachment; filename="${result.value.filename}"`);
        reply.header('Content-Type', result.value.contentType);
        return reply.status(200).send(result.value.body);
      },
    );

    fastify.get(
      '/:surveyId/export/csv',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.export'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string; surveyId: string };
        const result = await deps.exportService.exportCsv(
          params.id,
          params.surveyId,
          request.session!.userId,
        );
        if (!result.ok) throw Object.assign(new Error('Survey export csv failed'), result.error);
        reply.header('Content-Disposition', `attachment; filename="${result.value.filename}"`);
        reply.header('Content-Type', result.value.contentType);
        return reply.status(200).send(result.value.body);
      },
    );

    fastify.get(
      '/:surveyId/responses',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.read'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; surveyId: string };
        return deps.responses.listForSurvey(params.id, params.surveyId);
      },
    );

    fastify.get(
      '/:surveyId/responses/:responseId',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('survey.read'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; surveyId: string; responseId: string };
        return deps.responses.findById(params.id, params.surveyId, params.responseId);
      },
    );
  };
