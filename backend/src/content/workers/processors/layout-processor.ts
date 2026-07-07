/**
 * layout-processor.ts
 *
 * Layout variant selection, diversity enforcement, and layout field application
 * for the SDUI carousel worker — Growhaley catalog (10 gw_* variants, 3 families).
 *
 * @module workers/processors/layout-processor
 */

import type { SduiSlide } from '@leads-generator/shared';
import { applySduiTextGuardrails } from '../../sdui-text-guardrails.js';
import {
  layoutFamilyForVariant,
  layoutSupportsImageVariant,
  migratedLayoutCatalog,
} from '../../layout-migration.js';
import { SlideUtils } from '../utils/slide-utils.js';
import { SlideQualityValidator } from '../validators/slide-quality-validator.js';

// Local type alias for layout variant IDs (string-based)
type LayoutVariantId = string;

const DEFAULT_VARIANT_SEQUENCE: LayoutVariantId[] = [
  'gw_poster_cover',
  'gw_poster_statement',
  'gw_poster_list',
  'gw_poster_stat',
  'gw_poster_cards',
  'gw_poster_quote',
  'gw_poster_cta',
];

/** Generic fallback layout — diversity pass prefers richer variants over it. */
const TEXT_SAFE_LAYOUTS = new Set<LayoutVariantId>(['gw_poster_statement']);

const MULTI_IMAGE_LAYOUTS = new Set<LayoutVariantId>(['gw_collage_showcase']);

const MIN_MULTI_IMAGE_PLACEHOLDERS: Partial<Record<LayoutVariantId, number>> = {
  gw_collage_showcase: 2,
};

function requiredImagePlaceholderCount(layoutId: LayoutVariantId | undefined): number {
  if (!layoutId) return 0;
  return MIN_MULTI_IMAGE_PLACEHOLDERS[layoutId] ?? 1;
}

function isMultiImageLayout(layoutId: LayoutVariantId | undefined): boolean {
  return Boolean(layoutId && MULTI_IMAGE_LAYOUTS.has(layoutId));
}

/**
 * Returns layout variants compatible with slide's components and constraints.
 */
function compatibleVariants(
  slide: SduiSlide,
  index: number,
  forceNoImage = false,
): LayoutVariantId[] {
  const components = new Set(SlideUtils.slideComponents(slide).map((component) => component.type));
  const wantsNoImage =
    forceNoImage || slide.image_requirement === 'none' || !components.has('image_placeholder');
  const statAllowed = SlideQualityValidator.hasStatSignal(slide);

  if (wantsNoImage) {
    if (components.has('feature_cards') || components.has('comparison'))
      return ['gw_poster_cards'];
    if (components.has('stat_block') || components.has('stat_row')) return ['gw_poster_stat'];
    if (components.has('quote') || components.has('pull_quote')) return ['gw_poster_quote'];
    if (components.has('checklist') || components.has('numbered_list'))
      return ['gw_poster_list'];
    if (components.has('button_cta')) return ['gw_poster_cta'];
    if (index === 0) return ['gw_poster_cover', 'gw_poster_statement'];
    if (components.has('body')) return ['gw_poster_statement'];
    return ['gw_poster_statement', 'gw_poster_cover'];
  }

  const variants = migratedLayoutCatalog()
    .filter((layout) => {
      if (layout.supportsImage && !components.has('image_placeholder')) return false;
      if (!layout.supportsImage && components.has('image_placeholder')) return false;
      if (slide.layout_variant_id && layout.id === slide.layout_variant_id) return true;
      if (
        isMultiImageLayout(layout.id) &&
        SlideQualityValidator.imagePlaceholderCount(slide) <
          requiredImagePlaceholderCount(layout.id)
      )
        return false;
      if (layout.id === 'gw_poster_stat' && !statAllowed) return false;
      if (index > 0 && layout.id === 'gw_poster_cover') return false;
      return layout.requiredComponents.every((type) => components.has(type));
    })
    .map((layout) => layout.id as LayoutVariantId);

  if (variants.length > 0) {
    if (slide.layout_variant_id && variants.includes(slide.layout_variant_id)) {
      return [slide.layout_variant_id, ...variants.filter((id) => id !== slide.layout_variant_id)];
    }
    return variants;
  }
  return DEFAULT_VARIANT_SEQUENCE;
}

/**
 * Returns canonical layout variant ID. Growhaley uses a single id space —
 * this is now an identity passthrough kept for API compatibility.
 */
function canonicalWorkerLayoutVariantId(
  layoutId: LayoutVariantId | undefined,
): LayoutVariantId | undefined {
  return layoutId;
}

/**
 * Applies layout fields to slide: variant ID, family, container layout, and text guardrails.
 */
function applyLayoutFields(
  slide: SduiSlide,
  layoutId: LayoutVariantId,
  source: NonNullable<SduiSlide['layout_source']>,
): SduiSlide {
  const family = layoutFamilyForVariant(layoutId);
  const supportsImage = layoutSupportsImageVariant(layoutId);
  const layoutWithSafeText = applySduiTextGuardrails(
    {
      ...slide,
      layout_variant_id: layoutId,
      ...(family ? { layout_family: family } : {}),
      layout_source: source,
      ...(supportsImage
        ? { container_layout: 'background_overlay' as const, contentDirection: 'column' as const }
        : { container_layout: 'text_dominant' as const, contentDirection: 'column' as const }),
    },
    {},
  );
  return layoutWithSafeText;
}

