import type { AspectRatio, LegacyLayoutVariantId, SduiSlide } from '@leads-generator/shared';

import { inferLayoutVariant } from '../../layout-migration.js';
import { find, findAll } from './accessors.js';

/**
 * Growhaley template set — single id space: planner catalog ids ARE renderer
 * template ids. No alias layer.
 */
const GROWHALEY_TEMPLATES: readonly LegacyLayoutVariantId[] = [
  'gw_poster_cover',
  'gw_poster_statement',
  'gw_poster_list',
  'gw_poster_stat',
  'gw_poster_quote',
  'gw_poster_cta',
  'gw_poster_cards',
  'gw_photo_rotated',
  'gw_photo_statement',
  'gw_collage_showcase',
];

export const ALL_TEMPLATES: readonly LegacyLayoutVariantId[] = GROWHALEY_TEMPLATES;
export const TEMPLATE_SET = new Set<LegacyLayoutVariantId>(ALL_TEMPLATES);

/**
 * When a text-only template was picked but the slide actually carries a
 * renderable image, upgrade to an image-capable template so the image is
 * never silently dropped.
 */
function imageCapableUpgrade(slide: SduiSlide): LegacyLayoutVariantId {
  return findAll(slide, 'image_placeholder').length >= 2
    ? 'gw_collage_showcase'
    : 'gw_photo_statement';
}

function hasComponent(slide: SduiSlide, type: string): boolean {
  return !!find(slide, type);
}

function isRendererTemplateId(id: string | undefined): id is LegacyLayoutVariantId {
  return !!id && TEMPLATE_SET.has(id as LegacyLayoutVariantId);
}

export function has(slide: SduiSlide, type: string): boolean {
  return hasComponent(slide, type);
}

function slideHasRenderableImage(slide: SduiSlide): boolean {
  // At render time only a resolved URL counts: a placeholder whose
  // generation failed (requires_generation but no imageUrl) has nothing to
  // paint — the photo templates would show an empty dark canvas.
  return findAll(slide, 'image_placeholder').some((component) => Boolean(component.imageUrl));
}

function isImageTemplate(templateId: LegacyLayoutVariantId): boolean {
  return (
    templateId === 'gw_photo_rotated' ||
    templateId === 'gw_photo_statement' ||
    templateId === 'gw_collage_showcase'
  );
}

function ensureImageCapableTemplate(
  slide: SduiSlide,
  templateId: LegacyLayoutVariantId | undefined,
): LegacyLayoutVariantId | undefined {
  if (!templateId) return templateId;
  // Upgrade: a text template carrying a real image must not drop it.
  if (slideHasRenderableImage(slide)) {
    return isImageTemplate(templateId) ? templateId : imageCapableUpgrade(slide);
  }
  // Downgrade: a photo/collage template with no actual image renders a big
  // empty canvas (and hides list/cards content) — fall back to the poster
  // template that matches the slide's content.
  if (isImageTemplate(templateId)) {
    return fallbackTemplateForSlide(slide);
  }
  return templateId;
}

export function resolveRendererTemplateId(
  slide: SduiSlide,
  aspectRatio: AspectRatio,
): LegacyLayoutVariantId | undefined {
  const requested = slide.layout_variant_id;
  if (typeof requested === 'string' && isRendererTemplateId(requested)) {
    return ensureImageCapableTemplate(slide, requested);
  }

  const inferred = inferLayoutVariant(slide, aspectRatio);
  if (isRendererTemplateId(inferred)) {
    return ensureImageCapableTemplate(slide, inferred);
  }
  return undefined;
}

function fallbackTemplateForSlide(slide: SduiSlide): LegacyLayoutVariantId {
  const hasImg = slideHasRenderableImage(slide);
  const hasCl = hasComponent(slide, 'checklist') || hasComponent(slide, 'numbered_list');
  const hasCta = hasComponent(slide, 'button_cta');
  const hasStat = hasComponent(slide, 'stat_block') || hasComponent(slide, 'stat_row');

  if (hasImg) return imageCapableUpgrade(slide);
  if (slide.slide_type === 'cover') return 'gw_poster_cover';
  if (hasComponent(slide, 'feature_cards') || hasComponent(slide, 'comparison'))
    return 'gw_poster_cards';
  if (hasComponent(slide, 'quote')) return 'gw_poster_quote';
  if (hasStat) return 'gw_poster_stat';
  if (hasCl) return 'gw_poster_list';
  if (hasCta) return 'gw_poster_cta';
  return 'gw_poster_statement';
}

export function pickTemplate(slide: SduiSlide, aspectRatio: AspectRatio): LegacyLayoutVariantId {
  return resolveRendererTemplateId(slide, aspectRatio) ?? fallbackTemplateForSlide(slide);
}
