import type { LayoutStylePreference } from './content.js';

export interface LayoutStyleGroup {
  id: Exclude<LayoutStylePreference, 'auto'>;
  label: string;
  description: string;
  variantIds: string[];
  supportsAllSlidesImage: boolean;
  fallbackStyle: LayoutStylePreference;
}

export const LAYOUT_STYLE_GROUPS: readonly LayoutStyleGroup[] = [
  {
    id: 'scrapbook',
    label: 'Scrapbook',
    description: 'Collage-like visual storytelling with image-led compositions and layered layouts.',
    variantIds: [
      'cover_image_full',
      'image_top_text_bottom',
      'text_top_image_bottom',
      'dual_image_comparison',
      'moodboard_grid',
      'editorial_image_caption_grid',
      'reportage_photo_essay',
    ],
    supportsAllSlidesImage: true,
    fallbackStyle: 'editorial',
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'Magazine-style hierarchy with strong storytelling and premium reading rhythm.',
    variantIds: [
      'editorial_feature_spread',
      'magazine_cover_story',
      'pullquote_editorial',
      'article_column_layout',
      'editorial_image_caption_grid',
      'profile_story_layout',
      'reportage_photo_essay',
      'opinion_big_statement',
      'timeline_editorial',
      'data_editorial',
      'editorial_rich_stack',
      'editorial_rich_split',
    ],
    supportsAllSlidesImage: false,
    fallbackStyle: 'scrapbook',
  },
  {
    id: 'bento',
    label: 'Bento',
    description: 'Modular content blocks for productized information and feature grouping.',
    variantIds: [
      'feature_cards_grid',
      'feature_cards_with_header',
      'feature_visual_cards',
      'multi-text-list',
    ],
    supportsAllSlidesImage: false,
    fallbackStyle: 'comparison',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    description: 'Sequenced roadmap or process storytelling with chronological emphasis.',
    variantIds: ['numbered_steps', 'numbered_with_image', 'timeline_editorial', 'step_visual_sequence'],
    supportsAllSlidesImage: false,
    fallbackStyle: 'editorial',
  },
  {
    id: 'comparison',
    label: 'Comparison',
    description: 'Before/after, pros/cons, and side-by-side contrast layouts.',
    variantIds: [
      'comparison_columns',
      'comparison_with_header',
      'dual_image_comparison',
      'problem_solution_visual_pair',
      'dos_donts_visual_pair',
    ],
    supportsAllSlidesImage: false,
    fallbackStyle: 'scrapbook',
  },
  {
    id: 'ui_mockup',
    label: 'UI Mockup',
    description: 'Digital product, social proof, and interface-led compositions.',
    variantIds: ['mockup-standard', 'mockup-hero', 'mockup-balanced', 'mockup-titled', 'app_screen_flow'],
    supportsAllSlidesImage: true,
    fallbackStyle: 'scrapbook',
  },
  {
    id: 'chart',
    label: 'Chart',
    description: 'Data-led slides with charts, metrics, and analytical emphasis.',
    variantIds: [
      'chart-standard',
      'chart-hero',
      'chart-balanced',
      'data-standard',
      'data-chart-focus',
      'data_editorial',
    ],
    supportsAllSlidesImage: false,
    fallbackStyle: 'editorial',
  },
  {
    id: 'seamless',
    label: 'Seamless',
    description: 'Connected panoramic storytelling with swipe continuity and strong visual flow.',
    variantIds: ['cover_image_full', 'image-fullbleed', 'image-hero', 'rich-image-first'],
    supportsAllSlidesImage: true,
    fallbackStyle: 'scrapbook',
  },
  {
    id: 'alternating_contrast',
    label: 'Alternating Contrast',
    description: 'High-contrast rhythm and punchy transitions between slides.',
    variantIds: ['big_statement', 'quote_focus', 'text_centered', 'rich-editorial', 'image-fullbleed'],
    supportsAllSlidesImage: false,
    fallbackStyle: 'editorial',
  },
] as const;

export function layoutStyleGroupById(
  id: LayoutStylePreference | undefined,
): LayoutStyleGroup | undefined {
  if (!id || id === 'auto') return undefined;
  return LAYOUT_STYLE_GROUPS.find((group) => group.id === id);
}
