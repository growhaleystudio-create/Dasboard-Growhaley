/**
 * slide-repair.ts
 * 
 * Quality repair orchestration for SDUI slides - combines deterministic repairs,
 * AI-powered repairs, and visual integrity validation.
 * 
 * @module workers/processors/slide-repair
 */

import type {
  AspectRatio,
  ContentConversationContextMessage,
  SduiSlide,
  LayoutStylePreference,
  ImagePreferenceMode,
} from '@leads-generator/shared';
import type { SduiCarouselWorkerDeps } from '../../sdui-carousel-worker.js';
import type { SduiPlanner } from '../../sdui-planner/index.js';
import { applySduiTextGuardrails, sduiContentQualityIssues, sduiTextFitIssues } from '../../sdui-text-guardrails.js';
import type { SduiTextGuardrailOptions } from '../../sdui-text-guardrails.js';
import { promptExplicitlyRequestsImages, promptRequestsVisualLedDeck } from '../../sdui-planner/index.js';
import { SlideEnrichment } from './slide-enrichment.js';
import { LayoutProcessor } from './layout-processor.js';
import { SlideQualityValidator } from '../validators/slide-quality-validator.js';

/**
 * Pipeline context for repair operations - consolidated from JobPipelineCtx
 */
export interface RepairContext {
  deps: SduiCarouselWorkerDeps;
  teamId: string;
  jobId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  maxSlides: number;
  defaultTone: string;
  textGuardrailOptions: SduiTextGuardrailOptions;
  signal: AbortSignal;
  preferEditorial: boolean;
  layoutStyle: LayoutStylePreference;
  imagePreference: ImagePreferenceMode;
  contentTags: string[];
  conversationContext: ContentConversationContextMessage[];
}

/**
 * Returns unique issues by deduplicating strings
 */
function uniqueIssues(issues: string[]): string[] {
  return [...new Set(issues)];
}

/**
 * Calculates required visual slide count based on prompt analysis
 */
function requiredVisualSlideCount(prompt: string, slideCount: number): number {
  if (!promptRequestsVisualLedDeck(prompt)) return promptExplicitlyRequestsImages(prompt) ? 1 : 0;
  if (slideCount >= 5) return 3;
  if (slideCount >= 3) return 2;
  return 1;
}

/**
 * Validates visual integrity: checks if visual-led prompts have enough image slides
 */
function visualIntegrityIssues(prompt: string, slides: SduiSlide[]): string[] {
  const requiredCount = requiredVisualSlideCount(prompt, slides.length);
  if (requiredCount === 0) return [];
  const imageSlides = slides.filter(SlideQualityValidator.hasImagePlaceholder).length;
  const generatedSlides = slides.filter((slide) => slide.image_status === 'generated').length;
  const issues: string[] = [];
  if (imageSlides < requiredCount) {
    issues.push(
      `visual-led prompt needs at least ${requiredCount} image slides before render (${imageSlides}/${requiredCount})`,
    );
  }
  if (generatedSlides > 0 && generatedSlides < requiredCount) {
    issues.push(
      `visual-led prompt needs at least ${requiredCount} generated image slides before render (${generatedSlides}/${requiredCount})`,
    );
  }
  return issues;
}

/**
 * Deterministic no-image repair: removes image placeholders and selects
 * a compatible text-only layout variant.
 */
function deterministicNoImageRepair(slide: SduiSlide, index: number): SduiSlide {
  const withoutImage = LayoutProcessor.removeImagePlaceholders(slide);
  const compatible = LayoutProcessor.compatibleVariants(withoutImage, index, true);
  const preferred = compatible.find((variant) => variant !== slide.layout_variant_id) ?? compatible[0] ?? 'text_stack';
  return {
    ...LayoutProcessor.applyLayoutFields(withoutImage, preferred, 'ai_repaired_after_image_failure'),
    image_requirement: 'none',
    image_status: 'provider_failed_repaired',
  };
}

/**
 * Repairs slides for quality issues using a two-phase approach:
 * 1. Deterministic repair: enrichment + layout diversity + text guardrails
 * 2. AI repair (fallback): asks planner to fix remaining issues
 * 
 * Returns repaired slides, remaining issues, and the repair source used.
 */
