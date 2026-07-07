/**
 * slide-quality-validator.ts - Slide content quality validation module
 *
 * Validates slide content completeness, density, and renderability.
 * Extracted from sdui-carousel-worker.ts during Sprint 2 refactor.
 */

import type { SduiComponent, SduiSlide } from '@leads-generator/shared';
import { SlideUtils } from '../utils/slide-utils.js';
import { promptExplicitlyRequestsNoImages } from '../../sdui-planner/image/image-detection.js';

// Local type alias for layout variant IDs (string-based)
type LayoutVariantId = string;

// Constants for multi-image layouts
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

/**
 * Check if slide contains a specific component type.
 */
function slideHas(slide: SduiSlide, type: SduiComponent['type']): boolean {
  return SlideUtils.slideComponents(slide).some((component) => component.type === type);
}

/**
 * Check if slide has any image placeholder components.
 */
function hasImagePlaceholder(slide: SduiSlide): boolean {
  return slideHas(slide, 'image_placeholder');
}

/**
 * Count total image placeholder components in a slide.
 */
function imagePlaceholderCount(slide: SduiSlide): number {
  return SlideUtils.slideComponents(slide).filter(
    (component) => component.type === 'image_placeholder',
  ).length;
}

/**
 * Get required minimum image placeholder count for a layout.
 */
function requiredImagePlaceholderCount(layoutId: LayoutVariantId | undefined): number {
  if (!layoutId) return 0;
  return MIN_MULTI_IMAGE_PLACEHOLDERS[layoutId] ?? 1;
}

/**
 * Check if layout requires multiple images.
 */
function isMultiImageLayout(layoutId: LayoutVariantId | undefined): boolean {
  return Boolean(layoutId && MULTI_IMAGE_LAYOUTS.has(layoutId));
}

/**
 * Calculate content units for a single component (0 or 1).
 * Returns 1 if component has valid, non-empty content.
 */
function componentContentUnits(component: SduiComponent): number {
  switch (component.type) {
    case 'header':
      return component.text?.trim() ? 1 : 0;
    case 'body':
    case 'quote':
    case 'pull_quote':
    case 'callout':
      return component.text?.trim() ? 1 : 0;
    case 'button_cta':
      return component.label?.trim() ? 1 : 0;
    case 'checklist':
    case 'numbered_list':
      return (component.items ?? []).filter((item) => item.trim().length > 0).length >= 2 ? 1 : 0;
    case 'feature_cards':
      return (component.items_cards ?? []).filter((card) => card.title.trim().length > 0).length >=
        2
        ? 1
        : 0;
    case 'comparison':
      return (component.columns ?? []).filter(
        (column) => column.label.trim().length > 0 && column.items.length > 0,
      ).length >= 2
        ? 1
        : 0;
    case 'stat_block':
      return component.value?.trim() || component.text?.trim() || component.label?.trim() ? 1 : 0;
    case 'stat_row':
      return (component.stats ?? []).filter(
        (stat) => stat.value.trim().length > 0 && stat.label.trim().length > 0,
      ).length >= 2
        ? 1
        : 0;
    case 'key_value_list':
      return (component.rows ?? []).filter(
        (row) => row.label.trim().length > 0 && row.value.trim().length > 0,
      ).length >= 2
        ? 1
        : 0;
    case 'data_table':
      return (component.tableRows ?? []).length >= 2 ? 1 : 0;
    case 'timeline':
      return (component.timeline ?? []).filter(
        (item) => item.time.trim().length > 0 && item.text.trim().length > 0,
      ).length >= 2
        ? 1
        : 0;
    case 'progress_bar':
      return (component.progress ?? []).filter((item) => item.label.trim().length > 0).length >= 2
        ? 1
        : 0;
    case 'byline':
    case 'caption':
      return component.text?.trim() ? 1 : 0;
    case 'image_placeholder':
      return 1;
    default:
      return 0;
  }
}

/**
 * Calculate total content units in a slide.
 */
function slideContentUnits(slide: SduiSlide): number {
  return SlideUtils.slideComponents(slide).reduce(
    (sum, component) => sum + componentContentUnits(component),
    0,
  );
}

/**
 * Check if slide has insufficient content (sparse).
 * Content slides need at least 2 content units.
 */
function isSparseContentSlide(slide: SduiSlide): boolean {
  if (slide.slide_type !== 'content') return false;
  return slideContentUnits(slide) < 2;
}

/**
 * Check if slide content contains statistical/numerical signals.
 */
