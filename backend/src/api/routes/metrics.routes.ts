import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import type { MetricsService } from '../../metrics/metrics-service.js';
import type { AppError } from '@leads-generator/shared';

export interface MetricsRoutesDeps {
  metricsService: MetricsService;
}

const MetricsQuerySchema = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
});

export const metricsRoutes = (deps: MetricsRoutesDeps): FastifyPluginAsync => async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId]
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const parseResult = MetricsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      throw { code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) } as AppError;
    }

    const { start, end } = parseResult.data;
    const range = start && end ? { from: new Date(start), to: new Date(end) } : undefined;

    const result = await deps.metricsService.compute(params.id, range);
    if (!result.ok) throw result.error;

    return reply.status(200).send(result.value);
  });
};
