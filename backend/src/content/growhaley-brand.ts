/**
 * growhaley-brand.ts — Hardcoded brand configuration for the (single-tenant)
 * Growhaley content generator.
 *
 * Replaces the old per-team Brand Kit. Only `colors` and `chrome` are
 * load-bearing today:
 *   - colors: sent to the AI image generator as palette guidance
 *     (workers/pipeline/image-generation-handler.ts).
 *   - chrome: logo/placement/size, site URL, page number format
 *     (rendering/satori/chrome.ts).
 * `fonts`/`typography` are intentionally omitted — the renderer already
 * falls back to the bundled New Title / Plus Jakarta Sans faces
 * (rendering/satori/fonts.ts) and per-slide composition palette
 * (rendering/satori/templates/growhaley.ts) regardless of these fields.
 *
 * The logo is bundled locally (assets/logo/growhaley-logo*.png, rasterized
 * from the source SVG) and inlined as a data: URI — no network fetch, no
 * Object Storage. chrome.ts accepts data: URIs directly (see logoPill()).
 * Two color variants are exported (blue/white) — satori-renderer.ts picks
 * the contrast-safe one per slide based on the same background logic that
 * already drives chrome/tag text color.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrandKit } from '@leads-generator/shared';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
// dist/content → backend root is 2 levels up.
const LOGO_PATH = path.resolve(moduleDir, '../../assets/logo/growhaley-logo.png');
const LOGO_WHITE_PATH = path.resolve(moduleDir, '../../assets/logo/growhaley-logo-white.png');

function loadDataUri(filePath: string): string {
  try {
    const bytes = readFileSync(filePath);
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    console.warn('[growhaley-brand] Bundled logo missing at', filePath);
    return '';
  }
}

/** Blue-fill logo — legible on light (lime/cream) backgrounds. */
export const GROWHALEY_LOGO_BLUE = loadDataUri(LOGO_PATH);
/** White-fill logo — legible on dark/saturated (blue/ink/photo) backgrounds. */
export const GROWHALEY_LOGO_WHITE = loadDataUri(LOGO_WHITE_PATH);

export const GROWHALEY_BRAND_KIT: BrandKit = {
  id: 'growhaley',
  teamId: 'growhaley',
  logoUrl: GROWHALEY_LOGO_BLUE,
  colors: ['#e8ff03', '#177db5', '#232326', '#fff7e8', '#da457f'],
  fonts: [],
  chrome: {
    logoPlacement: 'top-left',
    logoSizePx: 48,
    pageNumberFormat: '{current}/{total}',
    siteUrl: 'growhaley.com',
  },
  updatedAt: new Date(0),
};
