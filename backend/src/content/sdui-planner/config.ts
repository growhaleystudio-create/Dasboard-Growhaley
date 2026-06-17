/**
 * config.ts — Constants and limits for SDUI Planner
 */

/** Gemini API endpoint path for text generation */
export const GEMINI_TEXT_PATH = '/v1beta/models/gemini-2.5-flash-lite:generateContent';

/** Maximum character length for header text */
export const HEADER_HARD_MAX = 80;

/** Maximum character length for body text */
export const BODY_HARD_MAX = 240;

/** Maximum character length for quote text */
export const QUOTE_HARD_MAX = 200;

/** Maximum character length for checklist item text */
export const CHECKLIST_ITEM_HARD_MAX = 100;

/** Valid component types that can appear in slides */
export const COMPONENT_TYPES = new Set([
  'tag',
  'header',
  'body',
  'checklist',
  'button_cta',
  'image_placeholder',
  'visual_layer',
  'quote',
  'feature_cards',
  'comparison',
  // New rich components
  'byline',
  'pull_quote',
  'callout',
  'caption',
  'stat_block',
  'key_value_list',
  'data_table',
  'stat_row',
  'timeline',
  'numbered_list',
  'progress_bar',
  'divider',
]);
