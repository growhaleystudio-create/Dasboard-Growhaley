/**
 * slide-enrichment.ts
 * 
 * Slide content enrichment and repair functions for the SDUI carousel worker.
 * Handles sparse slide detection, fallback content generation, and component upsert logic.
 * 
 * @module workers/processors/slide-enrichment
 */

import type { SduiComponent, SduiSlide } from '@leads-generator/shared';
import { analyzeSduiTextCompleteness, applySduiTextGuardrails, type SduiTextGuardrailOptions } from '../../sdui-text-guardrails.js';
import { getTextLimitsForVariant, layoutFamilyForVariant } from '../../layout-migration.js';
import { SlideUtils } from '../utils/slide-utils.js';
import { SlideContentAnalyzer } from '../validators/slide-content-analyzer.js';
import { SlideQualityValidator } from '../validators/slide-quality-validator.js';

/**
 * Generates fallback body text for a slide based on prompt and existing content.
 */
function fallbackBodyForSlide(slide: SduiSlide, prompt: string): string {
  const topic = prompt.replace(/\s+/g, ' ').trim().slice(0, 90) || 'topik ini';
  const header = SlideContentAnalyzer.firstText(slide, 'header') || 
                 SlideContentAnalyzer.firstText(slide, 'quote') || 
                 `Slide ${slide.slide_number}`;
  return `${header}: ringkas poin utama tentang ${topic}.`;
}

/**
 * Repairs incomplete text components (body/quote/checklist) with fallback content.
 */
function repairIncompleteTextComponents(slide: SduiSlide, prompt: string): SduiSlide {
  const rewrite = (component: SduiComponent): SduiComponent => {
    if ((component.type === 'body' || component.type === 'quote') && 
        analyzeSduiTextCompleteness(component.text).incomplete) {
      return { ...component, text: fallbackBodyForSlide(slide, prompt) };
    }
    if (component.type === 'checklist') {
      const fallbackItems = fallbackChecklistItems(slide, prompt);
      const items = (component.items ?? []).map((item, index) =>
        analyzeSduiTextCompleteness(item).incomplete ? (fallbackItems[index] ?? fallbackItems[0]!) : item,
      );
      return { ...component, items: items.length > 0 ? items : fallbackItems };
    }
    return component;
  };

  return {
    ...slide,
    nested_groups: {
      top_meta: (slide.nested_groups.top_meta ?? []).map(rewrite),
      core_content: (slide.nested_groups.core_content ?? []).map(rewrite),
      action_footer: (slide.nested_groups.action_footer ?? []).map(rewrite),
    },
  };
}

/**
 * Generates fallback checklist items based on slide context.
 */
function fallbackChecklistItems(slide: SduiSlide, prompt: string): string[] {
  const topic = prompt.replace(/\s+/g, ' ').trim().slice(0, 42) || 'topik';
  const header = SlideContentAnalyzer.firstText(slide, 'header') || 'Fokus';
  const limit = getTextLimitsForVariant(slide.layout_variant_id).checklistItem ?? 55;
  return [
    `Fokus utama: ${header}`,
    `Contoh untuk ${topic}`,
    'Aksi berikutnya jelas',
  ].map((item) => item.length <= limit ? item : item.slice(0, limit).trimEnd());
}

/**
 * Generates fallback feature cards component.
 */
function fallbackFeatureCards(slide: SduiSlide, prompt: string): SduiComponent {
  const topic = prompt.replace(/\s+/g, ' ').trim().slice(0, 38) || 'topik';
  const header = SlideContentAnalyzer.firstText(slide, 'header') || 'Strategi utama';
  return {
    type: 'feature_cards',
    items_cards: [
      { icon: '1', title: 'Masalah utama', description: `${header.slice(0, 42)} jadi konteks awal.` },
      { icon: '2', title: 'Solusi praktis', description: `Langkah yang relevan untuk ${topic}.` },
      { icon: '3', title: 'Hasil terukur', description: 'Audiens paham aksi berikutnya.' },
    ],
  };
}

/**
 * Generates fallback comparison component (before/after).
 */
