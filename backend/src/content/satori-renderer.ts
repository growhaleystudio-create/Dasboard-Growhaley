/**
 * satori-renderer.ts — fixed-template "Worker" engine for the SDUI carousel.
 *
 * Layout is NOT freely controlled by the AI. Instead we provide 15 hand-tuned
 * templates (spacing, sizes, image areas are designed once, here). The AI only
 * picks a `layout_variant_id` and fills text/image slots. This makes output
 * consistent and predictable.
 *
 * Brand fonts/colors/chrome are locked via the Brand Kit theme.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type {
  AspectRatio,
  LayoutVariantId,
  SduiComponent,
  SduiDocument,
  SduiSlide,
} from '@leads-generator/shared';

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

function canvasSize(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '1:1': return { width: 1080, height: 1080 };
    case '4:5': return { width: 1080, height: 1350 };
    case '9:16': return { width: 1080, height: 1920 };
  }
}

// ---------------------------------------------------------------------------
// Element helper (JSX-less Satori nodes)
// ---------------------------------------------------------------------------

type Style = Record<string, unknown>;
interface Node {
  type: string;
  props: { style?: Style; children?: unknown; [k: string]: unknown };
}
function el(type: string, style: Style, children?: unknown): Node {
  return { type, props: { style, ...(children !== undefined ? { children } : {}) } };
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const fontCache = new Map<string, ArrayBuffer>();
const FALLBACK_FAMILY = 'FallbackSans';
const FALLBACK_FONT_URL = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-400-normal.woff';
const FALLBACK_FONT_BOLD_URL = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-700-normal.woff';

async function fetchFont(url: string): Promise<ArrayBuffer | null> {
  const cached = fontCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    fontCache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

interface SatoriFont { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal'; }
export interface BrandFontRef { family: string; url: string; }

async function loadFonts(brandFonts: BrandFontRef[]): Promise<SatoriFont[]> {
  const fonts: SatoriFont[] = [];
  for (const bf of brandFonts) {
    if (!bf.url || !bf.family) continue;
    const data = await fetchFont(bf.url);
    if (data) {
      fonts.push({ name: bf.family, data, weight: 400, style: 'normal' });
      fonts.push({ name: bf.family, data, weight: 700, style: 'normal' });
    }
  }
  const fb = await fetchFont(FALLBACK_FONT_URL);
  if (fb) fonts.push({ name: FALLBACK_FAMILY, data: fb, weight: 400, style: 'normal' });
  const fbBold = (await fetchFont(FALLBACK_FONT_BOLD_URL)) ?? fb;
  if (fbBold) fonts.push({ name: FALLBACK_FAMILY, data: fbBold, weight: 700, style: 'normal' });
  return fonts;
}

function fam(family: string | undefined, available: Set<string>): string {
  return family && available.has(family) ? `${family}, ${FALLBACK_FAMILY}` : FALLBACK_FAMILY;
}

// ---------------------------------------------------------------------------
// Rich text (per-word highlight)
// ---------------------------------------------------------------------------

interface RichOpts {
  fontFamily: string; fontSize: number; fontWeight: number;
  color: string; highlightColor: string; lineHeight: number;
  align: 'left' | 'center' | 'right'; letterSpacing?: number;
}
function normWord(w: string): string { return w.toLowerCase().replace(/[.,!?;:"'()]/g, ''); }
function highlightIdx(words: string[], highlight: string | undefined): Set<number> {
  const set = new Set<number>();
  if (!highlight || !highlight.trim()) return set;
  const hl = highlight.trim().split(/\s+/).map(normWord).filter(Boolean);
  if (!hl.length) return set;
  const norm = words.map(normWord);
  for (let i = 0; i + hl.length <= words.length; i++) {
    let match = true;
    for (let j = 0; j < hl.length; j++) if (!norm[i + j] || !norm[i + j]!.includes(hl[j]!)) { match = false; break; }
    if (match) { for (let j = 0; j < hl.length; j++) set.add(i + j); break; }
  }
  return set;
}
function richText(text: string, highlight: string | undefined, o: RichOpts): Node {
  const words = text.split(/\s+/).filter(Boolean);
  const hlSet = highlightIdx(words, highlight);
  const gap = Math.round(o.fontSize * 0.26);
  const justify = o.align === 'center' ? 'center' : o.align === 'right' ? 'flex-end' : 'flex-start';
  const children = words.map((w, i) =>
    el('div', {
      display: 'flex',
      fontFamily: o.fontFamily,
      fontSize: `${o.fontSize}px`,
      fontWeight: o.fontWeight,
      lineHeight: o.lineHeight,
      color: hlSet.has(i) ? o.highlightColor : o.color,
      marginRight: `${gap}px`,
      ...(o.letterSpacing ? { letterSpacing: `${o.letterSpacing}px` } : {}),
    }, w),
  );
  return el('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: justify }, children);
}

// ---------------------------------------------------------------------------
// Content accessors
// ---------------------------------------------------------------------------

function find(slide: SduiSlide, type: string): SduiComponent | undefined {
  for (const g of ['core_content', 'action_footer', 'top_meta'] as const) {
    const c = (slide.nested_groups[g] ?? []).find((x) => x.type === type);
    if (c) return c;
  }
  return undefined;
}
function tagText(slide: SduiSlide): string {
  const t = find(slide, 'tag');
  return (t?.text ?? '').toUpperCase();
}

// ---------------------------------------------------------------------------
// Helpers: clamp + auto-fit header size by length
// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)); }
function fitTitle(base: number, text: string): number {
  const len = text.trim().length;
  if (len > 72) return Math.round(base * 0.72);
  if (len > 56) return Math.round(base * 0.82);
  if (len > 44) return Math.round(base * 0.9);
  return base;
}

function componentText(slide: SduiSlide, type: string): string {
  const component = find(slide, type);
  if (type === 'button_cta') return component?.label ?? '';
  return component?.text ?? '';
}

function checklistItems(slide: SduiSlide): string[] {
  return find(slide, 'checklist')?.items ?? [];
}

function estimatedLines(text: string, fontSize: number, width: number): number {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 0;
  const charsPerLine = Math.max(8, Math.floor(width / (fontSize * 0.52)));
  return Math.max(1, Math.ceil(clean.length / charsPerLine));
}

function contentWidthForTemplate(templateId: LayoutVariantId, tk: Tokens): number {
  const full = tk.W - tk.pad * 2;
  if (
    templateId === 'split_text_left_image_right' ||
    templateId === 'split_image_left_text_right' ||
    templateId === 'split_header_body_cta' ||
    templateId === 'split_checklist_image' ||
    templateId === 'split_image_checklist' ||
    templateId === 'numbered_with_image' ||
    templateId === 'split_stat_image'
  ) {
    return Math.max(260, Math.round((full - tk.gMacro) * 0.55));
  }
  if (templateId === 'quote_focus' || templateId === 'quote_with_image') {
    return Math.max(320, Math.round(full * 0.72));
  }
  if (templateId === 'cover_with_cta' || templateId === 'text_centered' || templateId === 'cta_centered') {
    return Math.max(320, Math.round(full * 0.84));
  }
  return full;
}

function contentHeightForTemplate(templateId: LayoutVariantId, tk: Tokens): number {
  const chromeReserve = Math.round(tk.small * 4.7);
  let height = tk.H - tk.pad * 2 - chromeReserve - tk.gMacro * 2;
  if (
    templateId === 'image_top_text_bottom' ||
    templateId === 'text_top_image_bottom' ||
    templateId === 'image_top_checklist_bottom'
  ) {
    height -= Math.round((tk.H - tk.pad * 2) * 0.46) + tk.gMacro;
  }
  if (templateId === 'image_full_caption') {
    height -= Math.round((tk.H - tk.pad * 2) * 0.72) + tk.gMeso;
  }
  if (templateId === 'quote_with_image') {
    height -= Math.round((tk.H - tk.pad * 2) * 0.30) + tk.gMeso;
  }
  return Math.max(220, height);
}

function estimateTextHeight(slide: SduiSlide, templateId: LayoutVariantId, tk: Tokens, scale: number): number {
  const width = contentWidthForTemplate(templateId, tk);
  const headerText = componentText(slide, 'header') || componentText(slide, 'quote');
  const bodyText = componentText(slide, 'body');
  const ctaText = componentText(slide, 'button_cta');
  const items = checklistItems(slide);

  const titleBase =
    slide.slide_type === 'cover' || templateId.startsWith('cover')
      ? tk.titleXL
      : templateId === 'big_statement'
        ? Math.round(tk.titleXL * 1.05)
        : tk.titleL;
  const titleSize = fitTitle(titleBase, headerText) * scale;
  const bodySize = tk.body * scale;
  const itemSize = clamp(Math.round(tk.body * 0.95 * scale), 15, 32);
  const gap = tk.gMeso * scale;

  let height = 0;
  if (headerText) height += estimatedLines(headerText, titleSize, width) * titleSize * 1.12;
  if (bodyText) height += estimatedLines(bodyText, bodySize, width) * bodySize * 1.45;
  if (items.length > 0) {
    height += items.reduce((sum, item) =>
      sum + Math.max(itemSize * 1.9, estimatedLines(item, itemSize, width - itemSize * 2.1) * itemSize * 1.35), 0);
  }
  if (ctaText) height += bodySize * 2.6;

  const blockCount = [headerText, bodyText, ctaText, items.length > 0 ? 'items' : ''].filter(Boolean).length;
  return height + Math.max(0, blockCount - 1) * gap;
}

function fitContentTokens(slide: SduiSlide, templateId: LayoutVariantId, tk: Tokens): Tokens {
  const availableHeight = contentHeightForTemplate(templateId, tk);
  const estimated = estimateTextHeight(slide, templateId, tk, 1);
  if (estimated <= availableHeight) return tk;

  const minScale = templateId.includes('image') || templateId.includes('split') ? 0.68 : 0.72;
  const scale = clamp(availableHeight / estimated, minScale, 1);
  if (scale >= 0.98) return tk;

  return {
    ...tk,
    gMacro: Math.round(tk.gMacro * clamp(scale + 0.08, 0.75, 1)),
    gMeso: Math.round(tk.gMeso * clamp(scale + 0.06, 0.72, 1)),
    gMicro: Math.round(tk.gMicro * clamp(scale + 0.05, 0.72, 1)),
    titleXL: Math.round(tk.titleXL * scale),
    titleL: Math.round(tk.titleL * scale),
    titleM: Math.round(tk.titleM * scale),
    body: Math.round(tk.body * scale),
    huge: Math.round(tk.huge * scale),
  };
}

function hasStatSignalText(text: string): boolean {
  const tokens = text.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
  const statWords = new Set(['rp', 'juta', 'ribu', 'miliar', 'kali', 'persen', 'score', 'skor', 'rate', 'rasio', 'data', 'angka', 'metrik', 'statistik']);
  return tokens.some((token) =>
    /\d/.test(token) ||
    token.includes('%') ||
    /^\d+x$/.test(token) ||
    statWords.has(token)
  );
}

// ---------------------------------------------------------------------------
// Design tokens (per slide) + chrome
// ---------------------------------------------------------------------------

interface Tokens {
  W: number; H: number; pad: number; radius: number;
  gMacro: number; gMeso: number; gMicro: number;
  coverFam: string; headerFam: string; bodyFam: string;
  titleXL: number; titleL: number; titleM: number; body: number; small: number; huge: number;
  c: SduiDocument['theme']['colors'];
}

function makeTokens(slide: SduiSlide, doc: SduiDocument, dims: { width: number; height: number }, available: Set<string>): Tokens {
  const W = dims.width, H = dims.height;
  const t = doc.theme;
  return {
    W, H,
    pad: Math.round(W * 0.072),
    radius: Math.round(W * 0.03),
    gMacro: Math.round(W * 0.045),
    gMeso: Math.round(W * 0.022),
    gMicro: Math.round(W * 0.012),
    coverFam: fam(t.coverFontFamily || t.headerFontFamily, available),
    headerFam: fam(t.headerFontFamily, available),
    bodyFam: fam(t.bodyFontFamily, available),
    titleXL: clamp(Math.round(t.coverSizePx ?? W * 0.085), 40, 120),
    titleL: clamp(Math.round(t.headerSizePx ?? W * 0.06), 30, 84),
    titleM: clamp(Math.round((t.headerSizePx ?? W * 0.06) * 0.82), 26, 64),
    body: clamp(Math.round(t.bodySizePx ?? W * 0.032), 16, 40),
    small: Math.round(W * 0.024),
    huge: Math.round(W * 0.2),
    c: t.colors,
  };
}

function urlPill(tk: Tokens, doc: SduiDocument): Node {
  const fs = tk.small;
  const text = (doc.theme.siteUrl || 'www.brand.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return el('div', {
    display: 'flex', alignItems: 'center', gap: `${Math.round(fs * 0.4)}px`,
    backgroundColor: tk.c.accent, color: tk.c.onAccent, borderRadius: '8px',
    padding: `${Math.round(fs * 0.5)}px ${Math.round(fs * 0.75)}px`,
    fontSize: `${fs}px`, fontWeight: 700, fontFamily: FALLBACK_FAMILY,
  }, [
    el('div', { display: 'flex', width: `${fs}px`, height: `${fs}px`, borderRadius: '50%', border: `2px solid ${tk.c.onAccent}` }),
    el('div', { display: 'flex' }, text),
  ]);
}

/** Render brand logo if available, otherwise fall back to URL pill. */
async function logoPill(tk: Tokens, doc: SduiDocument): Promise<Node> {
  const logoUrl = doc.theme.logoUrl;
  const placement = doc.theme.logoPlacement ?? 'top-left';
  if (placement === 'none' || !logoUrl || !logoUrl.startsWith('http')) {
    return urlPill(tk, doc);
  }
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return urlPill(tk, doc);
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    const ct = res.headers.get('content-type') ?? 'image/png';
    const logoH = Math.round(tk.small * 1.8);
    // Satori inlines images via data URI
    const imgNode = el('img', { height: `${logoH}px`, objectFit: 'contain', maxWidth: `${Math.round(tk.W * 0.35)}px` });
    (imgNode.props as Record<string, unknown>).src = `data:${ct};base64,${b64}`;
    return el('div', { display: 'flex', alignItems: 'center' }, [imgNode]);
  } catch {
    return urlPill(tk, doc);
  }
}

