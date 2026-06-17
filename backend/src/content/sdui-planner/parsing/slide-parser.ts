/**
 * slide-parser.ts — Parses raw LLM output into SduiSlide[]
 *
 * Extracted from sdui-planner.ts:854-933 (80 lines)
 * Status: ✅ Full implementation extracted
 */

import type {
  SduiSlide,
  SduiTypographyOverride,
  SduiComponent,
  TypographyScale,
  ImageRequirement,
} from '@leads-generator/shared';
import { sanitizeComponent } from './component-sanitizer.js';
import { getLayoutVariantSet } from '../layout/layout-catalog.js';
import { applySduiTextGuardrails } from '../../sdui-text-guardrails.js';
import { layoutFamilyForVariant } from '../../layout-migration.js';


const LAYOUT_VARIANT_SET = getLayoutVariantSet();
const LEGACY_LAYOUT_VARIANT_ALIASES: Readonly<Record<string, SduiSlide['layout_variant_id']>> = {
  cover_centered: 'cover_centered',
  cover_editorial_left: 'cover_editorial_left',
  cover_image_full: 'cover_image_full',
  text_centered: 'text_centered',
  text_stack: 'text_stack',
  split_text_left_image_right: 'split_text_left_image_right',
  split_image_left_text_right: 'split_image_left_text_right',
  image_top_text_bottom: 'image_top_text_bottom',
  text_top_image_bottom: 'text_top_image_bottom',
  checklist_stack: 'checklist_stack',
  numbered_steps: 'numbered_steps',
  quote_focus: 'quote_focus',
  stat_highlight: 'stat_highlight',
  big_statement: 'big_statement',
  cta_centered: 'cta_centered',
  split_checklist_image: 'split_checklist_image',
  split_image_checklist: 'split_image_checklist',
  split_stat_image: 'split_stat_image',
  image_top_checklist_bottom: 'image_top_checklist_bottom',
  quote_with_image: 'quote_with_image',
  header_body_cta: 'header_body_cta',
  split_header_body_cta: 'split_header_body_cta',
  cover_checklist: 'cover_checklist',
  numbered_with_image: 'numbered_with_image',
  big_stat_with_body: 'big_stat_with_body',
  two_column_text: 'two_column_text',
  image_full_caption: 'image_full_caption',
  quote_stat_combo: 'quote_stat_combo',
  cover_with_cta: 'cover_with_cta',
  checklist_with_body: 'checklist_with_body',
  editorial_feature_spread: 'editorial_feature_spread',
  magazine_cover_story: 'magazine_cover_story',
  pullquote_editorial: 'pullquote_editorial',
  article_column_layout: 'article_column_layout',
  editorial_image_caption_grid: 'editorial_image_caption_grid',
  profile_story_layout: 'profile_story_layout',
  reportage_photo_essay: 'reportage_photo_essay',
  opinion_big_statement: 'opinion_big_statement',
  timeline_editorial: 'timeline_editorial',
  data_editorial: 'data_editorial',
  editorial_rich_stack: 'editorial_rich_stack',
  editorial_rich_split: 'editorial_rich_split',
  feature_cards_grid: 'feature_cards_grid',
  feature_cards_with_header: 'feature_cards_with_header',
  comparison_columns: 'comparison_columns',
  comparison_with_header: 'comparison_with_header',
  dual_image_comparison: 'dual_image_comparison',
  product_angle_pair: 'product_angle_pair',
  use_case_gallery_2up: 'use_case_gallery_2up',
  mini_gallery_3up: 'mini_gallery_3up',
  moodboard_grid: 'moodboard_grid',
  step_visual_sequence: 'step_visual_sequence',
  problem_solution_visual_pair: 'problem_solution_visual_pair',
  feature_visual_cards: 'feature_visual_cards',
  testimonial_with_portrait_and_product: 'testimonial_with_portrait_and_product',
  case_study_snapshot_grid: 'case_study_snapshot_grid',
  dos_donts_visual_pair: 'dos_donts_visual_pair',
  outfit_or_style_board: 'outfit_or_style_board',
  menu_or_food_combo: 'menu_or_food_combo',
  real_estate_room_pair: 'real_estate_room_pair',
  app_screen_flow: 'app_screen_flow',
  social_proof_wall: 'social_proof_wall',
  event_moment_grid: 'event_moment_grid',
  travel_itinerary_grid: 'travel_itinerary_grid',
  collection_showcase: 'collection_showcase',
  variant_selector_showcase: 'variant_selector_showcase',
};

