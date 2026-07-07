/**
 * growhaley.ts — Growhaley brand template set (10 variants, 3 families).
 *
 * Poster-editorial system from the Growhaley brand guideline:
 *   - poster : flat brand-color canvas + soft radial blob + giant condensed
 *              display type, staggered alignment, {01} numbering, { } ornaments
 *   - photo  : full-bleed photo + lime display type (rotated rails or scrim)
 *   - collage: Blue Sea canvas + giant lime text + overlapping photo cards
 *
 * All templates render FULL-BLEED (their own canvas + padding); the renderer
 * overlays chrome (logo/pagination) on top — see satori-renderer.ts.
 *
 * The Growhaley palette is part of the design system itself (like spacing),
 * so it is fixed here; fonts still come from the Brand Kit via Tokens.
 * Satori capabilities used (rotate/gradients/overlap) verified by the
 * Fase-0 spike (dev/growhaley-spike.ts).
 */

import type {
  GwAccentChoice,
  GwBlobPosition,
  GwCollageScatter,
  GwComposition,
  GwHeaderComposition,
  GwPaletteChoice,
  SduiSlide,
} from '@leads-generator/shared';
import { GW_ACCENT_ALLOWED, GW_ACCENT_HEX } from '@leads-generator/shared';

import { find, findAll } from '../accessors.js';
import { el } from '../primitives.js';
import type { Node, Style } from '../primitives.js';
import { richText } from '../rich-renderers.js';
import { templateRegistry } from '../template-registry.js';
import { clamp, fitTitle, type Tokens } from '../tokens.js';

// ---------------------------------------------------------------------------
// Palette + helpers
// ---------------------------------------------------------------------------

const GW = {
  lime: '#e8ff03',
  blue: '#177db5',
  ink: '#232326',
  cream: '#fff7e8',
  magenta: '#da457f',
} as const;

interface PosterPalette {
  bg: string;
  blob: string;
  fg: string;
  accent: string;
}

/**
 * Brand palette table (Warna Palet + Kombinasi, guideline p.32). fg/blob per
 * background are FIXED design-system pairings — the AI can only pick which
 * palette, never invent colors.
 */
const PALETTES: Record<GwPaletteChoice, PosterPalette> = {
  lime: { bg: GW.lime, blob: '#f4ff8a', fg: GW.ink, accent: GW.magenta },
  cream: { bg: GW.cream, blob: '#ffffff', fg: GW.ink, accent: GW.blue },
  blue: { bg: GW.blue, blob: '#3f9ccb', fg: GW.lime, accent: GW.cream },
  ink: { bg: GW.ink, blob: '#3a3a3e', fg: GW.lime, accent: GW.magenta },
};

// Palette→accent contrast table + accent hex now live in shared
// (GW_ACCENT_ALLOWED / GW_ACCENT_HEX) so the frontend swatch picker and this
// renderer validate against one source.
const ACCENT_ALLOWED = GW_ACCENT_ALLOWED;
const ACCENT_HEX = GW_ACCENT_HEX;

function composition(slide: SduiSlide): GwComposition {
  return slide.composition ?? {};
}

function defaultPaletteKey(slide: SduiSlide, templateId: string): GwPaletteChoice {
  if (slide.slide_type === 'cover' || templateId === 'gw_poster_cta') return 'lime';
  return slide.slide_number % 2 === 0 ? 'cream' : 'blue';
}

/**
 * Deterministic background cycle, overridable by AI composition — but always
 * sanitized against the brand pairing tables above.
 */
function posterPalette(slide: SduiSlide, templateId: string): PosterPalette {
  const c = composition(slide);
  const key = c.palette ?? defaultPaletteKey(slide, templateId);
  const base = PALETTES[key];
  const accent =
    c.accent && ACCENT_ALLOWED[key].includes(c.accent) ? ACCENT_HEX[c.accent] : base.accent;
  return { ...base, accent };
}

/** Blob anchor per composition ('none' handled by caller). */
const BLOB_ANCHOR: Record<Exclude<GwBlobPosition, 'none'>, string> = {
  'top-left': '28% 18%',
  'top-right': '72% 18%',
  'bottom-left': '25% 80%',
  'bottom-right': '75% 80%',
  center: '50% 45%',
};

function ornamentLevel(slide: SduiSlide): 'none' | 'minimal' | 'rich' {
  return composition(slide).ornaments ?? 'minimal';
}

/**
 * Chrome contrast per slide: the renderer uses this to color logo/tag/
 * pagination/swipe so they stay legible on every template background.
 */
