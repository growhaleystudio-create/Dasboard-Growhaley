/**
 * image-enforcer.ts — Enforces image placeholders for visual layers and visual-led decks
 */

import type { SduiSlide, SduiComponent, ImageRequirement } from '@leads-generator/shared';
import { promptExplicitlyRequestsImages, promptRequestsVisualLedDeck } from './image-detection.js';
import { visualLayerImageContext } from './image-context-builder.js';

function hasImagePlaceholder(slide: SduiSlide): boolean {
  return (['top_meta', 'core_content', 'action_footer'] as const).some((group) =>
    (slide.nested_groups[group] ?? []).some((component) => component.type === 'image_placeholder'),
  );
}

function hasComponent(slide: SduiSlide, type: SduiComponent['type']): boolean {
  return (['top_meta', 'core_content', 'action_footer'] as const).some((group) =>
    (slide.nested_groups[group] ?? []).some((component) => component.type === type),
  );
}

function visualLayerNeedsGeneratedArtwork(component: SduiComponent): boolean {
  return (
    component.type === 'visual_layer' &&
    (component.visual_treatment === 'boxed_image' ||
      component.visual_treatment === 'circle_asset' ||
      component.visual_treatment === 'transparent_cutout' ||
      component.visual_treatment === 'full_bleed_background' ||
      component.visual_treatment === 'floating_object' ||
      component.visual_treatment === 'editorial_collage' ||
      component.visual_treatment === 'ui_mockup_board')
  );
}

function preferredImageLayoutVariant(slide: SduiSlide): string {
  if (slide.slide_type === 'cover') return 'gw_photo_statement';
  if (hasComponent(slide, 'header') && !hasComponent(slide, 'body')) return 'gw_photo_rotated';
  return 'gw_photo_statement';
}

function layoutFamilyForVariant(variantId: string): string | undefined {
  if (variantId.startsWith('gw_photo_')) return 'photo';
  if (variantId.startsWith('gw_collage_')) return 'collage';
  if (variantId.startsWith('gw_poster_')) return 'poster';
  return undefined;
}

function visualLayerImageContextForSlide(slide: SduiSlide, prompt: string): string {
  const visualLayer = (['core_content', 'action_footer', 'top_meta'] as const)
    .flatMap((group) => slide.nested_groups[group] ?? [])
    .find(visualLayerNeedsGeneratedArtwork);
  const brief = visualLayer?.visual_brief?.trim();
  const treatment = visualLayer?.visual_treatment?.replace(/_/g, ' ');
  const compactPrompt = prompt.replace(/\s+/g, ' ').trim().slice(0, 180);
  const base =
    brief && brief.length > 0
      ? brief
      : `content visual matching the user's requested image style and topic: ${compactPrompt}`;
  return treatment ? `${base}. Visual treatment: ${treatment}` : base;
}

/**
 * Injects image_placeholder for slides with visual_layer components that need artwork.
 */
export function ensureImagePlaceholderForVisualLayers(
  prompt: string,
  slides: SduiSlide[],
): SduiSlide[] {
  const promptRequestsImages = promptExplicitlyRequestsImages(prompt);
  return slides.map((slide) => {
    if (hasImagePlaceholder(slide)) return slide;
    const components = (['core_content', 'action_footer', 'top_meta'] as const).flatMap(
      (group) => slide.nested_groups[group] ?? [],
    );
    const hasArtworkVisualLayer = components.some(visualLayerNeedsGeneratedArtwork);
    const slideRequestsImage =
      slide.image_requirement === 'required' || slide.image_requirement === 'optional';
    if (!hasArtworkVisualLayer || (!slideRequestsImage && !promptRequestsImages)) return slide;

    const imagePlaceholder: SduiComponent = {
      type: 'image_placeholder',
      requires_generation: true,
      image_object_context: visualLayerImageContextForSlide(slide, prompt) || '',
    };
    const layoutVariant = preferredImageLayoutVariant(slide);
    const layoutFamily = layoutFamilyForVariant(layoutVariant);
    const imageRequirement: ImageRequirement =
      slide.image_requirement === 'required' ? 'required' : 'optional';

    return {
      ...slide,
      container_layout: 'background_overlay',
      contentDirection: 'column',
      layout_variant_id: layoutVariant,
      ...(layoutFamily ? { layout_family: layoutFamily as any } : {}),
      layout_source:
        slide.layout_source && slide.layout_source !== 'ai_selected'
          ? slide.layout_source
          : 'worker_adjusted',
      image_requirement: imageRequirement,
      nested_groups: {
        ...slide.nested_groups,
        core_content: [...(slide.nested_groups.core_content ?? []), imagePlaceholder],
      },
    };
  });
}

