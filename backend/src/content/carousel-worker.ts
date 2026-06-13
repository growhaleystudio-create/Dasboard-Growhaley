/**
 * carousel-worker.ts — BullMQ Worker for carousel generation pipeline.
 *
 * Pipeline per-job (fail-fast, attempts: 1, no auto-retry):
 *   1. Load job from DB
 *   2. Load master template → derive MasterTemplateRules
 *   3. Load brand kit
 *   4. Retrieve approved examples (topRelevant, or empty)
 *   5. PLANNER: generate ContentPlan
 *   6. VALIDATOR: validate plan; repair once if invalid
 *   7. PRECHECK DATA: mark failing slides, halt if any
 *   8. Create slide rows in DB
 *   9. RENDER per slide (fail-fast: slide failure halts all remaining slides)
 *  10. All slides success → mark job success
 *
 * Design: Components and Interfaces → Worker; Sequence: Pipeline
 * Requirements: 4.3, 4.4, 4.5, 9.4, 9.5, 9.6, 10.2, 10.3, 10.4, 11.1, 11.2, 11.3, 11.5
 */

import { Worker, type Job } from 'bullmq';
import type { RedisOptions } from 'ioredis';

import type { AspectRatio, BlockType, FailureReason, MasterTemplateRules } from '@leads-generator/shared';

import type { ContentGenerationJobPayload } from './content-generator-service.js';
import { CONTENT_GENERATION_QUEUE_NAME, checkRequiredData } from './content-generator-service.js';
import type { Planner, PlannerError } from './planner.js';
import type { ContentPlanValidator } from './content-plan-validator.js';
import type { Renderer, RenderContext } from './renderer.js';
import type { ExampleRetriever } from './example-retriever.js';
import type { ContentGenerationJobRepository } from '../repository/content-generation-job-repository.js';
import type { ContentGenerationSlideRepository } from '../repository/content-generation-slide-repository.js';
import type { MasterTemplateRepository } from '../repository/master-template-repository.js';
import type { BrandKitRepository } from '../repository/brand-kit-repository.js';

// ---------------------------------------------------------------------------
// Public deps interface
// ---------------------------------------------------------------------------