async function repairSlidesForQuality(
  deps: SduiCarouselWorkerDeps,
  params: {
    teamId: string;
    jobId: string;
    prompt: string;
    aspectRatio: AspectRatio;
    maxSlides: number;
    tone: string;
    slides: SduiSlide[];
    issues: string[];
    textGuardrailOptions: SduiTextGuardrailOptions;
    signal: AbortSignal;
    editorialBias?: boolean;
    layoutStyle?: LayoutStylePreference;
    imagePreference?: ImagePreferenceMode;
    contentTags: string[];
    conversationContext: ContentConversationContextMessage[];
  },
): Promise<{ slides: SduiSlide[]; issues: string[]; source: 'ai_repair' | 'deterministic_repair' | 'unrepaired' }> {
  // Phase 1: Deterministic repair chain
  const deterministicSlides = params.slides
    .map((slide, index) => SlideEnrichment.makeSlideQualityRepairable(slide, index, params.prompt))
    .map((slide) => applySduiTextGuardrails(slide, params.textGuardrailOptions))
    .map((slide) =>
      SlideEnrichment.makeSlideQualityRepairable(
        SlideEnrichment.repairIncompleteTextComponents(slide, params.prompt),
        slide.slide_number - 1,
        params.prompt,
      ),
    )
    .map((slide) => applySduiTextGuardrails(slide, params.textGuardrailOptions));

  const layoutRepairedSlides = LayoutProcessor.enforceLayoutDiversity(deterministicSlides, {
    preferEditorial: params.editorialBias ?? false,
  }).map((slide) => applySduiTextGuardrails(slide, params.textGuardrailOptions));

  const deterministicIssues = uniqueIssues([
    ...sduiTextFitIssues(layoutRepairedSlides, params.textGuardrailOptions),
    ...sduiContentQualityIssues(layoutRepairedSlides),
    ...visualIntegrityIssues(params.prompt, layoutRepairedSlides),
  ]);

  if (deterministicIssues.length === 0) {
    return { slides: layoutRepairedSlides, issues: [], source: 'deterministic_repair' };
  }

  // Phase 2: AI repair fallback
  const repairResult = await deps.planner.plan(
    {
      teamId: params.teamId,
      jobId: params.jobId,
      actorId: 'system',
      prompt: params.prompt,
      aspectRatio: params.aspectRatio,
      slideCount: params.slides.length,
      maxSlides: params.maxSlides,
      tone: params.tone,
      previousSlides: params.slides,
      feedback: [
        'Repair the SDUI plan so it renders successfully.',
        'Keep the user prompt intent, but adapt layout and rewrite copy instead of cutting sentences.',
        'Every content slide needs supporting body, checklist, quote, or CTA.',
        'All text must fit the layout text limits and read as a complete sentence.',
        `Current issues: ${params.issues.join('; ')}`,
      ].join(' '),
      typographyOverride: params.textGuardrailOptions.typography,
      contentTags: params.contentTags,
      conversationContext: params.conversationContext,
      layoutStyle: params.layoutStyle,
      imagePreference: params.imagePreference,
      ...(params.editorialBias ? { editorialBias: true } : {}),
    },
    params.signal,
  );

  if (repairResult.ok) {
    const aiSlides = repairResult.value.slides
      .slice(0, params.slides.length)
      .map((s, i) => applySduiTextGuardrails({ ...s, slide_number: i + 1 }, params.textGuardrailOptions));
    const aiIssues = uniqueIssues([
      ...sduiTextFitIssues(aiSlides, params.textGuardrailOptions),
      ...sduiContentQualityIssues(aiSlides),
      ...visualIntegrityIssues(params.prompt, aiSlides),
    ]);
    if (aiSlides.length > 0 && aiIssues.length === 0) {
      return { slides: aiSlides, issues: [], source: 'ai_repair' };
    }
  }

  return { slides: layoutRepairedSlides, issues: deterministicIssues, source: 'unrepaired' };
}

/**
 * Repairs slides whose OPTIONAL image generation failed.
 * Strategy:
 * 1. Ask AI planner for no-image layout alternatives
 * 2. Fallback to deterministic no-image repair if AI fails
 * 3. Re-enforce layout diversity on repaired deck
 * 4. Validate repaired slides
 */
async function repairFailedOptionalImages(
  ctx: RepairContext,
  slides: SduiSlide[],
  failedImageSlideNumbers: Set<number>,
): Promise<SduiSlide[]> {
  const {
    deps,
    teamId,
    jobId,
    prompt,
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
  } = ctx;
  const failedNumbers = [...failedImageSlideNumbers].sort((a, b) => a - b);

  // Phase 1: AI no-image repair
  const repairResult = await deps.planner.plan(
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
      layoutStyle,
      imagePreference,
      ...(preferEditorial ? { editorialBias: true } : {}),
    },
    signal,
  );

  let next: SduiSlide[];
  if (!repairResult.ok) {
    console.warn(
      '[sdui-worker] AI no-image repair failed, using deterministic no-image fallback:',
      repairResult.error,
    );
    next = slides.map((slide, index) =>
      failedImageSlideNumbers.has(slide.slide_number) ? deterministicNoImageRepair(slide, index) : slide,
    );
  } else {
    const repairedByNumber = new Map(repairResult.value.slides.map((slide) => [slide.slide_number, slide]));
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
        : deterministicNoImageRepair(slide, index);
      return LayoutProcessor.isValidNoImageRepair(candidate) ? candidate : deterministicNoImageRepair(slide, index);
    });
  }

  // Phase 2: Re-enforce layout diversity + final guardrails
  next = LayoutProcessor.enforceLayoutDiversity(next, {
    forceNoImageSlideNumbers: failedImageSlideNumbers,
    preferEditorial,
  }).map((slide) => applySduiTextGuardrails(slide, textGuardrailOptions));

  // Phase 3: Stamp repaired metadata
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

/**
 * SlideRepair - Quality repair orchestration
 * 
 * Combines deterministic enrichment, AI-powered repairs, and visual integrity
 * validation to recover from planner/provider failures.
 */
export const SlideRepair = {
  visualIntegrityIssues,
  deterministicNoImageRepair,
  repairSlidesForQuality,
  repairFailedOptionalImages,
  requiredVisualSlideCount,
} as const;
