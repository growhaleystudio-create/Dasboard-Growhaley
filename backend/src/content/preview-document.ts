/**
 * preview-document.ts — builds a Growhaley SduiDocument (theme + spacing) for
 * rendering slides with the hardcoded brand look, no per-team Brand Kit.
 *
 * Single source shared by the dev QA harness and the /draft/preview route so
 * the preview a user sees is rendered with the exact same theme as the final
 * carousel.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AspectRatio, SduiComponent, SduiDocument, SduiSlide } from '@leads-generator/shared';
import { GW_PALETTE_HEX, GW_ACCENT_HEX } from '@leads-generator/shared';

import { GROWHALEY_BRAND_KIT } from './growhaley-brand.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
// dist/content → backend root is 2 levels up.
const PLACEHOLDER_PATH = path.resolve(moduleDir, '../../assets/logo/preview-placeholder.png');

let placeholderDataUri: string | null = null;
/** Neutral "photo goes here" placeholder as a data URI (lazy, cached). Lets
 *  photo/collage templates render their real layout in preview even though no
 *  image has been generated yet. */
export function previewPlaceholderDataUri(): string {
  if (placeholderDataUri !== null) return placeholderDataUri;
  try {
    placeholderDataUri = `data:image/png;base64,${readFileSync(PLACEHOLDER_PATH).toString('base64')}`;
  } catch {
    console.warn('[preview-document] placeholder missing at', PLACEHOLDER_PATH);
    placeholderDataUri = '';
  }
  return placeholderDataUri;
}

/**
 * Fill empty image_placeholder slots with the preview placeholder so the
 * template picker keeps the photo/collage layout (a slot with no imageUrl
 * gets downgraded to a poster template). Non-mutating.
 */
export function withPreviewPlaceholders(slide: SduiSlide): SduiSlide {
  const uri = previewPlaceholderDataUri();
  if (!uri) return slide;
  const fill = (comps: SduiComponent[] | undefined): SduiComponent[] | undefined =>
    comps?.map((c) =>
      c.type === 'image_placeholder' && !c.imageUrl ? { ...c, imageUrl: uri } : c,
    );
  return {
    ...slide,
    nested_groups: {
      top_meta: fill(slide.nested_groups.top_meta) ?? [],
      core_content: fill(slide.nested_groups.core_content) ?? [],
      action_footer: fill(slide.nested_groups.action_footer) ?? [],
    },
  };
}

export function buildGrowhaleyTheme(): SduiDocument['theme'] {
  return {
    logoUrl: GROWHALEY_BRAND_KIT.logoUrl,
    logoPlacement: GROWHALEY_BRAND_KIT.chrome.logoPlacement,
    logoSizePx: GROWHALEY_BRAND_KIT.chrome.logoSizePx,
    siteUrl: GROWHALEY_BRAND_KIT.chrome.siteUrl,
    pageNumberFormat: GROWHALEY_BRAND_KIT.chrome.pageNumberFormat,
    coverFontFamily: '',
    headerFontFamily: '',
    bodyFontFamily: '',
    baseBodySizePx: 30,
    typographyRoles: {},
    colors: {
      background: GW_PALETTE_HEX.cream,
      header: GW_PALETTE_HEX.ink,
      body: '#4a4a4d',
      highlight: GW_ACCENT_HEX.magenta,
      pagination: GW_PALETTE_HEX.ink,
      meta: GW_PALETTE_HEX.ink,
      accent: GW_PALETTE_HEX.blue,
      onAccent: '#ffffff',
    },
  };
}

export function buildGrowhaleyDocument(
  aspectRatio: AspectRatio,
  slides: SduiSlide[],
): SduiDocument {
  return {
    aspectRatio,
    theme: buildGrowhaleyTheme(),
    spacing: { canvas_padding: 78, macro_gap: 40, meso_gap: 22, micro_gap: 12 },
    slides,
  };
}