export interface CarouselWorkerDeps {
  planner: Planner;
  validator: ContentPlanValidator;
  renderer: Renderer;
  jobRepo: ContentGenerationJobRepository;
  slideRepo: ContentGenerationSlideRepository;
  masterTemplateRepo: MasterTemplateRepository;
  brandKitRepo: BrandKitRepository;
  exampleRetriever: ExampleRetriever;
  redisUrl: string;
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/**
 * Map a PlannerError to the appropriate FailureReason for job status.
 * Requirements: 9.5, 9.6
 */
export function mapPlannerErrToFailureReason(err: PlannerError): FailureReason {
  switch (err.kind) {
    case 'non_json':           return 'validation_error';
    case 'budget_exceeded':    return 'budget_exceeded';
    case 'endpoint_mismatch':  return 'endpoint_mismatch';
    case 'insecure_transport': return 'insecure_transport';
    case 'privacy_violation':  return 'privacy_violation';
    case 'timeout':            return 'timeout';
    case 'provider_error':     return 'provider_error';
  }
}

// ---------------------------------------------------------------------------
// MasterTemplate → MasterTemplateRules conversion
// ---------------------------------------------------------------------------

/**
 * Convert a stored MasterTemplate to the runtime MasterTemplateRules shape
 * (ReadonlySet / ReadonlyMap).
 */
function templateToRules(template: {
  brandKitId: string;
  allowedBlocks: BlockType[];
  maxSlides: number;
  textLimits: { blockType: BlockType; maxChars: number }[];
  aspectRatios: AspectRatio[];
  defaultTone: string;
}): MasterTemplateRules {
  const textLimitsMap = new Map<BlockType, number>();
  for (const limit of template.textLimits) {
    textLimitsMap.set(limit.blockType, limit.maxChars);
  }
  return {
    allowedBlocks: new Set<BlockType>(template.allowedBlocks),
    maxSlides: template.maxSlides,
    textLimits: textLimitsMap as ReadonlyMap<BlockType, number>,
    aspectRatios: new Set<AspectRatio>(template.aspectRatios),
    defaultTone: template.defaultTone,
    brandKitId: template.brandKitId,
  };
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

/**
 * Create and return the BullMQ Worker that runs the carousel generation
 * pipeline for each job.
 *
 * Worker config:
 *   - concurrency: 3
 *   - attempts: 1 (no auto-retry — each job is fail-closed)
 *
 * Requirements: 10.2, 10.3, 10.4, 11.1, 11.2, 11.3, 11.5
 */
export function createCarouselWorker(
  deps: CarouselWorkerDeps,
): Worker<ContentGenerationJobPayload> {
  const connection = new URL(deps.redisUrl);

  const connectionOptions: RedisOptions = {
    host: connection.hostname,
    port: Number(connection.port || 6379),
    maxRetriesPerRequest: null,
  };
  if (connection.username) connectionOptions.username = connection.username;
  if (connection.password) connectionOptions.password = connection.password;
  if (connection.protocol === 'rediss:') connectionOptions.tls = {};

  return new Worker<ContentGenerationJobPayload>(
    CONTENT_GENERATION_QUEUE_NAME,
    async (job: Job<ContentGenerationJobPayload>) => {
      const { jobId, teamId } = job.data;
      const abortController = new AbortController();

      // -------------------------------------------------------------------
      // Step 1: Load job from DB (R10.2)
      // -------------------------------------------------------------------
      const jobRow = await deps.jobRepo.findById(teamId, jobId);
      if (!jobRow) {
        // Not found — BullMQ will mark job as failed
        throw new Error(`Job ${jobId} not found for team ${teamId}`);
      }

      const inputs = jobRow.inputs as {
        requestedSlideCount?: number;
        chosenPlan?: import('@leads-generator/shared').ContentPlan | null;
        chartData?: { ref: string; data: import('@leads-generator/shared').ChartData }[];
        mockups?: { ref: string; objectUrl: string }[];
        images?: { ref: string; objectUrl: string }[];
      };

      // -------------------------------------------------------------------
      // Step 2: Load master template (R10.2)
      // -------------------------------------------------------------------
      const masterTemplate = await deps.masterTemplateRepo.findByTeam(teamId);
      if (!masterTemplate) {
        await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'validation_error');
        return;
      }

      const rules = templateToRules(masterTemplate);

      // -------------------------------------------------------------------
      // Step 3: Load brand kit (R10.2)
      // -------------------------------------------------------------------
      const brandKit = await deps.brandKitRepo.findByTeam(teamId);
      if (!brandKit) {
        await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'off_brand');
        return;
      }

      // -------------------------------------------------------------------
      // Step 4: Load approved examples (or empty if none) (R8.2)
      // -------------------------------------------------------------------
      let examples: import('@leads-generator/shared').ApprovedExampleStructure[] = [];
      try {
        examples = await deps.exampleRetriever.topRelevant(
          teamId,
          {
            aspectRatio: jobRow.aspectRatio,
            tags: [],
            intendedBlocks: [...rules.allowedBlocks],
          },
        );
      } catch {
        // Approved examples are best-effort — continue without them
        examples = [];
      }

      // -------------------------------------------------------------------
      // Step 5: PLANNER — generate ContentPlan (R4.3)
      // -------------------------------------------------------------------
      const planInput: import('./planner.js').PlannerInput = {
        teamId,
        jobId,
        actorId: 'system',
        prompt: jobRow.prompt,
        rules,
        examples,
        expectsData: inferExpectsData(jobRow.prompt),
      };
      if (inputs.requestedSlideCount !== undefined) {
        // Clamp to maxSlides so AI never generates more slides than the template allows
        planInput.requestedSlideCount = Math.min(inputs.requestedSlideCount, rules.maxSlides);
      }

      let plan: import('@leads-generator/shared').ContentPlan;

      if (inputs.chosenPlan && inputs.chosenPlan.slides.length > 0) {
        // User already chose a plan in the preview step — use it directly so the
        // generated carousel matches exactly what they selected (no re-planning).
        plan = inputs.chosenPlan;
      } else {
        const planResult = await deps.planner.plan(planInput, abortController.signal);

        if (!planResult.ok) {
          const reason = mapPlannerErrToFailureReason(planResult.error);
          await deps.jobRepo.setStatus(teamId, jobId, 'failed', reason);
          return;
        }

        plan = planResult.value;
      }

      // -------------------------------------------------------------------
      // Step 6: VALIDATOR with repair (R4.4, R4.5, R9.4)
      // -------------------------------------------------------------------
      let outcome: import('./content-plan-validator.js').ValidationOutcome;

      try {
        outcome = deps.validator.validate(plan, rules);
      } catch {
        // Validator threw — fail-closed (R9.4)
        await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'validation_error');
        return;
      }

      if (!outcome.valid) {
        // Log for debugging
        console.error('[carousel-worker] Validation failed:', JSON.stringify({ errors: outcome.errors, plan }, null, 2));
        // Attempt one repair (R4.5)
        const repairInput: import('./planner.js').PlannerInput = {
          teamId,
          jobId,
          actorId: 'system',
          prompt: jobRow.prompt,
          rules,
          examples,
          expectsData: inferExpectsData(jobRow.prompt),
          repairOf: plan,
          validationErrors: outcome.errors,
        };
        if (inputs.requestedSlideCount !== undefined) {
          repairInput.requestedSlideCount = inputs.requestedSlideCount;
        }

        const repairResult = await deps.planner.plan(repairInput, abortController.signal);

        if (!repairResult.ok) {
          // Repair planner call failed → fail job validation_error (R4.5)
          await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'validation_error');
          return;
        }

        let repairOutcome: import('./content-plan-validator.js').ValidationOutcome;
        try {
          repairOutcome = deps.validator.validate(repairResult.value, rules);
        } catch {
          // Validator threw on repair attempt — fail-closed (R9.4)
          await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'validation_error');
          return;
        }

