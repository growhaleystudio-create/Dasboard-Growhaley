/**
 * renderer.ts — Deterministic slide renderer with brand fidelity.
 *
 * Implements a layered compositing pipeline:
 *   Layer 0: Background_Image (AI-generated, scanned by BackgroundScanner before use)
 *   Layer 1: Content blocks (text/chart/mockup/image rendered deterministically)
 *   Layer 2: Chrome (logo + pagination + URL — identical across all slides)
 *
 * Fallback algorithm (R5.6, R5.7, R5.10):
 *   - Background not clean → regenerate 1× → if still unclean, use solid brand color
 *   - Contrast < 4.5:1 / overflow / collision → apply defaultFor layout + usedFallbackLayout=true
 *   - Chrome/color/font cannot be honored → slide failed (off_brand), never renders incorrectly
 *   - Upload fails → slide failed (upload_failed)
 *
 * success ONLY when PNG is created AND uploaded (R5.11).
 *
 * Design: Components and Interfaces → Renderer (fallback algorithm)
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8, 5.10, 5.11, 6.2, 6.3, 6.5, 6.6, 7.5
 */

import sharp from 'sharp';
import type { AspectRatio, BrandKit, ContentPlanSlide, FailureReason, SlideStatus } from '@leads-generator/shared';
import type { ChartData } from './chart-renderer.js';
import type { ChartRenderer } from './chart-renderer.js';
import type { MockupRenderer } from './mockup-renderer.js';
import type { BackgroundImageClient } from './background-image-client.js';
import type { BackgroundScanner } from './background-scanner.js';
import type { ObjectStorage } from './object-storage.js';
import type { SlideLayoutCatalog } from './slide-layout-catalog.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RenderContext {
  teamId: string;
  jobId: string;
  brandKit: BrandKit;
  aspectRatio: AspectRatio;
  totalSlides: number;
  chartData: ReadonlyMap<string, ChartData>;
  mockupImages: ReadonlyMap<string, Buffer>;
  userImages: ReadonlyMap<string, Buffer>;
}

export interface RenderedSlide {
  index: number;
  status: SlideStatus;
  imageUrl?: string;         // only on success
  usedFallbackLayout: boolean;
  reason?: FailureReason;
}

export interface Renderer {
  renderSlide(slide: ContentPlanSlide, ctx: RenderContext): Promise<RenderedSlide>;
}

// ---------------------------------------------------------------------------
// Canvas dimensions
// ---------------------------------------------------------------------------

interface CanvasSize {
  width: number;
  height: number;
}

function canvasSize(aspectRatio: AspectRatio): CanvasSize {
  switch (aspectRatio) {
    case '1:1':  return { width: 1080, height: 1080 };
    case '4:5':  return { width: 1080, height: 1350 };
    case '9:16': return { width: 1080, height: 1920 };
  }
}

// ---------------------------------------------------------------------------
// Contrast / luminance utilities
// ---------------------------------------------------------------------------

