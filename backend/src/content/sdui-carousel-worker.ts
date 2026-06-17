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

import type { ContentGenerationJobPayload } from './content-generator-service.js';
import { CONTENT_GENERATION_QUEUE_NAME } from './content-generator-service.js';
import type { SduiPlanner } from './sdui-planner/index.js';
import {
  ensureExplicitImageRequest,
  promptExplicitlyRequestsImages,
} from './sdui-planner/index.js';
import { applySduiTextGuardrails } from './sdui-text-guardrails.js';
import type { SatoriRenderer, BrandFontRef } from './satori-renderer.js';
import type { BackgroundImageClient } from './background-image-client.js';
import type { ObjectStorage } from './object-storage.js';
import {
  generateSlideImages,
  failJobForRequiredImageFailures,
} from './workers/pipeline/image-generation-handler.js';
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
import type { BrandKitRepository } from '../repository/brand-kit-repository.js';

export interface SduiCarouselWorkerDeps {
  planner: SduiPlanner;
  renderer: SatoriRenderer;
  imageClient: BackgroundImageClient;
  storage: ObjectStorage;
  jobRepo: ContentGenerationJobRepository;
  slideRepo: ContentGenerationSlideRepository;
  masterTemplateRepo: MasterTemplateRepository;
  brandKitRepo: BrandKitRepository;
  redisUrl: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_GENERATION_RULES = {
  maxSlides: 7,
  defaultTone: 'professional',
} as const;

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

  const brandKit = await deps.brandKitRepo.findByTeam(teamId);
  if (!brandKit) {
    await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'off_brand');
    return;
  }

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

  const preferEditorial = LayoutProcessor.promptRequestsEditorial(jobRow.prompt);
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
    preferEditorial,
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

  // -------------------------------------------------------------------------
  // Phase 2: Ensure explicit image requests are honored
  // -------------------------------------------------------------------------
  slides = ensureExplicitImageRequest(jobRow.prompt, slides).map((slide) =>
    applySduiTextGuardrails(slide, textGuardrailOptions),
  );

  if (
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
        ...(preferEditorial ? { editorialBias: true } : {}),
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
  slides = LayoutProcessor.enforceLayoutDiversity(slides, { preferEditorial }).map((slide) =>
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

  // Handle required image failures
  if (imageGenResult.requiredImageFailedSlideNumbers.size > 0) {
    await failJobForRequiredImageFailures(
      deps.slideRepo,
      { teamId, jobId },
      slides,
      imageGenResult.requiredImageFailedSlideNumbers,
    );
    await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'provider_error');
    return;
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
      preferEditorial,
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
      await processSduiCarouselJob(deps, job.data, new AbortController().signal);
    },
    {
      connection: connectionOptions,
      concurrency: 2,
      lockDuration: 600_000, // 10 minutes (was 30s default)
    },
  );
}