export function growhaleyChromeColors(
  slide: SduiSlide,
  templateId: string,
): { fg: string; pillBg: string; pillFg: string } {
  const isPhoto = templateId.startsWith('gw_photo_') || templateId === 'gw_collage_showcase';
  const fg = isPhoto ? GW.cream : posterPalette(slide, templateId).fg;
  return { fg, pillBg: GW.ink, pillFg: GW.lime };
}

/** Chrome fg is only ever ink (light bg) or lime/cream (dark/photo bg) — see growhaleyChromeColors(). */
export function isLightChrome(fg: string): boolean {
  return fg === GW.ink;
}

/** Vertical padding reserved for chrome (top row + bottom row) in templates. */
export function gwSafeArea(tk: Tokens): { top: number; bottom: number } {
  return { top: Math.round(tk.pad * 2.1), bottom: Math.round(tk.pad * 2.3) };
}

/** Full-canvas root with brand bg + soft radial blob + own padding. */
function posterCanvas(tk: Tokens, p: PosterPalette, children: Node[], slide?: SduiSlide): Node {
  const blob = slide ? (composition(slide).blob ?? 'top-left') : 'top-left';
  const decorated = [...children];
  if (slide && ornamentLevel(slide) === 'rich') {
    decorated.push(
      el(
        'div',
        {
          position: 'absolute',
          // Fully inside the content zone: at *0.9 the glyph's bottom edge
          // crossed into the bottom-chrome band (flagged by svg-measure).
          bottom: `${Math.round(gwSafeArea(tk).bottom * 1.05)}px`,
          right: `${Math.round(tk.pad * 0.4)}px`,
          display: 'flex',
          fontFamily: tk.coverFam,
          fontSize: `${Math.round(tk.huge * 0.7)}px`,
          fontWeight: 700,
          color: p.accent,
          opacity: 0.45,
          lineHeight: 0.9,
        },
        '}',
      ),
    );
  }
  return el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      position: 'relative',
      backgroundColor: p.bg,
      ...(blob !== 'none'
        ? {
            backgroundImage: `radial-gradient(circle at ${BLOB_ANCHOR[blob]}, ${p.blob} 0%, ${p.bg} 62%)`,
          }
        : {}),
      padding: `${gwSafeArea(tk).top}px ${tk.pad}px ${gwSafeArea(tk).bottom}px ${tk.pad}px`,
    },
    decorated,
  );
}

/**
 * Headline block honoring composition.headerComposition:
 * 'staggered' = guideline word-group stagger; otherwise plain alignment.
 */
function headerBlock(
  slide: SduiSlide,
  text: string,
  highlight: string | undefined,
  tk: Tokens,
  size: number,
  color: string,
  defaultComp: GwHeaderComposition,
): Node {
  const comp = composition(slide).headerComposition ?? defaultComp;
  if (comp === 'staggered') return staggeredDisplayLines(text, tk, size, color);
  const align = (comp === 'right' ? 'right' : comp === 'center' ? 'center' : 'left') as
    | 'left'
    | 'center'
    | 'right';
  return el(
    'div',
    {
      display: 'flex',
      width: '100%',
      justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
    },
    [displayText(text, highlight, tk, size, color, align)],
  );
}

/** Display type — condensed brand font, tight leading. */
function displayText(
  text: string,
  highlight: string | undefined,
  tk: Tokens,
  size: number,
  color: string,
  align: 'left' | 'center' | 'right' = 'left',
  highlightColor: string = GW.magenta,
): Node {
  return richText(text, highlight, {
    fontFamily: tk.coverFam,
    fontSize: size,
    fontWeight: 700,
    color,
    highlightColor,
    lineHeight: 1.02,
    align,
    letterSpacing: 0,
  });
}

/**
 * Staggered display lines: split the headline into 2-3 word groups; all lines
 * left-aligned except the last, which is pushed right (guideline cover style).
 */
function staggeredDisplayLines(text: string, tk: Tokens, size: number, color: string): Node {
  const words = text.trim().split(/\s+/);
  const perLine = Math.max(1, Math.ceil(words.length / Math.min(3, Math.max(2, words.length))));
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += perLine) {
    lines.push(words.slice(i, i + perLine).join(' '));
  }
  // Stepped indent instead of pushing the last line hard-right: a lone short
  // word at the far edge reads as disconnected from the block. Each line
  // shifts right progressively (max ~30% of the canvas), keeping the
  // guideline's stagger feel while the lines stay visually attached.
  const maxIndentPct = 30;
  const step = lines.length > 1 ? maxIndentPct / (lines.length - 1) : 0;
  return el(
    'div',
    { display: 'flex', flexDirection: 'column', width: '100%', gap: `${tk.gMicro}px` },
    lines.map((line, i) =>
      el(
        'div',
        {
          display: 'flex',
          width: '100%',
          justifyContent: 'flex-start',
          marginLeft: `${Math.round(step * i * 10) / 10}%`,
        },
        [displayText(line, undefined, tk, size, color, 'left')],
      ),
    ),
  );
}

