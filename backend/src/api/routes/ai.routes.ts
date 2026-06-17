import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import type { TeamAiSettingsService } from '../../auth/team-ai-settings-service.js';
import type { AiReanalyzeService } from '../../ai/ai-reanalyze-service.js';
import type { AiCallLogRepository } from '../../repository/ai-call-log-repository.js';
import type { AppError } from '@leads-generator/shared';
import { providerKindFromBaseUrl } from '../../content/provider-key-routing.js';

export interface AiRoutesDeps {
  settings: TeamAiSettingsService;
  reanalyze: AiReanalyzeService;
  callLog: AiCallLogRepository;
}

const AiSettingsSchema = z.object({
  apiKey: z.string().optional(),
  apiKeys: z
    .object({
      leads: z.string().optional(),
      contentSuggestion: z.string().optional(),
      imageGeneration: z.string().optional(),
    })
    .optional(),
  apiBaseUrls: z
    .object({
      text: z.string().optional(),
      imageGeneration: z.string().optional(),
    })
    .optional(),
  aiEnabled: z.boolean().optional(),
  callBudget30d: z.number().int().min(0).optional(),
  aiIntentFactorWeight: z.number().min(0).optional(),
  textModel: z.string().optional(),
  imageModel: z.string().optional(),
});

function appError(error: AppError): Error & AppError {
  const message = 'messages' in error ? error.messages.join(', ') : error.message;
  return Object.assign(new Error(message), error);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid AI settings';
}

function isImaginerBaseUrl(rawBaseUrl: string): boolean {
  try {
    return new URL(rawBaseUrl).hostname === 'imaginer.mirava.studio';
  } catch {
    return false;
  }
}

function mapImaginerModels(data: unknown): Array<{ id: string; name: string }> {
  const models = (data as { models?: unknown }).models;
  if (!Array.isArray(models)) return [];

  return models
    .map((model) => {
      const m = model as { id?: unknown; display_name?: unknown; enabled?: unknown };
      if (typeof m.id !== 'string' || !m.id.trim()) return null;
      if (m.enabled === false) return null;

      return {
        id: m.id,
        name: typeof m.display_name === 'string' && m.display_name.trim()
          ? m.display_name
          : m.id,
      };
    })
    .filter((model): model is { id: string; name: string } => model !== null);
}