async function topChrome(slide: SduiSlide, tk: Tokens, doc: SduiDocument): Promise<Node> {
  const tag = tagText(slide);
  const left = await logoPill(tk, doc);
  return el('div', {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexGrow: 0, flexShrink: 0,
  }, [
    left,
    tag
      ? el('div', { display: 'flex', color: tk.c.meta, fontSize: `${tk.small}px`, fontWeight: 700, fontFamily: FALLBACK_FAMILY, letterSpacing: '1px', maxWidth: '45%', justifyContent: 'flex-end' }, tag)
      : el('div', { display: 'flex' }),
  ]);
}

function swipeButton(tk: Tokens): Node {
  const fs = tk.small;
  const arrow = Math.round(fs * 1.4);
  return el('div', {
    display: 'flex', alignItems: 'center', gap: `${Math.round(fs * 0.5)}px`,
    backgroundColor: tk.c.accent, color: tk.c.onAccent, borderRadius: '8px',
    padding: `${Math.round(fs * 0.5)}px ${Math.round(fs * 0.65)}px`,
    fontSize: `${fs}px`, fontWeight: 700, fontFamily: FALLBACK_FAMILY,
  }, [
    el('div', { display: 'flex' }, 'Swipe inside'),
    el('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: `${arrow}px`, height: `${arrow}px`, border: `1.5px solid ${tk.c.onAccent}`, borderRadius: '5px',
      fontSize: `${Math.round(arrow * 0.7)}px`,
    }, '›'),
  ]);
}

