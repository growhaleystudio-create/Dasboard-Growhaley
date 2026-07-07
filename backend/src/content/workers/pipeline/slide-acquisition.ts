/**
 * slide-acquisition.ts — Initial slide deck acquisition phase
 * 
 * Acquires the initial slide deck from one of three sources:
 * 1. Frontend-supplied SDUI draft (inputs.sduiSlides)
 * 2. Fresh AI plan from planner
 * 3. Deterministic worker fallback deck (planner failure)
 * 
 * Always returns text-guardrailed slides ready for further processing.
 */

import type { SduiSlide } from '@leads-generator/shared';
import type { MinimalPipelineContext } from './job-pipeline-context.js';
import type { SduiPlanner } from '../../sdui-planner/index.js';
import { applySduiTextGuardrails } from '../../sdui-text-guardrails.js';
import { applyContentTags } from '../utils/content-sanitizer.js';

export interface SlideAcquisitionResult {
  slides: SduiSlide[];
  plannerQualityWarnings: string[];
  source: 'frontend_draft' | 'ai_plan' | 'worker_fallback';
}

/**
 * Acquire initial slide deck: frontend draft, AI plan, or fallback.
 */
export async function acquireInitialSlides(
  planner: SduiPlanner,
  ctx: MinimalPipelineContext,
  slideCount: number,
  frontendSlides: SduiSlide[] | undefined,
): Promise<SlideAcquisitionResult> {
  // Use frontend-supplied draft if available
  if (frontendSlides && frontendSlides.length > 0) {
    const slides = applyContentTags(frontendSlides.slice(0, slideCount), ctx.contentTags).map(
      (s, i) => applySduiTextGuardrails({ ...s, slide_number: i + 1 }, ctx.textGuardrailOptions),
    );
    return { slides, plannerQualityWarnings: [], source: 'frontend_draft' };
  }

  // Request fresh AI plan
  const planResult = await planner.plan(
    {
      teamId: ctx.teamId,
      jobId: ctx.jobId,
      actorId: 'system',
      prompt: ctx.prompt,
      aspectRatio: ctx.aspectRatio,
      slideCount,
      maxSlides: ctx.maxSlides,
      tone: ctx.defaultTone,
      typographyOverride: ctx.textGuardrailOptions.typography,
      contentTags: ctx.contentTags,
      conversationContext: ctx.conversationContext,
      layoutStyle: ctx.layoutStyle,
      imagePreference: ctx.imagePreference,
    },
    ctx.signal,
  );

  if (planResult.ok) {
    const slides = applyContentTags(planResult.value.slides.slice(0, slideCount), ctx.contentTags).map(
      (s, i) => applySduiTextGuardrails({ ...s, slide_number: i + 1 }, ctx.textGuardrailOptions),
    );
    return {
      slides,
      plannerQualityWarnings: planResult.value.qualityWarnings ?? [],
      source: 'ai_plan',
    };
  }

  // Planner failed → use worker fallback
  console.warn('[slide-acquisition] AI planner failed, using worker fallback:', planResult.error);
  const fallbackSlides = buildFallbackSlides(ctx.prompt, slideCount);
  const slides = applyContentTags(fallbackSlides, ctx.contentTags).map((s, i) =>
    applySduiTextGuardrails({ ...s, slide_number: i + 1 }, ctx.textGuardrailOptions),
  );
  
  return {
    slides,
    plannerQualityWarnings: [`AI planner failed: ${planResult.error.kind}`],
    source: 'worker_fallback',
  };
}

/**
 * Build deterministic fallback slides when planner fails.
 * Creates a basic deck: cover + content slides with placeholders.
 */
function buildFallbackSlides(prompt: string, slideCount: number): SduiSlide[] {
  const topic = shortPromptTopic(prompt);
  const targetCount = Math.max(1, Math.min(slideCount, 7));
  const slides: SduiSlide[] = [];

  // Cover slide
  slides.push({
    slide_number: 1,
    slide_type: 'cover',
    container_layout: 'text_dominant',
    layout_variant_id: 'gw_poster_cover',
    image_requirement: 'none',
    image_status: 'not_needed',
    layout_source: 'worker_adjusted',
    typography_scale: 'editorial_bold',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'IDE KONTEN' }],
      core_content: [{ type: 'header', text: topic }],
      action_footer: [],
    },
  });

  // Content slides
  for (let i = 2; i <= targetCount; i++) {
    const isLast = i === targetCount;
    slides.push({
      slide_number: i,
      slide_type: 'content',
      container_layout: 'text_dominant',
      layout_variant_id: isLast ? 'gw_poster_cta' : 'gw_poster_statement',
      image_requirement: 'none',
      image_status: 'not_needed',
      layout_source: 'worker_adjusted',
      typography_scale: 'balanced_classic',
      nested_groups: {
        top_meta: [{ type: 'tag', text: isLast ? 'NEXT' : `POIN ${i - 1}` }],
        core_content: [
          { type: 'header', text: isLast ? 'Arahkan ke aksi berikutnya' : `Sudut pandang ${i - 1}` },
          {
            type: 'body',
            text: isLast
              ? `Tutup carousel dengan ajakan yang relevan untuk ${topic}.`
              : `Kembangkan bagian ini dengan contoh, konteks, dan manfaat utama dari ${topic}.`,
          },
        ],
        action_footer: isLast ? [{ type: 'button_cta', label: 'Mulai sekarang', style: 'primary' }] : [],
      },
    });
  }

  return slides;
}

/**
 * Extract short topic from user prompt for fallback slides.
 */
function shortPromptTopic(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  if (!compact) return 'Konten utama';
  return compact.length > 72 ? `${compact.slice(0, 69).trimEnd()}...` : compact;
}