/** {01}-style number ornament. */
function braceNumber(n: number, tk: Tokens, color: string): Node {
  return el(
    'div',
    {
      display: 'flex',
      fontFamily: tk.coverFam,
      fontSize: `${Math.round(tk.small * 1.6)}px`,
      fontWeight: 700,
      color,
    },
    `{${String(n).padStart(2, '0')}}`,
  );
}

function smallBody(
  text: string,
  tk: Tokens,
  color: string,
  maxWidthPct = 62,
  align: 'left' | 'center' = 'left',
): Node {
  return el(
    'div',
    {
      display: 'flex',
      width: `${maxWidthPct}%`,
      justifyContent: align === 'center' ? 'center' : 'flex-start',
    },
    [
      richText(text, undefined, {
        fontFamily: tk.bodyFam,
        fontSize: tk.body,
        fontWeight: 400,
        color,
        highlightColor: GW.magenta,
        lineHeight: 1.45,
        align,
      }),
    ],
  );
}

function fullBleedImage(slide: SduiSlide, index = 0): Node {
  const imgs = findAll(slide, 'image_placeholder');
  const url = imgs[index]?.imageUrl;
  const base: Style = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    backgroundColor: '#2a4d5e',
  };
  if (!url) return el('div', base);
  const img = el('img', { width: '100%', height: '100%', objectFit: 'cover' });
  (img.props as Record<string, unknown>).src = url;
  return el('div', base, [img]);
}

// ---------------------------------------------------------------------------
// POSTER FAMILY
// ---------------------------------------------------------------------------

function tplPosterCover(slide: SduiSlide, tk: Tokens): Node {
  const p = posterPalette(slide, 'gw_poster_cover');
  const header = find(slide, 'header')?.text ?? '';
  const body = find(slide, 'body')?.text;
  const size = fitTitle(Math.round(tk.titleXL * 1.45), header);
  // Header + body live in ONE centered group (gap gMacro) — body floating at
  // the bottom of a flexGrow void read as a broken layout on short covers.
  return posterCanvas(
    tk,
    p,
    [
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          justifyContent: 'center',
          gap: `${tk.gMacro}px`,
          width: '100%',
        },
        [
          headerBlock(slide, header, undefined, tk, size, p.fg, 'staggered'),
          ...(body ? [smallBody(body, tk, p.fg)] : []),
        ],
      ),
    ],
    slide,
  );
}

function tplPosterStatement(slide: SduiSlide, tk: Tokens): Node {
  const p = posterPalette(slide, 'gw_poster_statement');
  const header = find(slide, 'header')?.text ?? '';
  const h = find(slide, 'header');
  const body = find(slide, 'body')?.text;
  const size = fitTitle(Math.round(tk.titleXL * 1.15), header);
  return posterCanvas(
    tk,
    p,
    [
      ...(ornamentLevel(slide) !== 'none'
        ? [
            el('div', { display: 'flex', justifyContent: 'flex-end', width: '100%' }, [
              braceNumber(slide.slide_number, tk, p.accent),
            ]),
          ]
        : []),
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          justifyContent: 'center',
          gap: `${tk.gMacro}px`,
          width: '100%',
        },
        [
          headerBlock(slide, header, h?.highlight, tk, size, p.fg, 'left'),
          ...(body ? [smallBody(body, tk, p.fg, 74)] : []),
        ],
      ),
    ],
    slide,
  );
}

