/**
 * Content_Generator_Service — entry point for carousel generation.
 *
 * Implements three responsibilities:
 *   1. `trigger`        — prerequisite validation (aggregated) + job creation + BullMQ enqueue (R3.1, R3.6–R3.8, R10.1, R13.5–R13.6)
 *   2. `getJob`         — tenant-scoped read model (JobView) with per-slide status (R10.5, R10.6)
 *   3. `checkRequiredData` — pure precheck for missing chart data / mockup files (R7.4)
 *
 * Design: Components and Interfaces → Content_Generator_Service & Worker; Sequence: Pemicuan
 * Requirements: 3.1, 3.6, 3.7, 3.8, 7.4, 10.1, 10.5, 10.6, 13.5, 13.6
 */

import { Queue } from 'bullmq';
import { CONTENT_FAILURE_ERROR_CODE, ok, err } from '@leads-generator/shared';
import type {
  Result,
  AspectRatio,
  ContentPlan,
  ChartData,
  FailureReason,
  JobView,
  SduiSlide,
  SduiTypographyOverride,
  ContentConversationContextMessage,
  CarouselWorkflowArtifact,
  LayoutStylePreference,
  ImagePreferenceMode,
} from '@leads-generator/shared';
import type { AppError } from '@leads-generator/shared';

import type { ContentGenerationJobRepository } from '../repository/content-generation-job-repository.js';
import type { ContentGenerationSlideRepository } from '../repository/content-generation-slide-repository.js';
import type { MasterTemplateRepository } from '../repository/master-template-repository.js';
import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';

// ---------------------------------------------------------------------------
// Queue name
// ---------------------------------------------------------------------------

export const CONTENT_GENERATION_QUEUE_NAME = 'content-generation';

/**
 * A job still `pending` after this long is treated as orphaned and reaped on
 * the next status read. Set above the worker's own job timeout (180s) so a
 * live run can record its own terminal status before the lazy reaper fires.
 */
const STUCK_JOB_DEADLINE_MS = 240_000;

// ---------------------------------------------------------------------------
// Public request / response types
// ---------------------------------------------------------------------------

export interface GenerateRequest {
  /** Prompt teks (1..2000 karakter setelah trim, R3.6). */
  prompt: string;
  aspectRatio: AspectRatio;
  requestedSlideCount?: number;
  /**
   * A ContentPlan the user already chose from the plan-preview step. When
   * present, the worker uses this plan directly instead of re-planning, so the
   * generated carousel matches exactly what the user selected.
   */
  chosenPlan?: ContentPlan;
  /**
   * Fase 2/3: the reviewed SDUI draft slides (with per-slide image_object_context).
   * When present, the worker renders these EXACTLY and skips re-planning.
   */
  sduiSlides?: SduiSlide[];
  /** Hermes-style workflow artifact. When present, worker renders its slides and persists workflow state. */
  workflow?: CarouselWorkflowArtifact;
  /** Chart data payloads keyed by ref string. */
  chartData?: { ref: string; data: ChartData }[];
  /** Mockup asset object URLs keyed by ref string. */
  mockups?: { ref: string; objectUrl: string }[];
  /** Image asset object URLs keyed by ref string. */
  images?: { ref: string; objectUrl: string }[];
  /** Per-job text size override from the generator config panel. */
  typographyOverride?: SduiTypographyOverride;
  /** Visual top-meta tags requested from generator config. */
  contentTags?: string[];
  /** Recent chat context from the same browser session/window. */
  conversationContext?: ContentConversationContextMessage[];
  /** User-selected high-level layout style for this deck. */
  layoutStyle?: LayoutStylePreference;
  /** User-selected image preference mode for this deck. */
  imagePreference?: ImagePreferenceMode;
}

/** A slide that failed the precheck for required data. */
export interface FailingSlide {
  slideIndex: number;
  reason: 'missing_chart_data' | 'missing_mockup';
}

// ---------------------------------------------------------------------------
// BullMQ job payload
// ---------------------------------------------------------------------------

export interface ContentGenerationJobPayload {
  jobId: string;
  teamId: string;
  actorId: string;
}

// ---------------------------------------------------------------------------
// Service dependencies
// ---------------------------------------------------------------------------

export interface ContentGeneratorServiceDeps {
  jobRepo: ContentGenerationJobRepository;
  slideRepo: ContentGenerationSlideRepository;
  masterTemplateRepo: MasterTemplateRepository;
  aiSettings: TeamAiSettingsService;
  queue?: Pick<Queue<ContentGenerationJobPayload>, 'add'>;
  fallbackProcessor?: (payload: ContentGenerationJobPayload) => Promise<void>;
  allowQueueFallback?: boolean;
}