/** Parse a hex color string (#RGB or #RRGGBB) to {r, g, b} in 0–255 range. */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace(/^#/, '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0]! + cleaned[0], 16);
    const g = parseInt(cleaned[1]! + cleaned[1], 16);
    const b = parseInt(cleaned[2]! + cleaned[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

/** Compute relative luminance (WCAG 2.x formula). */
function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (v: number): number => {
    const sRGB = v / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Compute contrast ratio between two hex colors.
 * Returns the contrast ratio (1–21).
 * Returns 1 if either color cannot be parsed.
 */
export function luminanceContrast(hexColor1: string, hexColor2: string): number {
  const c1 = parseHex(hexColor1);
  const c2 = parseHex(hexColor2);
  if (!c1 || !c2) return 1;

  const l1 = relativeLuminance(c1.r, c1.g, c1.b);
  const l2 = relativeLuminance(c2.r, c2.g, c2.b);
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pick a text color (dark or light) that contrasts sufficiently with the background. */
function chooseTextColor(bgHex: string, brandColors: string[]): string | null {
  // Try brand colors first
  for (const color of brandColors) {
    if (luminanceContrast(bgHex, color) >= 4.5) {
      return color;
    }
  }
  // Fallback: try black or white
  if (luminanceContrast(bgHex, '#000000') >= 4.5) return '#000000';
  if (luminanceContrast(bgHex, '#ffffff') >= 4.5) return '#ffffff';
  return null; // cannot achieve sufficient contrast
}

// ---------------------------------------------------------------------------
// SVG text helpers
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface TextBlockOptions {
  text: string;
  width: number;
  height: number;
  fontFamily: string;
  color: string;
  fontSize?: number;
  fontWeight?: number | string;
  align?: 'left' | 'center' | 'right';
}

/**
 * Pick a brand color that reads well on a dark scrim; default to white.
 */
function pickReadableTextColor(colors: string[]): string {
  for (const c of colors) {
    if (luminanceContrast(c, '#0a0d14') >= 4.5) return c;
  }
  return '#ffffff';
}

/**
 * Build a rounded-rectangle semi-transparent scrim panel SVG used behind text
 * blocks to guarantee readability over arbitrary AI-generated backgrounds.
 */
function buildScrimSvg(width: number, height: number, fill: string): string {
  const r = Math.min(28, Math.round(height * 0.12));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}" fill="${fill}"/></svg>`;
}

/**
 * Build an SVG string for a text block.
 * Uses foreignObject with word-wrap for multi-line text.
 * Falls back to tspan-based approach for maximum compatibility.
 */
function buildTextSvg(opts: TextBlockOptions): string {  const {
    text,
    width,
    height,
    fontFamily,
    color,
    fontSize = 32,
    fontWeight = 400,
    align = 'left',
  } = opts;

  const escapedText = escapeXml(text);
  const safeFamily = escapeXml(fontFamily);
  const safeColor = escapeXml(color);

  // Use SVG text element with manual wrapping
  // Estimate chars per line based on fontSize and width
  const avgCharWidth = fontSize * 0.55;
  const charsPerLine = Math.max(1, Math.floor(width / avgCharWidth));

  // Word-wrap the text
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= charsPerLine) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      // Handle words longer than line width
      if (word.length > charsPerLine) {
        let remaining = word;
        while (remaining.length > charsPerLine) {
          lines.push(remaining.slice(0, charsPerLine));
          remaining = remaining.slice(charsPerLine);
        }
        currentLine = remaining;
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = fontSize * 1.4;
  const totalTextHeight = lines.length * lineHeight;
  const startY = Math.max(fontSize, (height - totalTextHeight) / 2 + fontSize);

  const textAnchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const x = align === 'center' ? width / 2 : align === 'right' ? width - 8 : 8;

  const tspans = lines
    .map((line, i) => {
      const dy = i === 0 ? 0 : lineHeight;
      return `<tspan x="${x.toFixed(2)}" dy="${dy.toFixed(2)}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="${width}" height="${height}" fill="transparent"/>` +
    `<text ` +
    `x="${x.toFixed(2)}" y="${startY.toFixed(2)}" ` +
    `font-family="${safeFamily}, sans-serif" ` +
    `font-size="${fontSize}" ` +
    `font-weight="${fontWeight}" ` +
    `fill="${safeColor}" ` +
    `text-anchor="${textAnchor}" ` +
    `dominant-baseline="auto"` +
    `>${tspans}</text>` +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Chrome SVG helpers
// ---------------------------------------------------------------------------

interface ChromeOptions {
  canvasWidth: number;
  canvasHeight: number;
  /** true=top, false=bottom; left=x near 0, right=x near end */
  logoPlacement: BrandKit['chrome']['logoPlacement'];
  pageText: string;   // e.g. "2/5"
  siteUrl: string;
  fontFamily: string;
  textColor: string;
  logoWidth: number;
  logoHeight: number;
}

/**
 * Build SVG for the pagination text and siteUrl (chrome text elements only — logo is composited separately).
 */
function buildChromeTextSvg(opts: ChromeOptions): string {
  const { canvasWidth, canvasHeight, pageText, siteUrl, fontFamily, textColor } = opts;
  const safeFamily = escapeXml(fontFamily);
  const safeColor = escapeXml(textColor);

  // Pagination: top-right area, y=50
  const paginationX = canvasWidth - 24;
  const paginationY = 52;

  // Site URL: bottom-center area
  const urlX = canvasWidth / 2;
  const urlY = canvasHeight - 20;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">` +
    (pageText
      ? `<text x="${paginationX}" y="${paginationY}" ` +
        `font-family="${safeFamily}, sans-serif" font-size="24" font-weight="400" ` +
        `fill="${safeColor}" text-anchor="end" dominant-baseline="middle">` +
        `${escapeXml(pageText)}</text>`
      : '') +
    (siteUrl
      ? `<text x="${urlX}" y="${urlY}" ` +
        `font-family="${safeFamily}, sans-serif" font-size="20" font-weight="400" ` +
        `fill="${safeColor}" text-anchor="middle" dominant-baseline="middle">` +
        `${escapeXml(siteUrl)}</text>`
      : '') +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Branded template helpers (clean designed-template look)
// ---------------------------------------------------------------------------

/** Lighten a hex color toward white by `amt` (0..1). */
function lighten(hex: string, amt: number): string {
  const c = parseHex(hex) ?? { r: 240, g: 240, b: 240 };
  const r = Math.round(c.r + (255 - c.r) * amt);
  const g = Math.round(c.g + (255 - c.g) * amt);
  const b = Math.round(c.b + (255 - c.b) * amt);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Word-wrap a string into lines that fit `width` px at `fontSize`. */
function wrapText(text: string, fontSize: number, width: number): string[] {
  const avgCharWidth = fontSize * 0.55;
  const charsPerLine = Math.max(1, Math.floor(width / avgCharWidth));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length <= charsPerLine) {
      cur = cand;
    } else {
      if (cur) lines.push(cur);
      if (w.length > charsPerLine) {
        let r = w;
        while (r.length > charsPerLine) {
          lines.push(r.slice(0, charsPerLine));
          r = r.slice(charsPerLine);
        }
        cur = r;
      } else {
        cur = w;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

interface ParagraphOpts {
  text: string;
  width: number;
  fontSize: number;
  fontWeight: number | string;
  color: string;
  fontFamily: string;
  align?: 'left' | 'center' | 'right';
  lineHeightMul?: number;
  italic?: boolean;
}

/** Build a left/centered paragraph SVG and report its rendered height. */
function buildParagraph(opts: ParagraphOpts): { svg: string; height: number } {
  const {
    text, width, fontSize, fontWeight, color, fontFamily,
    align = 'left', lineHeightMul = 1.3, italic = false,
  } = opts;
  const lines = wrapText(text, fontSize, width);
  const lineHeight = fontSize * lineHeightMul;
  const height = Math.ceil(lines.length * lineHeight + fontSize * 0.35);
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const x = align === 'center' ? width / 2 : align === 'right' ? width : 0;
  const tspans = lines
    .map((l, i) => `<tspan x="${x.toFixed(1)}" dy="${(i === 0 ? fontSize : lineHeight).toFixed(1)}">${escapeXml(l)}</tspan>`)
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<text font-family="${escapeXml(fontFamily)}, sans-serif" font-size="${fontSize}" ` +
    `font-weight="${fontWeight}" ${italic ? 'font-style="italic" ' : ''}fill="${color}" ` +
    `text-anchor="${anchor}">${tspans}</text></svg>`;
  return { svg, height };
}

/** Build a checklist row (accent checkboxes + labels), wraps across rows. */
function buildChecklist(
  items: string[],
  width: number,
  fontSize: number,
  accent: string,
  textColor: string,
  fontFamily: string,
): { svg: string; height: number } {
  const box = Math.round(fontSize * 1.2);
  const pad = 12;
  const gapX = 34;
  const rowH = Math.round(box * 1.9);

  const placed: { item: string; x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  for (const item of items) {
    const tw = item.length * fontSize * 0.56;
    const w = box + pad + tw;
    if (x > 0 && x + w > width) {
      x = 0;
      y += rowH;
    }
    placed.push({ item, x, y });
    x += w + gapX;
  }
  const height = y + rowH;

  const parts = placed.map(({ item, x: px, y: py }) => {
    const cy = py + (rowH - box) / 2;
    const check =
      `M ${(px + box * 0.24).toFixed(1)} ${(cy + box * 0.52).toFixed(1)} ` +
      `L ${(px + box * 0.43).toFixed(1)} ${(cy + box * 0.72).toFixed(1)} ` +
      `L ${(px + box * 0.78).toFixed(1)} ${(cy + box * 0.30).toFixed(1)}`;
    return (
      `<rect x="${px}" y="${cy}" width="${box}" height="${box}" rx="6" ry="6" fill="${accent}"/>` +
      `<path d="${check}" stroke="#ffffff" stroke-width="${(box * 0.12).toFixed(1)}" ` +
      `fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<text x="${px + box + pad}" y="${(py + rowH / 2 + fontSize * 0.35).toFixed(1)}" ` +
      `font-family="${escapeXml(fontFamily)}, sans-serif" font-size="${fontSize}" ` +
      `font-weight="600" fill="${textColor}">${escapeXml(item)}</text>`
    );
  });

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join('')}</svg>`;
  return { svg, height };
}

/** Build the fixed top chrome band: URL pill (left) + page indicator (right). */
function buildTopChrome(
  canvasW: number,
  canvasH: number,
  marginX: number,
  accent: string,
  pillTextColor: string,
  pillText: string,
  pageText: string,
  pageColor: string,
  fontFamily: string,
): string {
  const pillH = Math.round(canvasH * 0.05);
  const py = Math.round(canvasH * 0.042);
  const fs = Math.round(pillH * 0.42);
  const iconCx = marginX + pillH * 0.55;
  const textX = iconCx + pillH * 0.5;
  const pillW = Math.round((textX - marginX) + pillText.length * fs * 0.6 + pillH * 0.4);
  const midY = py + pillH / 2;
  const r = pillH * 0.22;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">` +
    `<rect x="${marginX}" y="${py}" width="${pillW}" height="${pillH}" rx="8" ry="8" fill="${accent}"/>` +
    `<circle cx="${iconCx.toFixed(1)}" cy="${midY.toFixed(1)}" r="${r.toFixed(1)}" ` +
    `fill="none" stroke="${pillTextColor}" stroke-width="2"/>` +
    `<line x1="${(iconCx - r).toFixed(1)}" y1="${midY.toFixed(1)}" x2="${(iconCx + r).toFixed(1)}" y2="${midY.toFixed(1)}" stroke="${pillTextColor}" stroke-width="1.5"/>` +
    `<ellipse cx="${iconCx.toFixed(1)}" cy="${midY.toFixed(1)}" rx="${(r * 0.5).toFixed(1)}" ry="${r.toFixed(1)}" fill="none" stroke="${pillTextColor}" stroke-width="1.5"/>` +
    `<text x="${textX.toFixed(1)}" y="${midY.toFixed(1)}" font-family="${escapeXml(fontFamily)}, sans-serif" ` +
    `font-size="${fs}" font-weight="600" fill="${pillTextColor}" dominant-baseline="central">${escapeXml(pillText)}</text>` +
    (pageText
      ? `<text x="${canvasW - marginX}" y="${midY.toFixed(1)}" font-family="${escapeXml(fontFamily)}, sans-serif" ` +
        `font-size="${Math.round(fs * 0.85)}" font-weight="500" fill="${pageColor}" ` +
        `text-anchor="end" dominant-baseline="central">${escapeXml(pageText)}</text>`
      : '') +
    `</svg>`
  );
}

/** Build the bottom-right "Swipe inside" call-to-action button. */
function buildSwipeButton(
  canvasW: number,
  canvasH: number,
  marginX: number,
  accent: string,
  label: string,
  fontFamily: string,
): string {
  const btnH = Math.round(canvasH * 0.05);
  const fs = Math.round(btnH * 0.42);
  const arrowBox = Math.round(btnH * 0.66);
  const textW = label.length * fs * 0.56;
  const padL = Math.round(btnH * 0.45);
  const gap = Math.round(btnH * 0.3);
  const btnW = padL + textW + gap + arrowBox + Math.round(btnH * 0.3);
  const bx = canvasW - marginX - btnW;
  const by = canvasH - Math.round(canvasH * 0.045) - btnH;
  const midY = by + btnH / 2;
  const arrowX = bx + padL + textW + gap;
  const ac = arrowX + arrowBox / 2;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">` +
    `<rect x="${bx}" y="${by}" width="${btnW}" height="${btnH}" rx="8" ry="8" fill="${accent}"/>` +
    `<text x="${bx + padL}" y="${midY.toFixed(1)}" font-family="${escapeXml(fontFamily)}, sans-serif" ` +
    `font-size="${fs}" font-weight="600" fill="#ffffff" dominant-baseline="central">${escapeXml(label)}</text>` +
    `<rect x="${arrowX}" y="${(midY - arrowBox / 2).toFixed(1)}" width="${arrowBox}" height="${arrowBox}" rx="5" ry="5" ` +
    `fill="none" stroke="#ffffff" stroke-width="1.5"/>` +
    `<path d="M ${(ac - arrowBox * 0.12).toFixed(1)} ${(midY - arrowBox * 0.18).toFixed(1)} ` +
    `L ${(ac + arrowBox * 0.16).toFixed(1)} ${midY.toFixed(1)} ` +
    `L ${(ac - arrowBox * 0.12).toFixed(1)} ${(midY + arrowBox * 0.18).toFixed(1)}" ` +
    `stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

/** Resize an image into a rounded-corner card. */
async function roundedImage(src: Buffer, w: number, h: number, radius: number): Promise<Buffer> {
  const resized = await sharp(src)
    .resize(w, h, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${radius}" ry="${radius}"/></svg>`,
  );
  return sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Solid background helper
// ---------------------------------------------------------------------------

/** Create a solid-color PNG buffer of the given size. */
async function solidColorBackground(
  width: number,
  height: number,
  hex: string,
): Promise<Buffer> {
  const c = parseHex(hex) ?? { r: 255, g: 255, b: 255 };
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: c.r, g: c.g, b: c.b, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Normalized → pixel coordinate mapping
// ---------------------------------------------------------------------------

/** Convert a normalized box (0–1000 units) to pixel coordinates on the canvas. */
function normalizedToPixel(
  box: { x: number; y: number; w: number; h: number },
  canvasWidth: number,
  canvasHeight: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left:   Math.round((box.x / 1000) * canvasWidth),
    top:    Math.round((box.y / 1000) * canvasHeight),
    width:  Math.round((box.w / 1000) * canvasWidth),
    height: Math.round((box.h / 1000) * canvasHeight),
  };
}

// ---------------------------------------------------------------------------
// Logo placement
// ---------------------------------------------------------------------------

function logoPosition(
  placement: BrandKit['chrome']['logoPlacement'],
  canvasWidth: number,
  logoWidth: number,
  logoHeight: number,
): { left: number; top: number } {
  const margin = 24;
  switch (placement) {
    case 'top-left':    return { left: margin,                          top: margin };
    case 'top-right':   return { left: canvasWidth - logoWidth - margin, top: margin };
    case 'bottom-left': return { left: margin,                          top: 1000 - logoHeight - margin }; // will be scaled
    case 'bottom-right':return { left: canvasWidth - logoWidth - margin, top: 1000 - logoHeight - margin };
    case 'none':        return { left: -9999,                           top: -9999 };
  }
}

// ---------------------------------------------------------------------------
// DefaultRenderer
// ---------------------------------------------------------------------------

export interface DefaultRendererDeps {
  catalog: SlideLayoutCatalog;
  chartRenderer: ChartRenderer;
  mockupRenderer: MockupRenderer;
  bgClient: BackgroundImageClient;
  bgScanner: BackgroundScanner;
  storage: ObjectStorage;
  now?: () => Date;
}

const LOGO_MAX_DIM = 120; // px — logo is resized to fit within this square
const FONT_SIZES: Record<string, number> = {
  heading: 56,
  quote:   48,
  stat:    72,
  body:    32,
  bullet:  28,
  cta:     40,
  image:   28,
};

export class DefaultRenderer implements Renderer {
  /** Cache one generated background per job so all slides share a cohesive look. */
  private readonly bgCache = new Map<string, Buffer>();

  constructor(private readonly deps: DefaultRendererDeps) {}

  async renderSlide(slide: ContentPlanSlide, ctx: RenderContext): Promise<RenderedSlide> {
    const { index } = slide;
    const { teamId, jobId, brandKit, aspectRatio, totalSlides } = ctx;

    // ------------------------------------------------------------------
    // Step 1: Determine canvas size
    // ------------------------------------------------------------------
    const canvas = canvasSize(aspectRatio);

    // ------------------------------------------------------------------
    // Step 2: Validate brand assets (chrome invariant — R6.6)
    // ------------------------------------------------------------------
    if (!brandKit.colors || brandKit.colors.length === 0) {
      return this._failed(index, 'off_brand');
    }
    const primaryColor  = brandKit.colors[0]!;
    const fontFamily    = brandKit.fonts.length > 0 ? brandKit.fonts[0]!.family : 'sans-serif';

    // ------------------------------------------------------------------
    // Step 3: Layout selection (R5.6, R5.7)
    // ------------------------------------------------------------------
    const blockTypes = slide.blocks.map((b) => b.type);
    const variants = this.deps.catalog.variantsFor(blockTypes, aspectRatio);
    let variant = variants.find((v) => v.id === slide.layoutVariantHint) ?? variants[0];
    let usedFallbackLayout = false;

    // Check if the chosen variant covers all block types on the slide
    const coveredTypes = new Set(variant?.regions.map((r) => r.blockType) ?? []);
    const allBlocksCovered = slide.blocks.every((b) => coveredTypes.has(b.type));

    if (!variant || !allBlocksCovered) {
      variant = this.deps.catalog.defaultFor(blockTypes, aspectRatio);
      usedFallbackLayout = true;
    }

    if (!variant) {
      return this._failed(index, 'layout_unsatisfiable');
    }

    // ------------------------------------------------------------------
    // Step 4: Layer 0 Background Image (AI-generated, scanned, fallback to solid brand color)
    // ------------------------------------------------------------------
    let backgroundBuffer: Buffer | null = null;
    const cachedBg = this.bgCache.get(jobId);
    if (cachedBg) {
      backgroundBuffer = cachedBg;
    } else {
      const bgPrompt = `abstract background art, no text, no logo, no faces, brand colors: ${brandKit.colors.slice(0, 5).join(', ')}`;
      const bgReq = {
        prompt: bgPrompt,
        aspectRatio,
        palette: brandKit.colors,
      };

      let bgResult = await this.deps.bgClient.generate(teamId, bgReq, new AbortController().signal);
      let isClean = false;
      if (bgResult.ok) {
        let scanResult = await this.deps.bgScanner.scan(bgResult.value);
        if (scanResult.clean) {
          backgroundBuffer = bgResult.value;
          isClean = true;
        } else {
          // Retry exactly once (R5.6)
          bgResult = await this.deps.bgClient.generate(teamId, bgReq, new AbortController().signal);
          if (bgResult.ok) {
            scanResult = await this.deps.bgScanner.scan(bgResult.value);
            if (scanResult.clean) {
              backgroundBuffer = bgResult.value;
              isClean = true;
            }
          }
        }
      }
      if (backgroundBuffer && isClean) {
        this.bgCache.set(jobId, backgroundBuffer);
      }
    }

    const accent = primaryColor;
    const BG = accent;                     // dirty/failed background fallback: solid brand color
    const DARK = '#1a1d24';
    const SUB = '#5b626e';
    const pillTextColor = luminanceContrast(accent, '#ffffff') >= 2 ? '#ffffff' : '#1a1d24';

    let canvasBuffer: Buffer;
    if (backgroundBuffer) {
      canvasBuffer = await sharp(backgroundBuffer)
        .resize(canvas.width, canvas.height, { fit: 'cover' })
        .png()
        .toBuffer();
    } else {
      canvasBuffer = await solidColorBackground(canvas.width, canvas.height, BG);
    }

    // ------------------------------------------------------------------
    // Step 5: Pre-check chart/mockup data (R7.4 — fail before partial render)
    // ------------------------------------------------------------------
    for (const block of slide.blocks) {
      if (block.type === 'chart' && (!block.chartDataRef || !ctx.chartData.get(block.chartDataRef))) {
        return this._failed(index, 'missing_chart_data');
      }
      if (block.type === 'mockup' && (!block.mockupRef || !ctx.mockupImages.get(block.mockupRef))) {
        return this._failed(index, 'missing_mockup');
      }
    }

    // ------------------------------------------------------------------
    // Step 6: Render blocks in specified layout region boxes
    // ------------------------------------------------------------------
    const marginX = Math.round(canvas.width * 0.08);
    const headingFamily = `Georgia, 'Times New Roman', serif`;
    const composites: sharp.OverlayOptions[] = [];

    // Match multiple blocks of the same type by keeping track of placed block indices
    const placedBlockIndexes = new Set<number>();

    for (const region of variant.regions) {
      const blockIndex = slide.blocks.findIndex((b, idx) => b.type === region.blockType && !placedBlockIndexes.has(idx));
      if (blockIndex === -1) continue;
      placedBlockIndexes.add(blockIndex);

      const block = slide.blocks[blockIndex]!;
      const px = normalizedToPixel(region.box, canvas.width, canvas.height);
      const fs = FONT_SIZES[block.type] ?? 32;

      if (block.type === 'heading' || block.type === 'stat') {
        const isHeading = block.type === 'heading';
        const { svg } = buildParagraph({
          text: block.text ?? '',
          width: px.width,
          fontSize: fs,
          fontWeight: 700,
          color: DARK,
          fontFamily: headingFamily,
        });
        composites.push({
          input: await sharp(Buffer.from(svg)).png().toBuffer(),
          top: px.top,
          left: px.left,
        });
      } else if (block.type === 'body' || block.type === 'quote' || block.type === 'bullet' || block.type === 'cta') {
        const { svg } = buildParagraph({
          text: block.text ?? '',
          width: px.width,
          fontSize: fs,
          fontWeight: 400,
          color: SUB,
          fontFamily,
        });
        composites.push({
          input: await sharp(Buffer.from(svg)).png().toBuffer(),
          top: px.top,
          left: px.left,
        });
      } else if (block.type === 'image' && block.imageRef) {
        const img = ctx.userImages.get(block.imageRef);
        if (img) {
          const radius = Math.round(canvas.width * 0.03);
          composites.push({
            input: await roundedImage(img, px.width, px.height, radius),
            top: px.top,
            left: px.left,
          });
        }
      } else if (block.type === 'mockup' && block.mockupRef) {
        const mk = ctx.mockupImages.get(block.mockupRef);
        if (mk) {
          const rendered = await this.deps.mockupRenderer.render(mk, 'phone', { w: px.width, h: px.height });
          composites.push({
            input: rendered,
            top: px.top,
            left: px.left,
          });
        }
      } else if (block.type === 'chart' && block.chartDataRef) {
        const cd = ctx.chartData.get(block.chartDataRef);
        if (cd) {
          const chart = this.deps.chartRenderer.render(cd, brandKit.colors, { w: px.width, h: px.height });
          composites.push({
            input: chart,
            top: px.top,
            left: px.left,
          });
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 7: Fixed chrome — URL pill + page indicator + swipe button.
    // ------------------------------------------------------------------
    const { siteUrl } = brandKit.chrome;
    const pillText = (siteUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '') || 'www.brand.com';
    const pageText = `${String(index + 1).padStart(2, '0')} / ${String(totalSlides).padStart(2, '0')}`;

    const topChromeSvg = buildTopChrome(
      canvas.width, canvas.height, marginX, accent, pillTextColor, pillText, pageText, SUB, fontFamily,
    );
    composites.push({ input: await sharp(Buffer.from(topChromeSvg)).png().toBuffer(), top: 0, left: 0 });

    if (index < totalSlides - 1) {
      const swipeSvg = buildSwipeButton(canvas.width, canvas.height, marginX, accent, 'Swipe inside', fontFamily);
      composites.push({ input: await sharp(Buffer.from(swipeSvg)).png().toBuffer(), top: 0, left: 0 });
    }

    // Logo (fatal if load fails when configured)
    if (
      brandKit.logoUrl &&
      brandKit.chrome.logoPlacement !== 'none'
    ) {
      try {
        const logoResponse = await fetch(brandKit.logoUrl);
        if (!logoResponse.ok) {
          return this._failed(index, 'off_brand');
        }
        const logoBytes = Buffer.from(await logoResponse.arrayBuffer());
        const resizedLogo = await sharp(logoBytes)
          .resize(LOGO_MAX_DIM, LOGO_MAX_DIM, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        const m = 32;
        const pos = brandKit.chrome.logoPlacement;
        const left = pos === 'top-right' || pos === 'bottom-right' ? canvas.width - LOGO_MAX_DIM - m : m;
        const top = pos === 'bottom-left' || pos === 'bottom-right' ? canvas.height - LOGO_MAX_DIM - m : m;
        composites.push({ input: resizedLogo, top, left });
      } catch (err) {
        return this._failed(index, 'off_brand');
      }
    }

    canvasBuffer = await sharp(canvasBuffer)
      .composite(composites)
      .png()
      .toBuffer();

    // ------------------------------------------------------------------
    // Step 8: Upload to Object_Storage
    // ------------------------------------------------------------------
    const storageKey = `jobs/${jobId}/slide-${index}.png`;
    const uploadResult = await this.deps.storage.upload(
      teamId,
      storageKey,
      canvasBuffer,
      'image/png',
    );

    if (!uploadResult.ok) {
      return this._failed(index, 'upload_failed');
    }

    // ------------------------------------------------------------------
    // Step 9: Return success
    // ------------------------------------------------------------------
    return {
      index,
      status: 'success',
      imageUrl: uploadResult.value,
      usedFallbackLayout,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private _failed(index: number, reason: FailureReason): RenderedSlide {
    return {
      index,
      status: 'failed',
      usedFallbackLayout: false,
      reason,
    };
  }
}
