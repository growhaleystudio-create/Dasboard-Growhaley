/**
 * layout-processor.ts
 *
 * Layout variant selection, diversity enforcement, and layout field application
 * for the SDUI carousel worker.
 *
 * @module workers/processors/layout-processor
 */

import type { SduiSlide } from '@leads-generator/shared';
import { applySduiTextGuardrails } from '../../sdui-text-guardrails.js';
import {
  getTextLimitsForVariant,
  layoutFamilyForVariant,
  layoutSupportsImageVariant,
  migratedLayoutCatalog,
} from '../../layout-migration.js';
import { MIGRATED_RENDERER_TEMPLATE_ALIASES } from '../../rendering/satori/template-picker.js';
import { SlideUtils } from '../utils/slide-utils.js';
import { SlideQualityValidator } from '../validators/slide-quality-validator.js';

// Local type alias for layout variant IDs (string-based)
type LayoutVariantId = string;

const DEFAULT_VARIANT_SEQUENCE: LayoutVariantId[] = [
  'cover_centered',
  'feature_cards_with_header',
  'checklist_stack',
  'comparison_with_header',
  'numbered_steps',
  'checklist_with_body',
  'quote_focus',
  'header_body_cta',
  'cta_centered',
];

const TEXT_SAFE_LAYOUTS = new Set<LayoutVariantId>([
  'text_centered',
  'text_stack',
  'big_statement',
]);

const MULTI_IMAGE_LAYOUTS = new Set<LayoutVariantId>([
  'dual_image_comparison',
  'product_angle_pair',
  'use_case_gallery_2up',
  'mini_gallery_3up',
  'moodboard_grid',
  'step_visual_sequence',
  'problem_solution_visual_pair',
  'feature_visual_cards',
  'testimonial_with_portrait_and_product',
  'case_study_snapshot_grid',
  'dos_donts_visual_pair',
  'outfit_or_style_board',
  'menu_or_food_combo',
  'real_estate_room_pair',
  'app_screen_flow',
  'social_proof_wall',
  'event_moment_grid',
  'travel_itinerary_grid',
  'collection_showcase',
  'variant_selector_showcase',
]);

