import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import { randomUUID } from 'crypto';
import { LAYOUT_VARIANT_IDS } from '@leads-generator/shared';
import type {
  AppError,
  BlockType,
  CarouselWorkflowArtifact,
  MasterTemplateRules,
  LayoutStylePreference,
  ImagePreferenceMode,
} from '@leads-generator/shared';
import type { GenerateRequest } from '../../content/content-generator-service.js';
import { buildCarouselWorkflowArtifact } from '../../content/carousel-workflow.js';
import { GROWHALEY_BRAND_KIT } from '../../content/growhaley-brand.js';
import { buildGrowhaleyDocument, withPreviewPlaceholders } from '../../content/preview-document.js';
import { applySduiTextGuardrails } from '../../content/sdui-text-guardrails.js';
import { withTransaction } from '../../db/transaction.js';
import { ContentTemplateRepository } from '../../repository/content-template-repository.js';
import { ContentGenerationRepository } from '../../repository/content-generation-repository.js';
import { uploadToSupabaseStorage } from '../../content/supabase-storage.js';
import type { TeamAiSettingsService } from '../../auth/team-ai-settings-service.js';
import type { AiBudgetTracker } from '../../ai/ai-budget-tracker.js';
import type { AuditLog } from '../../privacy/audit-log.js';
import type { MasterTemplateService } from '../../content/master-template-service.js';
import type { ContentGeneratorService } from '../../content/content-generator-service.js';
import type { ApprovedExampleService } from '../../content/approved-example-service.js';

export interface ContentRoutesDeps {
  pool: any; // pg Pool
  settings: TeamAiSettingsService;
  budget: AiBudgetTracker;
  audit: Pick<AuditLog, 'recordTx'>;
  // New deps for carousel routes
  masterTemplateService: MasterTemplateService;
  contentGeneratorService: ContentGeneratorService;
  approvedExampleService: ApprovedExampleService;
  // SDUI planner for draft/revise endpoints (Fase 2)
  sduiPlanner?: import('../../content/sdui-planner/index.js').SduiPlanner;
  // Satori renderer for /draft/preview (renders draft slides to PNG, no image gen)
  renderer?: import('../../content/satori-renderer.js').SatoriRenderer;
  // Visual Reference (Fase 3)
  visualRefRepo?: import('../../repository/visual-reference-repository.js').VisualReferenceRepository;
  visualDnaExtractor?: import('../../content/visual-dna-extractor.js').VisualDnaExtractor;
  visualRefStorage?: import('../../storage/object-storage.js').ObjectStorage;
}

const StyleGuideSchema = z.object({
  brandColors: z.array(z.string()).optional(),
  fontStyle: z.string().optional(),
  mood: z.string().optional(),
  layoutRules: z.array(z.string()).optional(),
  doNot: z.array(z.string()).optional(),
});

const TemplateCreateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['instagram', 'email_marketing', 'threads', 'linkedin', 'facebook', 'twitter_x']),
  styleGuide: StyleGuideSchema.default({}),
  systemPrompt: z.string().default(''),
  referenceImages: z.array(z.string()).optional(),
});

const ContentTagsSchema = z.array(z.string().trim().min(1).max(48)).max(10).optional();

const ConversationContextSchema = z
  .array(
    z.object({
      role: z.enum(['user', 'assistant']),
      text: z.string().trim().min(1).max(800),
      createdAt: z.string().max(64).optional(),
    }),
  )
  .max(10)
  .refine((messages) => messages.reduce((sum, message) => sum + message.text.length, 0) <= 5000, {
    message: 'conversationContext is too large',
  })
  .optional();

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

// Local type alias for layout variant IDs (string-based)
type LayoutVariantId = string;
const LAYOUT_STYLE_VALUES = [
  'auto',
  'poster',
  'photo',
  'collage',
] as const satisfies readonly LayoutStylePreference[];
const IMAGE_PREFERENCE_VALUES = ['auto', 'all_slides_image'] as const satisfies readonly ImagePreferenceMode[];

const SDUI_LAYOUT_VARIANTS = LAYOUT_VARIANT_IDS as readonly [LayoutVariantId, ...LayoutVariantId[]];

const GwCompositionSchema = z
  .object({
    palette: z.enum(['lime', 'cream', 'blue', 'ink']).optional(),
    accent: z.enum(['magenta', 'blue', 'lime', 'cream']).optional(),
    headerComposition: z.enum(['staggered', 'left', 'center', 'right']).optional(),
    blob: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'none']).optional(),
    ornaments: z.enum(['none', 'minimal', 'rich']).optional(),
    scatter: z.enum(['cascade', 'zigzag', 'stack']).optional(),
  })
  .optional();

const TypographyOverrideSchema = z.object({
  coverSizePx: z.number().int().min(12).max(180).optional(),
  headerSizePx: z.number().int().min(12).max(180).optional(),
  bodySizePx: z.number().int().min(8).max(96).optional(),
});