function tplPosterList(slide: SduiSlide, tk: Tokens): Node {
  const p = posterPalette(slide, 'gw_poster_list');
  const header = find(slide, 'header')?.text ?? '';
  const checklist = find(slide, 'checklist');
  const numbered = find(slide, 'numbered_list');
  const items = (checklist?.items ?? numbered?.items ?? []).slice(0, 6);
  // Fewer items → bigger type, so 3 items don't float as small text in a
  // large empty band. Header + list are one centered group (fixed gap), not
  // header-at-top with the list centered in leftover space.
  const itemBoost = items.length <= 3 ? 1.6 : items.length <= 4 ? 1.45 : 1.25;
  const itemSize = clamp(Math.round(tk.body * itemBoost), 28, 48);
  return posterCanvas(tk, p, [
    el(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        justifyContent: 'center',
        gap: `${tk.gMacro}px`,
        width: '100%',
      },
      [
        headerBlock(slide, header, find(slide, 'header')?.highlight, tk, fitTitle(tk.titleXL, header), p.fg, 'left'),
        el(
          'div',
          {
            display: 'flex',
            flexDirection: 'column',
            gap: `${tk.gMeso}px`,
            width: '100%',
          },
      items.map((item, i) =>
        el(
          'div',
          {
            display: 'flex',
            alignItems: 'center',
            gap: `${tk.gMeso}px`,
            width: '100%',
            borderBottom: i < items.length - 1 ? `2px solid ${p.fg}` : 'none',
            paddingBottom: `${tk.gMeso}px`,
          },
          [
            el(
              'div',
              {
                display: 'flex',
                flexShrink: 0,
                fontFamily: tk.coverFam,
                fontSize: `${itemSize}px`,
                fontWeight: 700,
                color: p.accent,
              },
              `{${String(i + 1).padStart(2, '0')}}`,
            ),
            el(
              'div',
              {
                display: 'flex',
                fontFamily: tk.coverFam,
                fontSize: `${itemSize}px`,
                fontWeight: 700,
                color: p.fg,
                lineHeight: 1.15,
              },
              item,
            ),
          ],
        ),
      ),
        ),
      ],
    ),
  ], slide);
}

function tplPosterStat(slide: SduiSlide, tk: Tokens): Node {
  const p = posterPalette(slide, 'gw_poster_stat');
  const header = find(slide, 'header')?.text;
  const body = find(slide, 'body')?.text;
  const statBlock = find(slide, 'stat_block');
  const statRow = find(slide, 'stat_row');
  const stats =
    statRow?.stats && statRow.stats.length > 0
      ? statRow.stats.slice(0, 3)
      : statBlock
        ? [{ value: statBlock.value ?? '', label: statBlock.label ?? '' }]
        : [];
  const single = stats.length === 1;
  return posterCanvas(tk, p, [
    ...(header
      ? [
          headerBlock(
            slide,
            header,
            undefined,
            tk,
            fitTitle(Math.round(tk.titleL * 1.1), header),
            p.fg,
            'left',
          ),
        ]
      : []),
    el(
      'div',
      {
        display: 'flex',
        flexDirection: single ? 'column' : 'row',
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: single ? 'center' : 'space-between',
        gap: `${tk.gMacro}px`,
        width: '100%',
      },
      stats.map((stat) =>
        el(
          'div',
          {
            display: 'flex',
            flexDirection: 'column',
            alignItems: single ? 'center' : 'flex-start',
            gap: `${tk.gMicro}px`,
          },
          [
            el(
              'div',
              {
                display: 'flex',
                fontFamily: tk.coverFam,
                fontSize: `${single ? Math.round(tk.huge * 1.5) : tk.huge}px`,
                fontWeight: 700,
                color: p.accent,
                lineHeight: 1,
              },
              String(stat.value ?? ''),
            ),
            el(
              'div',
              {
                display: 'flex',
                fontFamily: tk.bodyFam,
                fontSize: `${Math.round(tk.body * 1.05)}px`,
                fontWeight: 600,
                color: p.fg,
                lineHeight: 1.3,
                maxWidth: `${single ? 60 : 30}%`,
                textAlign: single ? 'center' : 'left',
              },
              String(stat.label ?? ''),
            ),
          ],
        ),
      ),
    ),
    ...(body ? [smallBody(body, tk, p.fg)] : []),
  ], slide);
}

function tplPosterQuote(slide: SduiSlide, tk: Tokens): Node {
  const p = posterPalette(slide, 'gw_poster_quote');
  const quote = find(slide, 'quote') ?? find(slide, 'pull_quote');
  const text = quote?.text ?? find(slide, 'header')?.text ?? '';
  const attribution =
    (quote as { attribution?: string } | undefined)?.attribution ?? find(slide, 'body')?.text;
  const size = fitTitle(Math.round(tk.titleXL * 1.1), text);
  // This template draws its own {} brackets — suppress the canvas's "rich"
  // ornament (another }) or the two overlap in the bottom-right corner.
  const quoteSlide: SduiSlide = slide.composition?.ornaments === 'rich'
    ? { ...slide, composition: { ...slide.composition, ornaments: 'minimal' } }
    : slide;
  return posterCanvas(tk, p, [
    el(
      'div',
      {
        display: 'flex',
        fontFamily: tk.coverFam,
        fontSize: `${Math.round(tk.huge * 0.9)}px`,
        fontWeight: 700,
        color: p.accent,
        lineHeight: 0.9,
      },
      '{',
    ),
    el(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        justifyContent: 'center',
        gap: `${tk.gMacro}px`,
        width: '100%',
        paddingLeft: `${Math.round(tk.pad * 0.5)}px`,
      },
      [
        displayText(text, undefined, tk, size, p.fg),
        ...(attribution
          ? [
              el(
                'div',
                {
                  display: 'flex',
                  fontFamily: tk.bodyFam,
                  fontSize: `${tk.body}px`,
                  fontWeight: 600,
                  color: p.accent,
                },
                `— ${attribution}`,
              ),
            ]
          : []),
      ],
    ),
    el('div', { display: 'flex', justifyContent: 'flex-end', width: '100%' }, [
      el(
        'div',
        {
          display: 'flex',
          fontFamily: tk.coverFam,
          fontSize: `${Math.round(tk.huge * 0.9)}px`,
          fontWeight: 700,
          color: p.accent,
          lineHeight: 0.9,
        },
        '}',
      ),
    ]),
  ], quoteSlide);
}