function bottomChrome(slide: SduiSlide, tk: Tokens, doc: SduiDocument, isLast: boolean): Node {
  return el('div', {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexGrow: 0, flexShrink: 0,
  }, [
    el('div', { display: 'flex', color: tk.c.pagination, fontSize: `${tk.small}px`, fontWeight: 700, fontFamily: FALLBACK_FAMILY, letterSpacing: '1px' },
      `${String(slide.slide_number).padStart(2, '0')} / ${String(doc.slides.length).padStart(2, '0')}`),
    isLast ? el('div', { display: 'flex' }) : swipeButton(tk),
  ]);
}

// ---------------------------------------------------------------------------
// Reusable content blocks
// ---------------------------------------------------------------------------

function titleNode(slide: SduiSlide, tk: Tokens, size: number, family: string, align: 'left' | 'center' | 'right'): Node | null {
  const h = find(slide, 'header') ?? find(slide, 'quote');
  if (!h?.text) return null;
  return richText(h.text, h.highlight, {
    fontFamily: family, fontSize: fitTitle(size, h.text), fontWeight: 700,
    color: tk.c.header, highlightColor: tk.c.highlight, lineHeight: 1.07, align, letterSpacing: 0,
  });
}
function bodyNode(slide: SduiSlide, tk: Tokens, align: 'left' | 'center' | 'right'): Node | null {
  const b = find(slide, 'body');
  if (!b?.text) return null;
  return richText(b.text, b.highlight, {
    fontFamily: tk.bodyFam, fontSize: tk.body, fontWeight: 400,
    color: tk.c.body, highlightColor: tk.c.highlight, lineHeight: 1.4, align,
  });
}

function pxNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const match = value.match(/^(\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : undefined;
}

function squareImageSide(tk: Tokens, style: Style): number {
  const availableW = Math.max(120, tk.W - tk.pad * 2);
  const availableH = Math.max(120, tk.H - tk.pad * 2);
  const widthPx = style.width === '100%' ? availableW : pxNumber(style.width);
  const heightPx = pxNumber(style.height);
  const fallback = Math.round(Math.min(availableW * 0.45, availableH * 0.62));
  const side = Math.min(widthPx ?? fallback, heightPx ?? fallback);
  return Math.max(120, Math.round(side));
}

async function roundedImage(comp: SduiComponent | undefined, tk: Tokens, style: Style): Promise<Node> {
  const side = squareImageSide(tk, style);
  const imageBoxStyle: Style = {
    width: `${side}px`,
    height: `${side}px`,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: `${tk.radius}px`,
    display: 'flex',
    backgroundColor: 'rgba(0,0,0,0)',
  };

  const imageBox = comp?.imageUrl
    ? el('div', imageBoxStyle, [
        el('img', { width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center' }),
      ])
    : el('div', imageBoxStyle);

  if (comp?.imageUrl) {
    (((imageBox.props.children as Node[])[0]!).props as Record<string, unknown>).src = comp.imageUrl;
  }

  return el('div', {
    ...style,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0)',
  }, [imageBox]);
}

function checklistNode(slide: SduiSlide, tk: Tokens, numbered: boolean): Node {
  const c = find(slide, 'checklist');
  const items = (c?.items ?? []).slice(0, 6);
  const fs = clamp(Math.round(tk.body * 0.95), 18, 32);
  const box = Math.round(fs * 1.5);
  return el('div', { display: 'flex', flexDirection: 'column', gap: `${tk.gMeso}px`, width: '100%' },
    items.map((item, i) =>
      el('div', { display: 'flex', alignItems: 'center', gap: `${Math.round(fs * 0.55)}px` }, [
        el('div', {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: `${box}px`, height: `${box}px`, flexShrink: 0,
          backgroundColor: tk.c.accent, color: tk.c.onAccent, borderRadius: numbered ? '50%' : '8px',
          fontSize: `${Math.round(box * (numbered ? 0.5 : 0.6))}px`, fontWeight: 700, fontFamily: FALLBACK_FAMILY,
        }, numbered ? String(i + 1) : '✓'),
        el('div', { display: 'flex', flexShrink: 1, color: tk.c.header, fontSize: `${fs}px`, fontWeight: 600, fontFamily: tk.bodyFam, lineHeight: 1.3 }, item),
      ]),
    ),
  );
}

function ctaButton(slide: SduiSlide, tk: Tokens): Node {
  const c = find(slide, 'button_cta');
  const label = c?.label ?? 'Get Started';
  return el('div', {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: tk.c.accent, color: tk.c.onAccent, borderRadius: '12px',
    padding: `${Math.round(tk.body * 0.8)}px ${Math.round(tk.body * 1.5)}px`,
    fontSize: `${Math.round(tk.body * 0.95)}px`, fontWeight: 700, fontFamily: tk.bodyFam,
  }, label);
}

// ---------------------------------------------------------------------------
// NEW 15 MIXED TEMPLATES (16-30)
// ---------------------------------------------------------------------------

async function tplSplitChecklistImage(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const img = find(slide, 'image_placeholder');
  const t = titleNode(slide, tk, tk.titleL, tk.headerFam, 'left');
  const cl = el('div', { display: 'flex', width: '100%' }, [checklistNode(slide, tk, false)]);
  const textCol = el('div', { display: 'flex', flexDirection: 'column', flexGrow: 55, flexBasis: 0, justifyContent: 'center', gap: `${tk.gMeso}px`, height: '100%', overflow: 'hidden' },
    [t, cl].filter(Boolean) as Node[]);
  const imgCol = await roundedImage(img, tk, { flexGrow: 45, flexBasis: 0, height: '100%' });
  return el('div', { display: 'flex', flexDirection: 'row', flexGrow: 1, gap: `${tk.gMacro}px`, alignItems: 'stretch', width: '100%' }, [textCol, imgCol]);
}

async function tplSplitImageChecklist(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const img = find(slide, 'image_placeholder');
  const t = titleNode(slide, tk, tk.titleL, tk.headerFam, 'left');
  const cl = el('div', { display: 'flex', width: '100%' }, [checklistNode(slide, tk, false)]);
  const textCol = el('div', { display: 'flex', flexDirection: 'column', flexGrow: 55, flexBasis: 0, justifyContent: 'center', gap: `${tk.gMeso}px`, height: '100%', overflow: 'hidden' },
    [t, cl].filter(Boolean) as Node[]);
  const imgCol = await roundedImage(img, tk, { flexGrow: 45, flexBasis: 0, height: '100%' });
  return el('div', { display: 'flex', flexDirection: 'row', flexGrow: 1, gap: `${tk.gMacro}px`, alignItems: 'stretch', width: '100%' }, [imgCol, textCol]);
}

async function tplSplitStatImage(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const img = find(slide, 'image_placeholder');
  const h = find(slide, 'header');
  const b = find(slide, 'body');
  const statCol = el('div', { display: 'flex', flexDirection: 'column', flexGrow: 55, flexBasis: 0, justifyContent: 'center', gap: `${tk.gMeso}px`, height: '100%' }, [
    h?.text ? el('div', { display: 'flex', fontFamily: tk.coverFam, fontSize: `${Math.round(tk.huge * 0.7)}px`, fontWeight: 700, color: tk.c.highlight, lineHeight: 1 }, h.text) : el('div', {}),
    b?.text ? richText(b.text, b.highlight, { fontFamily: tk.bodyFam, fontSize: tk.body, fontWeight: 600, color: tk.c.header, highlightColor: tk.c.highlight, lineHeight: 1.3, align: 'left' }) : el('div', {}),
  ]);
  const imgCol = await roundedImage(img, tk, { flexGrow: 45, flexBasis: 0, height: '100%' });
  return el('div', { display: 'flex', flexDirection: 'row', flexGrow: 1, gap: `${tk.gMacro}px`, alignItems: 'stretch', width: '100%' }, [statCol, imgCol]);
}

async function tplImageTopChecklist(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const img = find(slide, 'image_placeholder');
  const imgH = Math.round((tk.H - tk.pad * 2) * 0.40);
  const imgNode = await roundedImage(img, tk, { width: '100%', height: `${imgH}px`, flexShrink: 0 });
  const t = titleNode(slide, tk, tk.titleL, tk.headerFam, 'left');
  const cl = el('div', { display: 'flex', width: '100%' }, [checklistNode(slide, tk, false)]);
  const textCol = el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: `${tk.gMeso}px`, width: '100%' },
    [t, cl].filter(Boolean) as Node[]);
  return el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, gap: `${tk.gMeso}px`, width: '100%' }, [imgNode, textCol]);
}

