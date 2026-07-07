/**
 * image-generation-handler.ts — Image generation orchestration
 *
 * Handles AI image generation for slides, with retry logic, failure tracking,
 * and repair strategies for optional vs required images.
 */

import type {
  SduiSlide,
  SduiComponent,
  BrandKit,
  AspectRatio,
  ContentConversationContextMessage,
} from '@leads-generator/shared';
import type { BackgroundImageClient, BackgroundRequest } from '../../background-image-client.js';
import type { SduiPlanner } from '../../sdui-planner/index.js';
import type { ContentGenerationSlideRepository } from '../../../repository/content-generation-slide-repository.js';
import { ImageUtils } from '../utils/image-utils.js';
import { SlideUtils } from '../utils/slide-utils.js';
import { LayoutProcessor } from '../processors/layout-processor.js';
import { SlideRepair } from '../processors/slide-repair.js';
import { SlideContentAnalyzer } from '../validators/slide-content-analyzer.js';
import { applySduiTextGuardrails } from '../../sdui-text-guardrails.js';
import type { SduiTextGuardrailOptions } from '../../sdui-text-guardrails.js';

export interface ImageGenerationResult {
  /** Slide numbers where optional image generation failed */
  failedImageSlideNumbers: Set<number>;
  /** Slide numbers where REQUIRED image generation failed (terminal) */
  requiredImageFailedSlideNumbers: Set<number>;
}

export interface ImageGenerationContext {
  teamId: string;
  jobId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  width: number;
  brandKit: BrandKit;
  signal: AbortSignal;
  logTiming: (stage: string, ms: number, extra?: Record<string, unknown>) => void;
}

export interface ImageRepairContext {
  teamId: string;
  jobId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  width: number;
  brandKit: BrandKit;
  signal: AbortSignal;
  logTiming: (stage: string, ms: number, extra?: Record<string, unknown>) => void;
  maxSlides: number;
  defaultTone: string;
  textGuardrailOptions: SduiTextGuardrailOptions;
  contentTags: string[];
  conversationContext: ContentConversationContextMessage[];
}

/**
 * Generate AI images for all image_placeholder components in the deck.
 *
 * Flow:
 * 1. Collect all image placeholders from slides
 * 2. For each placeholder → generate image (with 1 retry)
 * 3. Success → inline as base64 data URI, mark slide.image_status = 'generated'
 * 4. Failure → track in failedImageSlideNumbers (optional) or requiredImageFailedSlideNumbers (required)
 *
 * Mutates slide/component objects in place.
 */
