import { slideLayoutCatalog, SLIDE_LAYOUT_VARIANTS } from '@leads-generator/shared';
import { MIGRATED_RENDERER_TEMPLATE_ALIASES } from './rendering/satori/template-picker.js';
import type {
  AspectRatio,
  BlockType,
  LayoutFamily,
  SduiComponent,
  SduiComponentType,
  SduiLayoutTextLimits,
  SduiSlide,
} from '@leads-generator/shared';

const DEFAULT_TEXT_LIMITS: SduiLayoutTextLimits = {
  tag: 16,
  header: 60,
  body: 220,
  quote: 150,
  ctaLabel: 28,
  checklistItem: 65,
  checklistItems: 5,
};

const LAYOUT_FAMILY_MAP: Record<string, LayoutFamily> = {
  'cover-centered': 'cover',
  'cover-top': 'cover',
  'cover-bottom': 'cover',
  'text-traditional': 'text',
  'text-balanced': 'text',
  'text-heading-hero': 'text',
  'text-body-heavy': 'text',
  'text-compact-header': 'text',
  'list-standard': 'checklist',
  'list-spacious': 'checklist',
  'list-bold-header': 'checklist',
  'chart-standard': 'stat',
  'chart-hero': 'stat',
  'chart-balanced': 'stat',
  'stat-standard': 'stat',
  'stat-hero': 'stat',
  'stat-context': 'stat',
  'data-standard': 'stat',
  'data-chart-focus': 'stat',
  'mockup-standard': 'image_focus',
  'mockup-hero': 'image_focus',
  'mockup-balanced': 'image_focus',
  'quote-centered': 'quote',
  'quote-top': 'quote',
  'quote-bottom': 'quote',
  'cta-centered': 'cta',
  'cta-bottom': 'cta',
  'image-hero': 'image_focus',
  'image-balanced': 'image_focus',
  'image-context': 'image_focus',
  'image-fullbleed': 'image_focus',
  'rich-magazine': 'editorial',
  'rich-image-first': 'editorial',
  'rich-editorial': 'editorial',
  'rich-thirds': 'editorial',
  'body-centered': 'text',
  'body-top': 'text',
  'multi-text-list': 'checklist',
  'multi-list-visual': 'image_split',
  'multi-product-story': 'image_focus',
  'multi-story-quote': 'quote',
  'multi-pitch': 'cta',
  'stat-only': 'stat',
  'stat-headline': 'stat',
  'stat-explained': 'stat',
  'chart-explained': 'stat',
  'chart-only': 'stat',
  'mockup-titled': 'image_focus',
  'mockup-only': 'image_focus',
  'bullet-only': 'checklist',
  'bullet-with-intro': 'checklist',
  'image-only': 'image_focus',
  'generic-default': 'text',
};

const LEGACY_LAYOUT_FAMILY_MAP: Record<string, LayoutFamily> = {
  cover_centered: 'cover',
  cover_editorial_left: 'cover',
  cover_image_full: 'image_focus',
  text_centered: 'text',
  text_stack: 'text',
  split_text_left_image_right: 'image_split',
  split_image_left_text_right: 'image_split',
  image_top_text_bottom: 'image_focus',
  text_top_image_bottom: 'image_focus',
  checklist_stack: 'checklist',
  numbered_steps: 'checklist',
  quote_focus: 'quote',
  stat_highlight: 'stat',
  big_statement: 'text',
  cta_centered: 'cta',
  split_checklist_image: 'image_split',
  split_image_checklist: 'image_split',
  split_stat_image: 'image_split',
  image_top_checklist_bottom: 'image_focus',
  quote_with_image: 'quote',
  header_body_cta: 'cta',
  split_header_body_cta: 'image_focus',
  cover_checklist: 'cover',
  numbered_with_image: 'image_split',
  big_stat_with_body: 'stat',
  two_column_text: 'text',
  image_full_caption: 'image_focus',
  quote_stat_combo: 'stat',
  cover_with_cta: 'cover',
  checklist_with_body: 'checklist',
  editorial_feature_spread: 'editorial',
  magazine_cover_story: 'editorial',
  pullquote_editorial: 'editorial',
  article_column_layout: 'editorial',
  editorial_image_caption_grid: 'editorial',
  profile_story_layout: 'editorial',
  reportage_photo_essay: 'editorial',
  opinion_big_statement: 'editorial',
  timeline_editorial: 'editorial',
  data_editorial: 'editorial',
  editorial_rich_stack: 'editorial',
  editorial_rich_split: 'editorial',
  feature_cards_grid: 'editorial',
  feature_cards_with_header: 'editorial',
  comparison_columns: 'text',
  comparison_with_header: 'text',
  dual_image_comparison: 'multi_image',
  product_angle_pair: 'multi_image',
  use_case_gallery_2up: 'multi_image',
  mini_gallery_3up: 'multi_image',
  moodboard_grid: 'multi_image',
  step_visual_sequence: 'multi_image',
  problem_solution_visual_pair: 'multi_image',
  feature_visual_cards: 'multi_image',
  testimonial_with_portrait_and_product: 'multi_image',
  case_study_snapshot_grid: 'multi_image',
  dos_donts_visual_pair: 'multi_image',
  outfit_or_style_board: 'multi_image',
  menu_or_food_combo: 'multi_image',
  real_estate_room_pair: 'multi_image',
  app_screen_flow: 'multi_image',
  social_proof_wall: 'multi_image',
  event_moment_grid: 'multi_image',
  travel_itinerary_grid: 'multi_image',
  collection_showcase: 'multi_image',
  variant_selector_showcase: 'multi_image',
};

