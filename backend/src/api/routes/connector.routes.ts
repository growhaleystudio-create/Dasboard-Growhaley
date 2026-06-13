import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import type { ConnectorActivationService } from '../../connector/activation.js';
import type { Connector_Registry } from '../../connector/registry.js';
import type { AppError } from '@leads-generator/shared';

export interface ConnectorRoutesDeps {
  registry: Connector_Registry;
  activation: ConnectorActivationService;
}

const ActivateSchema = z.object({
  apiKey: z.string().min(1),
});

export const connectorRoutes = (deps: ConnectorRoutesDeps): FastifyPluginAsync => async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId]
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const connectors = await deps.registry.listForTeam(params.id);
    const credentialPresence = await deps.activation.listCredentialPresence(params.id);
    const connectedBySource = new Map(
      credentialPresence.map((item) => [item.sourceId, item.connected]),
    );
    return reply.status(200).send(
      connectors.map((connector) => ({
        ...connector,
        connected: (connectedBySource.get(connector.sourceId) ?? false) || hasServerManagedCredential(connector.sourceId),
      })),
    );
  });

  fastify.post('/:sourceId/activate', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('connector.manage')]
  }, async (request, reply) => {
    const params = request.params as { id: string; sourceId: string };
    const parseResult = ActivateSchema.safeParse(request.body);
    
    if (!parseResult.success) {
      throw { code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) } as AppError;
    }

    const input = parseResult.data;
    const result = await deps.activation.activate(params.id, params.sourceId, input.apiKey);
    
    if (!result.ok) throw result.error;
    
    return reply.status(200).send(result.value);
  });

  fastify.delete('/:sourceId', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('connector.manage')]
  }, async (request, reply) => {
    const params = request.params as { id: string; sourceId: string };
    await deps.activation.remove(params.id, params.sourceId);
    return reply.status(204).send();
  });
};

function hasServerManagedCredential(sourceId: string): boolean {
  if (sourceId !== 'google') return false;
  return Boolean(process.env.APIFY_TOKEN || process.env.RAPIDAPI_KEY);
}
