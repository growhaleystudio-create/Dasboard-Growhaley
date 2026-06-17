/**
 * slide-content-analyzer.ts
 * 
 * Content analysis utilities for slides - extracting text, deduplicating issues,
 * validating repair outcomes, and generating short topic summaries.
 */

import type { SduiSlide } from '@leads-generator/shared';
import { layoutSupportsImageVariant } from '../../layout-migration.js';
import { SlideQualityValidator } from './slide-quality-validator.js';

/**
 * Extract first text component of given type from slide
 * @param slide - Slide to extract text from
 * @param type - Component type to find ('header', 'body', or 'quote')
 * @returns Trimmed text content or undefined if not found or empty
 */
function firstText(slide: SduiSlide, type: 'header' | 'body' | 'quote'): string | undefined {
  const components = (['top_meta', 'core_content', 'action_footer'] as const)
    .flatMap((group) => slide.nested_groups[group] ?? []);
  const text = components.find((component) => component.type === type)?.text?.trim();
  return text && text.length > 0 ? text : undefined;
}

/**
 * Deduplicate array of issue strings
 * @param issues - Array of issue strings (may contain duplicates)
 * @returns Deduplicated array
 */
function uniqueIssues(issues: string[]): string[] {
  return [...new Set(issues)];
}

/**
 * Generate short topic summary from prompt (max 72 chars)
 * @param prompt - User prompt
 * @returns Compact topic string (truncated if > 72 chars)
 */
function shortPromptTopic(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  if (!compact) return 'Konten utama';
  return compact.length > 72 ? `${compact.slice(0, 69).trimEnd()}...` : compact;
}

/**
 * Validate that a slide meets no-image repair requirements:
 * - No image placeholders present
 * - Layout does not support images (or layout is undefined)
 * 
 * Used after image generation failures to verify deterministic repair
 * successfully converted slide to valid text-only layout.
 * 
 * @param slide - Slide to validate
 * @returns true if slide is valid no-image repair, false otherwise
 */
function isValidNoImageRepair(slide: SduiSlide): boolean {
  if (SlideQualityValidator.hasImagePlaceholder(slide)) return false;
  if (slide.layout_variant_id && layoutSupportsImageVariant(slide.layout_variant_id)) return false;
  return true;
}

/**
 * SlideContentAnalyzer - Utility functions for analyzing slide content
 */
export const SlideContentAnalyzer = {
  firstText,
  uniqueIssues,
  shortPromptTopic,
  isValidNoImageRepair,
} as const;