function fallbackComparison(slide: SduiSlide, prompt: string): SduiComponent {
  const topic = prompt.replace(/\s+/g, ' ').trim().slice(0, 38) || 'topik';
  return {
    type: 'comparison',
    columns: [
      { label: 'SEBELUM', sentiment: 'negative', items: ['Pesan masih terlalu umum', `Aksi untuk ${topic} belum jelas`] },
      { label: 'SESUDAH', sentiment: 'positive', items: ['Poin utama mudah dipindai', 'Langkah berikutnya lebih konkret'] },
    ],
  };
}

/**
 * Generates fallback callout component.
 */
function fallbackCallout(slide: SduiSlide, prompt: string): SduiComponent {
  return {
    type: 'callout',
    variant: 'tip',
    text: fallbackBodyForSlide(slide, prompt),
  };
}

/**
 * Enriches sparse slides (< 2 content units) with appropriate fallback components.
 * Uses heuristics based on existing components and prompt keywords.
 */
function enrichSparseSlide(slide: SduiSlide, index: number, prompt: string): SduiSlide {
  if (!SlideQualityValidator.isSparseContentSlide(slide)) return slide;
  let next = slide;
  const components = new Set(SlideUtils.slideComponents(next).map((component) => component.type));
  const text = `${SlideContentAnalyzer.firstText(next, 'header') ?? ''} ${SlideContentAnalyzer.firstText(next, 'body') ?? ''} ${prompt}`.toLowerCase();

  if (components.has('feature_cards') && !SlideQualityValidator.hasRenderableComponent(next, 'feature_cards')) {
    next = upsertCoreComponent(next, fallbackFeatureCards(next, prompt));
  } else if (components.has('comparison') && !SlideQualityValidator.hasRenderableComponent(next, 'comparison')) {
    next = upsertCoreComponent(next, fallbackComparison(next, prompt));
  } else if (/\b(sebelum|sesudah|before|after|dulu|sekarang|manual\s+vs|vs\s+ai|tanpa|dengan|pro|kontra)\b/i.test(text) && !components.has('comparison')) {
    next = upsertCoreComponent(next, fallbackComparison(next, prompt));
  } else if (/\b(fitur|benefit|manfaat|keunggulan|use case|alasan|offer|layanan)\b/i.test(text) && !components.has('feature_cards')) {
    next = upsertCoreComponent(next, fallbackFeatureCards(next, prompt));
  } else if (!SlideQualityValidator.hasRenderableComponent(next, 'body')) {
    next = upsertCoreComponent(next, { type: 'body', text: fallbackBodyForSlide(next, prompt) });
  } else if (!SlideQualityValidator.hasRenderableComponent(next, 'callout')) {
    next = upsertCoreComponent(next, fallbackCallout(next, prompt));
  } else {
    next = upsertCoreComponent(next, { type: 'checklist', items: fallbackChecklistItems(next, prompt) });
  }

  if (!SlideQualityValidator.hasRenderableComponent(next, 'header') && 
      !SlideQualityValidator.hasRenderableComponent(next, 'quote') && 
      next.slide_type !== 'cover') {
    next = upsertCoreComponent(next, { 
      type: 'header', 
      text: SlideContentAnalyzer.firstText(next, 'body')?.slice(0, 48) || `Poin ${index + 1}` 
    });
  }

  return next;
}

/**
 * Upserts a component into slide's core_content group.
 * Replaces existing component of same type, or appends if not found.
 */
function upsertCoreComponent(slide: SduiSlide, component: SduiComponent): SduiSlide {
  const core = slide.nested_groups.core_content ?? [];
  const index = core.findIndex((candidate) => candidate.type === component.type);
  const nextCore = index >= 0
    ? core.map((candidate, candidateIndex) => candidateIndex === index ? component : candidate)
    : [...core, component];
  return {
    ...slide,
    nested_groups: {
      ...slide.nested_groups,
      core_content: nextCore,
    },
  };
}

/**
 * Makes slide quality-repairable by ensuring it has required components for its layout family.
 * Adds missing headers, enriches sparse content, and adds family-specific components.
 */
