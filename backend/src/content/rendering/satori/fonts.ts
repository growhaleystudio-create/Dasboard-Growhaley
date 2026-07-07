import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FontWeight } from 'satori';

export const FALLBACK_FAMILY = 'FallbackSans';
const FALLBACK_FONT_URL = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-400-normal.woff';
const FALLBACK_FONT_BOLD_URL = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-700-normal.woff';

/**
 * Growhaley brand fonts bundled in the repo (backend/assets/fonts) — the
 * display/body faces of the design system, always registered so templates
 * render on-brand without any brand-kit upload.
 */
export const GW_DISPLAY_FAMILY = 'New Title';
export const GW_BODY_FAMILY = 'Plus Jakarta Sans';
/**
 * Monochrome emoji fallback (Noto Emoji): brand fonts have no emoji glyphs,
 * so AI-written icons (feature_cards etc.) would render as tofu. Monochrome
 * glyphs inherit the text color — brand-safe by construction.
 */
export const EMOJI_FAMILY = 'Noto Emoji';

const BUNDLED_FONTS: { family: string; file: string; weight: FontWeight }[] = [
  { family: GW_DISPLAY_FAMILY, file: 'NewTitle-Extralight.ttf', weight: 200 },
  { family: GW_DISPLAY_FAMILY, file: 'NewTitle-Light.ttf', weight: 300 },
  { family: GW_DISPLAY_FAMILY, file: 'NewTitle-Regular.ttf', weight: 400 },
  { family: GW_DISPLAY_FAMILY, file: 'NewTitle-Medium.ttf', weight: 500 },
  { family: GW_DISPLAY_FAMILY, file: 'NewTitle-Bold.ttf', weight: 700 },
  { family: GW_BODY_FAMILY, file: 'PlusJakartaSans-Regular.ttf', weight: 400 },
  { family: GW_BODY_FAMILY, file: 'PlusJakartaSans-Medium.ttf', weight: 500 },
  { family: GW_BODY_FAMILY, file: 'PlusJakartaSans-Bold.ttf', weight: 700 },
  { family: EMOJI_FAMILY, file: 'NotoEmoji-Regular.woff', weight: 400 },
];

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
// dist/content/rendering/satori → backend root is 4 levels up.
const FONTS_DIR = path.resolve(moduleDir, '../../../../assets/fonts');

const fontCache = new Map<string, ArrayBuffer>();

async function readBundledFont(file: string): Promise<ArrayBuffer | null> {
  const key = `bundled:${file}`;
  const cached = fontCache.get(key);
  if (cached) return cached;
  try {
    const buf = await readFile(path.join(FONTS_DIR, file));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    fontCache.set(key, ab);
    return ab;
  } catch {
    return null;
  }
}

export interface SatoriFont {
  name: string;
  data: ArrayBuffer;
  weight: FontWeight;
  style: 'normal' | 'italic';
}

export interface LoadedFontSet {
  fonts: SatoriFont[];
  availableFamilies: Set<string>;
}

export interface BrandFontRef {
  family: string;
  url: string;
  weight?: number;
  style?: 'normal' | 'italic';
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function fontWeight(weight: number | undefined): FontWeight {
  const normalized = Math.round((weight ?? 400) / 100) * 100;
  const clamped = clamp(normalized, 100, 900);
  return clamped as FontWeight;
}

export function fam(family: string | undefined, available: Set<string>): string {
  return family && available.has(family) ? `${family}, ${FALLBACK_FAMILY}` : FALLBACK_FAMILY;
}

export async function fetchFont(url: string): Promise<ArrayBuffer | null> {
  const cached = fontCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    fontCache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

export async function loadFonts(brandFonts: BrandFontRef[]): Promise<LoadedFontSet> {
  const fonts: SatoriFont[] = [];
  const availableFamilies = new Set<string>();
  const pushed = new Set<string>();
  const pushFont = (font: SatoriFont): void => {
    const key = `${font.name}:${font.weight}:${font.style}:${font.data.byteLength}`;
    if (pushed.has(key)) return;
    pushed.add(key);
    fonts.push(font);
  };

  // Bundled Growhaley fonts first — always available.
  for (const bundled of BUNDLED_FONTS) {
    const data = await readBundledFont(bundled.file);
    if (data) {
      pushFont({ name: bundled.family, data, weight: bundled.weight, style: 'normal' });
      availableFamilies.add(bundled.family);
    } else {
      console.warn('[satori-renderer] Bundled font missing', { file: bundled.file });
    }
  }

  for (const bf of brandFonts) {
    if (!bf.url || !bf.family) continue;
    const data = await fetchFont(bf.url);
    if (data) {
      const style = bf.style ?? 'normal';
      const primaryWeight = fontWeight(bf.weight);
      pushFont({ name: bf.family, data, weight: primaryWeight, style });
      pushFont({ name: bf.family, data, weight: 400, style });
      pushFont({ name: bf.family, data, weight: 700, style });
      availableFamilies.add(bf.family);
    } else {
      console.warn('[satori-renderer] Brand font could not be loaded', { family: bf.family, url: bf.url });
    }
  }

  const fb = await fetchFont(FALLBACK_FONT_URL);
  if (fb) pushFont({ name: FALLBACK_FAMILY, data: fb, weight: 400, style: 'normal' });
  const fbBold = (await fetchFont(FALLBACK_FONT_BOLD_URL)) ?? fb;
  if (fbBold) pushFont({ name: FALLBACK_FAMILY, data: fbBold, weight: 700, style: 'normal' });
  return { fonts, availableFamilies };
}