const LayoutStyleSchema = z.enum(LAYOUT_STYLE_VALUES).optional();
const ImagePreferenceSchema = z.enum(IMAGE_PREFERENCE_VALUES).optional();

// Shared slide-shape schemas used by /draft/revise and /draft/preview (both
// accept an already-planned deck the user has edited).
const SduiComponentSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  highlight: z.string().optional(),
  label: z.string().optional(),
  items: z.array(z.string()).optional(),
  style: z.enum(['primary', 'secondary']).optional(),
  requires_generation: z.boolean().optional(),
  asset_type: z.string().optional(),
  image_object_context: z.string().optional(),
  imageUrl: z.string().optional(),
  heightPercent: z.number().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  verticalAlign: z.enum(['top', 'center', 'bottom']).optional(),
  textTransform: z.enum(['uppercase', 'none']).optional(),
});
const SduiSlideSchema = z.object({
  slide_number: z.number().int().min(1),
  slide_type: z.enum(['cover', 'content']),
  container_layout: z.enum(['text_dominant', 'split_screen', 'background_overlay']),
  layout_variant_id: z.enum(SDUI_LAYOUT_VARIANTS).optional(),
  layout_family: z.enum(['poster', 'photo', 'collage']).optional(),
  composition: GwCompositionSchema,
  layout_style: LayoutStyleSchema,
  image_preference: ImagePreferenceSchema,
  image_requirement: z.enum(['required', 'optional', 'none']).optional(),
  layout_source: z
    .enum(['ai_selected', 'worker_adjusted', 'ai_repaired_after_image_failure'])
    .optional(),
  image_status: z.enum(['not_needed', 'generated', 'provider_failed_repaired']).optional(),
  typography_scale: z
    .enum(['editorial_bold', 'balanced_classic', 'information_dense'])
    .optional(),
  contentDirection: z.enum(['column', 'row']).optional(),
  nested_groups: z.object({
    top_meta: z.array(SduiComponentSchema).optional(),
    core_content: z.array(SduiComponentSchema).optional(),
    action_footer: z.array(SduiComponentSchema).optional(),
  }),
});

const GenerateRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  aspectRatio: z.enum(['1:1', '4:5', '9:16']).default('1:1'),
  requestedSlideCount: z.number().int().min(1).max(10).optional(),
  typographyOverride: TypographyOverrideSchema.optional(),
  layoutStyle: LayoutStyleSchema,
  imagePreference: ImagePreferenceSchema,
  contentTags: ContentTagsSchema,
  conversationContext: ConversationContextSchema,
  sduiSlides: z
    .array(
      z.object({
        slide_number: z.number().int().min(1),
        slide_type: z.enum(['cover', 'content']),
        container_layout: z.enum(['text_dominant', 'split_screen', 'background_overlay']),
        layout_variant_id: z.enum(SDUI_LAYOUT_VARIANTS).optional(),
        layout_family: z.enum(['poster', 'photo', 'collage']).optional(),
        composition: GwCompositionSchema,
        image_requirement: z.enum(['required', 'optional', 'none']).optional(),
        layout_source: z
          .enum(['ai_selected', 'worker_adjusted', 'ai_repaired_after_image_failure'])
          .optional(),
        image_status: z.enum(['not_needed', 'generated', 'provider_failed_repaired']).optional(),
        typography_scale: z
          .enum(['editorial_bold', 'balanced_classic', 'information_dense'])
          .optional(),
        contentDirection: z.enum(['column', 'row']).optional(),
        nested_groups: z.object({
          top_meta: z.array(z.record(z.unknown())).optional(),
          core_content: z.array(z.record(z.unknown())).optional(),
          action_footer: z.array(z.record(z.unknown())).optional(),
        }),
      }),
    )
    .optional(),
  workflow: z
    .custom<CarouselWorkflowArtifact>(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        (value as { version?: unknown }).version === 1,
    )
    .optional(),
  chosenPlan: z
    .object({
      aspectRatio: z.enum(['1:1', '4:5', '9:16']),
      slides: z.array(
        z.object({
          index: z.number().int().min(0),
          layoutVariantHint: z.string().optional(),
          blocks: z.array(
            z.object({
              type: z.enum([
                'heading',
                'body',
                'mockup',
                'chart',
                'quote',
                'stat',
                'bullet',
                'cta',
                'image',
              ]),
              text: z.string().optional(),
              chartDataRef: z.string().optional(),
              mockupRef: z.string().optional(),
              imageRef: z.string().optional(),
            }),
          ),
        }),
      ),
    })
    .optional(),
  chartData: z
    .array(
      z.object({
        ref: z.string(),
        data: z.object({
          kind: z.enum(['bar', 'line', 'pie']),
          series: z.array(
            z.object({
              label: z.string(),
              value: z.number(),
            }),
          ),
        }),
      }),
    )
    .optional(),
  mockups: z
    .array(
      z.object({
        ref: z.string(),
        objectUrl: z.string().url(),
      }),
    )
    .optional(),
});

