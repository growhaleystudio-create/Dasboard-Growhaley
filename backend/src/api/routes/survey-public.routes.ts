import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import type { AppError, SurveyAnswerValue } from '@leads-generator/shared';
import type { SurveyPublicService } from '../../survey/survey-public-service.js';

export interface SurveyPublicRoutesDeps {
  service: SurveyPublicService;
}

const AnswerValueSchema: z.ZodType<SurveyAnswerValue> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  z.null(),
]);

const SubmitResponseSchema = z
  .object({
    answers: z.record(AnswerValueSchema),
    metadata: z.record(z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    if (Object.keys(value.answers).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answers'],
        message: 'At least one answer is required',
      });
    }
  });

type SubmitResponseInput = z.infer<typeof SubmitResponseSchema>;

function toSubmitResponseInput(value: SubmitResponseInput) {
  return {
    answers: value.answers,
    ...(value.metadata !== undefined ? { metadata: value.metadata } : {}),
  };
}

function appValidationError(error: z.ZodError): Error & AppError {
  return Object.assign(new Error('Validation failed'), {
    code: 'VALIDATION' as const,
    messages: error.issues.map((item) => item.message),
  });
}

export const surveyPublicRoutes =
  (deps: SurveyPublicRoutesDeps): FastifyPluginAsync =>
  async (fastify) => {
    await Promise.resolve();

    fastify.get('/:slug', (request) => {
      const params = request.params as { slug: string };
      return deps.service.getBySlug(params.slug);
    });

    fastify.post('/:slug/responses', async (request, reply) => {
      const params = request.params as { slug: string };
      const parsed = SubmitResponseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(appValidationError(parsed.error));
      }
      const input = toSubmitResponseInput(parsed.data);
      const result = await deps.service.submitBySlug(params.slug, input);
      return reply.status(201).send(result);
    });
  };