function tplPosterCta(slide: SduiSlide, tk: Tokens): Node {
  const p = posterPalette(slide, 'gw_poster_cta');
  const header = find(slide, 'header')?.text ?? '';
  const body = find(slide, 'body')?.text;
  const cta = find(slide, 'button_cta');
  const label = cta?.label ?? 'Hubungi Kami';
  const size = fitTitle(Math.round(tk.titleXL * 1.3), header);
  // Header, body, and the CTA button form ONE centered group — a button
  // pinned to the bottom corner away from a centered headline read as a
  // scattered layout. Center-composition centers the whole group.
  const centered = (composition(slide).headerComposition ?? 'staggered') === 'center';
  return posterCanvas(tk, p, [
    el(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: centered ? 'center' : 'flex-start',
        gap: `${tk.gMacro}px`,
        width: '100%',
      },
      [
        headerBlock(slide, header, undefined, tk, size, p.fg, 'staggered'),
        ...(body ? [smallBody(body, tk, p.fg, 70, centered ? 'center' : 'left')] : []),
        el(
          'div',
          {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: p.fg,
            color: p.bg,
            padding: `${Math.round(tk.body * 0.9)}px ${Math.round(tk.body * 2)}px`,
            fontFamily: tk.coverFam,
            fontSize: `${Math.round(tk.body * 1.3)}px`,
            fontWeight: 700,
            marginTop: `${tk.gMeso}px`,
          },
          label,
        ),
      ],
    ),
  ], slide);
}

function tplPosterCards(slide: SduiSlide, tk: Tokens): Node {
  const p = posterPalette(slide, 'gw_poster_cards');
  const header = find(slide, 'header')?.text;
  const comparison = find(slide, 'comparison');
  const featureCards = find(slide, 'feature_cards');

  let content: Node;
  if (comparison?.columns && comparison.columns.length >= 2) {
    content = el(
      'div',
      { display: 'flex', flexDirection: 'row', flexGrow: 1, gap: `${tk.gMeso}px`, width: '100%' },
      comparison.columns.slice(0, 2).map((column) => {
        const negative = column.sentiment === 'negative';
        const colBg = negative ? GW.magenta : GW.blue;
        return el(
          'div',
          {
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            flexBasis: 0,
            backgroundColor: colBg,
            padding: `${tk.gMeso}px`,
            gap: `${tk.gMeso}px`,
          },
          [
            el(
              'div',
              {
                display: 'flex',
                fontFamily: tk.coverFam,
                fontSize: `${Math.round(tk.body * 1.4)}px`,
                fontWeight: 700,
                color: GW.cream,
                textTransform: 'uppercase',
              },
              column.label ?? '',
            ),
            ...(column.items ?? []).slice(0, 4).map((item) =>
              el(
                'div',
                {
                  display: 'flex',
                  fontFamily: tk.bodyFam,
                  fontSize: `${tk.body}px`,
                  fontWeight: 500,
                  color: GW.cream,
                  lineHeight: 1.3,
                  borderTop: `1px solid ${GW.cream}`,
                  paddingTop: `${tk.gMicro}px`,
                },
                item,
              ),
            ),
          ],
        );
      }),
    );
  } else {
    const cards = (featureCards?.items_cards ?? []).slice(0, 4);
    content = el(
      'div',
      {
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: `${tk.gMeso}px`,
        width: '100%',
        alignContent: 'center',
      },
      cards.map((card, i) =>
        el(
          'div',
          {
            display: 'flex',
            flexDirection: 'column',
            // 2px slack per card: an exact half-width fit trips satori's
            // float rounding and wraps everything into one overflowing column.
            width: `${Math.floor((tk.W - tk.pad * 2 - tk.gMeso) / 2) - 2}px`,
            border: `3px solid ${p.fg}`,
            padding: `${tk.gMeso}px`,
            gap: `${tk.gMicro}px`,
          },
          [
            el('div', { display: 'flex', justifyContent: 'space-between', width: '100%' }, [
              el('div', { display: 'flex', fontSize: `${Math.round(tk.body * 1.4)}px` }, card.icon ?? ''),
              braceNumber(i + 1, tk, p.accent),
            ]),
            el(
              'div',
              {
                display: 'flex',
                fontFamily: tk.coverFam,
                fontSize: `${Math.round(tk.body * 1.25)}px`,
                fontWeight: 700,
                color: p.fg,
              },
              card.title ?? '',
            ),
            ...(card.description
              ? [
                  el(
                    'div',
                    {
                      display: 'flex',
                      fontFamily: tk.bodyFam,
                      fontSize: `${tk.body}px`,
                      color: p.fg,
                      lineHeight: 1.35,
                    },
                    card.description,
                  ),
                ]
              : []),
          ],
        ),
      ),
    );
  }

  // Header + cards form one vertically-centered group — a header at the top
  // with cards floating below leaves a dead band under the grid.
  return posterCanvas(
    tk,
    p,
    [
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          justifyContent: 'center',
          gap: `${tk.gMacro}px`,
          width: '100%',
        },
        [
          ...(header
            ? [headerBlock(slide, header, undefined, tk, fitTitle(tk.titleXL, header), p.fg, 'left')]
            : []),
          content,
        ],
      ),
    ],
    slide,
  );
}