export async function generateSlideImages(
  ctx: ImageGenerationContext,
  slides: SduiSlide[],
  imageClient: BackgroundImageClient,
): Promise<ImageGenerationResult> {
  const { teamId, jobId, prompt, aspectRatio, width, brandKit, signal, logTiming } = ctx;

  // Collect all image_placeholder components
  const imageTasks: { slide: SduiSlide; comp: SduiComponent }[] = [];
  for (const slide of slides) {
    for (const group of ['action_footer', 'core_content'] as const) {
      for (const comp of slide.nested_groups[group] ?? []) {
        if (comp.type === 'image_placeholder') {
          imageTasks.push({ slide, comp });
        }
      }
    }
  }

  const failedImageSlideNumbers = new Set<number>();
  const requiredImageFailedSlideNumbers = new Set<number>();

  if (imageTasks.length === 0) {
    return { failedImageSlideNumbers, requiredImageFailedSlideNumbers };
  }

  console.log(`[image-gen] job=${jobId} starting ${imageTasks.length} image generation tasks (parallel)`);
  const imageGenT0 = Date.now();

  // Parallel image generation with concurrency limit (3 concurrent max)
  const CONCURRENCY_LIMIT = 3;
  const results = await Promise.allSettled(
    imageTasks.map(async ({ slide, comp }) => {
      const slideT0 = Date.now();
      const imgPrompt =
        comp.image_object_context?.trim() ||
        `professional illustration related to: ${prompt.slice(0, 80)}`;

      const tryGenerate = async (): Promise<Buffer | null> => {
        const stylePrompt = ImageUtils.extractStyle(prompt);
        const request: BackgroundRequest = {
          prompt: imgPrompt,
          aspectRatio: ImageUtils.getGeneratedAspect(slide, aspectRatio),
          palette: brandKit.colors,
          kind: 'content',
        };
        if (stylePrompt) request.stylePrompt = stylePrompt;

        const result = await imageClient.generate(teamId, request, signal);
        if (!result.ok) return null;

        return ImageUtils.normalize(result.value, slide, aspectRatio, width);
      };

      try {
        let png = await tryGenerate();
        if (!png) {
          console.warn(`[image-gen] attempt 1 failed for slide ${slide.slide_number}, retrying…`);
          png = await tryGenerate();
        }

        if (png) {
          comp.imageUrl = `data:image/png;base64,${png.toString('base64')}`;
          slide.image_status = 'generated';
          logTiming('image_gen_slide', Date.now() - slideT0, {
            slide: slide.slide_number,
            ok: true,
          });
          return { success: true, slide: slide.slide_number };
        } else {
          const isRequired = slide.image_requirement === 'required';
          console.warn(
            `[image-gen] failed after retry for slide ${slide.slide_number} (${isRequired ? 'required' : 'optional'})`,
          );
          logTiming('image_gen_slide', Date.now() - slideT0, {
            slide: slide.slide_number,
            ok: false,
            required: isRequired,
          });
          return { success: false, slide: slide.slide_number, isRequired };
        }
      } catch (e) {
        const isRequired = slide.image_requirement === 'required';
        console.warn(
          `[image-gen] exception for slide ${slide.slide_number} (${isRequired ? 'required' : 'optional'}):`,
          e,
        );
        logTiming('image_gen_slide', Date.now() - slideT0, {
          slide: slide.slide_number,
          ok: false,
          exception: true,
          required: isRequired,
        });
        return { success: false, slide: slide.slide_number, isRequired, exception: true };
      }
    }),
  );

  // Collect failures from parallel results
  for (const result of results) {
    if (result.status === 'fulfilled' && !result.value.success) {
      const { slide, isRequired } = result.value;
      (isRequired ? requiredImageFailedSlideNumbers : failedImageSlideNumbers).add(slide);
    } else if (result.status === 'rejected') {
      console.error('[image-gen] unexpected promise rejection:', result.reason);
    }
  }

  logTiming('image_gen_total', Date.now() - imageGenT0, {
    tasks: imageTasks.length,
    requiredFailed: requiredImageFailedSlideNumbers.size,
    optionalFailed: failedImageSlideNumbers.size,
  });

  return { failedImageSlideNumbers, requiredImageFailedSlideNumbers };
}

/**
 * Terminal failure handler for required image generation failures.
 *
 * A slide that REQUIRED an image but failed generation cannot silently become
 * text-only. Record per-slide failure rows (best-effort) and mark the job failed.
 *
 * NOTE: Wrapped in try/catch so DB errors don't prevent job status update.
 */
export async function failJobForRequiredImageFailures(
  slideRepo: ContentGenerationSlideRepository,
  ctx: { teamId: string; jobId: string },
  slides: SduiSlide[],
  requiredImageFailedSlideNumbers: Set<number>,
): Promise<void> {
  const { teamId, jobId } = ctx;
  const failedNums = [...requiredImageFailedSlideNumbers].sort((a, b) => a - b);

  console.error(
    `[image-gen] Required image generation failed for slide(s) ${failedNums.join(', ')} — job will fail`,
  );

  // Best-effort: record failed slide rows before marking job failed
  try {
    for (let idx = 0; idx < slides.length; idx++) {
      const s = slides[idx]!;
      const isFailed = requiredImageFailedSlideNumbers.has(s.slide_number);

      // Insert as 'pending' first (satisfies slide_failed_has_reason CHECK constraint)
      await slideRepo.insertSlide({
        teamId,
        jobId,
        index: idx,
        status: 'pending',
        blockComposition: SlideUtils.blockComposition(s),
      });

      // Then mark failed slides with reason
      if (isFailed) {
        await slideRepo.updateSlide(teamId, jobId, idx, {
          status: 'failed',
          reason: 'provider_error',
        });
      }
    }
  } catch (e) {
    console.error(
      '[image-gen] failed to record failed-slide rows; job will still be marked failed:',
      e,
    );
  }
}