const MIN_MULTI_IMAGE_PLACEHOLDERS: Partial<Record<LayoutVariantId, number>> = {
  dual_image_comparison: 2,
  product_angle_pair: 2,
  use_case_gallery_2up: 2,
  problem_solution_visual_pair: 2,
  dos_donts_visual_pair: 2,
  real_estate_room_pair: 2,
  testimonial_with_portrait_and_product: 2,
  mini_gallery_3up: 3,
  step_visual_sequence: 3,
  app_screen_flow: 3,
  case_study_snapshot_grid: 3,
  moodboard_grid: 4,
  social_proof_wall: 4,
  event_moment_grid: 4,
  travel_itinerary_grid: 4,
  collection_showcase: 4,
  variant_selector_showcase: 4,
  outfit_or_style_board: 4,
  menu_or_food_combo: 4,
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
 * Filters by image requirement, component types, and editorial preference.
 */
function compatibleVariants(
  slide: SduiSlide,
  index: number,
  forceNoImage = false,
  allowEditorialPool = false,
): LayoutVariantId[] {
  const components = new Set(SlideUtils.slideComponents(slide).map((component) => component.type));
  const wantsNoImage =
    forceNoImage || slide.image_requirement === 'none' || !components.has('image_placeholder');
  const statAllowed = SlideQualityValidator.hasStatSignal(slide);

  if (wantsNoImage) {
    if (components.has('feature_cards')) return ['feature_cards_with_header', 'feature_cards_grid'];
    if (components.has('comparison')) return ['comparison_with_header', 'comparison_columns'];
    if (
      components.has('stat_block') ||
      components.has('stat_row') ||
      components.has('key_value_list') ||
      components.has('timeline') ||
      components.has('progress_bar') ||
      components.has('callout') ||
      components.has('pull_quote')
    ) {
      return ['editorial_rich_stack'];
    }
    if (components.has('button_cta') && components.has('body'))
      return ['header_body_cta', 'checklist_with_body'];
    if (components.has('button_cta')) return ['cta_centered'];
    if (components.has('checklist') && components.has('body'))
      return ['checklist_with_body', 'numbered_steps'];
    if (components.has('checklist')) return ['checklist_stack', 'numbered_steps'];
    if (components.has('quote')) return ['quote_focus', 'pullquote_editorial'];
    if (components.has('body')) return ['text_stack', 'text_centered', 'big_statement'];
    return index === 0
      ? ['cover_centered', 'cover_editorial_left']
      : ['feature_cards_with_header', 'checklist_with_body', 'text_stack'];
  }

  const variants = migratedLayoutCatalog()
    .filter((layout) => {
      if (layout.supportsImage && !components.has('image_placeholder')) return false;
      const canonicalLayoutId = canonicalWorkerLayoutVariantId(layout.id);
      if (slide.layout_variant_id && canonicalLayoutId === slide.layout_variant_id) {
        return true;
      }
      if (
        isMultiImageLayout(layout.id) &&
        SlideQualityValidator.imagePlaceholderCount(slide) <
          requiredImagePlaceholderCount(layout.id)
      )
        return false;
      if (layout.family === 'stat' && !statAllowed) return false;
      if (index > 0 && layout.family === 'cover' && layout.id !== 'cover_with_cta') return false;
      // Editorial-family layouts are a stylistic opt-in: outside editorial mode they
      // are only valid when the planner explicitly chose this exact layout — never
      // auto-promoted into the candidate pool just to add family diversity.
      if (
        layout.family === 'editorial' &&
        !allowEditorialPool &&
        layout.id !== slide.layout_variant_id
      )
        return false;
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
 * Returns canonical layout variant ID after resolving aliases.
 */
function canonicalWorkerLayoutVariantId(
  layoutId: LayoutVariantId | undefined,
): LayoutVariantId | undefined {
  if (!layoutId) return undefined;
  return (MIGRATED_RENDERER_TEMPLATE_ALIASES[layoutId] as LayoutVariantId | undefined) ?? layoutId;
}

/**
 * Applies layout fields to slide: variant ID, family, container layout, and text guardrails.
 */
function applyLayoutFields(
  slide: SduiSlide,
  layoutId: LayoutVariantId,
  source: NonNullable<SduiSlide['layout_source']>,
): SduiSlide {
  const canonicalLayoutId = canonicalWorkerLayoutVariantId(layoutId) ?? layoutId;
  const family = layoutFamilyForVariant(canonicalLayoutId);
  const supportsImage = layoutSupportsImageVariant(canonicalLayoutId);
  const layoutWithSafeText = applySduiTextGuardrails(
    {
      ...slide,
      layout_variant_id: canonicalLayoutId,
      ...(family ? { layout_family: family } : {}),
      layout_source: source,
      ...(supportsImage && family === 'image_focus' && canonicalLayoutId === 'cover_image_full'
        ? { container_layout: 'background_overlay' as const, contentDirection: 'column' as const }
        : supportsImage && family === 'image_split'
          ? { container_layout: 'split_screen' as const, contentDirection: 'row' as const }
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
 * Returns true when the user's prompt explicitly asks for an editorial /
 * magazine / opinion / storytelling style. Used to bias layout selection so
 * the majority of slides land in the `editorial` family.
 */
function promptRequestsEditorial(prompt: string): boolean {
  return /\b(editorial|majalah|magazine|opini|opinion|storytelling|reportase|reportage|feature\s+story|cerita\s+panjang|long[\s-]form|artikel\s+panjang|data\s+journalism|jurnalistik)\b/i.test(
    prompt,
  );
}

/**
 * Enforces layout diversity across slides by selecting compatible variants
 * that maximize family diversity while respecting editorial preferences.
 */
function enforceLayoutDiversity(
  slides: SduiSlide[],
  options: { forceNoImageSlideNumbers?: Set<number>; preferEditorial?: boolean } = {},
): SduiSlide[] {
  const out: SduiSlide[] = [];
  const targetUniqueFamilies =
    slides.length >= 5 ? 4 : slides.length >= 4 ? 3 : Math.min(slides.length, 2);

  for (let i = 0; i < slides.length; i++) {
    const slide = normalizeSlideMetadata(slides[i]!);
    const forceNoImage = options.forceNoImageSlideNumbers?.has(slide.slide_number) ?? false;
    const compatible = compatibleVariants(slide, i, forceNoImage, options.preferEditorial ?? false);
    const previous = out[i - 1]?.layout_variant_id;
    const usedFamilies = new Set(out.map((s) => s.layout_family).filter(Boolean));

    // Planner already chose an editorial layout → always respect it (don't swap).
    const plannerChoseEditorial =
      options.preferEditorial &&
      slide.layout_variant_id &&
      layoutFamilyForVariant(slide.layout_variant_id) === 'editorial' &&
      compatible.includes(slide.layout_variant_id);

    // When user asked for editorial style but planner chose a non-editorial layout,
    // try to upgrade to an editorial variant that fits the same components.
    const editorialPreferred =
      options.preferEditorial && !plannerChoseEditorial
        ? compatible.find((id) => layoutFamilyForVariant(id) === 'editorial' && id !== previous)
        : undefined;

    const shouldAvoidCurrentTextSafe =
      slide.slide_type === 'content' &&
      Boolean(slide.layout_variant_id && TEXT_SAFE_LAYOUTS.has(slide.layout_variant_id)) &&
      compatible.some((id) => !TEXT_SAFE_LAYOUTS.has(id));

    const current =
      slide.layout_variant_id &&
      (compatible.includes(slide.layout_variant_id) ||
        compatible.some((id) => canonicalWorkerLayoutVariantId(id) === slide.layout_variant_id)) &&
      slide.layout_variant_id !== previous &&
      !shouldAvoidCurrentTextSafe
        ? slide.layout_variant_id === 'mockup-standard'
          ? 'split_text_left_image_right'
          : slide.layout_variant_id
        : undefined;
    const richCompatible = compatible.find(
      (id) =>
        id !== previous &&
        !TEXT_SAFE_LAYOUTS.has(id) &&
        !usedFamilies.has(layoutFamilyForVariant(id)),
    );
    const familyDiverse =
      richCompatible ??
      compatible.find((id) => id !== previous && !usedFamilies.has(layoutFamilyForVariant(id)));
    // Priority: keep planner's editorial choice > upgrade non-editorial to editorial > keep planner's any choice > diversity > any
    const chosen =
      (plannerChoseEditorial ? slide.layout_variant_id : undefined) ??
      editorialPreferred ??
      current ??
      familyDiverse ??
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

  if (out.length >= 4) {
    const uniqueFamilies = new Set(out.map((s) => s.layout_family).filter(Boolean));
    // When editorial is requested, skip the diversity pass so the editorial
    // family is not swapped out in order to hit the family-count target.
    if (!options.preferEditorial) {
      for (let i = 1; uniqueFamilies.size < targetUniqueFamilies && i < out.length - 1; i++) {
        const slide = out[i]!;
        const compatible = compatibleVariants(
          slide,
          i,
          options.forceNoImageSlideNumbers?.has(slide.slide_number) ?? false,
        );
        const prev = out[i - 1]?.layout_variant_id;
        const nextSlide = out[i + 1];
        const next = compatible.find((id) => {
          const family = layoutFamilyForVariant(id);
          return (
            family &&
            !uniqueFamilies.has(family) &&
            id !== prev &&
            id !== nextSlide?.layout_variant_id
          );
        });
        if (next) {
          out[i] = applyLayoutFields(slide, next, 'worker_adjusted');
          const family = layoutFamilyForVariant(next);
          if (family) uniqueFamilies.add(family);
        }
      }
    }
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
 *
 * Exported functions for determining compatible layouts, enforcing diversity,
 * and validating layout constraints.
 */
export const LayoutProcessor = {
  compatibleVariants,
  canonicalWorkerLayoutVariantId,
  applyLayoutFields,
  removeImagePlaceholders,
  normalizeSlideMetadata,
  promptRequestsEditorial,
  enforceLayoutDiversity,
  isValidNoImageRepair,
} as const;
