/**
 * sdui-carousel-worker.ts — BullMQ worker for the Server-Driven UI carousel
 * pipeline (feature-update.md v2).
 *
 * Pipeline per job (fail-fast, attempts: 1):
 *   1. Load job + optional master template + brand kit
 *   2. Build theme_config from the locked Brand Kit
 *   3. SDUI PLANNER → slides (No-Reference mode); enforce exact slide count
 *   4. For each slide needing an image → generate via image client (sync)
 *   5. SATORI RENDER each slide → PNG → upload → slide row
 *   6. All slides success → mark job success
 */

import { Worker, type Job } from 'bullmq';
import type { RedisOptions } from 'ioredis';

import type { SduiSlide, SduiDocument, SduiTypographyOverride } from '@leads-generator/shared';
import { CONTENT_JOB_MAX_RUNTIME_MS } from '@leads-generator/shared';

import type { ContentGenerationJobPayload } from './content-generator-service.js';
import { CONTENT_GENERATION_QUEUE_NAME } from './content-generator-service.js';
import type { SduiPlanner } from './sdui-planner/index.js';
import {
  ensureExplicitImageRequest,
  promptExplicitlyRequestsImages,
  promptExplicitlyRequestsNoImages,
} from './sdui-planner/index.js';
import { layoutStyleGroupById } from '@leads-generator/shared';
import { applySduiTextGuardrails } from './sdui-text-guardrails.js';
import type { SatoriRenderer, BrandFontRef } from './satori-renderer.js';
import type { BackgroundImageClient } from './background-image-client.js';
import type { ObjectStorage } from './object-storage.js';
import { generateSlideImages } from './workers/pipeline/image-generation-handler.js';
import { renderAndUploadSlides } from './workers/pipeline/render-phase-handler.js';
import { runQualityGate } from './workers/pipeline/quality-gate.js';
import { acquireInitialSlides } from './workers/pipeline/slide-acquisition.js';
import { failJobForPlannerError } from './workers/pipeline/pipeline-error-handler.js';
import { ImageUtils } from './workers/utils/image-utils.js';
import { ThemeBuilder } from './workers/utils/theme-builder.js';
import { SlideUtils } from './workers/utils/slide-utils.js';
import { LayoutProcessor } from './workers/processors/layout-processor.js';
import { SlideRepair } from './workers/processors/slide-repair.js';
import type { ContentGenerationJobRepository } from '../repository/content-generation-job-repository.js';
import type { ContentGenerationSlideRepository } from '../repository/content-generation-slide-repository.js';
import type { MasterTemplateRepository } from '../repository/master-template-repository.js';
import { GROWHALEY_BRAND_KIT } from './growhaley-brand.js';

