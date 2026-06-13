import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import type { ScanConfigService } from '../../scan/scan-config-service.js';
import type { ScanConfigurationRepository } from '../../repository/scan-configuration-repository.js';
import type { AppError } from '@leads-generator/shared';

import type { ScanSummary, Result } from '@leads-generator/shared';

export interface ScanRoutesDeps {
  scanConfigService: ScanConfigService;
  configs: Pick<ScanConfigurationRepository, 'listForTeam' | 'findById'>;
  executeScan: (input: { teamId: string, query: { keywords: string[], niche?: string, location?: string }, sourceIds: string[], aiEnabled?: boolean }) => Promise<Result<ScanSummary>>;
}

const ConfigSchema = z.object({
  keywords: z.array(z.string()).min(1),
  niche: z.string().optional(),
  location: z.string().optional(),
  sourceIds: z.array(z.string()).min(1),
  scheduleIntervalMinutes: z.number().int().positive().optional(),
  aiEnabled: z.boolean().optional(),
});

export const scanRoutes = (deps: ScanRoutesDeps): FastifyPluginAsync => async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId]
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const configs = await deps.configs.listForTeam(params.id);
    return reply.status(200).send(configs);
  });

  fastify.get('/:configId', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId]
  }, async (request, reply) => {
    const params = request.params as { id: string, configId: string };
    const config = await deps.configs.findById(params.id, params.configId);
    if (!config) {
      throw { code: 'NOT_FOUND', message: 'Config not found' } as AppError;
    }
    return reply.status(200).send(config);
  });

  fastify.post('/', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('scan.execute')]
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const parseResult = ConfigSchema.safeParse(request.body);
    if (!parseResult.success) {
      request.log.error({ err: parseResult.error }, 'validation failed for scan config');
      throw { code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) } as AppError;
    }

    const input = parseResult.data;
    const result = await deps.scanConfigService.save(params.id, input as any);
    
    if (!result.ok) {
      request.log.error({ err: result.error }, 'scanConfigService.save returned error');
      throw result.error;
    }
    
    return reply.status(201).send(result.value);
  });

  fastify.post('/:configId/run', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('scan.execute')]
  }, async (request, reply) => {
    const params = request.params as { id: string, configId: string };
    const config = await deps.configs.findById(params.id, params.configId);
    if (!config) {
      throw { code: 'NOT_FOUND', message: 'Config not found' } as AppError;
    }

    const result = await deps.executeScan({
      teamId: params.id,
      query: {
        keywords: config.keywords,
        ...(config.niche !== undefined ? { niche: config.niche } : {}),
        ...(config.location !== undefined ? { location: config.location } : {}),
      },
      sourceIds: config.sourceIds,
      ...(config.aiEnabled !== undefined ? { aiEnabled: config.aiEnabled } : {}),
    });

    if (!result.ok) throw result.error;

    return reply.status(200).send(result.value);
  });
};