const TEXT_LIMITS_MAP: Record<string, Partial<SduiLayoutTextLimits>> = {
  'cover-centered': { header: 52, body: 110 },
  'cover-top': { header: 52, body: 110 },
  'cover-bottom': { header: 52, body: 110 },
  'text-traditional': { header: 44, body: 180 },
  'text-balanced': { header: 44, body: 170 },
  'text-heading-hero': { header: 52, body: 140 },
  'text-body-heavy': { header: 34, body: 240 },
  'text-compact-header': { header: 30, body: 260 },
  'list-standard': { header: 38, checklistItem: 55, checklistItems: 5 },
  'list-spacious': { header: 34, checklistItem: 55, checklistItems: 5 },
  'list-bold-header': { header: 42, checklistItem: 50, checklistItems: 4 },
  'quote-centered': { quote: 130, body: 90 },
  'quote-top': { quote: 130, body: 90 },
  'quote-bottom': { quote: 130, body: 90 },
  'cta-centered': { header: 40, ctaLabel: 24, body: 110 },
  'cta-bottom': { header: 38, ctaLabel: 24, body: 110 },
  'image-hero': { header: 38, body: 120 },
  'image-balanced': { header: 38, body: 120 },
  'image-context': { header: 38, body: 120 },
  'image-fullbleed': { header: 34, body: 100 },
  'rich-magazine': { header: 36, body: 200 },
  'rich-image-first': { header: 34, body: 180 },
  'rich-editorial': { header: 34, body: 200 },
  'rich-thirds': { header: 34, body: 180 },
  'body-centered': { body: 280 },
  'body-top': { body: 280 },
  'multi-text-list': { header: 36, body: 120, checklistItem: 50, checklistItems: 4 },
  'multi-list-visual': { header: 34, checklistItem: 48, checklistItems: 4 },
  'multi-product-story': { header: 34, body: 150 },
  'multi-story-quote': { header: 34, body: 130, quote: 120 },
  'multi-pitch': { header: 38, body: 130, ctaLabel: 24 },
  'stat-standard': { header: 24, body: 110 },
  'stat-hero': { header: 20, body: 100 },
  'stat-context': { header: 22, body: 150 },
  'stat-only': { body: 80 },
  'stat-headline': { header: 22 },
  'stat-explained': { body: 150 },
  'chart-standard': { header: 36, body: 80 },
  'chart-hero': { header: 34, body: 70 },
  'chart-balanced': { header: 34, body: 80 },
  'data-standard': { header: 32, body: 120 },
  'data-chart-focus': { header: 30, body: 110 },
  'chart-explained': { body: 160 },
  'chart-only': { body: 60 },
  'mockup-standard': { body: 130 },
  'mockup-hero': { body: 110 },
  'mockup-balanced': { body: 140 },
  'mockup-titled': { header: 34 },
  'mockup-only': { body: 60 },
  'bullet-only': { checklistItem: 60, checklistItems: 6 },
  'bullet-with-intro': { body: 110, checklistItem: 55, checklistItems: 5 },
  'image-only': { body: 60 },
  'generic-default': { header: 60, body: 220 },
};

function allComponents(slide: SduiSlide): SduiComponent[] {
  return (['top_meta', 'core_content', 'action_footer'] as const).flatMap(
    (group) => slide.nested_groups[group] ?? [],
  );
}