export const aiRoutes = (deps: AiRoutesDeps): FastifyPluginAsync => (fastify) => {
  fastify.get('/usage', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId]
  }, async (request) => {
    const params = request.params as { id: string };
    const settings = await deps.settings.getSettings(params.id);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const used = await deps.callLog.countSince(params.id, since);
    const byOutcome = await deps.callLog.countByOutcomeSince(params.id, since);
    const tokenUsage = await deps.callLog.sumTokensSince(params.id, since);
    const budget = settings.callBudget30d;
    const usagePercent = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;

    return {
      callsUsed: used,
      budget,
      usagePercent,
      remaining: Math.max(0, budget - used),
      windowDays: 30,
      aiEnabled: settings.aiEnabled,
      hasApiKey: settings.hasApiKey,
      hasApiKeys: {
        leads: settings.hasLeadsApiKey,
        contentSuggestion: settings.hasContentSuggestionApiKey,
        imageGeneration: settings.hasImageGenerationApiKey,
      },
      apiBaseUrls: {
        text: settings.textApiBaseUrl,
        imageGeneration: settings.imageGenerationApiBaseUrl,
      },
      models: {
        text: settings.textModel,
        imageGeneration: settings.imageModel,
      },
      byOutcome,
      tokenUsage,
    };
  });

  fastify.put('/settings', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('ai.configure')]
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const parseResult = AiSettingsSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw appError({ code: 'VALIDATION', messages: parseResult.error.errors.map((error) => error.message) });
    }

    const input = parseResult.data;
    
    try {
      if (input.apiKey !== undefined) {
        if (input.apiKey === '') {
          await Promise.all([
            deps.settings.clearApiKey(params.id, 'leads'),
            deps.settings.clearApiKey(params.id, 'content_suggestion'),
            deps.settings.clearApiKey(params.id, 'image_generation'),
          ]);
        } else {
          await Promise.all([
            deps.settings.setApiKey(params.id, input.apiKey, 'leads'),
            deps.settings.setApiKey(params.id, input.apiKey, 'content_suggestion'),
            deps.settings.setApiKey(params.id, input.apiKey, 'image_generation'),
          ]);
        }
      }
      if (input.apiKeys !== undefined) {
        const updates = [
          ['leads', input.apiKeys.leads],
          ['content_suggestion', input.apiKeys.contentSuggestion],
          ['image_generation', input.apiKeys.imageGeneration],
        ] as const;
        for (const [purpose, key] of updates) {
          if (key === undefined) continue;
          if (key === '') {
            await deps.settings.clearApiKey(params.id, purpose);
          } else {
            await deps.settings.setApiKey(params.id, key, purpose);
          }
        }
      }
      if (input.apiBaseUrls !== undefined) {
        if (input.apiBaseUrls.text !== undefined) {
          await Promise.all([
            deps.settings.setApiBaseUrl(params.id, input.apiBaseUrls.text, 'leads'),
            deps.settings.setApiBaseUrl(params.id, input.apiBaseUrls.text, 'content_suggestion'),
          ]);
        }
        if (input.apiBaseUrls.imageGeneration !== undefined) {
          await deps.settings.setApiBaseUrl(params.id, input.apiBaseUrls.imageGeneration, 'image_generation');
        }
      }
      if (input.aiEnabled !== undefined) {
        await deps.settings.setAiEnabled(params.id, input.aiEnabled);
      }
      if (input.callBudget30d !== undefined) {
        await deps.settings.setCallBudget30d(params.id, input.callBudget30d);
      }
      if (input.aiIntentFactorWeight !== undefined) {
        await deps.settings.setAiIntentFactorWeight(params.id, input.aiIntentFactorWeight);
      }
      if (input.textModel !== undefined) {
        await deps.settings.setTextModel(params.id, input.textModel);
      }
      if (input.imageModel !== undefined) {
        await deps.settings.setImageModel(params.id, input.imageModel);
      }
    } catch (error: unknown) {
      throw appError({ code: 'VALIDATION', messages: [errorMessage(error)] });
    }

    const updated = await deps.settings.getSettings(params.id);
    return reply.status(200).send(updated);
  });

  fastify.post('/leads/:leadId/reanalyze', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('ai.reanalyze')]
  }, async (request, reply) => {
    const params = request.params as { id: string, leadId: string };
    const result = await deps.reanalyze.reanalyze(params.id, params.leadId, request.session!.userId);
    if (!result.ok) throw appError(result.error);
    
    return reply.status(200).send(result.value);
  });

  fastify.get('/available-models', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId]
  }, async (request) => {
    const params = request.params as { id: string };
    const query = request.query as { purpose?: string };
    const purpose = query.purpose === 'image' ? 'image' : 'text';

    const FALLBACK_TEXT_MODELS = [
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    ];

    const FALLBACK_IMAGE_MODELS = [
      { id: 'gpt-image-1', name: 'GPT Image 1 (OpenAI-compatible)' },
      { id: 'gpt-image-2', name: 'GPT Image 2 (OpenAI-compatible)' },
      { id: 'imagen-3.0-generate-002', name: 'Imagen 3.0 Generate 002' },
      { id: 'dall-e-3', name: 'DALL-E 3' },
    ];

    const fallbackList = purpose === 'image' ? FALLBACK_IMAGE_MODELS : FALLBACK_TEXT_MODELS;

    const apiKey = await deps.settings.loadApiKey(params.id, purpose === 'image' ? 'image_generation' : 'leads');
    const rawBaseUrl = await deps.settings.loadApiBaseUrl(params.id, purpose === 'image' ? 'image_generation' : 'leads');

    if (!apiKey || !rawBaseUrl) {
      return fallbackList;
    }

    try {
      const providerKind = providerKindFromBaseUrl(rawBaseUrl);
      if (providerKind === 'google') {
        const url = `${rawBaseUrl}/v1beta/models?key=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Google API failed: ${res.status}`);
        const data: any = await res.json();
        if (Array.isArray(data.models)) {
          const mapped = data.models
            .map((m: any) => {
              const cleanId = m.name?.replace(/^models\//, '') || '';
              return {
                id: cleanId,
                name: m.displayName || cleanId,
              };
            })
            .filter((m: any) => m.id);
          
          if (mapped.length > 0) return mapped;
        }
      } else if (purpose === 'image' && isImaginerBaseUrl(rawBaseUrl)) {
        const url = `${rawBaseUrl}/api/public/v1/models`;
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        if (!res.ok) throw new Error(`Imaginer API failed: ${res.status}`);
        const data: any = await res.json();
        const mapped = mapImaginerModels(data);

        if (mapped.length > 0) return mapped;
      } else {
        const url = `${rawBaseUrl}/v1/models`;
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        if (!res.ok) throw new Error(`OpenAI API failed: ${res.status}`);
        const data: any = await res.json();
        if (Array.isArray(data.data)) {
          const mapped = data.data
            .map((m: any) => ({
              id: m.id,
              name: m.id,
            }))
            .filter((m: any) => m.id);

          if (mapped.length > 0) return mapped;
        }
      }
    } catch (err) {
      fastify.log.warn(`Failed to fetch models from provider: ${err}`);
    }

    return fallbackList;
  });

  return Promise.resolve();
};
