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
  GwComposition,
} from '@leads-generator/shared';
import {
  GW_ACCENT_CHOICES,
  GW_BLOB_POSITIONS,
  GW_COLLAGE_SCATTERS,
  GW_HEADER_COMPOSITIONS,
  GW_ORNAMENT_LEVELS,
  GW_PALETTE_CHOICES,
} from '@leads-generator/shared';
import { sanitizeComponent } from './component-sanitizer.js';
import { getLayoutVariantSet } from '../layout/layout-catalog.js';
import { applySduiTextGuardrails } from '../../sdui-text-guardrails.js';
import { layoutFamilyForVariant } from '../../layout-migration.js';


const LAYOUT_VARIANT_SET = getLayoutVariantSet();

/**
 * Unknown/legacy layout ids (pre-Growhaley catalogs) normalize to undefined —
 * the worker's template picker then chooses a gw_* fallback by content.
 */
function normalizeLayoutVariantId(layoutVariantId: unknown): SduiSlide['layout_variant_id'] | undefined {
  if (typeof layoutVariantId !== 'string') return undefined;
  if (LAYOUT_VARIANT_SET.has(layoutVariantId)) {
    return layoutVariantId as SduiSlide['layout_variant_id'];
  }
  return undefined;
}

/**
 * Whitelists the AI-provided composition object: every field must be one of
 * the design-system enum values, anything else is dropped. Cross-field brand
 * rules (bg/accent contrast) are enforced later by the renderer.
 */
function sanitizeComposition(raw: unknown): GwComposition | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : undefined;

  const palette = pick(r.palette, GW_PALETTE_CHOICES);
  const accent = pick(r.accent, GW_ACCENT_CHOICES);
  const headerComposition = pick(r.headerComposition, GW_HEADER_COMPOSITIONS);
  const blob = pick(r.blob, GW_BLOB_POSITIONS);
  const ornaments = pick(r.ornaments, GW_ORNAMENT_LEVELS);
  const scatter = pick(r.scatter, GW_COLLAGE_SCATTERS);

  const composition: GwComposition = {
    ...(palette ? { palette } : {}),
    ...(accent ? { accent } : {}),
    ...(headerComposition ? { headerComposition } : {}),
    ...(blob ? { blob } : {}),
    ...(ornaments ? { ornaments } : {}),
    ...(scatter ? { scatter } : {}),
  };
  return Object.keys(composition).length > 0 ? composition : undefined;
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
    let layoutVariant = normalizeLayoutVariantId(r.layout_variant_id);
    const nestedGroups = {
      top_meta: mapGroup('top_meta'),
      core_content: mapGroup('core_content'),
      action_footer: mapGroup('action_footer'),
    };

    // button_cta is reserved for the closing slide: the chrome already draws
    // an automatic "Swipe" button on every non-last slide, and a stray CTA on
    // the cover forces the worker to swap it off gw_poster_cover. Drop CTAs
    // from non-last slides regardless of what the LLM returned.
    const isLastSlide = i === rawSlides.length - 1;
    if (!isLastSlide) {
      (['top_meta', 'core_content', 'action_footer'] as const).forEach((group) => {
        nestedGroups[group] = nestedGroups[group].filter((c) => c.type !== 'button_cta');
      });
      if (layoutVariant === 'gw_poster_cta') layoutVariant = undefined; // re-pick by content
    }
    const layoutFamily = layoutFamilyForVariant(layoutVariant);
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
      ...(() => {
        const composition = sanitizeComposition(r.composition);
        return composition ? { composition } : {};
      })(),
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