function toBlockType(component: SduiComponent): BlockType[] {
  switch (component.type) {
    case 'header':
      return ['heading'];
    case 'body':
      return ['body'];
    case 'quote':
      return ['quote'];
    case 'button_cta':
      return ['cta'];
    case 'checklist':
      return ['bullet'];
    case 'image_placeholder':
      return ['image'];
    case 'stat_block':
    case 'stat_row':
      return ['stat'];
    default:
      return [];
  }
}

export function slideBlockTypes(slide: SduiSlide): BlockType[] {
  return [...new Set(allComponents(slide).flatMap(toBlockType))];
}

export interface MigratedLayoutCandidate {
  id: string;
  family: LayoutFamily;
  supportsImage: boolean;
  requiredComponents: SduiComponentType[];
  textLimits: SduiLayoutTextLimits;
  bestFor: string[];
}

export function inferLayoutVariant(slide: SduiSlide, aspectRatio: AspectRatio): string {
  const blocks = slideBlockTypes(slide);
  if (blocks.length === 0) return slideLayoutCatalog.defaultFor(['heading'], aspectRatio).id;
  return slideLayoutCatalog.defaultFor(blocks, aspectRatio).id;
}

export function layoutFamilyForVariant(id: string | undefined): LayoutFamily | undefined {
  if (!id) return undefined;
  if (LEGACY_LAYOUT_FAMILY_MAP[id]) return LEGACY_LAYOUT_FAMILY_MAP[id];
  const normalizedId = MIGRATED_RENDERER_TEMPLATE_ALIASES[id] ?? id;
  return LAYOUT_FAMILY_MAP[normalizedId] ?? 'text';
}

export function layoutSupportsImageVariant(id: string | undefined): boolean {
  if (!id) return false;
  const family = layoutFamilyForVariant(id);
  return (
    family === 'image_focus' ||
    family === 'image_split' ||
    family === 'multi_image' ||
    family === 'editorial'
  );
}

export function getTextLimitsForVariant(id: string | undefined): SduiLayoutTextLimits {
  return {
    ...DEFAULT_TEXT_LIMITS,
    ...(id ? (TEXT_LIMITS_MAP[id] ?? undefined) : undefined),
  };
}

export function migratedLayoutCatalog(): MigratedLayoutCandidate[] {
  return SLIDE_LAYOUT_VARIANTS.map((variant) => {
    const blocks = [...new Set(variant.regions.map((region) => region.blockType))];
    const requiredComponents: SduiComponentType[] = [
      ...new Set(
        blocks.flatMap((block): SduiComponentType[] => {
          switch (block) {
            case 'heading':
              return ['header'];
            case 'body':
              return ['body'];
            case 'bullet':
              return ['checklist'];
            case 'quote':
              return ['quote'];
            case 'cta':
              return ['button_cta'];
            case 'image':
              return ['image_placeholder'];
            case 'stat':
              return ['stat_block'];
            default:
              return [];
          }
        }),
      ),
    ];
    const bestFor: string[] = [
      ...new Set(
        blocks.map((block): string => {
          switch (block) {
            case 'heading':
              return 'headline-driven slides';
            case 'body':
              return 'narrative explanation';
            case 'bullet':
              return 'steps or checklist content';
            case 'quote':
              return 'quote or testimonial slides';
            case 'cta':
              return 'call-to-action slides';
            case 'image':
              return 'visual-led storytelling';
            case 'stat':
              return 'data or metric-driven slides';
            default:
              return 'general content';
          }
        }),
      ),
    ];

    return {
      id: variant.id,
      family: layoutFamilyForVariant(variant.id) ?? 'text',
      supportsImage: layoutSupportsImageVariant(variant.id),
      requiredComponents,
      textLimits: getTextLimitsForVariant(variant.id),
      bestFor,
    };
  });
}

export function migratedNoImageLayoutCatalog(): MigratedLayoutCandidate[] {
  return migratedLayoutCatalog().filter((layout) => !layout.supportsImage);
}

export function migratedEditorialLayoutCatalog(): MigratedLayoutCandidate[] {
  return migratedLayoutCatalog().filter(
    (layout) => layout.family === 'editorial' || layout.id === 'cover_editorial_left',
  );
}

export function preferredImageLayoutVariant(slide: SduiSlide): string {
  if (slide.slide_type === 'cover') return 'cover_image_full';
  const hasChecklist = allComponents(slide).some((component) => component.type === 'checklist');
  const hasBody = allComponents(slide).some((component) => component.type === 'body');
  const hasCta = allComponents(slide).some((component) => component.type === 'button_cta');
  if (hasChecklist && !hasBody) return 'numbered_with_image';
  if (hasCta) return 'split_header_body_cta';
  return 'split_text_left_image_right';
}