function hasStatSignal(slide: SduiSlide): boolean {
  const text = SlideUtils.slideComponents(slide)
    .filter((component) => component.type === 'header' || component.type === 'body')
    .map((component) => component.text ?? '')
    .join(' ');
  const tokens = text.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
  const statWords = new Set([
    'rp',
    'juta',
    'ribu',
    'miliar',
    'kali',
    'persen',
    'score',
    'skor',
    'rate',
    'rasio',
    'data',
    'angka',
    'metrik',
    'statistik',
  ]);
  return tokens.some(
    (token) =>
      /\d/.test(token) || token.includes('%') || /^\d+x$/.test(token) || statWords.has(token),
  );
}

/**
 * Check if component has valid, renderable content.
 */
function hasRenderableComponent(slide: SduiSlide, type: SduiComponent['type']): boolean {
  const components = SlideUtils.slideComponents(slide);
  return components.some((component) => {
    if (component.type !== type) return false;
    if (component.type === 'checklist')
      return (component.items ?? []).some((item) => item.trim().length > 0);
    if (component.type === 'feature_cards')
      return (
        (component.items_cards ?? []).filter((card) => card.title.trim().length > 0).length >= 2
      );
    if (component.type === 'comparison')
      return (
        (component.columns ?? []).filter(
          (column) => column.label.trim().length > 0 && column.items.length > 0,
        ).length >= 2
      );
    if (component.type === 'numbered_list')
      return (component.items ?? []).filter((item) => item.trim().length > 0).length >= 2;
    if (component.type === 'stat_row')
      return (
        (component.stats ?? []).filter(
          (stat) => stat.value.trim().length > 0 && stat.label.trim().length > 0,
        ).length >= 2
      );
    if (component.type === 'key_value_list')
      return (
        (component.rows ?? []).filter(
          (row) => row.label.trim().length > 0 && row.value.trim().length > 0,
        ).length >= 2
      );
    if (component.type === 'timeline')
      return (
        (component.timeline ?? []).filter(
          (item) => item.time.trim().length > 0 && item.text.trim().length > 0,
        ).length >= 2
      );
    if (component.type === 'progress_bar')
      return (component.progress ?? []).filter((item) => item.label.trim().length > 0).length >= 2;
    if (component.type === 'button_cta')
      return typeof component.label === 'string' && component.label.trim().length > 0;
    if (component.type === 'stat_block')
      return Boolean(component.value?.trim() || component.text?.trim() || component.label?.trim());
    if (component.type === 'data_table') return (component.tableRows ?? []).length >= 2;
    if ('text' in component)
      return typeof component.text === 'string' && component.text.trim().length > 0;
    return true;
  });
}

/**
 * Calculate required visual slide count based on prompt analysis.
 */
function requiredVisualSlideCount(prompt: string, slideCount: number): number {
  // "tanpa gambar / teks saja" wins: the word "gambar" in a negation must not
  // trip the image-required heuristic and re-add photos to a text-only deck.
  if (promptExplicitlyRequestsNoImages(prompt)) return 0;
  const promptRequestsVisualLed =
    /\b(visual[\s-]led|visually[\s-]driven|image[\s-]heavy|photo[\s-]driven|dipimpin\s+visual|berat\s+gambar|fokus\s+visual|carousel\s+foto)\b/i.test(
      prompt,
    );
  const promptExplicitlyRequestsImages =
    /\b(gambar|ilustrasi|foto|image|illustration|photo|visual|graphic|infographic|infografis|mockup|screenshot)\b/i.test(
      prompt,
    );

  if (!promptRequestsVisualLed) return promptExplicitlyRequestsImages ? 1 : 0;
  if (slideCount >= 5) return 3;
  if (slideCount >= 3) return 2;
  return 1;
}

/**
 * Check visual integrity and return issues.
 */
function visualIntegrityIssues(prompt: string, slides: SduiSlide[]): string[] {
  const requiredCount = requiredVisualSlideCount(prompt, slides.length);
  if (requiredCount === 0) return [];
  const imageSlides = slides.filter(hasImagePlaceholder).length;
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
 * Exported validator functions.
 */
export const SlideQualityValidator = {
  slideHas,
  hasImagePlaceholder,
  imagePlaceholderCount,
  requiredImagePlaceholderCount,
  isMultiImageLayout,
  componentContentUnits,
  slideContentUnits,
  isSparseContentSlide,
  hasStatSignal,
  hasRenderableComponent,
  requiredVisualSlideCount,
  visualIntegrityIssues,
  // Export constants for testing
  MULTI_IMAGE_LAYOUTS,
  MIN_MULTI_IMAGE_PLACEHOLDERS,
};
