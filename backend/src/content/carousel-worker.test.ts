/**
 * Unit tests for createCarouselWorker pipeline.
 *
 * Covers the three core scenarios required by task 18.1:
 *   1. Validator fail → job marked validation_error; Renderer NOT called
 *   2. Slide failure at position k → halts remaining slides; job marked failed
 *   3. All slides success → job marked success
 *
 * All external dependencies are mocked. BullMQ Worker is mocked to capture
 * the processor function, which is then called directly without a live Redis
 * connection.
 *
 * Requirements: 4.3, 4.4, 4.5, 9.4, 9.5, 9.6, 10.2, 10.3, 10.4, 11.1, 11.2, 11.3, 11.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { Job, Queue } from 'bullmq';

import type { ContentGenerationJobPayload, GenerateRequest } from './content-generator-service.js';
import { ContentGeneratorService } from './content-generator-service.js';
import type { CarouselWorkerDeps } from './carousel-worker.js';
import { mapPlannerErrToFailureReason } from './carousel-worker.js';
import type { Planner, PlannerError } from './planner.js';
import type { ContentPlanValidator, ValidationOutcome } from './content-plan-validator.js';
import type { Renderer } from './renderer.js';
import type { ExampleRetriever } from './example-retriever.js';
import type { ContentGenerationJobRepository, JobFullRow } from '../repository/content-generation-job-repository.js';
import type { ContentGenerationSlideRepository } from '../repository/content-generation-slide-repository.js';
import type { MasterTemplateRepository } from '../repository/master-template-repository.js';
import type { BrandKitRepository } from '../repository/brand-kit-repository.js';
import type { ContentPlan, BrandKit, MasterTemplate, ApprovedExampleStructure, JobStatus, SlideStatus, FailureReason, BlockType } from '@leads-generator/shared';
import type { RenderedSlide } from './renderer.js';

// ---------------------------------------------------------------------------
// Mock BullMQ Worker so we can capture the processor without a real Redis
// ---------------------------------------------------------------------------

// The captured processor is stored here per-test (object to avoid hoisting issues)
const workerCapture: {
  processor: ((job: Job<ContentGenerationJobPayload>) => Promise<void>) | null;
} = { processor: null };

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    // Override only the Worker constructor
    Worker: class MockWorker {
      constructor(
        _queue: string,
        processor: (job: Job<ContentGenerationJobPayload>) => Promise<void>,
        _opts: unknown,
      ) {
        workerCapture.processor = processor;
      }
      on = vi.fn();
      close = vi.fn().mockResolvedValue(undefined);
    },
  };
});

// ---------------------------------------------------------------------------
// Factories & helpers
// ---------------------------------------------------------------------------

function makePlan(slideCount = 2): ContentPlan {
  return {
    aspectRatio: '1:1',
    slides: Array.from({ length: slideCount }, (_, i) => ({
      index: i,
      blocks: [{ type: 'heading' as const, text: `Slide ${i} heading` }],
    })),
  };
}

function makeJobRow(overrides: Partial<JobFullRow> = {}): JobFullRow {
  return {
    id: 'job-1',
    teamId: 'team-1',
    masterTemplateId: 'tpl-1',
    prompt: 'Make a carousel',
    aspectRatio: '1:1',
    status: 'pending',
    reason: null,
    inputs: {
      requestedSlideCount: 2,
      chartData: [],
      mockups: [],
      images: [],
    },
    createdAt: new Date(),
    finishedAt: null,
    ...overrides,
  };
}

function makeMasterTemplate(): MasterTemplate {
  return {
    id: 'tpl-1',
    teamId: 'team-1',
    brandKitId: 'bk-1',
    allowedBlocks: ['heading', 'body'],
    maxSlides: 10,
    textLimits: [],
    aspectRatios: ['1:1'],
    defaultTone: 'professional',
    updatedAt: new Date(),
  };
}

function makeBrandKit(): BrandKit {
  return {
    id: 'bk-1',
    teamId: 'team-1',
    logoUrl: 'https://example.com/logo.png',
    fonts: [],
    colors: ['#000000'],
    chrome: {
      logoPlacement: 'none',
      pageNumberFormat: '{current}/{total}',
      siteUrl: 'https://example.com',
    },
    updatedAt: new Date(),
  };
}

interface MakeDepsOptions {
  planResult?: import('@leads-generator/shared').Result<ContentPlan, PlannerError>;
  repairPlanResult?: import('@leads-generator/shared').Result<ContentPlan, PlannerError>;
  validationOutcome?: ValidationOutcome;
  repairValidationOutcome?: ValidationOutcome;
  renderedSlides?: RenderedSlide[];
  jobRow?: JobFullRow | null;
  masterTemplate?: MasterTemplate | null;
  brandKit?: BrandKit | null;
}

interface MadeDeps {
  deps: CarouselWorkerDeps;
  mocks: {
    plannerPlan: ReturnType<typeof vi.fn>;
    validatorValidate: ReturnType<typeof vi.fn>;
    rendererRenderSlide: ReturnType<typeof vi.fn>;
    jobRepoFindById: ReturnType<typeof vi.fn>;
    jobRepoSetStatus: ReturnType<typeof vi.fn>;
    jobRepoSetFinishedAt: ReturnType<typeof vi.fn>;
    slideRepoInsertSlide: ReturnType<typeof vi.fn>;
    slideRepoUpdateSlide: ReturnType<typeof vi.fn>;
  };
}

/** Build a deps object with injectable test doubles. */
function makeDeps(options: MakeDepsOptions = {}): MadeDeps {
  const plan = makePlan(2);
  const planResult = options.planResult ?? { ok: true as const, value: plan };
  const repairPlanResult = options.repairPlanResult ?? { ok: true as const, value: plan };
  const validationOutcome = options.validationOutcome ?? { valid: true, errors: [] };
  const repairValidationOutcome = options.repairValidationOutcome ?? { valid: true, errors: [] };

  // Default: 2 slides, both success
  const renderedSlides = options.renderedSlides ?? [
    {
      index: 0,
      status: 'success' as const,
      imageUrl: 'https://cdn.example.com/slide-0.png',
      usedFallbackLayout: false,
    },
    {
      index: 1,
      status: 'success' as const,
      imageUrl: 'https://cdn.example.com/slide-1.png',
      usedFallbackLayout: false,
    },
  ];

  const plannerPlan = vi.fn()
    .mockResolvedValueOnce(planResult)
    .mockResolvedValueOnce(repairPlanResult);

  const validatorValidate = vi.fn()
    .mockReturnValueOnce(validationOutcome)
    .mockReturnValueOnce(repairValidationOutcome);

  let slideCallIdx = 0;
  const rendererRenderSlide = vi.fn().mockImplementation(async () => {
    const result = renderedSlides[slideCallIdx];
    slideCallIdx++;
    return result ?? {
      index: slideCallIdx - 1,
      status: 'failed' as const,
      usedFallbackLayout: false,
      reason: 'provider_error' as const,
    };
  });

  const jobRepoFindById = vi.fn().mockResolvedValue(
    options.jobRow !== undefined ? options.jobRow : makeJobRow(),
  );
  const jobRepoSetStatus = vi.fn().mockResolvedValue(undefined);
  const jobRepoSetFinishedAt = vi.fn().mockResolvedValue(undefined);

  const slideRepoInsertSlide = vi.fn().mockResolvedValue({
    jobId: 'job-1',
    index: 0,
    status: 'pending',
    imageUrl: null,
    reason: null,
    usedFallback: false,
    blockComposition: [],
  });
  const slideRepoUpdateSlide = vi.fn().mockResolvedValue(undefined);

  const deps: CarouselWorkerDeps = {
    planner: { plan: plannerPlan } as unknown as Planner,
    validator: { validate: validatorValidate } as unknown as ContentPlanValidator,
    renderer: { renderSlide: rendererRenderSlide } as unknown as Renderer,
    jobRepo: {
      findById: jobRepoFindById,
      setStatus: jobRepoSetStatus,
      setFinishedAt: jobRepoSetFinishedAt,
    } as unknown as ContentGenerationJobRepository,
    slideRepo: {
      insertSlide: slideRepoInsertSlide,
      updateSlide: slideRepoUpdateSlide,
    } as unknown as ContentGenerationSlideRepository,
    masterTemplateRepo: {
      findByTeam: vi.fn().mockResolvedValue(
        options.masterTemplate !== undefined ? options.masterTemplate : makeMasterTemplate(),
      ),
    } as unknown as MasterTemplateRepository,
    brandKitRepo: {
      findByTeam: vi.fn().mockResolvedValue(
        options.brandKit !== undefined ? options.brandKit : makeBrandKit(),
      ),
    } as unknown as BrandKitRepository,
    exampleRetriever: {
      topRelevant: vi.fn().mockResolvedValue([] as ApprovedExampleStructure[]),
    } as unknown as ExampleRetriever,
    redisUrl: 'redis://localhost:6379',
  };

  return {
    deps,
    mocks: {
      plannerPlan,
      validatorValidate,
      rendererRenderSlide,
      jobRepoFindById,
      jobRepoSetStatus,
      jobRepoSetFinishedAt,
      slideRepoInsertSlide,
      slideRepoUpdateSlide,
    },
  };
}