// ---------------------------------------------------------------------------
// PHOTO FAMILY
// ---------------------------------------------------------------------------

/**
 * Rotated lime rail along a vertical edge.
 * QA-verified: Satori rotates around the ELEMENT CENTER (transformOrigin is
 * not honored), so the box is positioned by its center: a wide horizontal
 * strip centered at (xCenter, H/2) becomes a vertical rail after rotate(-90).
 */
function rotatedRail(tk: Tokens, xCenter: number, text: string, size: number, color: string = GW.lime): Node {
  const safe = gwSafeArea(tk);
  const railW = tk.H - safe.top - safe.bottom;
  const railH = Math.round(size * 1.2);
  return el(
    'div',
    {
      position: 'absolute',
      left: `${Math.round(xCenter - railW / 2)}px`,
      top: `${Math.round(tk.H / 2 - railH / 2)}px`,
      width: `${railW}px`,
      height: `${railH}px`,
      display: 'flex',
      alignItems: 'center',
      transform: 'rotate(-90deg)',
      fontFamily: tk.coverFam,
      fontSize: `${size}px`,
      fontWeight: 700,
      color,
      lineHeight: 1,
    },
    text,
  );
}

function photoTextColor(slide: SduiSlide): string {
  // On photos only lime/cream keep contrast; anything else falls back to lime.
  return composition(slide).accent === 'cream' ? GW.cream : GW.lime;
}

function tplPhotoRotated(slide: SduiSlide, tk: Tokens): Node {
  const header = find(slide, 'header')?.text ?? '';
  const tag = find(slide, 'tag')?.text;
  const body = find(slide, 'body')?.text;
  const textColor = photoTextColor(slide);
  const safeFit = gwSafeArea(tk);
  const railW = tk.H - safeFit.top - safeFit.bottom;
  // Fit the rail font so the longest rail text stays on ONE line.
  const longest = Math.max(header.length, tag?.length ?? 0, 1);
  const railSize = clamp(
    Math.min(Math.round(tk.titleXL * 1.1), Math.floor(railW / (longest * 0.64))),
    40,
    110,
  );
  return el(
    'div',
    {
      display: 'flex',
      width: '100%',
      height: '100%',
      position: 'relative',
      backgroundColor: GW.ink,
    },
    [
      fullBleedImage(slide),
      el('div', {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundImage: 'linear-gradient(to bottom, rgba(35,35,38,0.05), rgba(35,35,38,0.55))',
      }),
      rotatedRail(tk, Math.round(tk.pad * 0.55 + railSize / 2), header.toUpperCase(), railSize, textColor),
      ...(tag
        ? [
            rotatedRail(
              tk,
              tk.W - Math.round(tk.pad * 0.55 + railSize / 2),
              tag.toUpperCase(),
              railSize,
              textColor,
            ),
          ]
        : []),
      ...(body
        ? [
            el(
              'div',
              {
                position: 'absolute',
                bottom: `${gwSafeArea(tk).bottom}px`,
                left: `${Math.round(tk.pad * 2.2)}px`,
                width: `${Math.round(tk.W * 0.5)}px`,
                display: 'flex',
              },
              [
                richText(body, undefined, {
                  fontFamily: tk.bodyFam,
                  fontSize: tk.body,
                  fontWeight: 500,
                  color: GW.cream,
                  highlightColor: GW.lime,
                  lineHeight: 1.4,
                  align: 'left',
                }),
              ],
            ),
          ]
        : []),
    ],
  );
}