async function tplQuoteWithImage(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const q = find(slide, 'quote') ?? find(slide, 'header');
  const img = find(slide, 'image_placeholder');
  const imgH = Math.round((tk.H - tk.pad * 2) * 0.30);
  const mark = el('div', { display: 'flex', fontFamily: tk.coverFam, fontSize: `${Math.round(tk.titleXL * 1.2)}px`, fontWeight: 700, color: tk.c.accent, lineHeight: 0.8 }, '"');
  const nodes: Node[] = [mark];
  if (q?.text) nodes.push(richText(q.text, q.highlight, { fontFamily: tk.coverFam, fontSize: fitTitle(tk.titleL, q.text), fontWeight: 700, color: tk.c.header, highlightColor: tk.c.highlight, lineHeight: 1.12, align: 'center' }));
  const imgNode = await roundedImage(img, tk, { width: '100%', height: `${imgH}px`, flexShrink: 0, marginTop: `${tk.gMeso}px` });
  nodes.push(imgNode);
  return colCenter(nodes, tk, tk.gMeso);
}

async function tplHeaderBodyCta(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const nodes: Node[] = [];
  const title = titleNode(slide, tk, tk.titleL, tk.headerFam, 'left'); if (title) nodes.push(title);
  const body = bodyNode(slide, tk, 'left'); if (body) nodes.push(body);
  nodes.push(el('div', { display: 'flex', marginTop: `${tk.gMacro}px` }, [ctaButton(slide, tk)]));
  return colLeft(nodes, tk, tk.gMeso);
}

async function tplSplitHeaderBodyCta(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const img = find(slide, 'image_placeholder');
  const textCol = el('div', { display: 'flex', flexDirection: 'column', flexGrow: 55, flexBasis: 0, justifyContent: 'center', gap: `${tk.gMeso}px`, height: '100%', overflow: 'hidden' },
    [
      titleNode(slide, tk, tk.titleL, tk.headerFam, 'left'),
      bodyNode(slide, tk, 'left'),
      el('div', { display: 'flex', marginTop: `${tk.gMicro}px` }, [ctaButton(slide, tk)]),
    ].filter(Boolean) as Node[]);
  const imgCol = await roundedImage(img, tk, { flexGrow: 45, flexBasis: 0, height: '100%' });
  return el('div', { display: 'flex', flexDirection: 'row', flexGrow: 1, gap: `${tk.gMacro}px`, alignItems: 'stretch', width: '100%' }, [textCol, imgCol]);
}

async function tplCoverChecklist(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const nodes: Node[] = [];
  const title = titleNode(slide, tk, tk.titleXL, tk.coverFam, 'center'); if (title) nodes.push(title);
  const body = bodyNode(slide, tk, 'center'); if (body) nodes.push(body);
  nodes.push(el('div', { display: 'flex', width: '100%', marginTop: `${tk.gMeso}px` }, [checklistNode(slide, tk, false)]));
  return colCenter(nodes, tk, tk.gMeso);
}

async function tplNumberedWithImage(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const img = find(slide, 'image_placeholder');
  const stepsCol = el('div', { display: 'flex', flexDirection: 'column', flexGrow: 55, flexBasis: 0, justifyContent: 'center', gap: `${tk.gMeso}px`, height: '100%', overflow: 'hidden' },
    [titleNode(slide, tk, tk.titleL, tk.headerFam, 'left'), checklistNode(slide, tk, true)].filter(Boolean) as Node[]);
  const imgCol = await roundedImage(img, tk, { flexGrow: 45, flexBasis: 0, height: '100%' });
  return el('div', { display: 'flex', flexDirection: 'row', flexGrow: 1, gap: `${tk.gMacro}px`, alignItems: 'stretch', width: '100%' }, [stepsCol, imgCol]);
}

async function tplBigStatWithBody(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const h = find(slide, 'header');
  const b = find(slide, 'body');
  const nodes: Node[] = [];
  if (h?.text) nodes.push(el('div', { display: 'flex', fontFamily: tk.coverFam, fontSize: `${clamp(fitTitle(tk.huge, h.text), 60, tk.huge)}px`, fontWeight: 700, color: tk.c.highlight, lineHeight: 1 }, h.text));
  if (b?.text) nodes.push(richText(b.text, b.highlight, { fontFamily: tk.bodyFam, fontSize: Math.round(tk.body * 1.1), fontWeight: 400, color: tk.c.body, highlightColor: tk.c.highlight, lineHeight: 1.4, align: 'center' }));
  nodes.push(el('div', { display: 'flex', marginTop: `${tk.gMeso}px` }, [ctaButton(slide, tk)]));
  return colCenter(nodes, tk, tk.gMeso);
}

async function tplTwoColumnText(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const t = titleNode(slide, tk, tk.titleL, tk.headerFam, 'left');
  const cl = checklistNode(slide, tk, false);
  const leftCol = el('div', { display: 'flex', flexDirection: 'column', flexGrow: 50, flexBasis: 0, justifyContent: 'center', gap: `${tk.gMeso}px`, height: '100%' },
    t ? [t] : []);
  const rightCol = el('div', { display: 'flex', flexDirection: 'column', flexGrow: 50, flexBasis: 0, justifyContent: 'center', height: '100%' }, [cl]);
  return el('div', { display: 'flex', flexDirection: 'row', flexGrow: 1, gap: `${tk.gMacro}px`, alignItems: 'stretch', width: '100%' }, [leftCol, rightCol]);
}

async function tplImageFullCaption(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const img = find(slide, 'image_placeholder');
  const imgH = Math.round((tk.H - tk.pad * 2) * 0.72);
  const imgNode = await roundedImage(img, tk, { width: '100%', height: `${imgH}px`, flexShrink: 0 });
  const b = bodyNode(slide, tk, 'center');
  return el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, gap: `${tk.gMeso}px`, width: '100%', alignItems: 'center' },
    [imgNode, b ?? el('div', {})].filter(Boolean) as Node[]);
}

async function tplQuoteStatCombo(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const q = find(slide, 'quote') ?? find(slide, 'header');
  const b = find(slide, 'body');
  const nodes: Node[] = [];
  if (q?.text) {
    nodes.push(el('div', { display: 'flex', fontFamily: tk.coverFam, fontSize: `${Math.round(tk.titleXL * 1.2)}px`, fontWeight: 700, color: tk.c.accent, lineHeight: 0.8 }, '"'));
    nodes.push(richText(q.text, q.highlight, { fontFamily: tk.coverFam, fontSize: fitTitle(tk.titleL, q.text), fontWeight: 700, color: tk.c.header, highlightColor: tk.c.highlight, lineHeight: 1.12, align: 'center' }));
  }
  if (b?.text) {
    // Render the body as a big stat number if it looks like a number
    const isStat = /^\d+[\d,.%x+]+/.test(b.text.trim());
    nodes.push(el('div', {
      display: 'flex', fontFamily: tk.coverFam,
      fontSize: isStat ? `${Math.round(tk.titleXL * 0.9)}px` : `${tk.body}px`,
      fontWeight: isStat ? 700 : 400, color: isStat ? tk.c.highlight : tk.c.body, lineHeight: 1.1, textAlign: 'center',
    }, b.text));
  }
  return colCenter(nodes, tk, tk.gMeso);
}