        if (!repairOutcome.valid) {
          // Repaired plan still invalid → fail job (R4.5)
          await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'validation_error');
          return;
        }

        // Use the repaired plan
        plan = repairResult.value;
      }

      // -------------------------------------------------------------------
      // Step 6.5: Enforce exact requested slide count (truncate extras)
      // -------------------------------------------------------------------
      if (inputs.requestedSlideCount !== undefined) {
        const want = Math.min(inputs.requestedSlideCount, rules.maxSlides);
        if (plan.slides.length > want) {
          plan = {
            ...plan,
            slides: plan.slides.slice(0, want).map((s, i) => ({ ...s, index: i })),
          };
        }
      }

      // -------------------------------------------------------------------
      // Step 7: PRECHECK DATA — check for missing chart data / mockups (R7.4)
      // -------------------------------------------------------------------
      const failingSlides = checkRequiredData(plan, inputs);

      if (failingSlides.length > 0) {
        // Mark each failing slide in DB
        for (const failing of failingSlides) {
          const slide = plan.slides.find((s) => s.index === failing.slideIndex);
          await deps.slideRepo.insertSlide({
            teamId,
            jobId,
            index: failing.slideIndex,
            status: 'failed',
            blockComposition: slide?.blocks.map((b) => b.type) ?? [],
          });
          await deps.slideRepo.updateSlide(teamId, jobId, failing.slideIndex, {
            status: 'failed',
            reason: failing.reason,
          });
        }
        // Fail job immediately
        await deps.jobRepo.setStatus(teamId, jobId, 'failed', failingSlides[0]!.reason);
        return;
      }

      // -------------------------------------------------------------------
      // Step 8: Create slide rows in DB (pending) (R10.2)
      // -------------------------------------------------------------------
      for (const slide of plan.slides) {
        await deps.slideRepo.insertSlide({
          teamId,
          jobId,
          index: slide.index,
          status: 'pending',
          blockComposition: slide.blocks.map((b) => b.type),
        });
      }

      // -------------------------------------------------------------------
      // Step 9: Build render context
      // -------------------------------------------------------------------
      const chartDataMap = new Map<string, import('./chart-renderer.js').ChartData>();
      for (const cd of inputs.chartData ?? []) {
        chartDataMap.set(cd.ref, cd.data as import('./chart-renderer.js').ChartData);
      }

      const mockupImagesMap = new Map<string, Buffer>();
      // Mockup images would be pre-fetched; here we pass empty map
      // (actual image fetching is handled by the renderer or an upstream step)

      const userImagesMap = new Map<string, Buffer>();

      const renderContext: RenderContext = {
        teamId,
        jobId,
        brandKit,
        aspectRatio: plan.aspectRatio,
        totalSlides: plan.slides.length,
        chartData: chartDataMap,
        mockupImages: mockupImagesMap,
        userImages: userImagesMap,
      };

      // -------------------------------------------------------------------
      // Step 10: RENDER per slide — fail-fast (R10.3)
      // -------------------------------------------------------------------
      for (const slide of plan.slides) {
        const rendered = await deps.renderer.renderSlide(slide, renderContext);

        // Write slide result to DB
        await deps.slideRepo.updateSlide(teamId, jobId, slide.index, {
          status: rendered.status,
          imageUrl: rendered.imageUrl ?? null,
          reason: rendered.reason ?? null,
          usedFallback: rendered.usedFallbackLayout,
        });

        if (rendered.status === 'failed') {
          // Fail-fast: halt remaining slides, mark job failed (R10.3, R11.3)
          await deps.jobRepo.setStatus(
            teamId,
            jobId,
            'failed',
            rendered.reason ?? 'provider_error',
          );
          return;
        }
      }

      // -------------------------------------------------------------------
      // Step 11: All slides success → mark job success (R10.4, R11.1)
      // -------------------------------------------------------------------
      await deps.jobRepo.setStatus(teamId, jobId, 'success');
      await deps.jobRepo.setFinishedAt(teamId, jobId, new Date());
    },
    {
      connection: connectionOptions,
      concurrency: 3,
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Infer whether the prompt expects data/chart blocks.
 * Simple heuristic: look for data-related keywords.
 */
function inferExpectsData(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    lower.includes('data') ||
    lower.includes('chart') ||
    lower.includes('grafik') ||
    lower.includes('angka') ||
    lower.includes('statistik') ||
    lower.includes('statistic') ||
    lower.includes('number') ||
    lower.includes('metric') ||
    lower.includes('metrik')
  );
}