function makeSlideQualityRepairable(slide: SduiSlide, index: number, prompt: string): SduiSlide {
  let next = slide;
  if (!SlideQualityValidator.hasRenderableComponent(next, 'header') && 
      !SlideQualityValidator.hasRenderableComponent(next, 'quote') && 
      next.slide_type !== 'cover') {
    next = upsertCoreComponent(next, { 
      type: 'header', 
      text: SlideContentAnalyzer.firstText(next, 'body')?.slice(0, 48) || `Poin ${index + 1}` 
    });
  }

  next = enrichSparseSlide(next, index, prompt);

  const layoutFamily = layoutFamilyForVariant(next.layout_variant_id);
  if (layoutFamily === 'text' && !SlideQualityValidator.hasRenderableComponent(next, 'body')) {
    next = upsertCoreComponent(next, { type: 'body', text: fallbackBodyForSlide(next, prompt) });
  }
  if (layoutFamily === 'checklist' && !SlideQualityValidator.hasRenderableComponent(next, 'checklist')) {
    next = upsertCoreComponent(next, { type: 'checklist', items: fallbackChecklistItems(next, prompt) });
  }
  if (layoutFamily === 'quote' && !SlideQualityValidator.hasRenderableComponent(next, 'quote')) {
    next = upsertCoreComponent(next, { type: 'quote', text: fallbackBodyForSlide(next, prompt) });
  }
  if (layoutFamily === 'cta' && !SlideQualityValidator.hasRenderableComponent(next, 'button_cta')) {
    next = {
      ...next,
      nested_groups: {
        ...next.nested_groups,
        action_footer: [
          ...(next.nested_groups.action_footer ?? []).filter((component) => component.type !== 'button_cta'),
          { type: 'button_cta', label: 'Lanjutkan', style: 'primary' },
        ],
      },
    };
  }

  return next;
}

/**
 * Finalizes slide for rendering by applying layout fields, ensuring required components,
 * and applying text guardrails. This is the last enrichment step before render.
 */
function finalizeRenderableSlide(
  slide: SduiSlide, 
  index: number, 
  prompt: string, 
  textGuardrailOptions: SduiTextGuardrailOptions,
  applyLayoutFieldsFn: (slide: SduiSlide, layoutId: string, source: NonNullable<SduiSlide['layout_source']>) => SduiSlide,
): SduiSlide {
  let next = applyLayoutFieldsFn(slide, slide.layout_variant_id ?? 'text_stack', slide.layout_source ?? 'worker_adjusted');
  const layoutFamily = layoutFamilyForVariant(next.layout_variant_id);

  if (layoutFamily === 'checklist') {
    next = upsertCoreComponent(next, { type: 'checklist', items: fallbackChecklistItems(next, prompt) });
  }
  if (layoutFamily === 'text' && !SlideQualityValidator.hasRenderableComponent(next, 'body')) {
    next = upsertCoreComponent(next, { type: 'body', text: fallbackBodyForSlide(next, prompt) });
  }
  if ((layoutFamily === 'image_focus' || layoutFamily === 'image_split' || layoutFamily === 'editorial') && 
      next.image_requirement !== 'none' && 
      !SlideQualityValidator.hasImagePlaceholder(next)) {
    next = {
      ...next,
      image_requirement: 'none',
      image_status: 'not_needed',
    };
  }
  if (!SlideQualityValidator.hasRenderableComponent(next, 'header') && 
      !SlideQualityValidator.hasRenderableComponent(next, 'quote') && 
      next.slide_type !== 'cover') {
    next = upsertCoreComponent(next, { 
      type: 'header', 
      text: SlideContentAnalyzer.firstText(next, 'body')?.slice(0, 48) || `Poin ${index + 1}` 
    });
  }
  return applySduiTextGuardrails(next, textGuardrailOptions);
}

/**
 * SlideEnrichment - Slide content enrichment and repair utilities
 * 
 * Exported functions for enriching sparse slides, generating fallback content,
 * and ensuring slides have required components for their layout family.
 */
export const SlideEnrichment = {
  fallbackBodyForSlide,
  repairIncompleteTextComponents,
  fallbackChecklistItems,
  fallbackFeatureCards,
  fallbackComparison,
  fallbackCallout,
  enrichSparseSlide,
  upsertCoreComponent,
  makeSlideQualityRepairable,
  finalizeRenderableSlide,
} as const;