async function tplCoverWithCta(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const nodes: Node[] = [];
  const title = titleNode(slide, tk, tk.titleXL, tk.coverFam, 'center'); if (title) nodes.push(title);
  const body = bodyNode(slide, tk, 'center'); if (body) nodes.push(el('div', { display: 'flex', width: '80%', justifyContent: 'center' }, [body]));
  nodes.push(el('div', { display: 'flex', marginTop: `${tk.gMacro}px` }, [ctaButton(slide, tk)]));
  return colCenter(nodes, tk, tk.gMacro);
}

async function tplChecklistWithBody(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const nodes: Node[] = [];
  const title = titleNode(slide, tk, tk.titleL, tk.headerFam, 'left'); if (title) nodes.push(title);
  const body = bodyNode(slide, tk, 'left'); if (body) nodes.push(body);
  nodes.push(el('div', { display: 'flex', width: '100%', marginTop: `${tk.gMeso}px` }, [checklistNode(slide, tk, false)]));
  return colLeft(nodes, tk, tk.gMeso, 'flex-start');
}

// ---------------------------------------------------------------------------
// 15 TEMPLATES — each returns the MIDDLE content node (between chrome rows)
// ---------------------------------------------------------------------------

function colCenter(children: Node[], tk: Tokens, gap = tk.gMeso): Node {
  return el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: `${gap}px`, width: '100%' }, children);
}
function colLeft(children: Node[], tk: Tokens, gap = tk.gMeso, justify = 'center'): Node {
  return el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, alignItems: 'flex-start', justifyContent: justify, gap: `${gap}px`, width: '100%' }, children);
}

