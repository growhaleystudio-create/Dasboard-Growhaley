/**
 * quality-checker.ts — Quality checks for SDUI slides
 */

import type { SduiSlide } from '@leads-generator/shared';
import { promptExplicitlyRequestsImages } from '../image/image-detection.js';

function hasImagePlaceholder(slide: SduiSlide): boolean {
  return (['top_meta', 'core_content', 'action_footer'] as const).some((group) =>
    (slide.nested_groups[group] ?? []).some((component) => component.type === 'image_placeholder'),
  );
}

/**
 * Checks for image requirement violations in the slide deck.
 */
export function sduiImageRequirementIssues(
  input: Pick<{ prompt: string }, 'prompt'>,
  slides: SduiSlide[],
): string[] {
  const issues: string[] = [];
  if (promptExplicitlyRequestsImages(input.prompt) && !slides.some(hasImagePlaceholder)) {
    issues.push('user explicitly requested at least one image, but no slide contains image_placeholder');
  }
  for (const slide of slides) {
    if (
      (slide.image_requirement === 'required' || slide.image_requirement === 'optional') &&
      !hasImagePlaceholder(slide)
    ) {
      issues.push(
        `slide ${slide.slide_number}: image_requirement=${slide.image_requirement} requires an image_placeholder`,
      );
    }
  }
  return issues;
}