function tplPhotoStatement(slide: SduiSlide, tk: Tokens): Node {
  const h = find(slide, 'header');
  const header = h?.text ?? '';
  const body = find(slide, 'body')?.text;
  const cta = find(slide, 'button_cta');
  const size = fitTitle(Math.round(tk.titleXL * 1.25), header);
  const textColor = photoTextColor(slide);
  // Guideline p.45 variant: accent 'magenta' swaps the ink scrim for the
  // magenta gradient wash ("Let's Take A Look" reference design).
  const magentaScrim = composition(slide).accent === 'magenta';
  const scrim = magentaScrim
    ? 'linear-gradient(to bottom, rgba(218,69,127,0), rgba(218,69,127,0.85))'
    : 'linear-gradient(to bottom, rgba(35,35,38,0), rgba(35,35,38,0.82))';
  // On the magenta wash a magenta highlight would vanish — use cream instead.
  const highlightColor = magentaScrim ? GW.cream : GW.magenta;
  return el(
    'div',
    {
      display: 'flex',
      width: '100%',
      height: '100%',
      position: 'relative',
      backgroundColor: GW.ink,
    },
    [
      fullBleedImage(slide),
      el('div', {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundImage: scrim,
      }),
      el(
        'div',
        {
          position: 'absolute',
          bottom: `${gwSafeArea(tk).bottom}px`,
          left: `${tk.pad}px`,
          width: `${tk.W - tk.pad * 2}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: `${tk.gMeso}px`,
        },
        [
          displayText(header, h?.highlight, tk, size, textColor, 'left', highlightColor),
          ...(body
            ? [
                richText(body, undefined, {
                  fontFamily: tk.bodyFam,
                  fontSize: tk.body,
                  fontWeight: 400,
                  color: GW.cream,
                  highlightColor: GW.lime,
                  lineHeight: 1.4,
                  align: 'left',
                }),
              ]
            : []),
          ...(cta?.label
            ? [
                el('div', { display: 'flex' }, [
                  el(
                    'div',
                    {
                      display: 'flex',
                      backgroundColor: GW.lime,
                      color: GW.ink,
                      padding: `${Math.round(tk.body * 0.7)}px ${Math.round(tk.body * 1.6)}px`,
                      fontFamily: tk.coverFam,
                      fontSize: `${Math.round(tk.body * 1.15)}px`,
                      fontWeight: 700,
                    },
                    cta.label,
                  ),
                ]),
              ]
            : []),
        ],
      ),
    ],
  );
}

// ---------------------------------------------------------------------------
// COLLAGE FAMILY
// ---------------------------------------------------------------------------

interface CardSpot {
  top: number;
  left: number;
  w: number;
  h: number;
}

/** Deterministic scatter positions (fractions of canvas) per card count. */
function collageSpots(count: number, scatter: GwCollageScatter = 'cascade'): CardSpot[] {
  // Tops start below the giant display header (which sits in the top safe area).
  if (scatter === 'stack') {
    // Centered column with slight alternating offsets.
    const h = count <= 2 ? 0.2 : count === 3 ? 0.16 : 0.13;
    const gap = 0.02;
    return Array.from({ length: Math.min(4, Math.max(1, count)) }, (_, i) => ({
      top: 0.28 + i * (h + gap),
      left: i % 2 === 0 ? 0.18 : 0.24,
      w: 0.58,
      h,
    }));
  }
  if (scatter === 'zigzag') {
    // Hard left/right alternation.
    const h = count <= 2 ? 0.19 : count === 3 ? 0.16 : 0.13;
    const gap = 0.015;
    return Array.from({ length: Math.min(4, Math.max(1, count)) }, (_, i) => ({
      top: 0.27 + i * (h + gap),
      left: i % 2 === 0 ? 0.05 : 0.47,
      w: 0.48,
      h,
    }));
  }
  // cascade (default) — diagonal overlap like the guideline reference.
  if (count <= 2) {
    return [
      { top: 0.3, left: 0.08, w: 0.44, h: 0.19 },
      { top: 0.44, left: 0.36, w: 0.44, h: 0.19 },
    ];
  }
  if (count === 3) {
    return [
      { top: 0.27, left: 0.07, w: 0.42, h: 0.17 },
      { top: 0.42, left: 0.4, w: 0.44, h: 0.17 },
      { top: 0.57, left: 0.12, w: 0.4, h: 0.17 },
    ];
  }
  return [
    { top: 0.26, left: 0.06, w: 0.4, h: 0.14 },
    { top: 0.37, left: 0.44, w: 0.42, h: 0.14 },
    { top: 0.48, left: 0.1, w: 0.4, h: 0.14 },
    { top: 0.59, left: 0.42, w: 0.42, h: 0.14 },
  ];
}

function tplCollageShowcase(slide: SduiSlide, tk: Tokens): Node {
  const h = find(slide, 'header');
  const header = h?.text ?? '';
  const body = find(slide, 'body')?.text;
  const images = findAll(slide, 'image_placeholder').slice(0, 4);
  const spots = collageSpots(images.length, composition(slide).scatter ?? 'cascade');
  const size = fitTitle(Math.round(tk.titleXL * 1.35), header);

  const cards = images.map((comp, i) => {
    const spot = spots[i] ?? spots[0]!;
    const w = Math.round(tk.W * spot.w);
    const hPx = Math.round(tk.H * spot.h);
    const img = comp.imageUrl
      ? (() => {
          const node = el('img', { width: '100%', height: '100%', objectFit: 'cover' });
          (node.props as Record<string, unknown>).src = comp.imageUrl;
          return node;
        })()
      : el('div', { width: '100%', height: '100%', display: 'flex', backgroundColor: '#0e5d8a' });
    return el(
      'div',
      {
        position: 'absolute',
        top: `${Math.round(tk.H * spot.top)}px`,
        left: `${Math.round(tk.W * spot.left)}px`,
        width: `${w}px`,
        height: `${hPx}px`,
        display: 'flex',
        flexDirection: 'column',
        border: `5px solid ${GW.cream}`,
        backgroundColor: GW.ink,
      },
      [
        el('div', { display: 'flex', flexGrow: 1, overflow: 'hidden' }, [img]),
        el(
          'div',
          {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: GW.ink,
            color: GW.cream,
            padding: `${Math.round(tk.gMicro * 0.8)}px ${tk.gMicro}px`,
            fontFamily: tk.bodyFam,
            fontSize: `${Math.round(tk.small * 0.9)}px`,
          },
          [
            el('div', { display: 'flex' }, `Project {${String(i + 1).padStart(2, '0')}}`),
          ],
        ),
      ],
    );
  });

  return el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      position: 'relative',
      backgroundColor: GW.blue,
      backgroundImage: `radial-gradient(circle at 30% 20%, #3f9ccb 0%, ${GW.blue} 60%)`,
    },
    [
      el(
        'div',
        {
          position: 'absolute',
          top: `${gwSafeArea(tk).top}px`,
          left: `${tk.pad}px`,
          width: `${tk.W - tk.pad * 2}px`,
          display: 'flex',
        },
        [displayText(`{${header}}`, h?.highlight, tk, size, GW.lime)],
      ),
      ...cards,
      ...(body
        ? [
            el(
              'div',
              {
                position: 'absolute',
                bottom: `${gwSafeArea(tk).bottom}px`,
                left: `${tk.pad}px`,
                width: `${Math.round(tk.W * 0.62)}px`,
                display: 'flex',
              },
              [
                richText(body, undefined, {
                  fontFamily: tk.bodyFam,
                  fontSize: tk.body,
                  fontWeight: 400,
                  color: GW.cream,
                  highlightColor: GW.lime,
                  lineHeight: 1.4,
                  align: 'left',
                }),
              ],
            ),
          ]
        : []),
    ],
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerGrowhaleyTemplates() {
  templateRegistry.set('gw_poster_cover', tplPosterCover);
  templateRegistry.set('gw_poster_statement', tplPosterStatement);
  templateRegistry.set('gw_poster_list', tplPosterList);
  templateRegistry.set('gw_poster_stat', tplPosterStat);
  templateRegistry.set('gw_poster_quote', tplPosterQuote);
  templateRegistry.set('gw_poster_cta', tplPosterCta);
  templateRegistry.set('gw_poster_cards', tplPosterCards);
  templateRegistry.set('gw_photo_rotated', tplPhotoRotated);
  templateRegistry.set('gw_photo_statement', tplPhotoStatement);
  templateRegistry.set('gw_collage_showcase', tplCollageShowcase);
}
