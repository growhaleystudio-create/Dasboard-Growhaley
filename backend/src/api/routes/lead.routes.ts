import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import type { LeadManager } from '../../lead/lead-manager.js';
import type { LeadFilter } from '../../lead-query/lead-filter.js';
import type { LeadQueryService } from '../../lead-query/lead-query-service.js';
import type { AIState, AppError, LeadStatus } from '@leads-generator/shared';

export interface LeadRoutesDeps {
  manager: LeadManager;
  query: LeadQueryService;
}

const LeadStatusSchema = z.enum(['New', 'Reviewed', 'Contacted', 'Qualified', 'Converted', 'Rejected']);
const AiStatusSchema = z.enum(['none', 'pending', 'success', 'unavailable']);

const QuerySchema = z.object({
  search: z.string().optional(),
  status: z.union([LeadStatusSchema, z.array(LeadStatusSchema)]).optional().transform(v => typeof v === 'string' ? [v] : v),
  aiStatus: z.union([AiStatusSchema, z.array(AiStatusSchema)]).optional().transform(v => typeof v === 'string' ? [v] : v),
  sourceId: z.union([z.string(), z.array(z.string())]).optional().transform(v => typeof v === 'string' ? [v] : v),
  rating: z.union([z.coerce.number().int().min(1).max(5), z.array(z.coerce.number().int().min(1).max(5))]).optional().transform(v => Array.isArray(v) ? v : v === undefined ? undefined : [v]),
  website: z.union([z.enum(['have_website', 'no_website']), z.array(z.enum(['have_website', 'no_website']))]).optional().transform(v => typeof v === 'string' ? [v] : v),
  minScore: z.coerce.number().int().optional(),
  maxScore: z.coerce.number().int().optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(20).default(10),
});

const ChangeStatusSchema = z.object({
  status: z.enum(['New', 'Reviewed', 'Contacted', 'Qualified', 'Converted', 'Rejected']),
});

const AddNoteSchema = z.object({
  body: z.string().min(1).max(2000),
});

const DeleteSchema = z.object({
  confirmed: z.boolean().default(false),
});

function toThrowable(error: AppError): Error & AppError {
  const message = 'message' in error ? error.message : error.messages.join(', ');
  return Object.assign(new Error(message), error);
}

// Fastify's plugin contract is async even though route registration itself is synchronous.
// eslint-disable-next-line @typescript-eslint/require-await
export const leadRoutes = (deps: LeadRoutesDeps): FastifyPluginAsync => async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId]
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const parseResult = QuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      throw toThrowable({ code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) });
    }

    const { page, pageSize, ...filter } = parseResult.data;
    
    // Convert to the exact LeadFilter shape
    const leadFilter: LeadFilter = {};
    if (filter.search !== undefined) leadFilter.search = filter.search;
    const statuses = filter.status as LeadStatus[] | undefined;
    const aiStates = filter.aiStatus as AIState[] | undefined;
    if (statuses !== undefined) leadFilter.statuses = statuses;
    if (aiStates !== undefined) leadFilter.aiStates = aiStates;
    if (filter.sourceId !== undefined) leadFilter.sources = filter.sourceId;
    if (filter.rating !== undefined) leadFilter.ratings = filter.rating;
    if (filter.website !== undefined) leadFilter.websiteStatuses = filter.website;
    if (filter.minScore !== undefined) leadFilter.scoreMin = filter.minScore;
    if (filter.maxScore !== undefined) leadFilter.scoreMax = filter.maxScore;
    if (filter.start !== undefined) leadFilter.discoveredFrom = new Date(filter.start);
    if (filter.end !== undefined) leadFilter.discoveredTo = new Date(filter.end);
    
    const result = await deps.query.list(params.id, leadFilter, page, pageSize);
    if (!result.ok) throw toThrowable(result.error);
    
    return reply.status(200).send(result.value);
  });

  fastify.put('/:leadId/status', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('lead.status.change')]
  }, async (request, reply) => {
    const params = request.params as { id: string, leadId: string };
    const parseResult = ChangeStatusSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw toThrowable({ code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) });
    }

    const result = await deps.manager.changeStatus(request.session!, params.leadId, parseResult.data.status);
    if (!result.ok) throw toThrowable(result.error);
    
    return reply.status(200).send(result.value);
  });

  fastify.post('/:leadId/notes', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('note.write')]
  }, async (request, reply) => {
    const params = request.params as { id: string, leadId: string };
    const parseResult = AddNoteSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw toThrowable({ code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) });
    }

    const result = await deps.manager.addNote(request.session!, params.leadId, parseResult.data.body);
    if (!result.ok) throw toThrowable(result.error);
    
    return reply.status(201).send(result.value);
  });

  fastify.delete('/:leadId', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('lead.delete')]
  }, async (request, reply) => {
    const params = request.params as { id: string, leadId: string };
    const parseResult = DeleteSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw toThrowable({ code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) });
    }

    const result = await deps.manager.deleteLead(request.session!, params.leadId, parseResult.data.confirmed);
    if (!result.ok) throw toThrowable(result.error);
    
    if (!result.value.deleted) {
      return reply.status(200).send({ message: 'Lead not deleted, confirmation required' });
    }
    
    return reply.status(204).send();
  });
};