// ---------------------------------------------------------------------------
// Master template schema
// ---------------------------------------------------------------------------

const TextLengthLimitSchema = z.object({
  blockType: z.enum([
    'heading',
    'body',
    'mockup',
    'chart',
    'quote',
    'stat',
    'bullet',
    'cta',
    'image',
  ]),
  maxChars: z.number().int().min(1),
});

const MasterTemplateSchema = z.object({
  allowedBlocks: z
    .array(
      z.enum(['heading', 'body', 'mockup', 'chart', 'quote', 'stat', 'bullet', 'cta', 'image']),
    )
    .min(1),
  maxSlides: z.number().int().min(1).max(10),
  textLimits: z.array(TextLengthLimitSchema).default([]),
  aspectRatios: z.array(z.enum(['1:1', '4:5', '9:16'])).min(1),
  defaultTone: z.string().default('professional'),
});

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function appError(error: AppError): Error & AppError {
  const message = 'messages' in error ? error.messages.join(', ') : error.message;
  return Object.assign(new Error(message), error);
}

function mapResultError(error: AppError): never {
  throw appError(error);
}

const INTERNAL_DEFAULT_TEMPLATE_RULES = {
  allowedBlocks: new Set<BlockType>(['heading', 'body', 'quote', 'stat', 'bullet', 'cta', 'image']),
  maxSlides: 7,
  textLimits: new Map<BlockType, number>([
    ['heading', 64],
    ['body', 140],
    ['quote', 120],
    ['stat', 24],
    ['bullet', 42],
    ['cta', 24],
    ['image', 120],
  ]),
  aspectRatios: new Set(['1:1', '4:5', '9:16'] as const),
  defaultTone: 'professional',
} satisfies MasterTemplateRules;