export interface SduiCarouselWorkerDeps {
  planner: SduiPlanner;
  renderer: SatoriRenderer;
  imageClient: BackgroundImageClient;
  storage: ObjectStorage;
  jobRepo: ContentGenerationJobRepository;
  slideRepo: ContentGenerationSlideRepository;
  masterTemplateRepo: MasterTemplateRepository;
  redisUrl: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_GENERATION_RULES = {
  maxSlides: 7,
  defaultTone: 'professional',
} as const;

/**
 * Strip a slide down to text-only: drop every image_placeholder, force
 * image_requirement="none", and release any photo/collage layout so the
 * template picker re-selects a poster variant by content. Runs before image
 * generation so no wasted image API calls happen for a text-only deck.
 */
function coerceTextOnlySlide(slide: SduiSlide): SduiSlide {
  const strip = (components: SduiSlide['nested_groups']['core_content']) =>
    (components ?? []).filter((c) => c.type !== 'image_placeholder');
  const isPhotoLayout =
    slide.layout_variant_id === 'gw_photo_rotated' ||
    slide.layout_variant_id === 'gw_photo_statement' ||
    slide.layout_variant_id === 'gw_collage_showcase';
  const { layout_variant_id: _drop, ...rest } = slide;
  return {
    ...rest,
    ...(isPhotoLayout ? {} : { layout_variant_id: slide.layout_variant_id }),
    image_requirement: 'none',
    image_status: 'not_needed',
    nested_groups: {
      top_meta: strip(slide.nested_groups.top_meta),
      core_content: strip(slide.nested_groups.core_content),
      action_footer: strip(slide.nested_groups.action_footer),
    },
  };
}

// ---------------------------------------------------------------------------
// Main Job Processor
// ---------------------------------------------------------------------------

export async function processSduiCarouselJob(
  deps: SduiCarouselWorkerDeps,
  payload: ContentGenerationJobPayload,
  signal: AbortSignal = new AbortController().signal,
): Promise<void> {
  const { jobId, teamId } = payload;

  const jobRow = await deps.jobRepo.findById(teamId, jobId);
  if (!jobRow) throw new Error(`Job ${jobId} not found for team ${teamId}`);

  const inputs = jobRow.inputs as {
    requestedSlideCount?: number;
    sduiSlides?: SduiSlide[];
    typographyOverride?: SduiTypographyOverride;
    contentTags?: string[];
    conversationContext?: import('@leads-generator/shared').ContentConversationContextMessage[];
    layoutStyle?: import('@leads-generator/shared').LayoutStylePreference;
    imagePreference?: import('@leads-generator/shared').ImagePreferenceMode;
    workflow?: {
      slides?: { slide_number: number; sduiSlide?: SduiSlide }[];
    };
  };

  // Extract slides from workflow artifact if present
  const workflowSlides =
    inputs.workflow?.slides
      ?.map((s) => s.sduiSlide)
      .filter((s): s is SduiSlide => s !== undefined) ?? [];
  const frontendSlides = workflowSlides.length > 0 ? workflowSlides : (inputs.sduiSlides ?? []);

  const masterTemplate = await deps.masterTemplateRepo.findByTeam(teamId);
  const maxSlides = masterTemplate?.maxSlides ?? DEFAULT_GENERATION_RULES.maxSlides;
  const defaultTone = masterTemplate?.defaultTone ?? DEFAULT_GENERATION_RULES.defaultTone;

  const brandKit = GROWHALEY_BRAND_KIT;

  const aspectRatio = jobRow.aspectRatio;
  const width = ImageUtils.canvasWidth(aspectRatio);
  const baseBody = Math.round(width * 0.03);
  const typographyOverride = ThemeBuilder.sanitizeTypographyOverride(inputs.typographyOverride);
  const theme = ThemeBuilder.buildTheme(brandKit, baseBody, typographyOverride);
  const textGuardrailOptions = { typography: ThemeBuilder.typographyFromTheme(theme) };

  const slideCount = Math.min(
    inputs.requestedSlideCount && inputs.requestedSlideCount > 0
      ? inputs.requestedSlideCount
      : Math.min(5, maxSlides),
    maxSlides,
  );

  const contentTags = inputs.contentTags ?? [];
  const conversationContext = inputs.conversationContext ?? [];
  const layoutStyle = inputs.layoutStyle ?? 'auto';
  const imagePreference = inputs.imagePreference ?? 'auto';

  // Build minimal pipeline context for shared utilities
  const minimalCtx = {
    teamId,
    jobId,
    prompt: jobRow.prompt,
    aspectRatio,
    maxSlides,
    defaultTone,
    textGuardrailOptions,
    signal,
    layoutStyle,
    imagePreference,
    contentTags,
    conversationContext,
  };

  // -------------------------------------------------------------------------
  // Phase 1: Acquire initial slides (frontend draft | AI plan | fallback)
  // -------------------------------------------------------------------------
  const acquisitionResult = await acquireInitialSlides(
    deps.planner,
    minimalCtx,
    slideCount,
    frontendSlides,
  );
  let slides = acquisitionResult.slides;
  const plannerQualityWarnings = acquisitionResult.plannerQualityWarnings;

  // Persist planner fallback diagnostics if used
  if (acquisitionResult.source === 'worker_fallback') {
    await deps.jobRepo.updateInputs(teamId, jobId, {
      ...inputs,
      plannerFailureStage: 'initial_plan',
      plannerFallbackUsed: true,
      ...(textGuardrailOptions.typography
        ? { typographyOverride: textGuardrailOptions.typography }
        : {}),
    });
  }

  // Ensure at least 1 slide exists
  if (slides.length === 0) {
    await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'malformed_output');
    return;
  }

  // Text-only is a HARD user intent: the "poster" style group carries no
  // image-capable variants (supportsAllSlidesImage=false), and an explicit
  // "tanpa gambar / teks saja" in the prompt is unambiguous. Either one
  // forces every slide off the photo/collage path — the planner only
  // "prioritizes" a style, so we enforce it deterministically here.
  const styleGroup = layoutStyleGroupById(layoutStyle);
  const forceTextOnly =
    (styleGroup !== undefined && styleGroup.supportsAllSlidesImage === false) ||
    (promptExplicitlyRequestsNoImages(jobRow.prompt) && imagePreference !== 'all_slides_image');