/**
 * Repair slides whose OPTIONAL image failed generation.
 *
 * Flow:
 * 1. Ask planner for no-image layout repair (AI)
 * 2. If AI fails → deterministic no-image layout selection
 * 3. Re-enforce layout diversity across repaired deck
 * 4. Stamp all repaired slides with image_requirement='none', image_status='provider_failed_repaired'
 *
 * Returns updated slide array.
 */
export async function repairFailedOptionalImages(
  planner: SduiPlanner,
  ctx: ImageRepairContext,
  slides: SduiSlide[],
  failedImageSlideNumbers: Set<number>,
): Promise<SduiSlide[]> {
  const {
    teamId,
    jobId,
    prompt,
    aspectRatio,
    maxSlides,
    defaultTone,
    textGuardrailOptions,
    signal,
    contentTags,
    conversationContext,
  } = ctx;

  const failedNumbers = [...failedImageSlideNumbers].sort((a, b) => a - b);

  // Attempt AI repair
  const repairResult = await planner.plan(
    {
      teamId,
      jobId,
      actorId: 'system',
      prompt,
      aspectRatio,
      slideCount: slides.length,
      maxSlides,
      tone: defaultTone,
      previousSlides: slides,
      feedback: `Image generation failed for slide(s) ${failedNumbers.join(', ')}. Repair those slides using no-image layouts only.`,
      repairMode: 'image_failure_no_image',
      failedImageSlideNumbers: failedNumbers,
      typographyOverride: textGuardrailOptions.typography,
      contentTags,
      conversationContext,
    },
    signal,
  );

  let next: SduiSlide[];

  if (!repairResult.ok) {
    console.warn(
      '[image-gen] AI no-image repair failed, using deterministic fallback:',
      repairResult.error,
    );
    next = slides.map((slide, index) =>
      failedImageSlideNumbers.has(slide.slide_number)
        ? SlideRepair.deterministicNoImageRepair(slide, index)
        : slide,
    );
  } else {
    const repairedByNumber = new Map(
      repairResult.value.slides.map((slide) => [slide.slide_number, slide]),
    );

    next = slides.map((slide, index) => {
      if (!failedImageSlideNumbers.has(slide.slide_number)) return slide;

      const repaired = repairedByNumber.get(slide.slide_number);
      const candidate = repaired
        ? applySduiTextGuardrails(
            {
              ...repaired,
              slide_number: slide.slide_number,
              slide_type: slide.slide_type,
              image_requirement: 'none' as const,
              image_status: 'provider_failed_repaired' as const,
              layout_source: 'ai_repaired_after_image_failure' as const,
            },
            textGuardrailOptions,
          )
        : SlideRepair.deterministicNoImageRepair(slide, index);

      return LayoutProcessor.isValidNoImageRepair(candidate)
        ? candidate
        : SlideRepair.deterministicNoImageRepair(slide, index);
    });
  }

  // Re-enforce layout diversity with failed slides forced to no-image
  next = LayoutProcessor.enforceLayoutDiversity(next, {
    forceNoImageSlideNumbers: failedImageSlideNumbers,
  }).map((slide) => applySduiTextGuardrails(slide, textGuardrailOptions));

  // Final stamp: all failed slides marked as repaired
  next = next.map((slide) =>
    failedImageSlideNumbers.has(slide.slide_number)
      ? applySduiTextGuardrails(
          {
            ...slide,
            image_requirement: 'none',
            image_status: 'provider_failed_repaired',
            layout_source: 'ai_repaired_after_image_failure',
          },
          textGuardrailOptions,
        )
      : slide,
  );

  return next;
}