async function tplCoverCentered(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const nodes: Node[] = [];
  const title = titleNode(slide, tk, tk.titleXL, tk.coverFam, 'center'); if (title) nodes.push(title);
  const body = bodyNode(slide, tk, 'center'); if (body) nodes.push(el('div', { display: 'flex', width: '82%', justifyContent: 'center' }, [body]));
  return colCenter(nodes, tk, tk.gMacro);
}
async function tplCoverLeft(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const nodes: Node[] = [];
  const title = titleNode(slide, tk, tk.titleXL, tk.coverFam, 'left'); if (title) nodes.push(title);
  const body = bodyNode(slide, tk, 'left'); if (body) nodes.push(body);
  return colLeft(nodes, tk, tk.gMacro);
}
async function tplCoverImageFull(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const img = find(slide, 'image_placeholder');
  const title = titleNode(slide, tk, tk.titleXL, tk.coverFam, 'left');
  const body = bodyNode(slide, tk, 'left');
  const children: Node[] = [];
  if (img?.imageUrl) {
    const imgNode = el('img', { width: `${tk.W}px`, height: `${tk.H}px`, objectFit: 'cover', position: 'absolute', top: 0, left: 0 });
    (imgNode.props as Record<string, unknown>).src = img.imageUrl;
    children.push(imgNode);
    children.push(el('div', { position: 'absolute', top: 0, left: 0, width: `${tk.W}px`, height: `${tk.H}px`, display: 'flex', backgroundColor: 'rgba(8,10,18,0.55)' }));
  }
  const overlayColor = img?.imageUrl ? '#ffffff' : tk.c.header;
  const inner: Node[] = [];
  if (title) {
    // recolor title to white on image
    const h = find(slide, 'header') ?? find(slide, 'quote');
    inner.push(richText(h!.text!, h!.highlight, { fontFamily: tk.coverFam, fontSize: fitTitle(tk.titleXL, h!.text!), fontWeight: 700, color: overlayColor, highlightColor: tk.c.highlight, lineHeight: 1.07, align: 'left', letterSpacing: 0 }));
  }
  if (body) {
    const b = find(slide, 'body')!;
    inner.push(richText(b.text!, b.highlight, { fontFamily: tk.bodyFam, fontSize: tk.body, fontWeight: 400, color: img?.imageUrl ? '#e8eaf0' : tk.c.body, highlightColor: tk.c.highlight, lineHeight: 1.4, align: 'left' }));
  }
  children.push(el('div', {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    justifyContent: 'flex-end',
    gap: `${tk.gMeso}px`,
    width: '100%',
    position: 'relative',
    padding: `${tk.pad}px`,
    paddingBottom: `${Math.round(tk.pad * 2.2)}px`,
  }, [
    el('div', { display: 'flex', flexDirection: 'column', gap: `${tk.gMeso}px`, width: '78%' }, inner),
  ]));
  return el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, position: 'relative', width: '100%' }, children);
}
async function tplTextCentered(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const nodes: Node[] = [];
  const title = titleNode(slide, tk, tk.titleL, tk.headerFam, 'center'); if (title) nodes.push(title);
  const body = bodyNode(slide, tk, 'center'); if (body) nodes.push(el('div', { display: 'flex', width: '84%', justifyContent: 'center' }, [body]));
  return colCenter(nodes, tk, tk.gMeso);
}
async function tplTextStack(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const nodes: Node[] = [];
  const title = titleNode(slide, tk, tk.titleL, tk.headerFam, 'left'); if (title) nodes.push(title);
  const body = bodyNode(slide, tk, 'left'); if (body) nodes.push(body);
  return colLeft(nodes, tk, tk.gMeso);
}
async function tplSplit(slide: SduiSlide, tk: Tokens, imageRight: boolean): Promise<Node> {
  const img = find(slide, 'image_placeholder');
  const textCol = el('div', { display: 'flex', flexDirection: 'column', flexGrow: 55, flexBasis: 0, justifyContent: 'center', gap: `${tk.gMeso}px`, height: '100%', overflow: 'hidden' },
    [titleNode(slide, tk, tk.titleL, tk.headerFam, 'left'), bodyNode(slide, tk, 'left')].filter(Boolean) as Node[]);
  const imgCol = await roundedImage(img, tk, { flexGrow: 45, flexBasis: 0, height: '100%' });
  const cols = imageRight ? [textCol, imgCol] : [imgCol, textCol];
  return el('div', { display: 'flex', flexDirection: 'row', flexGrow: 1, gap: `${tk.gMacro}px`, alignItems: 'stretch', width: '100%' }, cols);
}
async function tplImageTop(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const img = find(slide, 'image_placeholder');
  const imgNode = await roundedImage(img, tk, { width: '100%', height: `${Math.round((tk.H - tk.pad * 2) * 0.46)}px`, flexShrink: 0 });
  const textCol = el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: `${tk.gMeso}px`, width: '100%' },
    [titleNode(slide, tk, tk.titleL, tk.headerFam, 'left'), bodyNode(slide, tk, 'left')].filter(Boolean) as Node[]);
  return el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, gap: `${tk.gMacro}px`, width: '100%' }, [imgNode, textCol]);
}
async function tplImageBottom(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const img = find(slide, 'image_placeholder');
  const textCol = el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: `${tk.gMeso}px`, width: '100%' },
    [titleNode(slide, tk, tk.titleL, tk.headerFam, 'left'), bodyNode(slide, tk, 'left')].filter(Boolean) as Node[]);
  const imgNode = await roundedImage(img, tk, { width: '100%', height: `${Math.round((tk.H - tk.pad * 2) * 0.46)}px`, flexShrink: 0 });
  return el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, gap: `${tk.gMacro}px`, width: '100%' }, [textCol, imgNode]);
}
async function tplChecklist(slide: SduiSlide, tk: Tokens, numbered: boolean): Promise<Node> {
  const nodes: Node[] = [];
  const title = titleNode(slide, tk, tk.titleL, tk.headerFam, 'left'); if (title) nodes.push(title);
  const body = bodyNode(slide, tk, 'left'); if (body) nodes.push(body);
  nodes.push(el('div', { display: 'flex', marginTop: `${tk.gMeso}px`, width: '100%' }, [checklistNode(slide, tk, numbered)]));
  return colLeft(nodes, tk, tk.gMeso, 'center');
}
async function tplQuote(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const q = find(slide, 'quote') ?? find(slide, 'header');
  const mark = el('div', { display: 'flex', fontFamily: tk.coverFam, fontSize: `${Math.round(tk.titleXL * 1.4)}px`, fontWeight: 700, color: tk.c.accent, lineHeight: 0.8 }, '“');
  const nodes: Node[] = [mark];
  if (q?.text) {
    nodes.push(richText(q.text, q.highlight, { fontFamily: tk.coverFam, fontSize: fitTitle(tk.titleL, q.text), fontWeight: 700, color: tk.c.header, highlightColor: tk.c.highlight, lineHeight: 1.15, align: 'center' }));
  }
  const body = bodyNode(slide, tk, 'center'); if (body) nodes.push(el('div', { display: 'flex', width: '70%', justifyContent: 'center' }, [body]));
  return colCenter(nodes, tk, tk.gMeso);
}
async function tplStat(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const h = find(slide, 'header');
  const body = find(slide, 'body');
  const nodes: Node[] = [];
  if (h?.text) {
    const statLike = hasStatSignalText(`${h.text} ${body?.text ?? ''}`);
    const fontSize = statLike
      ? clamp(fitTitle(tk.huge, h.text), 60, tk.huge)
      : fitTitle(tk.titleL, h.text);
    nodes.push(richText(h.text, h.highlight, {
      fontFamily: tk.coverFam,
      fontSize,
      fontWeight: 700,
      color: statLike ? tk.c.highlight : tk.c.header,
      highlightColor: tk.c.highlight,
      lineHeight: statLike ? 1 : 1.08,
      align: 'center',
    }));
  }
  if (body?.text) {
    nodes.push(richText(body.text, body.highlight, { fontFamily: tk.bodyFam, fontSize: Math.round(tk.body * 1.15), fontWeight: 600, color: tk.c.header, highlightColor: tk.c.highlight, lineHeight: 1.3, align: 'center' }));
  }
  return colCenter(nodes, tk, tk.gMeso);
}
async function tplBigStatement(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const nodes: Node[] = [];
  const title = titleNode(slide, tk, Math.round(tk.titleXL * 1.05), tk.coverFam, 'left'); if (title) nodes.push(title);
  const body = bodyNode(slide, tk, 'left'); if (body) nodes.push(body);
  return colLeft(nodes, tk, tk.gMeso);
}
async function tplCta(slide: SduiSlide, tk: Tokens): Promise<Node> {
  const nodes: Node[] = [];
  const title = titleNode(slide, tk, tk.titleL, tk.coverFam, 'center'); if (title) nodes.push(title);
  const body = bodyNode(slide, tk, 'center'); if (body) nodes.push(el('div', { display: 'flex', width: '80%', justifyContent: 'center' }, [body]));
  nodes.push(el('div', { display: 'flex', marginTop: `${tk.gMeso}px` }, [ctaButton(slide, tk)]));
  return colCenter(nodes, tk, tk.gMeso);
}

// ---------------------------------------------------------------------------
// Template dispatch + auto-pick
// ---------------------------------------------------------------------------

const ALL_TEMPLATES: LayoutVariantId[] = [
  'cover_centered', 'cover_editorial_left', 'cover_image_full', 'text_centered', 'text_stack',
  'split_text_left_image_right', 'split_image_left_text_right', 'image_top_text_bottom',
  'text_top_image_bottom', 'checklist_stack', 'numbered_steps', 'quote_focus',
  'stat_highlight', 'big_statement', 'cta_centered',
  // mixed
  'split_checklist_image', 'split_image_checklist', 'split_stat_image',
  'image_top_checklist_bottom', 'quote_with_image', 'header_body_cta',
  'split_header_body_cta', 'cover_checklist', 'numbered_with_image',
  'big_stat_with_body', 'two_column_text', 'image_full_caption',
  'quote_stat_combo', 'cover_with_cta', 'checklist_with_body',
];
const TEMPLATE_SET = new Set<string>(ALL_TEMPLATES);

function has(slide: SduiSlide, type: string): boolean { return !!find(slide, type); }