/**
 * For visual-led decks, ensures minimum number of slides have image placeholders.
 */
export function ensureExplicitImageRequest(prompt: string, slides: SduiSlide[]): SduiSlide[] {
  const visualLayerNormalized = ensureImagePlaceholderForVisualLayers(prompt, slides);
  const visualLed = promptRequestsVisualLedDeck(prompt);
  if (!visualLed) return visualLayerNormalized;

  const minImageSlides =
    visualLayerNormalized.length >= 5 ? 3 : visualLayerNormalized.length >= 3 ? 2 : 1;
  const existingImageSlides = visualLayerNormalized.filter(hasImagePlaceholder).length;
  if (existingImageSlides >= minImageSlides) {
    return visualLayerNormalized.map((slide) =>
      hasImagePlaceholder(slide)
        ? {
            ...slide,
            image_requirement: 'required',
          }
        : slide,
    );
  }

  const preferredIndexes = [
    visualLayerNormalized.findIndex(
      (slide) => slide.slide_type === 'cover' && hasComponent(slide, 'header'),
    ),
    ...visualLayerNormalized
      .map((slide, index) => ({ slide, index }))
      .filter(
        ({ slide }) =>
          slide.slide_type === 'content' &&
          hasComponent(slide, 'header') &&
          hasComponent(slide, 'body'),
      )
      .map(({ index }) => index),
    ...visualLayerNormalized
      .map((slide, index) => ({ slide, index }))
      .filter(({ slide }) => slide.slide_type === 'content' && hasComponent(slide, 'checklist'))
      .map(({ index }) => index),
    ...visualLayerNormalized.map((_, index) => index),
  ].filter(
    (index, position, all): index is number => index >= 0 && all.indexOf(index) === position,
  );

  const indexesToImage = new Set<number>();
  for (const [index, slide] of visualLayerNormalized.entries()) {
    if (hasImagePlaceholder(slide)) indexesToImage.add(index);
  }
  for (const index of preferredIndexes) {
    if (indexesToImage.size >= minImageSlides) break;
    if (indexesToImage.has(index)) continue;

    const slide = visualLayerNormalized[index];
    if (!slide) continue;
    const { image_status: _imageStatus, ...slideWithoutImageStatus } = slide;
    const hasBody = hasComponent(slide, 'body');
    const hasChecklist = hasComponent(slide, 'checklist');
    const hasCta = hasComponent(slide, 'button_cta');
    const layoutVariant = preferredImageLayoutVariant(slide);
    const imagePlaceholder: SduiComponent = {
      type: 'image_placeholder',
      requires_generation: true,
      image_object_context: visualLayerImageContext(undefined, prompt) || '',
    };

    visualLayerNormalized[index] = {
      ...slideWithoutImageStatus,
      container_layout: 'background_overlay',
      contentDirection: 'column',
      layout_variant_id: layoutVariant,
      layout_family: layoutFamilyForVariant(layoutVariant) as any,
      layout_source: 'worker_adjusted',
      image_requirement: 'required',
      nested_groups: {
        ...slide.nested_groups,
        core_content: [...(slide.nested_groups.core_content ?? []), imagePlaceholder],
      },
    };
    indexesToImage.add(index);
  }

  return visualLayerNormalized;
}