// ---------------------------------------------------------------------------
// ContentGeneratorService
// ---------------------------------------------------------------------------

/**
 * Content_Generator_Service.
 *
 * Dependencies are injected via the constructor so the service remains
 * unit-testable without a live database or Redis connection.
 */
export class ContentGeneratorService {
  constructor(private readonly deps: ContentGeneratorServiceDeps) {}

  // -------------------------------------------------------------------------
  // 17.1 — trigger: aggregated prereq validation + job creation + enqueue
  // -------------------------------------------------------------------------

  /**
   * Validates all prerequisites, creates a `pending` generation job, and
   * enqueues it to BullMQ.
   *
   * ALL prerequisite errors are collected before returning so the caller can
   * surface every problem in a single response (R3.8).
   *
   * @returns `ok({ jobId })` — job created; `err(VALIDATION)` — one or more
   *   prereqs failed (messages list every violation).
   */
  async trigger(
    teamId: string,
    actorId: string,
    req: GenerateRequest,
  ): Promise<Result<{ jobId: string }>> {
    const errors: string[] = [];

    // -----------------------------------------------------------------------
    // 1. Validate prompt (R3.6)
    // -----------------------------------------------------------------------
    const prompt = req.prompt.trim();
    if (prompt.length === 0 || prompt.length > 2000) {
      errors.push('Prompt harus sepanjang 1 sampai 2.000 karakter');
    }

    // -----------------------------------------------------------------------
    // 2. Load optional Master_Template. During the dynamic composer refactor,
    //    generation can run with internal defaults when no template exists.
    // -----------------------------------------------------------------------
    const template = await this.deps.masterTemplateRepo.findByTeam(teamId);

    // -----------------------------------------------------------------------
    // 3. Check Gemini API key configured (R13.5, R13.6)
    // -----------------------------------------------------------------------
    const hasKey = await this.deps.aiSettings.hasApiKey(teamId, 'content_suggestion');
    if (!hasKey) {
      errors.push('Kunci API Leads & Suggestion Content wajib dikonfigurasi terlebih dahulu');
    }

    // -----------------------------------------------------------------------
    // 4. Bail out if any errors — DO NOT create the job (R3.8)
    // -----------------------------------------------------------------------
    if (errors.length > 0) {
      const validationError: AppError = { code: 'VALIDATION', messages: errors };
      return err(validationError);
    }

    // -----------------------------------------------------------------------
    // 5. Create pending job (R10.1)
    // -----------------------------------------------------------------------
    const job = await this.deps.jobRepo.insert({
      teamId,
      masterTemplateId: template?.id ?? null,
      prompt,
      aspectRatio: req.aspectRatio,
      inputs: {
        requestedSlideCount: req.requestedSlideCount,
        chosenPlan: req.chosenPlan ?? null,
        sduiSlides: req.sduiSlides ?? null,
        workflow: req.workflow ?? null,
        chartData: req.chartData ?? [],
        mockups: req.mockups ?? [],
        images: req.images ?? [],
        typographyOverride: req.typographyOverride ?? null,
        contentTags: req.contentTags ?? [],
        conversationContext: req.conversationContext ?? [],
        layoutStyle: req.layoutStyle ?? 'auto',
        imagePreference: req.imagePreference ?? 'auto',
        generationRulesSource: template ? 'master_template' : 'internal_defaults',
      },
    });

    // -----------------------------------------------------------------------
    // 6. Enqueue to BullMQ (R10.1) — AI work happens in the worker
    // -----------------------------------------------------------------------
    const payload = { jobId: job.id, teamId, actorId };
    try {
      if (!this.deps.queue) throw new Error('content_generation_queue_unavailable');
      await this.deps.queue.add(
        'generate',
        payload,
        {
          attempts: 1,        // no auto-retry (mirrors AI worker pattern)
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (queueError) {
      if (!this.deps.allowQueueFallback || !this.deps.fallbackProcessor) {
        throw queueError;
      }
      void this.deps.fallbackProcessor(payload).catch((error) => {
        console.error('[content-generator] fallback processor failed:', error);
      });
    }

    return ok({ jobId: job.id });
  }

  // -------------------------------------------------------------------------
  // 17.2 — getJob: tenant-scoped JobView
  // -------------------------------------------------------------------------

  /**
   * Returns the full read model for a carousel generation job, including
   * the per-slide status list.
   *
   * Always scoped to `teamId` — a job belonging to another team returns
   * `NOT_FOUND` (uniform not-found, R16.3).
   */
  async getJob(teamId: string, jobId: string): Promise<Result<JobView>> {
    let job = await this.deps.jobRepo.findById(teamId, jobId);
    if (job === null) {
      return err({ code: 'NOT_FOUND', message: `Job ${jobId} tidak ditemukan` } as AppError);
    }

    // Lazy reaper: a job still `pending` long past the worker's own deadline
    // was almost certainly orphaned (e.g. the process died mid-run, so no
    // terminal status was ever written). Mark it failed here so the polling
    // UI gives up instead of spinning forever.
    if (job.status === 'pending') {
      const ageMs = Date.now() - new Date(job.createdAt).getTime();
      if (ageMs > STUCK_JOB_DEADLINE_MS) {
        await this.deps.jobRepo.setStatus(teamId, jobId, 'failed', 'timeout');
        const refreshed = await this.deps.jobRepo.findById(teamId, jobId);
        if (refreshed !== null) job = refreshed;
      }
    }

    const slides = await this.deps.slideRepo.listSlides(teamId, jobId);
    const layoutAudit = Array.isArray(job.inputs.layoutAudit)
      ? (job.inputs.layoutAudit as JobView['layoutAudit'])
      : undefined;
    const workflow = typeof job.inputs.workflow === 'object' && job.inputs.workflow !== null
      ? (job.inputs.workflow as CarouselWorkflowArtifact)
      : undefined;

    const view: JobView = {
      jobId: job.id,
      status: job.status,
      ...(job.reason != null ? { reason: job.reason } : {}),
      ...(job.reason != null ? { errorCode: contentErrorCode(job.reason) } : {}),
      ...(layoutAudit ? { layoutAudit } : {}),
      ...(workflow ? { workflow } : {}),
      slides: slides.map((s) => {
        const slide: JobView['slides'][number] = {
          index: s.index,
          status: s.status,
          usedFallbackLayout: s.usedFallback,
        };
        if (s.imageUrl != null) slide.imageUrl = s.imageUrl;
        if (s.reason != null) {
          slide.reason = s.reason;
          slide.errorCode = contentErrorCode(s.reason);
        }
        return slide;
      }),
    };

    return ok(view);
  }
}

function contentErrorCode(reason: FailureReason) {
  return CONTENT_FAILURE_ERROR_CODE[reason] ?? 'CONTENT_JOB_FAILED';
}

// ---------------------------------------------------------------------------
// 17.3 — checkRequiredData: pure precheck (no I/O)
// ---------------------------------------------------------------------------

/**
 * Scans a `ContentPlan` for slides that reference chart data or mockup files
 * that are NOT present in the supplied `inputs`.
 *
 * This is a **pure function** with no side effects — the caller (Worker) is
 * responsible for acting on the result (marking slides failed, etc.).
 *
 * Returns all failing slides immediately — fail-fast per slide (R7.4).
 *
 * @param plan   The validated ContentPlan to check.
 * @param inputs The data/mockup assets supplied by the user at trigger time.
 * @returns      Array of slides that are missing required data.
 */
export function checkRequiredData(
  plan: ContentPlan,
  inputs: {
    chartData?: { ref: string; data: ChartData }[];
    mockups?: { ref: string; objectUrl: string }[];
  },
): FailingSlide[] {
  const chartRefs = new Set((inputs.chartData ?? []).map((c) => c.ref));
  const mockupRefs = new Set((inputs.mockups ?? []).map((m) => m.ref));

  const failing: FailingSlide[] = [];

  for (const slide of plan.slides) {
    let slideFailReason: 'missing_chart_data' | 'missing_mockup' | undefined;

    for (const block of slide.blocks) {
      if (block.type === 'chart') {
        if (!block.chartDataRef || !chartRefs.has(block.chartDataRef)) {
          slideFailReason = 'missing_chart_data';
          break; // fail-fast per slide
        }
      }
      if (block.type === 'mockup') {
        if (!block.mockupRef || !mockupRefs.has(block.mockupRef)) {
          // Only overwrite if no more-specific reason already set
          if (slideFailReason === undefined) {
            slideFailReason = 'missing_mockup';
          }
          break; // fail-fast per slide
        }
      }
    }

    if (slideFailReason !== undefined) {
      failing.push({ slideIndex: slide.index, reason: slideFailReason });
    }
  }

  return failing;
}