function normalizeLayoutVariantId(layoutVariantId: unknown): SduiSlide['layout_variant_id'] | undefined {
  if (typeof layoutVariantId !== 'string') return undefined;
  if (LEGACY_LAYOUT_VARIANT_ALIASES[layoutVariantId]) {
    return LEGACY_LAYOUT_VARIANT_ALIASES[layoutVariantId];
  }
  if (LAYOUT_VARIANT_SET.has(layoutVariantId)) {
    return layoutVariantId as SduiSlide['layout_variant_id'];
  }
  return undefined;
}

export function parseSlides(
  parsed: unknown,
  typographyOverride?: SduiTypographyOverride,
  options: { applyTextGuardrails?: boolean } = {},
): { slides: SduiSlide[]; chosenReferenceId?: string } | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const rawSlides = (parsed as Record<string, unknown>).slides;
  if (!Array.isArray(rawSlides)) return null;
  const chosenReferenceId =
    typeof (parsed as Record<string, unknown>).chosen_reference_id === 'string'
      ? ((parsed as Record<string, unknown>).chosen_reference_id as string)
      : undefined;

  const slides: SduiSlide[] = [];
  rawSlides.forEach((rs, i) => {
    if (typeof rs !== 'object' || rs === null) return;
    const r = rs as Record<string, unknown>;
    const groupsRaw = (r.nested_groups ?? {}) as Record<string, unknown>;

    const mapGroup = (key: string): SduiComponent[] => {
      const arr = groupsRaw[key];
      if (!Array.isArray(arr)) return [];
      return arr.map(sanitizeComponent).filter((c): c is SduiComponent => c !== null);
    };

    const slideType = r.slide_type === 'cover' || i === 0 ? 'cover' : 'content';
    const layout =
      r.container_layout === 'split_screen' || r.container_layout === 'background_overlay'
        ? r.container_layout
        : 'text_dominant';
    const scale: TypographyScale =
      r.typography_scale === 'editorial_bold' ||
      r.typography_scale === 'information_dense' ||
      r.typography_scale === 'balanced_classic'
        ? r.typography_scale
        : 'balanced_classic';
    const layoutVariant = normalizeLayoutVariantId(r.layout_variant_id);
    const layoutFamily = layoutFamilyForVariant(layoutVariant);
    const nestedGroups = {
      top_meta: mapGroup('top_meta'),
      core_content: mapGroup('core_content'),
      action_footer: mapGroup('action_footer'),
    };
    const hasImagePlaceholder = (['top_meta', 'core_content', 'action_footer'] as const).some(
      (group) => nestedGroups[group].some((component) => component.type === 'image_placeholder'),
    );
    const imageRequirement: ImageRequirement =
      r.image_requirement === 'required' ||
      r.image_requirement === 'optional' ||
      r.image_requirement === 'none'
        ? r.image_requirement
        : hasImagePlaceholder
          ? 'optional'
          : 'none';

    const slide: SduiSlide = {
      slide_number: i + 1,
      slide_type: slideType as SduiSlide['slide_type'],
      container_layout: layout as SduiSlide['container_layout'],
      ...(layoutVariant ? { layout_variant_id: layoutVariant } : {}),
      ...(layoutFamily ? { layout_family: layoutFamily } : {}),
      image_requirement: imageRequirement,
      layout_source: 'ai_selected',
      ...(imageRequirement === 'none' ? { image_status: 'not_needed' as const } : {}),
      typography_scale: scale,
      ...(r.contentDirection === 'row' || r.contentDirection === 'column'
        ? { contentDirection: r.contentDirection as 'row' | 'column' }
        : {}),
      nested_groups: nestedGroups,
    };
    slides.push(
      options.applyTextGuardrails === true
        ? applySduiTextGuardrails(slide, { typography: typographyOverride })
        : slide,
    );
  });

  if (slides.length === 0) return null;
  const out: { slides: SduiSlide[]; chosenReferenceId?: string } = { slides };
  if (chosenReferenceId) out.chosenReferenceId = chosenReferenceId;
  return out;
}

// Re-export sanitizer for use in parsing
export { sanitizeComponent };
