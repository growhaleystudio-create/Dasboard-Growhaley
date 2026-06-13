import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import type { ExportService } from '../../privacy/export-service.js';
import type { DsarService } from '../../privacy/dsar-service.js';
import type { AppError } from '@leads-generator/shared';

export interface PrivacyRoutesDeps {
  exportService: ExportService;
  dsarService: DsarService;
}

const DsarSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional(),
  verified: z.boolean().default(false),
});

export const privacyRoutes = (deps: PrivacyRoutesDeps): FastifyPluginAsync => async (fastify) => {
  fastify.post('/export', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('export.run')]
  }, async (request, reply) => {
    const result = await deps.exportService.exportLeads(request.session!);
    if (!result.ok) throw result.error;
    
    const artifact = result.value;
    reply.header('Content-Disposition', `attachment; filename="${artifact.filename}"`);
    reply.header('Content-Type', artifact.contentType);
    return reply.status(200).send(artifact.csv);
  });

  fastify.post('/dsar', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('team.manage')]
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const parseResult = DsarSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw { code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) } as AppError;
    }

    const input = parseResult.data;
    
    // PersonalDataCriteria requires at least one field
    const subject: { name?: string; publicContact?: string } = {};
    if (input.email) subject.publicContact = input.email;
    if (input.name) subject.name = input.name;
    
    if (Object.keys(subject).length === 0) {
      throw { code: 'VALIDATION', messages: ['Minimal butuh satu kriteria (email atau nama)'] } as AppError;
    }

    const result = await deps.dsarService.process({
      teamId: params.id,
      verified: input.verified,
      subject: subject as any,
    });
    
    if (!result.ok) throw result.error;
    
    return reply.status(200).send(result.value);
  });
};