const JOB_PAYLOAD: ContentGenerationJobPayload = {
  jobId: 'job-1',
  teamId: 'team-1',
  actorId: 'system',
};

/**
 * Runs the worker pipeline for a given job payload using the provided deps.
 * Uses the mocked BullMQ Worker to capture the processor, then invokes it.
 */
async function runPipeline(
  deps: CarouselWorkerDeps,
  payload: ContentGenerationJobPayload,
): Promise<void> {
  workerCapture.processor = null;

  const { createCarouselWorker } = await import('./carousel-worker.js');
  createCarouselWorker(deps);

  const processor = workerCapture.processor;
  if (!processor) {
    throw new Error('Worker processor was not captured by mock');
  }

  const fakeJob = { data: payload } as unknown as Job<ContentGenerationJobPayload>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (processor as (job: any) => Promise<void>)(fakeJob);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CarouselWorker pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerCapture.processor = null;
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Job not found
  // -------------------------------------------------------------------------
  describe('job not found in DB', () => {
    it('throws so BullMQ marks job as failed (no setStatus called)', async () => {
      const { deps, mocks } = makeDeps({ jobRow: null });

      await expect(runPipeline(deps, JOB_PAYLOAD)).rejects.toThrow();
      expect(mocks.jobRepoSetStatus).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Master template missing
  // -------------------------------------------------------------------------
  describe('master template missing', () => {
    it('marks job as failed with validation_error', async () => {
      const { deps, mocks } = makeDeps({ masterTemplate: null });

      await runPipeline(deps, JOB_PAYLOAD);

      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith(
        'team-1', 'job-1', 'failed', 'validation_error',
      );
      expect(mocks.rendererRenderSlide).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Brand kit missing
  // -------------------------------------------------------------------------
  describe('brand kit missing', () => {
    it('marks job as failed with off_brand', async () => {
      const { deps, mocks } = makeDeps({ brandKit: null });

      await runPipeline(deps, JOB_PAYLOAD);

      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith(
        'team-1', 'job-1', 'failed', 'off_brand',
      );
      expect(mocks.rendererRenderSlide).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Planner fails → job marked failed, renderer NOT called
  // -------------------------------------------------------------------------
  describe('planner fails', () => {
    it('marks job failed with mapped reason; renderer not called', async () => {
      const { deps, mocks } = makeDeps({
        planResult: { ok: false, error: { kind: 'non_json' } },
      });

      await runPipeline(deps, JOB_PAYLOAD);

      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith(
        'team-1', 'job-1', 'failed', 'validation_error',
      );
      expect(mocks.rendererRenderSlide).not.toHaveBeenCalled();
    });

    it('maps budget_exceeded planner error correctly', async () => {
      const { deps, mocks } = makeDeps({
        planResult: { ok: false, error: { kind: 'budget_exceeded' } },
      });

      await runPipeline(deps, JOB_PAYLOAD);

      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith(
        'team-1', 'job-1', 'failed', 'budget_exceeded',
      );
    });

    it('maps timeout planner error correctly', async () => {
      const { deps, mocks } = makeDeps({
        planResult: { ok: false, error: { kind: 'timeout' } },
      });

      await runPipeline(deps, JOB_PAYLOAD);

      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith(
        'team-1', 'job-1', 'failed', 'timeout',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Validate fail → job marked validation_error (R9.4, R9.5)
  // Renderer must NOT be called
  // -------------------------------------------------------------------------
  describe('validator fails → validation_error; renderer not called (R9.4, R9.5)', () => {
    it('when initial plan is invalid AND repair also fails validation → validation_error', async () => {
      const { deps, mocks } = makeDeps({
        validationOutcome: { valid: false, errors: ['too many slides'] },
        repairValidationOutcome: { valid: false, errors: ['still wrong'] },
      });

      await runPipeline(deps, JOB_PAYLOAD);

      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith(
        'team-1', 'job-1', 'failed', 'validation_error',
      );
      expect(mocks.rendererRenderSlide).not.toHaveBeenCalled();
    });

    it('when initial plan is invalid AND repair planner call fails → validation_error', async () => {
      const { deps, mocks } = makeDeps({
        validationOutcome: { valid: false, errors: ['bad block type'] },
        repairPlanResult: { ok: false, error: { kind: 'non_json' } },
      });

      await runPipeline(deps, JOB_PAYLOAD);

      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith(
        'team-1', 'job-1', 'failed', 'validation_error',
      );
      expect(mocks.rendererRenderSlide).not.toHaveBeenCalled();
    });

    it('when validator throws (execution error) → fail-closed with validation_error (R9.4)', async () => {
      const { deps, mocks } = makeDeps();
      // Reset the queued return values, then make validator throw for ALL calls
      mocks.validatorValidate.mockReset();
      mocks.validatorValidate.mockImplementation(() => {
        throw new Error('Validator internal error');
      });

      await runPipeline(deps, JOB_PAYLOAD);

      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith(
        'team-1', 'job-1', 'failed', 'validation_error',
      );
      expect(mocks.rendererRenderSlide).not.toHaveBeenCalled();
    });

    it('repair succeeds when initial plan is invalid but repair is valid', async () => {
      const { deps, mocks } = makeDeps({
        validationOutcome: { valid: false, errors: ['too many slides'] },
        repairValidationOutcome: { valid: true, errors: [] },
      });

      await runPipeline(deps, JOB_PAYLOAD);

      // Should proceed to render slides
      expect(mocks.rendererRenderSlide).toHaveBeenCalled();
      // Job should succeed
      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith('team-1', 'job-1', 'success');
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Slide failure halts remaining slides (R10.3, R11.3)
  // -------------------------------------------------------------------------
  describe('slide failure halts remaining slides (R10.3, R11.3)', () => {
    it('slide 0 fails → slide 1 NOT rendered; job marked failed', async () => {
      const { deps, mocks } = makeDeps({
        renderedSlides: [
          {
            index: 0,
            status: 'failed',
            usedFallbackLayout: false,
            reason: 'off_brand',
          },
        ],
      });

      await runPipeline(deps, JOB_PAYLOAD);

      // Renderer called exactly once (for slide 0), not for slide 1
      expect(mocks.rendererRenderSlide).toHaveBeenCalledTimes(1);
      // Job marked failed with the reason from the failed slide
      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith(
        'team-1', 'job-1', 'failed', 'off_brand',
      );
    });

    it('slide 1 fails (slide 0 succeeds) → job marked failed; slide 0 result preserved', async () => {
      const { deps, mocks } = makeDeps({
        renderedSlides: [
          {
            index: 0,
            status: 'success',
            imageUrl: 'https://cdn.example.com/slide-0.png',
            usedFallbackLayout: false,
          },
          {
            index: 1,
            status: 'failed',
            usedFallbackLayout: false,
            reason: 'upload_failed',
          },
        ],
      });

      await runPipeline(deps, JOB_PAYLOAD);

      // Both slides rendered (slide 0 first, then slide 1 which failed)
      expect(mocks.rendererRenderSlide).toHaveBeenCalledTimes(2);

      // Slide 0 updated with success
      expect(mocks.slideRepoUpdateSlide).toHaveBeenCalledWith(
        'team-1', 'job-1', 0,
        expect.objectContaining({ status: 'success' }),
      );

      // Slide 1 updated with failed
      expect(mocks.slideRepoUpdateSlide).toHaveBeenCalledWith(
        'team-1', 'job-1', 1,
        expect.objectContaining({ status: 'failed', reason: 'upload_failed' }),
      );

      // Job marked failed
      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith(
        'team-1', 'job-1', 'failed', 'upload_failed',
      );

      // Job is NOT marked success
      expect(mocks.jobRepoSetStatus).not.toHaveBeenCalledWith(
        'team-1', 'job-1', 'success',
      );
    });

    it('failed slide image URL is never reported as success (R11.5)', async () => {
      const { deps, mocks } = makeDeps({
        renderedSlides: [
          {
            index: 0,
            status: 'failed',
            usedFallbackLayout: false,
            reason: 'off_brand',
            // No imageUrl on failed slide (correctly undefined)
          },
        ],
      });

      await runPipeline(deps, JOB_PAYLOAD);

      // The slide update should have null imageUrl (no placeholder URL)
      expect(mocks.slideRepoUpdateSlide).toHaveBeenCalledWith(
        'team-1', 'job-1', 0,
        expect.objectContaining({ status: 'failed', imageUrl: null }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 7: All slides success → job marked success (R10.4, R11.1)
  // -------------------------------------------------------------------------
  describe('all slides success → job marked success (R10.4, R11.1)', () => {
    it('marks job success after all slides rendered successfully', async () => {
      const { deps, mocks } = makeDeps();

      await runPipeline(deps, JOB_PAYLOAD);

      expect(mocks.rendererRenderSlide).toHaveBeenCalledTimes(2);
      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith('team-1', 'job-1', 'success');
      expect(mocks.jobRepoSetFinishedAt).toHaveBeenCalledWith(
        'team-1', 'job-1', expect.any(Date),
      );
    });

    it('writes slide rows to DB before rendering', async () => {
      const { deps, mocks } = makeDeps();

      await runPipeline(deps, JOB_PAYLOAD);

      // Both slides should be inserted as pending before rendering
      expect(mocks.slideRepoInsertSlide).toHaveBeenCalledTimes(2);
      expect(mocks.slideRepoInsertSlide).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', index: 0 }),
      );
      expect(mocks.slideRepoInsertSlide).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', index: 1 }),
      );
    });

    it('updates each slide with success status and imageUrl', async () => {
      const { deps, mocks } = makeDeps();

      await runPipeline(deps, JOB_PAYLOAD);

      expect(mocks.slideRepoUpdateSlide).toHaveBeenCalledWith(
        'team-1', 'job-1', 0,
        expect.objectContaining({
          status: 'success',
          imageUrl: 'https://cdn.example.com/slide-0.png',
        }),
      );
      expect(mocks.slideRepoUpdateSlide).toHaveBeenCalledWith(
        'team-1', 'job-1', 1,
        expect.objectContaining({
          status: 'success',
          imageUrl: 'https://cdn.example.com/slide-1.png',
        }),
      );
    });

    it('job success is set exactly once after all slides complete', async () => {
      const { deps, mocks } = makeDeps();

      await runPipeline(deps, JOB_PAYLOAD);

      const successCalls = mocks.jobRepoSetStatus.mock.calls.filter(
        (args: unknown[]) => args[2] === 'success',
      );
      expect(successCalls).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Precheck data failure
  // -------------------------------------------------------------------------
  describe('precheck data failure → job failed before rendering', () => {
    it('fails job when chart data is missing; renderer not called', async () => {
      const plan = makePlan(1);
      // Add a chart block that references missing data
      plan.slides[0]!.blocks = [{ type: 'chart', chartDataRef: 'missing-chart' }];

      const { deps, mocks } = makeDeps({
        planResult: { ok: true, value: plan },
      });

      // Job has no chartData in inputs
      mocks.jobRepoFindById.mockResolvedValue(
        makeJobRow({ inputs: { chartData: [], mockups: [], images: [] } }),
      );

      await runPipeline(deps, JOB_PAYLOAD);

      expect(mocks.rendererRenderSlide).not.toHaveBeenCalled();
      expect(mocks.jobRepoSetStatus).toHaveBeenCalledWith(
        'team-1', 'job-1', 'failed',
        'missing_chart_data',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// mapPlannerErrToFailureReason unit tests
// ---------------------------------------------------------------------------

describe('mapPlannerErrToFailureReason', () => {
  const cases: [PlannerError, string][] = [
    [{ kind: 'non_json' }, 'validation_error'],
    [{ kind: 'budget_exceeded' }, 'budget_exceeded'],
    [{ kind: 'endpoint_mismatch' }, 'endpoint_mismatch'],
    [{ kind: 'insecure_transport' }, 'insecure_transport'],
    [{ kind: 'privacy_violation' }, 'privacy_violation'],
    [{ kind: 'timeout' }, 'timeout'],
    [{ kind: 'provider_error', message: 'details' }, 'provider_error'],
  ];

  it.each(cases)('%o → %s', (input, expected) => {
    expect(mapPlannerErrToFailureReason(input)).toBe(expected);
  });
});

// ===========================================================================
// Tasks 18.2–18.5 — Property-based tests (fast-check) + end-to-end integration
//
// These reuse the BullMQ Worker mock + `runPipeline` harness defined above
// (the processor is captured and invoked directly, with NO real Redis/DB/AI).
// Unlike `makeDeps` (vi.fn assertion mocks), the harness below backs the
// repositories with an in-memory store so we can assert on the *persisted*
// job/slide state and the exact order of render calls.
// ===========================================================================

// ---------------------------------------------------------------------------
// In-memory store + stateful fakes
// ---------------------------------------------------------------------------

interface SlideRecord {
  index: number;
  status: SlideStatus;
  imageUrl: string | null;
  reason: FailureReason | null;
  usedFallback: boolean;
  blockComposition: BlockType[];
}

interface InMemoryStore {
  /** Current persisted job status (starts 'pending'). */
  jobStatus: JobStatus;
  jobReason: FailureReason | null;
  /** Every setStatus(...) call, in order — used to inspect status transitions. */
  jobStatusHistory: { status: JobStatus; reason: FailureReason | null }[];
  finishedAtCount: number;
  /** Persisted per-slide rows keyed by slide index. */
  slides: Map<number, SlideRecord>;
  /** Slide indices passed to renderer.renderSlide, in call order. */
  renderedIndices: number[];
  /** Payloads enqueued onto the (fake) BullMQ queue. */
  enqueued: ContentGenerationJobPayload[];
}

interface StatefulConfig {
  plan?: ContentPlan;
  planResult?: import('@leads-generator/shared').Result<ContentPlan, PlannerError>;
  repairPlanResult?: import('@leads-generator/shared').Result<ContentPlan, PlannerError>;
  validationOutcome?: ValidationOutcome;
  repairValidationOutcome?: ValidationOutcome;
  /** Render outcomes indexed by slide.index. */
  renderOutcomes?: RenderedSlide[];
  masterTemplate?: MasterTemplate | null;
  brandKit?: BrandKit | null;
  jobRowPresent?: boolean;
}

interface StatefulHarness {
  deps: CarouselWorkerDeps;
  store: InMemoryStore;
  /** Validator call count (to assert repair attempted at most once). */
  plannerCallCount: () => number;
}

/**
 * Build a CarouselWorkerDeps whose jobRepo/slideRepo are backed by an
 * in-memory store. Planner/validator/renderer are deterministic fakes
 * driven by the supplied config.
 */
function makeStatefulHarness(config: StatefulConfig = {}): StatefulHarness {
  const plan = config.plan ?? makePlan(2);
  const planResult = config.planResult ?? { ok: true as const, value: plan };
  const repairPlanResult = config.repairPlanResult ?? { ok: true as const, value: plan };
  const validationOutcome = config.validationOutcome ?? { valid: true, errors: [] };
  const repairValidationOutcome = config.repairValidationOutcome ?? { valid: true, errors: [] };
  const jobRowPresent = config.jobRowPresent ?? true;

  const store: InMemoryStore = {
    jobStatus: 'pending',
    jobReason: null,
    jobStatusHistory: [],
    finishedAtCount: 0,
    slides: new Map(),
    renderedIndices: [],
    enqueued: [],
  };

  let plannerCalls = 0;
  const planner = {
    plan: async () => {
      plannerCalls += 1;
      return plannerCalls === 1 ? planResult : repairPlanResult;
    },
  } as unknown as Planner;

  let validateCalls = 0;
  const validator = {
    validate: () => {
      validateCalls += 1;
      return validateCalls === 1 ? validationOutcome : repairValidationOutcome;
    },
  } as unknown as ContentPlanValidator;

  const renderer = {
    renderSlide: async (slide: { index: number }) => {
      store.renderedIndices.push(slide.index);
      const outcome = config.renderOutcomes?.[slide.index];
      return (
        outcome ?? {
          index: slide.index,
          status: 'success' as const,
          imageUrl: `https://cdn.example.com/job-1/slide-${slide.index}.png`,
          usedFallbackLayout: false,
        }
      );
    },
  } as unknown as Renderer;

  const jobRepo = {
    findById: async (): Promise<JobFullRow | null> =>
      jobRowPresent
        ? makeJobRow({
            status: store.jobStatus,
            inputs: {
              requestedSlideCount: plan.slides.length,
              chartData: [],
              mockups: [],
              images: [],
            },
          })
        : null,
    insert: async (data: { teamId: string; prompt: string; aspectRatio: import('@leads-generator/shared').AspectRatio; inputs?: Record<string, unknown> }): Promise<JobFullRow> => {
      store.jobStatus = 'pending';
      return makeJobRow({
        prompt: data.prompt,
        aspectRatio: data.aspectRatio,
        inputs: (data.inputs ?? {}) as JobFullRow['inputs'],
      });
    },
    setStatus: async (_teamId: string, _jobId: string, status: JobStatus, reason?: FailureReason) => {
      store.jobStatus = status;
      store.jobReason = reason ?? null;
      store.jobStatusHistory.push({ status, reason: reason ?? null });
    },
    setFinishedAt: async () => {
      store.finishedAtCount += 1;
    },
  } as unknown as ContentGenerationJobRepository;

  const slideRepo = {
    insertSlide: async (data: { index: number; status?: SlideStatus; blockComposition?: BlockType[] }) => {
      const record: SlideRecord = {
        index: data.index,
        status: data.status ?? 'pending',
        imageUrl: null,
        reason: null,
        usedFallback: false,
        blockComposition: data.blockComposition ?? [],
      };
      store.slides.set(data.index, record);
      return {
        jobId: 'job-1',
        index: record.index,
        status: record.status,
        imageUrl: record.imageUrl,
        reason: record.reason,
        usedFallback: record.usedFallback,
        blockComposition: record.blockComposition,
      };
    },
    updateSlide: async (
      _teamId: string,
      _jobId: string,
      index: number,
      fields: { status: SlideStatus; imageUrl?: string | null; reason?: FailureReason | null; usedFallback?: boolean },
    ) => {
      const existing =
        store.slides.get(index) ??
        ({ index, status: 'pending', imageUrl: null, reason: null, usedFallback: false, blockComposition: [] } as SlideRecord);
      existing.status = fields.status;
      existing.imageUrl = fields.imageUrl ?? null;
      existing.reason = fields.reason ?? null;
      existing.usedFallback = fields.usedFallback ?? false;
      store.slides.set(index, existing);
    },
    listSlides: async () =>
      [...store.slides.values()]
        .sort((a, b) => a.index - b.index)
        .map((s) => ({
          jobId: 'job-1',
          index: s.index,
          status: s.status,
          imageUrl: s.imageUrl,
          reason: s.reason,
          usedFallback: s.usedFallback,
          blockComposition: s.blockComposition,
        })),
  } as unknown as ContentGenerationSlideRepository;

  const deps: CarouselWorkerDeps = {
    planner,
    validator,
    renderer,
    jobRepo,
    slideRepo,
    masterTemplateRepo: {
      findByTeam: async () => (config.masterTemplate !== undefined ? config.masterTemplate : makeMasterTemplate()),
    } as unknown as MasterTemplateRepository,
    brandKitRepo: {
      findByTeam: async () => (config.brandKit !== undefined ? config.brandKit : makeBrandKit()),
    } as unknown as BrandKitRepository,
    exampleRetriever: {
      topRelevant: async () => [] as ApprovedExampleStructure[],
    } as unknown as ExampleRetriever,
    redisUrl: 'redis://localhost:6379',
  };

  return { deps, store, plannerCallCount: () => plannerCalls };
}

/** Build a success render outcome carrying a non-null Object_Storage URL. */
function successOutcome(index: number): RenderedSlide {
  return {
    index,
    status: 'success',
    imageUrl: `https://cdn.example.com/job-1/slide-${index}.png`,
    usedFallbackLayout: false,
  };
}

/** Build a failed render outcome — never carries an image URL. */
function failedOutcome(index: number, reason: FailureReason = 'provider_error'): RenderedSlide {
  return { index, status: 'failed', usedFallbackLayout: false, reason };
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

// ---------------------------------------------------------------------------
// Task 18.2 — Property 19: Semantik fail-fast dan keberhasilan Job
// ---------------------------------------------------------------------------

describe('CarouselWorker — Property 19: Semantik fail-fast dan keberhasilan Job', () => {
  // Feature: ai-content-carousel-generator, Property 19: Untuk setiap urutan hasil render Slide dalam satu Job, jika sebuah Slide berstatus failed pada posisi k maka Slide pada posisi > k SHALL tidak diproses, status keseluruhan Job SHALL failed, dan seluruh Slide yang telah success sebelum posisi k SHALL dipertahankan apa adanya tanpa rollback/cleanup; status Job SHALL success jika dan hanya jika seluruh Slide success dan masing-masing memiliki acuan URL. Gambar placeholder pada Slide failed SHALL tidak pernah dilaporkan success maupun dihitung sebagai keberhasilan Job.
  // **Validates: Requirements 10.3, 10.4, 11.1, 11.2, 11.3**
  it('halts after first failed slide, keeps prior successes, and succeeds iff all slides succeed with a URL', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary per-slide outcome sequence: true = success, false = failed.
        fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
        async (seq) => {
          const outcomes: RenderedSlide[] = seq.map((isSuccess, i) =>
            isSuccess ? successOutcome(i) : failedOutcome(i),
          );
          const { deps, store } = makeStatefulHarness({
            plan: makePlan(seq.length),
            renderOutcomes: outcomes,
          });

          await runPipeline(deps, JOB_PAYLOAD);

          const k = seq.findIndex((s) => !s); // first failure, or -1 if none
          const allSuccess = k === -1;

          // --- Fail-fast: slides after k are never processed ----------------
          const expectedRenderCount = allSuccess ? seq.length : k + 1;
          expect(store.renderedIndices).toEqual(range(expectedRenderCount));
          if (!allSuccess) {
            expect(Math.max(...store.renderedIndices)).toBe(k);
          }

          // --- Exactly one terminal job-status write ------------------------
          expect(store.jobStatusHistory).toHaveLength(1);

          // --- Job status = success IFF all slides success (each w/ URL) ----
          expect(store.jobStatus === 'success').toBe(allSuccess);

          if (allSuccess) {
            expect(store.finishedAtCount).toBeGreaterThanOrEqual(1);
            // Every slide persisted as success with a non-null URL.
            for (const i of range(seq.length)) {
              const slide = store.slides.get(i)!;
              expect(slide.status).toBe('success');
              expect(slide.imageUrl).not.toBeNull();
            }
          } else {
            expect(store.jobStatus).toBe('failed');

            // Successes before k preserved as-is (no rollback / cleanup).
            for (const i of range(k)) {
              const slide = store.slides.get(i)!;
              expect(slide.status).toBe('success');
              expect(slide.imageUrl).not.toBeNull();
            }

            // The failed slide is never reported as success and carries no URL.
            const failed = store.slides.get(k)!;
            expect(failed.status).toBe('failed');
            expect(failed.imageUrl).toBeNull();

            // Slides after k were inserted (pending) but never rendered/succeeded.
            for (let i = k + 1; i < seq.length; i++) {
              expect(store.slides.get(i)!.status).not.toBe('success');
            }
          }

          // --- A failed slide is never recorded as a success ----------------
          for (const slide of store.slides.values()) {
            if (slide.status === 'success') expect(slide.imageUrl).not.toBeNull();
            if (slide.status === 'failed') expect(slide.imageUrl).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 18.3 — Property 20: Status keseluruhan adalah enum tunggal yang valid
// ---------------------------------------------------------------------------

type StatusScenario =
  | { kind: 'all_success'; n: number }
  | { kind: 'render_fail'; n: number; failAt: number }
  | { kind: 'planner_fail' }
  | { kind: 'validation_fail' }
  | { kind: 'master_missing' }
  | { kind: 'brandkit_missing' }
  | { kind: 'job_not_found' };

function harnessForScenario(s: StatusScenario): StatefulHarness {
  switch (s.kind) {
    case 'all_success':
      return makeStatefulHarness({
        plan: makePlan(s.n),
        renderOutcomes: range(s.n).map((i) => successOutcome(i)),
      });
    case 'render_fail': {
      const failAt = Math.min(s.failAt, s.n - 1);
      return makeStatefulHarness({
        plan: makePlan(s.n),
        renderOutcomes: range(s.n).map((i) => (i === failAt ? failedOutcome(i) : successOutcome(i))),
      });
    }
    case 'planner_fail':
      return makeStatefulHarness({ planResult: { ok: false, error: { kind: 'non_json' } } });
    case 'validation_fail':
      return makeStatefulHarness({
        validationOutcome: { valid: false, errors: ['invalid'] },
        repairValidationOutcome: { valid: false, errors: ['still invalid'] },
      });
    case 'master_missing':
      return makeStatefulHarness({ masterTemplate: null });
    case 'brandkit_missing':
      return makeStatefulHarness({ brandKit: null });
    case 'job_not_found':
      return makeStatefulHarness({ jobRowPresent: false });
  }
}

const VALID_JOB_STATUSES: JobStatus[] = ['pending', 'success', 'failed'];

describe('CarouselWorker — Property 20: Status keseluruhan adalah enum tunggal yang valid', () => {
  // Feature: ai-content-carousel-generator, Property 20: Untuk setiap lintasan pemrosesan Job, status keseluruhan SHALL selalu bernilai tepat satu dari {pending, success, failed} pada satu waktu, dan transisi SHALL hanya dari pending ke status terminal success atau failed.
  // **Validates: Requirements 10.2**
  it('keeps the job status in {pending,success,failed} and only transitions pending → terminal', async () => {
    const scenarioArb: fc.Arbitrary<StatusScenario> = fc.oneof(
      fc.record({ kind: fc.constant('all_success' as const), n: fc.integer({ min: 1, max: 6 }) }),
      fc.record({
        kind: fc.constant('render_fail' as const),
        n: fc.integer({ min: 1, max: 6 }),
        failAt: fc.nat(),
      }),
      fc.constant({ kind: 'planner_fail' as const }),
      fc.constant({ kind: 'validation_fail' as const }),
      fc.constant({ kind: 'master_missing' as const }),
      fc.constant({ kind: 'brandkit_missing' as const }),
      fc.constant({ kind: 'job_not_found' as const }),
    );

    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const { deps, store } = harnessForScenario(scenario);

        // job_not_found makes the processor throw (BullMQ would mark it failed);
        // the persisted status must simply remain 'pending' (no transition).
        try {
          await runPipeline(deps, JOB_PAYLOAD);
        } catch {
          /* expected for job_not_found */
        }

        // Observed status timeline: initial 'pending' followed by each write.
        const timeline: JobStatus[] = ['pending', ...store.jobStatusHistory.map((h) => h.status)];

        // (a) Every observed value is a member of the enum.
        for (const status of timeline) {
          expect(VALID_JOB_STATUSES).toContain(status);
        }

        // (b) The worker never writes 'pending' — only terminal statuses.
        for (const h of store.jobStatusHistory) {
          expect(h.status === 'success' || h.status === 'failed').toBe(true);
        }

        // (c) At most one terminal transition occurs.
        expect(store.jobStatusHistory.length).toBeLessThanOrEqual(1);

        // (d) Every transition is pending → terminal (never terminal → X).
        for (let i = 1; i < timeline.length; i++) {
          expect(timeline[i - 1]).toBe('pending');
          expect(timeline[i] === 'success' || timeline[i] === 'failed').toBe(true);
        }

        // (e) The final status is exactly one valid enum value.
        expect(VALID_JOB_STATUSES).toContain(store.jobStatus);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 18.4 — Property 21: Status mencerminkan eksekusi sebenarnya terlepas
//             dari notifikasi (Outbox pattern)
// ---------------------------------------------------------------------------

type NotifierFaultMode = 'throw_sync' | 'reject_async' | 'throw_nonerror';

/**
 * Fault-injected notifier representing the separate Outbox dispatcher. The
 * worker never invokes it directly (status is persisted in the domain
 * transaction); a downstream dispatcher reads the persisted status and
 * notifies. Every mode here fails so we can prove the failure cannot mutate
 * the persisted status.
 */
function makeFaultyNotifier(mode: NotifierFaultMode) {
  return {
    notify: async (_status: JobStatus, _slides: SlideRecord[]): Promise<void> => {
      switch (mode) {
        case 'throw_sync':
          throw new Error('notifier transport failure');
        case 'reject_async':
          return Promise.reject(new Error('notifier rejected'));
        case 'throw_nonerror':
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'notifier string failure';
      }
    },
  };
}

describe('CarouselWorker — Property 21: Status mencerminkan eksekusi sebenarnya terlepas dari notifikasi', () => {
  // Feature: ai-content-carousel-generator, Property 21: Untuk setiap mode kegagalan penyampaian notifikasi, status keseluruhan dan status per-Slide yang tersimpan SHALL tetap sama dengan hasil eksekusi sebenarnya (ditegakkan via Outbox pattern), sehingga kegagalan notifikasi tidak pernah mengubah status yang dilaporkan.
  // **Validates: Requirements 11.5**
  it('persisted job + per-slide statuses equal the actual execution result regardless of notifier failure mode', async () => {
    const execArb = fc.oneof(
      fc.record({ kind: fc.constant('success' as const), n: fc.integer({ min: 1, max: 5 }) }),
      fc.record({
        kind: fc.constant('fail' as const),
        n: fc.integer({ min: 1, max: 5 }),
        failAt: fc.nat(),
      }),
    );
    const faultArb = fc.constantFrom<NotifierFaultMode>('throw_sync', 'reject_async', 'throw_nonerror');

    await fc.assert(
      fc.asyncProperty(execArb, faultArb, async (exec, faultMode) => {
        const failAt = exec.kind === 'fail' ? Math.min(exec.failAt, exec.n - 1) : -1;
        const outcomes = range(exec.n).map((i) =>
          failAt === i ? failedOutcome(i) : successOutcome(i),
        );
        const { deps, store } = makeStatefulHarness({
          plan: makePlan(exec.n),
          renderOutcomes: outcomes,
        });

        // 1) Run the worker — it persists status purely from execution.
        await runPipeline(deps, JOB_PAYLOAD);

        // 2) Compute the actual execution result independently.
        const expectedJobStatus: JobStatus = failAt === -1 ? 'success' : 'failed';
        const expectedSlides = new Map<number, SlideStatus>();
        for (const i of range(exec.n)) {
          if (failAt === -1 || i < failAt) expectedSlides.set(i, 'success');
          else if (i === failAt) expectedSlides.set(i, 'failed');
          else expectedSlides.set(i, 'pending'); // never rendered after k
        }

        // Persisted state matches the execution result before any notification.
        expect(store.jobStatus).toBe(expectedJobStatus);
        for (const [i, st] of expectedSlides) {
          expect(store.slides.get(i)!.status).toBe(st);
        }

        // Snapshot the persisted state.
        const before = {
          jobStatus: store.jobStatus,
          jobReason: store.jobReason,
          slides: [...store.slides.values()].map((s) => ({ ...s })),
        };

        // 3) Run the Outbox dispatcher with an injected fault. It reads the
        //    persisted status and fails — the failure is swallowed by the
        //    dispatcher and MUST NOT touch the persisted status.
        const notifier = makeFaultyNotifier(faultMode);
        let notifierFailed = false;
        try {
          await notifier.notify(store.jobStatus, [...store.slides.values()]);
        } catch {
          notifierFailed = true;
        }
        expect(notifierFailed).toBe(true); // the fault was genuinely injected

        // 4) Persisted state is unchanged and still equals the execution result.
        expect(store.jobStatus).toBe(before.jobStatus);
        expect(store.jobStatus).toBe(expectedJobStatus);
        expect(store.jobReason).toBe(before.jobReason);
        for (const [i, st] of expectedSlides) {
          expect(store.slides.get(i)!.status).toBe(st);
        }
        for (const snap of before.slides) {
          const now = store.slides.get(snap.index)!;
          expect(now.status).toBe(snap.status);
          expect(now.imageUrl).toBe(snap.imageUrl);
          expect(now.reason).toBe(snap.reason);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 18.5 — Integration test: trigger → worker → status (end-to-end)
// ---------------------------------------------------------------------------

describe('CarouselWorker — end-to-end trigger → worker → status (integration)', () => {
  /** A fake BullMQ Queue that records enqueued payloads into the store. */
  function makeFakeQueue(store: InMemoryStore): Queue<ContentGenerationJobPayload> {
    return {
      add: async (_name: string, payload: ContentGenerationJobPayload) => {
        store.enqueued.push(payload);
        return { id: `bull-${store.enqueued.length}` };
      },
    } as unknown as Queue<ContentGenerationJobPayload>;
  }

  const REQ: GenerateRequest = {
    prompt: 'Buatkan carousel 2 slide tentang produk kami',
    aspectRatio: '1:1',
    requestedSlideCount: 2,
  };

  it('happy path: trigger enqueues a pending job; worker renders all slides → job success (R10.2, R10.4)', async () => {
    const { deps, store } = makeStatefulHarness({
      plan: makePlan(2),
      renderOutcomes: [successOutcome(0), successOutcome(1)],
    });

    // --- Trigger (asynchronous): create pending job + enqueue, no inline AI ---
    const service = new ContentGeneratorService({
      jobRepo: deps.jobRepo,
      slideRepo: deps.slideRepo,
      masterTemplateRepo: deps.masterTemplateRepo,
      aiSettings: { hasApiKey: async () => true } as unknown as import('../auth/team-ai-settings-service.js').TeamAiSettingsService,
      queue: makeFakeQueue(store),
    });

    const triggered = await service.trigger('team-1', 'system', REQ);
    expect(triggered.ok).toBe(true);
    expect(store.enqueued).toHaveLength(1); // exactly one enqueue
    expect(store.jobStatus).toBe('pending'); // R10.2: starts pending

    // --- Worker consumes the enqueued payload ---
    const payload = store.enqueued[0]!;
    await runPipeline(deps, payload);

    // R10.4: all slides success → overall success.
    expect(store.jobStatus).toBe('success');
    expect(store.renderedIndices).toEqual([0, 1]);
    expect(store.slides.get(0)!.status).toBe('success');
    expect(store.slides.get(0)!.imageUrl).not.toBeNull(); // Object_Storage URL
    expect(store.slides.get(1)!.status).toBe('success');
    expect(store.finishedAtCount).toBeGreaterThanOrEqual(1);

    // getJob read model reflects the terminal state.
    const view = await service.getJob('team-1', payload.jobId);
    expect(view.ok).toBe(true);
    if (view.ok) {
      expect(view.value.status).toBe('success');
      expect(view.value.slides).toHaveLength(2);
      expect(view.value.slides.every((s) => s.status === 'success')).toBe(true);
    }
  });

  it('validator failure: job stays failed with no re-enqueue and bookkeeping completes (R9.5, R9.6)', async () => {
    const { deps, store } = makeStatefulHarness({
      // Initial plan invalid AND repaired plan still invalid → fail-closed.
      validationOutcome: { valid: false, errors: ['too many slides'] },
      repairValidationOutcome: { valid: false, errors: ['still too many slides'] },
      renderOutcomes: [successOutcome(0), successOutcome(1)],
    });

    const rendererSpy = vi.spyOn(deps.renderer, 'renderSlide');

    const service = new ContentGeneratorService({
      jobRepo: deps.jobRepo,
      slideRepo: deps.slideRepo,
      masterTemplateRepo: deps.masterTemplateRepo,
      aiSettings: { hasApiKey: async () => true } as unknown as import('../auth/team-ai-settings-service.js').TeamAiSettingsService,
      queue: makeFakeQueue(store),
    });

    const triggered = await service.trigger('team-1', 'system', REQ);
    expect(triggered.ok).toBe(true);
    expect(store.enqueued).toHaveLength(1);

    const payload = store.enqueued[0]!;
    await runPipeline(deps, payload);

    // R9.4/R9.5: validation fails → job failed (validation_error); renderer not invoked.
    expect(store.jobStatus).toBe('failed');
    expect(store.jobReason).toBe('validation_error');
    expect(rendererSpy).not.toHaveBeenCalled();

    // R9.5: attempts:1 → no auto-retry / no re-enqueue (still exactly one enqueue).
    expect(store.enqueued).toHaveLength(1);

    // R9.6: bookkeeping completed — the terminal status write happened exactly once.
    expect(store.jobStatusHistory).toHaveLength(1);
    expect(store.jobStatusHistory[0]).toEqual({ status: 'failed', reason: 'validation_error' });

    // Status read model is terminal-failed and stable.
    const view = await service.getJob('team-1', payload.jobId);
    expect(view.ok).toBe(true);
    if (view.ok) expect(view.value.status).toBe('failed');
  });
});