async function templateRulesOrDefaults(
  service: MasterTemplateService,
  teamId: string,
): Promise<MasterTemplateRules> {
  const result = await service.rules(teamId);
  if (result.ok) return result.value;
  if (result.error.code === 'NOT_FOUND') return INTERNAL_DEFAULT_TEMPLATE_RULES;
  throw appError(result.error);
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const contentRoutes =
  (deps: ContentRoutesDeps): FastifyPluginAsync =>
  async (fastify) => {
    const templatesRepo = new ContentTemplateRepository(deps.pool);
    const generationsRepo = new ContentGenerationRepository(deps.pool);

    // ==========================================================================
    // Existing template CRUD routes (unchanged)
    // ==========================================================================

    // 1. Get all templates for a team
    fastify.get(
      '/templates',
      {
        preHandler: [fastify.requireAuth, fastify.requireTeamId],
      },
      async (request) => {
        const params = request.params as { id: string };
        return await templatesRepo.getForTeam(params.id);
      },
    );

    // 2. Create a content template
    fastify.post(
      '/templates',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('ai.configure'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const parsed = TemplateCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          throw appError({
            code: 'VALIDATION',
            messages: parsed.error.errors.map((e) => e.message),
          });
        }

        const input = parsed.data;

        // Pre-generate template UUID to use in file names
        const templateId = randomUUID();

        // 1. Process & upload reference images first (network requests outside transaction)
        const finalUrls: string[] = [];
        if (input.referenceImages && input.referenceImages.length > 0) {
          for (const img of input.referenceImages) {
            try {
              const finalUrl = await processReferenceImage(img, templateId);
              finalUrls.push(finalUrl);
            } catch (err: any) {
              console.error(`Failed processing reference image for template ${templateId}:`, err);
            }
          }
        }

        // 2. Save template and reference URLs in a single DB transaction (atomic)
        const template = await withTransaction(deps.pool, async (tx) => {
          const txTemplatesRepo = new ContentTemplateRepository(tx);

          const createdTemplate = await txTemplatesRepo.create(params.id, {
            id: templateId,
            name: input.name,
            type: input.type,
            styleGuide: input.styleGuide as any,
            systemPrompt: input.systemPrompt,
          });

          for (const url of finalUrls) {
            await txTemplatesRepo.addReferenceImage(templateId, url);
          }

          return {
            ...createdTemplate,
            referenceImages: finalUrls,
          };
        });

        return reply.status(201).send(template);
      },
    );

    // 3. Update a template
    fastify.put(
      '/templates/:templateId',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('ai.configure'),
        ],
      },
      async (request) => {
        const params = request.params as { id: string; templateId: string };
        const parsed = TemplateCreateSchema.partial().safeParse(request.body);
        if (!parsed.success) {
          throw appError({
            code: 'VALIDATION',
            messages: parsed.error.errors.map((e) => e.message),
          });
        }

        const input = parsed.data;

        // 1. If reference images are provided, process & upload them first (outside transaction)
        let finalUrls: string[] | undefined = undefined;
        if (input.referenceImages !== undefined) {
          finalUrls = [];
          for (const img of input.referenceImages) {
            try {
              const finalUrl = await processReferenceImage(img, params.templateId);
              finalUrls.push(finalUrl);
            } catch (err: any) {
              console.error(
                `Failed processing reference image update for template ${params.templateId}:`,
                err,
              );
            }
          }
        }

        // 2. Perform DB update inside a transaction (atomic)
        const template = await withTransaction(deps.pool, async (tx) => {
          const txTemplatesRepo = new ContentTemplateRepository(tx);

          // Check existence first
          const existing = await txTemplatesRepo.getById(params.id, params.templateId);
          if (!existing) {
            return null;
          }

          const updated = await txTemplatesRepo.update(params.id, params.templateId, {
            name: input.name,
            type: input.type,
            styleGuide: input.styleGuide as any,
            systemPrompt: input.systemPrompt,
          });

          if (!updated) {
            return null;
          }

          if (finalUrls !== undefined) {
            await txTemplatesRepo.clearReferenceImages(params.templateId);
            for (const url of finalUrls) {
              await txTemplatesRepo.addReferenceImage(params.templateId, url);
            }
            updated.referenceImages = finalUrls;
          } else {
            // preserve existing references in return value if they weren't updated
            updated.referenceImages = existing.referenceImages;
          }

          return updated;
        });

        if (!template) {
          throw appError({ code: 'NOT_FOUND', message: 'Template not found' });
        }

        return template;
      },
    );

    // 4. Delete a template
    fastify.delete(
      '/templates/:templateId',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('ai.configure'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string; templateId: string };
        const deleted = await templatesRepo.delete(params.id, params.templateId);
        if (!deleted) {
          throw appError({ code: 'NOT_FOUND', message: 'Template not found' });
        }
        return reply.status(204).send();
      },
    );

    // 5. Generate content — superseded by new carousel generator (Task 17)
    // This endpoint is disabled pending migration to ContentGeneratorService.trigger.
    fastify.post(
      '/generate',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('ai.reanalyze'),
        ],
      },
      async (_request, reply) => {
        return reply
          .status(410)
          .send({ error: 'This endpoint has been superseded by the carousel generator.' });
      },
    );

    // 6. Get generation history
    fastify.get(
      '/history',
      {
        preHandler: [fastify.requireAuth, fastify.requireTeamId],
      },
      async (request) => {
        const params = request.params as { id: string };
        return await generationsRepo.getForTeam(params.id);
      },
    );


    // ==========================================================================
    // MASTER TEMPLATE routes (Task 20.1)
    // ==========================================================================

    // PUT /master-template — save; RBAC content.manage
    fastify.put(
      '/master-template',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('content.manage'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const parsed = MasterTemplateSchema.safeParse(request.body);
        if (!parsed.success) {
          throw appError({
            code: 'VALIDATION',
            messages: parsed.error.errors.map((e) => e.message),
          });
        }

        const actorId = request.session!.userId;
        const result = await deps.masterTemplateService.save(params.id, actorId, parsed.data);

        if (!result.ok) mapResultError(result.error);
        return reply.status(200).send(result.value);
      },
    );

    // GET /master-template — get; requireAuth+requireTeamId
    fastify.get(
      '/master-template',
      {
        preHandler: [fastify.requireAuth, fastify.requireTeamId],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const result = await deps.masterTemplateService.get(params.id);
        if (!result.ok) mapResultError(result.error);
        return reply.status(200).send(result.value);
      },
    );

    // GET /master-template/rules — get rules; requireAuth+requireTeamId
    fastify.get(
      '/master-template/rules',
      {
        preHandler: [fastify.requireAuth, fastify.requireTeamId],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const result = await deps.masterTemplateService.rules(params.id);
        if (!result.ok) mapResultError(result.error);

        // Serialize ReadonlySet/ReadonlyMap to plain JSON-serializable structures
        const rules = result.value;
        return reply.status(200).send({
          allowedBlocks: [...rules.allowedBlocks],
          maxSlides: rules.maxSlides,
          textLimits: [...rules.textLimits.entries()].map(([blockType, maxChars]) => ({
            blockType,
            maxChars,
          })),
          aspectRatios: [...rules.aspectRatios],
          defaultTone: rules.defaultTone,
        });
      },
    );

    // ==========================================================================
    // CAROUSEL GENERATE routes (Task 20.2)
    // ==========================================================================

    // POST /carousel/generate — trigger; RBAC content.generate
    fastify.post(
      '/carousel/generate',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('content.generate'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const parsed = GenerateRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          throw appError({
            code: 'VALIDATION',
            messages: parsed.error.errors.map((e) => e.message),
          });
        }

        const actorId = request.session!.userId;

        // Build request object with strict optional properties (exactOptionalPropertyTypes)
        const generateReq: GenerateRequest = {
          prompt: parsed.data.prompt,
          aspectRatio: parsed.data.aspectRatio,
        };
        if (parsed.data.requestedSlideCount !== undefined) {
          generateReq.requestedSlideCount = parsed.data.requestedSlideCount;
        }
        if (parsed.data.chosenPlan !== undefined) {
          generateReq.chosenPlan = parsed.data
            .chosenPlan as import('@leads-generator/shared').ContentPlan;
        }
        if (parsed.data.sduiSlides !== undefined) {
          generateReq.sduiSlides = parsed.data
            .sduiSlides as unknown as import('@leads-generator/shared').SduiSlide[];
        }
        if (parsed.data.workflow !== undefined) {
          generateReq.workflow = parsed.data.workflow;
        }
        if (parsed.data.typographyOverride !== undefined) {
          generateReq.typographyOverride = parsed.data.typographyOverride;
        }
        if (parsed.data.contentTags !== undefined) {
          generateReq.contentTags = parsed.data.contentTags;
        }
        if (parsed.data.conversationContext !== undefined) {
          generateReq.conversationContext = parsed.data.conversationContext;
        }
        if (parsed.data.layoutStyle !== undefined) {
          generateReq.layoutStyle = parsed.data.layoutStyle;
        }
        if (parsed.data.imagePreference !== undefined) {
          generateReq.imagePreference = parsed.data.imagePreference;
        }
        if (parsed.data.chartData !== undefined) {
          generateReq.chartData = parsed.data.chartData;
        }
        if (parsed.data.mockups !== undefined) {
          generateReq.mockups = parsed.data.mockups;
        }

        const result = await deps.contentGeneratorService.trigger(params.id, actorId, generateReq);

        if (!result.ok) mapResultError(result.error);
        return reply.status(201).send(result.value);
      },
    );

    // GET /carousel/jobs/:jobId — get job status; requireAuth+requireTeamId
    fastify.get(
      '/carousel/jobs/:jobId',
      {
        preHandler: [fastify.requireAuth, fastify.requireTeamId],
      },
      async (request, reply) => {
        const params = request.params as { id: string; jobId: string };
        const result = await deps.contentGeneratorService.getJob(params.id, params.jobId);

        if (!result.ok) mapResultError(result.error);
        return reply.status(200).send(result.value);
      },
    );

    // ==========================================================================
    // APPROVED EXAMPLES routes (Task 20.2)
    // ==========================================================================

    // POST /carousel/jobs/:jobId/approve — approve; RBAC content.manage
    fastify.post(
      '/carousel/jobs/:jobId/approve',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('content.manage'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string; jobId: string };
        const actorId = request.session!.userId;
        const result = await deps.approvedExampleService.approve(params.id, actorId, params.jobId);

        if (!result.ok) mapResultError(result.error);
        return reply.status(201).send(result.value);
      },
    );

    // DELETE /carousel/examples/:exampleId/approve — unapprove; RBAC content.manage
    fastify.delete(
      '/carousel/examples/:exampleId/approve',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('content.manage'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string; exampleId: string };
        const actorId = request.session!.userId;
        const result = await deps.approvedExampleService.unapprove(
          params.id,
          actorId,
          params.exampleId,
        );

        if (!result.ok) mapResultError(result.error);
        return reply.status(204).send();
      },
    );

    // GET /carousel/examples — list; requireAuth+requireTeamId
    fastify.get(
      '/carousel/examples',
      {
        preHandler: [fastify.requireAuth, fastify.requireTeamId],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const result = await deps.approvedExampleService.list(params.id);

        if (!result.ok) mapResultError(result.error);
        return reply.status(200).send(result.value);
      },
    );

    // ==========================================================================
    // FASE 2: Draft → Chat Feedback → Revise → Render
    // ==========================================================================

    // POST /carousel/draft — AI planners a set of SduiSlides (no rendering).
    //   Returns the slide draft for the user to review and optionally revise.
    fastify.post(
      '/carousel/draft',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('content.generate'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const DraftSchema = z.object({
          prompt: z.string().min(1).max(2000),
          aspectRatio: z.enum(['1:1', '4:5', '9:16']).default('4:5'),
          slideCount: z.number().int().min(1).max(10).optional(),
          referenceMode: z.enum(['no_reference', 'auto_match', 'manual']).default('no_reference'),
          chosenReferenceId: z.string().optional(),
          typographyOverride: TypographyOverrideSchema.optional(),
          layoutStyle: LayoutStyleSchema,
          imagePreference: ImagePreferenceSchema,
          contentTags: ContentTagsSchema,
          conversationContext: ConversationContextSchema,
        });
        const parsed = DraftSchema.safeParse(request.body);
        if (!parsed.success) {
          throw appError({
            code: 'VALIDATION',
            messages: parsed.error.errors.map((e) => e.message),
          });
        }
        const sduiPlanner = deps.sduiPlanner;
        if (!sduiPlanner)
          throw appError({ code: 'INTERNAL', message: 'SDUI planner not configured' });

        const rules = await templateRulesOrDefaults(deps.masterTemplateService, params.id);

        const count = parsed.data.slideCount
          ? Math.min(parsed.data.slideCount, rules.maxSlides)
          : rules.maxSlides;

        const signal = AbortSignal.timeout(30_000);
        const planInput: import('../../content/sdui-planner/index.js').SduiPlannerInput = {
          teamId: params.id,
          jobId: `draft-${Date.now()}`,
          actorId: request.session!.userId,
          prompt: parsed.data.prompt,
          aspectRatio: parsed.data.aspectRatio,
          slideCount: count,
          maxSlides: rules.maxSlides,
          tone: rules.defaultTone,
          referenceMode: parsed.data.referenceMode,
          typographyOverride: parsed.data.typographyOverride,
          contentTags: parsed.data.contentTags,
          conversationContext: parsed.data.conversationContext,
          layoutStyle: parsed.data.layoutStyle,
          imagePreference: parsed.data.imagePreference,
        };

        // Fase 3: inject reference catalog or chosen reference
        if (parsed.data.referenceMode !== 'no_reference' && deps.visualRefRepo) {
          const allRefs = await deps.visualRefRepo.listByTeam(params.id);
          if (parsed.data.referenceMode === 'auto_match') {
            planInput.referenceCatalog = allRefs.map((r) => ({
              id: r.id,
              name: r.name,
              dna: r.dna,
              tags: r.tags,
            }));
          } else if (parsed.data.referenceMode === 'manual' && parsed.data.chosenReferenceId) {
            const chosen = allRefs.find((r) => r.id === parsed.data.chosenReferenceId);
            if (chosen)
              planInput.chosenReference = { id: chosen.id, name: chosen.name, dna: chosen.dna };
          }
        }

        const planResult = await sduiPlanner.plan(planInput, signal);
        if (!planResult.ok) {
          const kind = planResult.error.kind;
          throw appError({ code: 'INTERNAL', message: `Planning failed: ${kind}` });
        }
        const workflow = buildCarouselWorkflowArtifact({
          prompt: parsed.data.prompt,
          slides: planResult.value.slides,
          brandKit: GROWHALEY_BRAND_KIT,
          source: 'planning',
          stage: 'prompts',
        });
        return reply.status(200).send({
          workflow,
          slides: planResult.value.slides,
          aspectRatio: parsed.data.aspectRatio,
          chosenReferenceId: planResult.value.chosenReferenceId ?? null,
        });
      },
    );

    // POST /carousel/draft/revise — feed user chat feedback to AI; returns updated slides.
    fastify.post(
      '/carousel/draft/revise',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('content.generate'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string };

        const ReviseSchema = z.object({
          prompt: z.string().min(1).max(2000),
          aspectRatio: z.enum(['1:1', '4:5', '9:16']).default('4:5'),
          slides: z.array(SduiSlideSchema).min(1).max(10),
          workflow: z
            .custom<CarouselWorkflowArtifact>(
              (value) =>
                typeof value === 'object' &&
                value !== null &&
                (value as { version?: unknown }).version === 1,
            )
            .optional(),
          feedback: z.string().min(1).max(1000),
          typographyOverride: TypographyOverrideSchema.optional(),
          layoutStyle: LayoutStyleSchema,
          imagePreference: ImagePreferenceSchema,
          contentTags: ContentTagsSchema,
          conversationContext: ConversationContextSchema,
        });

        const parsed = ReviseSchema.safeParse(request.body);
        if (!parsed.success) {
          throw appError({
            code: 'VALIDATION',
            messages: parsed.error.errors.map((e) => e.message),
          });
        }
        const sduiPlanner = deps.sduiPlanner;
        if (!sduiPlanner)
          throw appError({ code: 'INTERNAL', message: 'SDUI planner not configured' });

        const rules = await templateRulesOrDefaults(deps.masterTemplateService, params.id);

        const signal = AbortSignal.timeout(30_000);
        const reviseResult = await sduiPlanner.plan(
          {
            teamId: params.id,
            jobId: `revise-${Date.now()}`,
            actorId: request.session!.userId,
            prompt: parsed.data.prompt,
            aspectRatio: parsed.data.aspectRatio,
            slideCount: parsed.data.slides.length,
            maxSlides: rules.maxSlides,
            tone: rules.defaultTone,
            feedback: parsed.data.feedback,
            previousSlides: parsed.data.slides as import('@leads-generator/shared').SduiSlide[],
            typographyOverride: parsed.data.typographyOverride,
            contentTags: parsed.data.contentTags,
            conversationContext: parsed.data.conversationContext,
            layoutStyle: parsed.data.layoutStyle,
            imagePreference: parsed.data.imagePreference,
          },
          signal,
        );
        if (!reviseResult.ok) {
          throw appError({
            code: 'INTERNAL',
            message: `Revision failed: ${reviseResult.error.kind}`,
          });
        }
        const previousWorkflow =
          typeof (request.body as { workflow?: unknown }).workflow === 'object' &&
          (request.body as { workflow?: unknown }).workflow !== null
            ? (request.body as { workflow: CarouselWorkflowArtifact }).workflow
            : undefined;
        const workflow = buildCarouselWorkflowArtifact({
          prompt: parsed.data.prompt,
          slides: reviseResult.value.slides,
          brandKit: GROWHALEY_BRAND_KIT,
          source: 'planning',
          previous: previousWorkflow,
          stage: 'prompts',
        });
        return reply.status(200).send({
          workflow,
          slides: reviseResult.value.slides,
          aspectRatio: parsed.data.aspectRatio,
        });
      },
    );

    // POST /carousel/draft/preview — render already-planned slides to PNG for
    // the visual draft grid. NO image generation, NO AI call, NO DB job row:
    // it's a pure render (~200-300ms/slide) used to preview/iterate layout &
    // composition before committing to a final job.
    //
    // Returns base64 data URIs (not object-storage URLs): preview PNGs are
    // ephemeral (single-tenant, ~5 slides ≈ ~1MB) so uploading them would only
    // litter storage and add a round-trip.
    fastify.post(
      '/carousel/draft/preview',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('content.generate'),
        ],
      },
      async (request, reply) => {
        const PreviewSchema = z.object({
          aspectRatio: z.enum(['1:1', '4:5', '9:16']).default('4:5'),
          slides: z.array(SduiSlideSchema).min(1).max(10),
          typographyOverride: TypographyOverrideSchema.optional(),
        });
        const parsed = PreviewSchema.safeParse(request.body);
        if (!parsed.success) {
          throw appError({
            code: 'VALIDATION',
            messages: parsed.error.errors.map((e) => e.message),
          });
        }
        const renderer = deps.renderer;
        if (!renderer) throw appError({ code: 'INTERNAL', message: 'Renderer not configured' });

        type Slide = import('@leads-generator/shared').SduiSlide;
        const typography = parsed.data.typographyOverride;
        const inputSlides = parsed.data.slides as unknown as Slide[];

        // Guardrail each slide for RENDER only, and flag whether the text had to
        // be adjusted to fit the (possibly newly-chosen) layout — the UI shows a
        // "text adjusted" hint so the user can ask AI to rewrite for that layout.
        const guarded = inputSlides.map((slide) => {
          const next = applySduiTextGuardrails(slide, { typography });
          const adjusted = JSON.stringify(next) !== JSON.stringify(slide);
          return { slide: next, adjusted };
        });

        // Placeholder photos keep photo/collage layouts intact in preview (an
        // empty image slot would downgrade them to a poster template).
        const renderSlides = guarded.map((g) => ({
          slide: withPreviewPlaceholders(g.slide),
          adjusted: g.adjusted,
        }));
        const doc = buildGrowhaleyDocument(
          parsed.data.aspectRatio,
          renderSlides.map((r) => r.slide),
        );

        const items = await Promise.all(
          renderSlides.map(async ({ slide, adjusted }) => {
            const { png, metrics } = await renderer.renderSlideWithMetrics(slide, doc, []);
            return {
              slide_number: slide.slide_number,
              png: `data:image/png;base64,${png.toString('base64')}`,
              adjusted,
              metrics: {
                contentUsageRatio: metrics.contentUsageRatio,
                overflow: metrics.overflow,
              },
            };
          }),
        );

        return reply.status(200).send({ aspectRatio: parsed.data.aspectRatio, items });
      },
    );

    // POST /carousel/jobs/:jobId/slides/:slideIndex/regenerate — regen a single slide.
    fastify.post(
      '/carousel/jobs/:jobId/slides/:slideIndex/regenerate',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('content.generate'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string; jobId: string; slideIndex: string };
        const sduiPlanner = deps.sduiPlanner;
        if (!sduiPlanner)
          throw appError({ code: 'INTERNAL', message: 'SDUI planner not configured' });

        const RegenSchema = z.object({
          prompt: z.string().min(1).max(2000),
          aspectRatio: z.enum(['1:1', '4:5', '9:16']).default('4:5'),
          feedback: z.string().min(1).max(500),
          totalSlides: z.number().int().min(1).max(10),
          typographyOverride: TypographyOverrideSchema.optional(),
          layoutStyle: LayoutStyleSchema,
          imagePreference: ImagePreferenceSchema,
          contentTags: ContentTagsSchema,
          conversationContext: ConversationContextSchema,
        });
        const parsed = RegenSchema.safeParse(request.body);
        if (!parsed.success) {
          throw appError({
            code: 'VALIDATION',
            messages: parsed.error.errors.map((e) => e.message),
          });
        }
        const rules = await templateRulesOrDefaults(deps.masterTemplateService, params.id);

        const slideIdx = Number(params.slideIndex);
        const isCover = slideIdx === 0;
        const specificPrompt =
          `Generate ONLY ONE slide (slide number ${slideIdx + 1} of ${parsed.data.totalSlides}). ` +
          `Type: ${isCover ? 'cover' : 'content'}. ` +
          `The user wants: "${parsed.data.feedback}". ` +
          `Original topic: ${parsed.data.prompt}`;

        const signal = AbortSignal.timeout(20_000);
        const result = await sduiPlanner.plan(
          {
            teamId: params.id,
            jobId: `regen-${params.jobId}-${slideIdx}`,
            actorId: request.session!.userId,
            prompt: specificPrompt,
            aspectRatio: parsed.data.aspectRatio,
            slideCount: 1,
            maxSlides: rules.maxSlides,
            tone: rules.defaultTone,
            typographyOverride: parsed.data.typographyOverride,
            contentTags: parsed.data.contentTags,
            conversationContext: parsed.data.conversationContext,
            layoutStyle: parsed.data.layoutStyle,
            imagePreference: parsed.data.imagePreference,
          },
          signal,
        );
        if (!result.ok) {
          throw appError({ code: 'INTERNAL', message: `Regen failed: ${result.error.kind}` });
        }
        // Return just the one slide, renumbered correctly.
        const newSlide = result.value.slides[0];
        if (!newSlide) throw appError({ code: 'INTERNAL', message: 'No slide generated' });
        return reply.status(200).send({ slide: { ...newSlide, slide_number: slideIdx + 1 } });
      },
    );

    // ==========================================================================
    // FASE 3: Visual Reference Management
    // ==========================================================================

    // POST /carousel/references — upload + extract DNA
    fastify.post(
      '/carousel/references',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('content.manage'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const UploadSchema = z.object({
          name: z.string().min(1).max(100),
          base64: z.string().min(1),
          contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']).default('image/png'),
          tags: z.array(z.string()).default([]),
        });
        const parsed = UploadSchema.safeParse(request.body);
        if (!parsed.success) {
          throw appError({
            code: 'VALIDATION',
            messages: parsed.error.errors.map((e) => e.message),
          });
        }
        const { visualRefRepo, visualDnaExtractor, visualRefStorage } = deps;
        if (!visualRefRepo || !visualDnaExtractor || !visualRefStorage) {
          throw appError({ code: 'INTERNAL', message: 'Visual reference service not configured' });
        }

        const bytes = Buffer.from(parsed.data.base64, 'base64');
        if (bytes.length > 5 * 1024 * 1024) {
          throw appError({ code: 'VALIDATION', messages: ['Image must be ≤ 5 MB'] });
        }

        // Upload image
        const key = `visual-references/${randomUUID()}.${parsed.data.contentType.split('/')[1]}`;
        const uploadResult = await visualRefStorage.upload(
          params.id,
          key,
          bytes,
          parsed.data.contentType,
        );
        if (!uploadResult.ok) throw appError({ code: 'INTERNAL', message: 'Upload failed' });

        // Extract Visual DNA
        const dna = await visualDnaExtractor.extract(
          params.id,
          parsed.data.base64,
          parsed.data.contentType,
        );

        // Save to DB
        const ref = await visualRefRepo.insert(params.id, {
          name: parsed.data.name,
          imageUrl: uploadResult.value,
          dna,
          tags: parsed.data.tags,
        });

        return reply.status(201).send(ref);
      },
    );

    // GET /carousel/references — list
    fastify.get(
      '/carousel/references',
      {
        preHandler: [fastify.requireAuth, fastify.requireTeamId],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const { visualRefRepo } = deps;
        if (!visualRefRepo)
          throw appError({ code: 'INTERNAL', message: 'Visual reference service not configured' });
        const refs = await visualRefRepo.listByTeam(params.id);
        return reply.status(200).send(refs);
      },
    );

    // DELETE /carousel/references/:refId — delete
    fastify.delete(
      '/carousel/references/:refId',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('content.manage'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string; refId: string };
        const { visualRefRepo } = deps;
        if (!visualRefRepo)
          throw appError({ code: 'INTERNAL', message: 'Visual reference service not configured' });
        const deleted = await visualRefRepo.delete(params.id, params.refId);
        if (!deleted) throw appError({ code: 'NOT_FOUND', message: 'Reference not found' });
        return reply.status(204).send();
      },
    );
  };

async function processReferenceImage(imageStr: string, templateId: string): Promise<string> {
  if (imageStr.startsWith('data:')) {
    const match = imageStr.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid data URI format');
    const contentType = match[1]!;
    const base64Data = match[2]!;
    const buffer = Buffer.from(base64Data, 'base64');

    // Enforce 1MB file size limit on reference images
    if (buffer.byteLength > 1024 * 1024) {
      throw appError({ code: 'VALIDATION', messages: ['File size exceeds 1MB limit'] });
    }

    const ext = contentType.split('/')[1] || 'png';
    const fileName = `ref-${templateId}-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

    return await uploadToSupabaseStorage(fileName, buffer, contentType);
  }
  return imageStr;
}