  if (forceTextOnly) {
    slides = slides.map((slide) => coerceTextOnlySlide(slide));
  }

  // -------------------------------------------------------------------------
  // Phase 2: Ensure explicit image requests are honored
  // -------------------------------------------------------------------------
  if (!forceTextOnly) {
    slides = ensureExplicitImageRequest(jobRow.prompt, slides).map((slide) =>
      applySduiTextGuardrails(slide, textGuardrailOptions),
    );
  } else {
    slides = slides.map((slide) => applySduiTextGuardrails(slide, textGuardrailOptions));
  }

  if (
    !forceTextOnly &&
    promptExplicitlyRequestsImages(jobRow.prompt) &&
    SlideRepair.visualIntegrityIssues(jobRow.prompt, slides).length > 0
  ) {
    console.warn(
      '[sdui-worker] prompt explicitly requested image, requesting AI image-layout repair',
    );
    const repairResult = await deps.planner.plan(
      {
        teamId,
        jobId,
        actorId: 'system',
        prompt: jobRow.prompt,
        aspectRatio,
        slideCount: slides.length,
        maxSlides,
        tone: defaultTone,
        previousSlides: slides,
        feedback:
          'User explicitly requested at least one image/illustration. Revise the deck so at least one relevant slide uses an image-capable layout with image_requirement="required" and a concrete image_placeholder in core_content.',
        typographyOverride: textGuardrailOptions.typography,
        contentTags,
        conversationContext,
        layoutStyle,
        imagePreference,
      },
      signal,
    );

    if (!repairResult.ok) {
      console.warn('[sdui-worker] image-layout repair failed:', repairResult.error);
      await failJobForPlannerError(
        deps.jobRepo,
        teamId,
        jobId,
        inputs,
        'image_requirement_repair',
        repairResult.error,
      );
      return;
    }

    slides = repairResult.value.slides
      .slice(0, slideCount)
      .map((s, i) => applySduiTextGuardrails({ ...s, slide_number: i + 1 }, textGuardrailOptions));
  }

  // -------------------------------------------------------------------------
  // Quality Gate 1: Pre-layout-diversity validation
  // -------------------------------------------------------------------------
  const preLayoutGate = await runQualityGate(minimalCtx, slides, {
    label: 'pre-layout-diversity',
    deps,
    jobRepo: deps.jobRepo,
    currentInputs: inputs,
  });
  if (preLayoutGate.terminal) return;
  slides = preLayoutGate.slides;

  // -------------------------------------------------------------------------
  // Phase 3: Enforce layout diversity
  // -------------------------------------------------------------------------
  // A frontend draft carries the user's explicit per-slide layout choices
  // (picked in the visual preview) — honor them instead of reshuffling for
  // diversity. AI/fallback decks still get the full diversity pass.
  const respectExplicitVariants = acquisitionResult.source === 'frontend_draft';
  slides = LayoutProcessor.enforceLayoutDiversity(slides, { respectExplicitVariants }).map((slide) =>
    applySduiTextGuardrails(slide, textGuardrailOptions),
  );

  // -------------------------------------------------------------------------
  // Quality Gate 2: Post-layout-diversity validation
  // -------------------------------------------------------------------------
  const postLayoutGate = await runQualityGate(minimalCtx, slides, {
    label: 'post-layout-diversity',
    deps,
    jobRepo: deps.jobRepo,
    currentInputs: inputs,
  });
  if (postLayoutGate.terminal) return;
  slides = postLayoutGate.slides;

  // -------------------------------------------------------------------------
  // Phase 4: Generate slide images
  // -------------------------------------------------------------------------
  const imageGenResult = await generateSlideImages(
    {
      teamId,
      jobId,
      prompt: jobRow.prompt,
      aspectRatio,
      width,
      brandKit,
      signal,
      logTiming: () => {
        /* no-op */
      },
    },
    slides,
    deps.imageClient,
  );

  // Graceful degrade for REQUIRED image failures: instead of failing the
  // whole job (one dead provider used to kill the deck), route the affected
  // slides through the same no-image repair used for optional failures and
  // surface a warning. The deck always ships.
  if (imageGenResult.requiredImageFailedSlideNumbers.size > 0) {
    for (const slideNumber of imageGenResult.requiredImageFailedSlideNumbers) {
      imageGenResult.failedImageSlideNumbers.add(slideNumber);
      plannerQualityWarnings.push(
        `image_degraded: slide ${slideNumber} gagal generate gambar — layout diturunkan ke poster tanpa gambar`,
      );
    }
    slides = slides.map((slide) =>
      imageGenResult.requiredImageFailedSlideNumbers.has(slide.slide_number)
        ? { ...slide, image_requirement: 'optional' as const }
        : slide,
    );
  }