/**
 * Removes all image_placeholder components from slide's nested groups.
 */
function removeImagePlaceholders(slide: SduiSlide): SduiSlide {
  return {
    ...slide,
    nested_groups: {
      top_meta: (slide.nested_groups.top_meta ?? []).filter(
        (component) => component.type !== 'image_placeholder',
      ),
      core_content: (slide.nested_groups.core_content ?? []).filter(
        (component) => component.type !== 'image_placeholder',
      ),
      action_footer: (slide.nested_groups.action_footer ?? []).filter(
        (component) => component.type !== 'image_placeholder',
      ),
    },
  };
}

/**
 * Normalizes slide metadata: image_requirement, layout_source, image_status, layout_family.
 */
function normalizeSlideMetadata(slide: SduiSlide): SduiSlide {
  const hasImage = SlideQualityValidator.hasImagePlaceholder(slide);
  const imageRequirement = hasImage ? (slide.image_requirement ?? 'optional') : 'none';
  const layoutId = slide.layout_variant_id;
  const family = layoutFamilyForVariant(layoutId);
  return {
    ...slide,
    image_requirement: imageRequirement,
    layout_source: slide.layout_source ?? 'ai_selected',
    ...(slide.image_status
      ? { image_status: slide.image_status }
      : imageRequirement === 'none'
        ? { image_status: 'not_needed' as const }
        : {}),
    ...(family ? { layout_family: family } : {}),
  };
}

/**
 * Enforces layout diversity across slides. With only 3 families, diversity is
 * tracked at the VARIANT level: avoid repeating the same variant on
 * consecutive slides and prefer variants not used yet in the deck.
 */
function enforceLayoutDiversity(
  slides: SduiSlide[],
  options: {
    forceNoImageSlideNumbers?: Set<number>;
    /** Keep the user's explicit layout choice when compatible (frontend draft
     *  preview). Diversity/text-safe swaps only kick in if it's incompatible. */
    respectExplicitVariants?: boolean;
  } = {},
): SduiSlide[] {
  const out: SduiSlide[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = normalizeSlideMetadata(slides[i]!);
    const forceNoImage = options.forceNoImageSlideNumbers?.has(slide.slide_number) ?? false;
    const compatible = compatibleVariants(slide, i, forceNoImage);
    const previous = out[i - 1]?.layout_variant_id;
    const usedVariants = new Set(out.map((s) => s.layout_variant_id).filter(Boolean));

    // Respect explicit user choice: if the picked variant is valid for this
    // slide's content, honor it verbatim (no diversity reshuffle).
    if (
      options.respectExplicitVariants &&
      slide.layout_variant_id &&
      compatible.includes(slide.layout_variant_id)
    ) {
      out.push(
        applyLayoutFields(slide, slide.layout_variant_id, slide.layout_source ?? 'ai_selected'),
      );
      continue;
    }

    const shouldAvoidCurrentTextSafe =
      slide.slide_type === 'content' &&
      Boolean(slide.layout_variant_id && TEXT_SAFE_LAYOUTS.has(slide.layout_variant_id)) &&
      compatible.some((id) => !TEXT_SAFE_LAYOUTS.has(id));

    const current =
      slide.layout_variant_id &&
      compatible.includes(slide.layout_variant_id) &&
      slide.layout_variant_id !== previous &&
      !shouldAvoidCurrentTextSafe
        ? slide.layout_variant_id
        : undefined;

    const freshVariant = compatible.find(
      (id) => id !== previous && !usedVariants.has(id) && !TEXT_SAFE_LAYOUTS.has(id),
    );
    const anyFresh = compatible.find((id) => id !== previous && !usedVariants.has(id));

    // Priority: planner's valid choice > unused rich variant > any unused > any non-consecutive > first
    const chosen =
      current ??
      freshVariant ??
      anyFresh ??
      compatible.find((id) => id !== previous) ??
      compatible[0] ??
      DEFAULT_VARIANT_SEQUENCE[i % DEFAULT_VARIANT_SEQUENCE.length]!;
    const normalized = applyLayoutFields(
      slide,
      chosen,
      chosen === slide.layout_variant_id
        ? (slide.layout_source ?? 'ai_selected')
        : 'worker_adjusted',
    );
    out.push(normalized);
  }

  return out;
}

/**
 * Validates that a slide is a valid no-image repair:
 * - No image placeholders
 * - Layout doesn't require images
 */
function isValidNoImageRepair(slide: SduiSlide): boolean {
  if (SlideQualityValidator.hasImagePlaceholder(slide)) return false;
  if (slide.layout_variant_id && layoutSupportsImageVariant(slide.layout_variant_id)) return false;
  return true;
}

/**
 * LayoutProcessor - Layout variant selection and diversity enforcement
 */
export const LayoutProcessor = {
  compatibleVariants,
  canonicalWorkerLayoutVariantId,
  applyLayoutFields,
  removeImagePlaceholders,
  normalizeSlideMetadata,
  enforceLayoutDiversity,
  isValidNoImageRepair,
} as const;