function pickTemplate(slide: SduiSlide): LayoutVariantId {
  if (slide.layout_variant_id && TEMPLATE_SET.has(slide.layout_variant_id)) return slide.layout_variant_id;
  const hasImg = has(slide, 'image_placeholder');
  const hasCl = has(slide, 'checklist');
  const hasCta = has(slide, 'button_cta');
  const hasBody = has(slide, 'body');

  if (slide.slide_type === 'cover') {
    if (hasImg && hasCta) return 'cover_with_cta';
    if (hasImg) return 'cover_image_full';
    if (hasCl) return 'cover_checklist';
    return 'cover_centered';
  }
  if (has(slide, 'quote') && hasImg) return 'quote_with_image';
  if (has(slide, 'quote')) return 'quote_focus';
  if (hasCl && hasImg) {
    return slide.slide_number % 2 === 0 ? 'split_image_checklist' : 'split_checklist_image';
  }
  if (hasCl && hasBody) return 'checklist_with_body';
  if (hasCl) return slide.slide_number % 2 === 0 ? 'numbered_steps' : 'checklist_stack';
  if (hasCta && hasImg) return 'split_header_body_cta';
  if (hasCta && !hasImg) return slide.slide_number % 2 === 0 ? 'cover_with_cta' : 'header_body_cta';
  if (hasImg) {
    const opts: LayoutVariantId[] = [
      'split_text_left_image_right', 'split_image_left_text_right',
      'image_top_text_bottom', 'text_top_image_bottom', 'image_full_caption',
    ];
    return opts[slide.slide_number % opts.length]!;
  }
  return slide.slide_number % 2 === 0 ? 'text_centered' : 'text_stack';
}

async function renderTemplate(id: LayoutVariantId, slide: SduiSlide, tk: Tokens): Promise<Node> {
  switch (id) {
    case 'cover_centered': return tplCoverCentered(slide, tk);
    case 'cover_editorial_left': return tplCoverLeft(slide, tk);
    case 'cover_image_full': return tplCoverImageFull(slide, tk);
    case 'text_centered': return tplTextCentered(slide, tk);
    case 'text_stack': return tplTextStack(slide, tk);
    case 'split_text_left_image_right': return tplSplit(slide, tk, true);
    case 'split_image_left_text_right': return tplSplit(slide, tk, false);
    case 'image_top_text_bottom': return tplImageTop(slide, tk);
    case 'text_top_image_bottom': return tplImageBottom(slide, tk);
    case 'checklist_stack': return tplChecklist(slide, tk, false);
    case 'numbered_steps': return tplChecklist(slide, tk, true);
    case 'quote_focus': return tplQuote(slide, tk);
    case 'stat_highlight': return tplStat(slide, tk);
    case 'big_statement': return tplBigStatement(slide, tk);
    case 'cta_centered': return tplCta(slide, tk);
    // mixed
    case 'split_checklist_image': return tplSplitChecklistImage(slide, tk);
    case 'split_image_checklist': return tplSplitImageChecklist(slide, tk);
    case 'split_stat_image': return tplSplitStatImage(slide, tk);
    case 'image_top_checklist_bottom': return tplImageTopChecklist(slide, tk);
    case 'quote_with_image': return tplQuoteWithImage(slide, tk);
    case 'header_body_cta': return tplHeaderBodyCta(slide, tk);
    case 'split_header_body_cta': return tplSplitHeaderBodyCta(slide, tk);
    case 'cover_checklist': return tplCoverChecklist(slide, tk);
    case 'numbered_with_image': return tplNumberedWithImage(slide, tk);
    case 'big_stat_with_body': return tplBigStatWithBody(slide, tk);
    case 'two_column_text': return tplTwoColumnText(slide, tk);
    case 'image_full_caption': return tplImageFullCaption(slide, tk);
    case 'quote_stat_combo': return tplQuoteStatCombo(slide, tk);
    case 'cover_with_cta': return tplCoverWithCta(slide, tk);
    case 'checklist_with_body': return tplChecklistWithBody(slide, tk);
  }
}

// ---------------------------------------------------------------------------
// Public renderer
// ---------------------------------------------------------------------------

export class SatoriRenderer {
  async renderSlide(slide: SduiSlide, doc: SduiDocument, brandFonts: BrandFontRef[]): Promise<Buffer> {
    const dims = canvasSize(doc.aspectRatio);
    const fonts = await loadFonts(brandFonts);
    if (fonts.length === 0) throw new Error('no_fonts_available');

    const available = new Set(brandFonts.map((b) => b.family).filter(Boolean));
    const chromeTk = makeTokens(slide, doc, dims, available);
    const templateId = pickTemplate(slide);
    const tk = fitContentTokens(slide, templateId, chromeTk);
    const isLast = slide.slide_number >= doc.slides.length;

    const middle = await renderTemplate(templateId, slide, tk);
    const topChromeNode = await topChrome(slide, chromeTk, doc);
    const bottomChromeNode = bottomChrome(slide, chromeTk, doc, isLast);

    // cover_image_full is full-bleed: render without padding/chrome gaps overlaying
    const isFullBleed = templateId === 'cover_image_full' && has(slide, 'image_placeholder') && !!find(slide, 'image_placeholder')?.imageUrl;

    const root = isFullBleed
      ? el('div', { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative', backgroundColor: tk.c.background }, [
          middle,
          el('div', {
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            position: 'absolute', top: 0, left: 0, width: `${dims.width}px`, height: `${dims.height}px`,
            padding: `${chromeTk.pad}px`,
          }, [topChromeNode, el('div', { display: 'flex', flexGrow: 1 }), bottomChromeNode]),
        ])
      : el('div', {
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          width: '100%', height: '100%', padding: `${chromeTk.pad}px`,
          backgroundColor: chromeTk.c.background, fontFamily: tk.bodyFam,
        }, [
          topChromeNode,
          el('div', { display: 'flex', flexGrow: 1, width: '100%', marginTop: `${chromeTk.gMacro}px`, marginBottom: `${chromeTk.gMacro}px`, overflow: 'hidden' }, [middle]),
          bottomChromeNode,
        ]);

    const svg = await satori(root as unknown as Parameters<typeof satori>[0], {
      width: dims.width,
      height: dims.height,
      fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
    });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: dims.width } }).render().asPng();
    return Buffer.from(png);
  }
}