  // Stamp image_status for slides without images
  slides = slides.map((slide) =>
    slide.image_status || slide.image_requirement !== 'none'
      ? slide
      : { ...slide, image_status: 'not_needed' as const },
  );

  // Repair optional image failures
  if (imageGenResult.failedImageSlideNumbers.size > 0) {
    const repairCtx = {
      deps,
      teamId,
      jobId,
      prompt: jobRow.prompt,
      aspectRatio,
      maxSlides,
      defaultTone,
      textGuardrailOptions,
      signal,
      layoutStyle,
      imagePreference,
      contentTags,
      conversationContext,
    };
    slides = await SlideRepair.repairFailedOptionalImages(
      repairCtx,
      slides,
      imageGenResult.failedImageSlideNumbers,
    );
  }

  slides = slides.map((slide) => applySduiTextGuardrails(slide, textGuardrailOptions));

  // -------------------------------------------------------------------------
  // Quality Gate 3: Post-image-generation validation
  // -------------------------------------------------------------------------
  const finalGate = await runQualityGate(minimalCtx, slides, {
    label: 'post-image-generation',
    deps,
    jobRepo: deps.jobRepo,
    currentInputs: inputs,
  });
  if (finalGate.terminal) return;
  slides = finalGate.slides;

  // -------------------------------------------------------------------------
  // Phase 5: Persist final inputs and render slides
  // -------------------------------------------------------------------------
  const finalInputs = {
    ...inputs,
    sduiSlides: SlideUtils.slidesForPersist(slides),
    layoutAudit: SlideUtils.slideAudit(slides),
    ...(plannerQualityWarnings.length > 0 ? { plannerQualityWarnings } : {}),
    ...(textGuardrailOptions.typography
      ? { typographyOverride: textGuardrailOptions.typography }
      : {}),
  };
  await deps.jobRepo.updateInputs(teamId, jobId, finalInputs);

  const doc: SduiDocument = {
    aspectRatio,
    theme,
    spacing: {
      canvas_padding: Math.round(width * 0.072),
      macro_gap: 40,
      meso_gap: 22,
      micro_gap: 12,
    },
    slides,
  };

  const brandFonts: BrandFontRef[] = brandKit.fonts
    .filter((f) => typeof f.url === 'string' && f.url.length > 0)
    .map((f) => ({ family: f.family, url: f.url }));

  await renderAndUploadSlides(
    {
      renderer: deps.renderer,
      storage: deps.storage,
      jobRepo: deps.jobRepo,
      slideRepo: deps.slideRepo,
    },
    {
      teamId,
      jobId,
      prompt: jobRow.prompt,
      slides,
      doc,
      brandFonts,
      jobT0: Date.now(),
      logTiming: () => {
        /* no-op */
      },
      finalInputs,
    },
  );
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createSduiCarouselWorker(
  deps: SduiCarouselWorkerDeps,
): Worker<ContentGenerationJobPayload> {
  const connection = new URL(deps.redisUrl);
  const connectionOptions: RedisOptions = {
    host: connection.hostname,
    port: Number(connection.port || 6379),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 30000,
    reconnectOnError: () => true,
    retryStrategy: (times: number) => Math.min(times * 500, 5000),
  };
  if (connection.username) connectionOptions.username = connection.username;
  if (connection.password) connectionOptions.password = connection.password;
  if (connection.protocol === 'rediss:') connectionOptions.tls = {};

  return new Worker<ContentGenerationJobPayload>(
    CONTENT_GENERATION_QUEUE_NAME,
    async (job: Job<ContentGenerationJobPayload>) => {
      try {
        await processSduiCarouselJob(deps, job.data, new AbortController().signal);
      } catch (error) {
        // Pipeline phases record their own terminal status; this catch covers
        // anything uncaught (renderer crash, network error, missing job row)
        // so the DB row never sits `pending` forever.
        console.error('[carousel-worker] uncaught pipeline error', {
          jobId: job.data.jobId,
          teamId: job.data.teamId,
          error,
        });
        await deps.jobRepo
          .setStatus(job.data.teamId, job.data.jobId, 'failed', 'provider_error')
          .catch(() => {});
      }
    },
    {
      connection: connectionOptions,
      concurrency: 2,
      lockDuration: CONTENT_JOB_MAX_RUNTIME_MS, // 10 minutes (was 30s default)
    },
  );
}
