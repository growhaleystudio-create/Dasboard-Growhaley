import type { BrandTypographyRole, SduiDocument, SduiSlide } from '@leads-generator/shared';

import { checklistItems, componentText } from './accessors.js';
import { fam, GW_BODY_FAMILY, GW_DISPLAY_FAMILY } from './fonts.js';

// Local type alias for layout variant IDs (string-based)
type LayoutVariantId = string;

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export interface Tokens {
  W: number;
  H: number;
  pad: number;
  radius: number;
  gMacro: number;
  gMeso: number;
  gMicro: number;
  coverFam: string;
  headerFam: string;
  bodyFam: string;
  titleXL: number;
  titleL: number;
  titleM: number;
  body: number;
  small: number;
  huge: number;
  c: SduiDocument['theme']['colors'];
  role: Record<BrandTypographyRole, { fam: string; size: number; color: string }>;
}

export function fitTitle(base: number, text: string): number {
  const len = text.trim().length;
  if (len > 72) return Math.round(base * 0.72);
  if (len > 56) return Math.round(base * 0.82);
  if (len > 44) return Math.round(base * 0.9);
  return base;
}

export function estimatedLines(text: string, fontSize: number, width: number): number {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 0;
  const charsPerLine = Math.max(8, Math.floor(width / (fontSize * 0.52)));
  return Math.max(1, Math.ceil(clean.length / charsPerLine));
}

export function contentWidthForTemplate(templateId: LayoutVariantId, tk: Tokens): number {
  const full = tk.W - tk.pad * 2;
  if (templateId === 'gw_poster_quote') {
    return Math.max(320, Math.round(full * 0.78));
  }
  if (templateId === 'gw_photo_rotated') {
    // Rotated rails eat the vertical edges; the horizontal body is narrower.
    return Math.max(320, Math.round(full * 0.62));
  }
  return full;
}

export function contentHeightForTemplate(templateId: LayoutVariantId, tk: Tokens): number {
  const chromeReserve = Math.round(tk.small * 4.7);
  let height = tk.H - tk.pad * 2 - chromeReserve - tk.gMacro * 2;
  if (templateId === 'gw_photo_statement' || templateId === 'gw_collage_showcase') {
    // Text occupies only the lower band over the photo/collage.
    height = Math.round(height * 0.55);
  }
  return Math.max(220, height);
}

export function estimateTextHeight(
  slide: SduiSlide,
  templateId: LayoutVariantId,
  tk: Tokens,
  scale: number,
): number {
  const width = contentWidthForTemplate(templateId, tk);
  const headerText = componentText(slide, 'header') || componentText(slide, 'quote');
  const bodyText = componentText(slide, 'body');
  const ctaText = componentText(slide, 'button_cta');
  const items = checklistItems(slide);

  // Display-size multipliers used by the Growhaley templates (keep in sync
  // with templates/growhaley.ts) so overflow estimation matches real render.
  const GW_TITLE_SCALE: Record<string, number> = {
    gw_poster_cover: 1.45,
    gw_poster_statement: 1.15,
    gw_poster_cta: 1.3,
    gw_poster_quote: 1.1,
    gw_photo_statement: 1.25,
    gw_collage_showcase: 1.35,
  };
  const gwScale = GW_TITLE_SCALE[templateId];
  const titleBase = gwScale
    ? Math.round(tk.titleXL * gwScale)
    : slide.slide_type === 'cover'
      ? tk.titleXL
      : tk.titleL;
  const titleSize = fitTitle(titleBase, headerText) * scale;
  const bodySize = tk.body * scale;
  const itemSize = clamp(Math.round(tk.body * 0.95 * scale), 15, 32);
  const gap = tk.gMeso * scale;

  let height = 0;
  if (headerText) height += estimatedLines(headerText, titleSize, width) * titleSize * 1.12;
  if (bodyText) height += estimatedLines(bodyText, bodySize, width) * bodySize * 1.45;
  if (items.length > 0) {
    height += items.reduce(
      (sum, item) =>
        sum +
        Math.max(
          itemSize * 1.9,
          estimatedLines(item, itemSize, width - itemSize * 2.1) * itemSize * 1.35,
        ),
      0,
    );
  }
  if (ctaText) height += bodySize * 2.6;

  const blockCount = [headerText, bodyText, ctaText, items.length > 0 ? 'items' : ''].filter(
    Boolean,
  ).length;
  return height + Math.max(0, blockCount - 1) * gap;
}

export function fitContentTokens(
  slide: SduiSlide,
  templateId: LayoutVariantId,
  tk: Tokens,
): Tokens {
  const availableHeight = contentHeightForTemplate(templateId, tk);
  const estimated = estimateTextHeight(slide, templateId, tk, 1);
  if (estimated <= availableHeight) return tk;

  const minScale = templateId.includes('image') || templateId.includes('split') ? 0.68 : 0.72;
  const scale = clamp(availableHeight / estimated, minScale, 1);
  if (scale >= 0.98) return tk;

  return scaleTypographyTokens(tk, scale);
}

/**
 * Uniformly rescale the typographic tokens (type sizes + spacing). Used by
 * fitContentTokens (estimator-driven shrink) and by the renderer's measured
 * second pass (SVG-driven grow/shrink, see satori-renderer.ts).
 */
export function scaleTypographyTokens(tk: Tokens, scale: number): Tokens {
  return {
    ...tk,
    gMacro: Math.round(tk.gMacro * clamp(scale + 0.08, 0.75, Math.max(1, scale))),
    gMeso: Math.round(tk.gMeso * clamp(scale + 0.06, 0.72, Math.max(1, scale))),
    gMicro: Math.round(tk.gMicro * clamp(scale + 0.05, 0.72, Math.max(1, scale))),
    titleXL: Math.round(tk.titleXL * scale),
    titleL: Math.round(tk.titleL * scale),
    titleM: Math.round(tk.titleM * scale),
    body: Math.round(tk.body * scale),
    huge: Math.round(tk.huge * scale),
  };
}

export function makeTokens(
  doc: SduiDocument,
  dims: { width: number; height: number },
  available: Set<string>,
): Tokens {
  const W = dims.width;
  const H = dims.height;
  const t = doc.theme;
  const coverSize = clamp(Math.round(t.coverSizePx ?? W * 0.085), 40, 120);
  const headerSize = clamp(Math.round(t.headerSizePx ?? W * 0.06), 30, 84);
  const bodySize = clamp(Math.round(t.bodySizePx ?? W * 0.032), 16, 40);
  const smallSize = Math.round(W * 0.024);
  // Growhaley bundled faces are the system default; a brand-kit font, when
  // configured AND successfully loaded, still takes precedence.
  const coverFam = fam(t.coverFontFamily || t.headerFontFamily || GW_DISPLAY_FAMILY, available);
  const headerFam = fam(t.headerFontFamily || GW_DISPLAY_FAMILY, available);
  const bodyFam = fam(t.bodyFontFamily || GW_BODY_FAMILY, available);
  const role = (
    roleName: BrandTypographyRole,
    fallback: { fam: string; size: number; color: string },
  ) => {
    const source = t.typographyRoles?.[roleName];
    return {
      fam: fam(source?.fontFamily, available) || fallback.fam,
      size: clamp(Math.round(source?.sizePx ?? fallback.size), 8, 180),
      color: source?.color || fallback.color,
    };
  };
  const roleTokens: Tokens['role'] = {
    cover: role('cover', { fam: coverFam, size: coverSize, color: t.colors.header }),
    header: role('header', { fam: headerFam, size: headerSize, color: t.colors.header }),
    body: role('body', { fam: bodyFam, size: bodySize, color: t.colors.body }),
    tag: role('tag', { fam: headerFam, size: smallSize, color: t.colors.meta }),
    quote: role('quote', { fam: coverFam, size: headerSize, color: t.colors.header }),
    list: role('list', { fam: bodyFam, size: Math.round(bodySize * 0.95), color: t.colors.header }),
    cta: role('cta', { fam: bodyFam, size: Math.round(bodySize * 0.95), color: t.colors.onAccent }),
    card: role('card', { fam: bodyFam, size: Math.round(bodySize * 0.9), color: t.colors.header }),
    stat: role('stat', { fam: coverFam, size: coverSize, color: t.colors.highlight }),
    caption: role('caption', {
      fam: bodyFam,
      size: Math.round(smallSize * 0.95),
      color: t.colors.meta,
    }),
    chrome: role('chrome', { fam: bodyFam, size: smallSize, color: t.colors.pagination }),
  };

  return {
    W,
    H,
    // Official Growhaley grid margin: 70pt on a 1080pt canvas (guideline p.42).
    pad: Math.round(W * (70 / 1080)),
    radius: Math.round(W * 0.03),
    gMacro: Math.round(W * 0.045),
    gMeso: Math.round(W * 0.022),
    gMicro: Math.round(W * 0.012),
    coverFam,
    headerFam,
    bodyFam,
    titleXL: coverSize,
    titleL: headerSize,
    titleM: clamp(Math.round(headerSize * 0.82), 26, 64),
    body: bodySize,
    small: smallSize,
    huge: Math.round(W * 0.2),
    c: t.colors,
    role: roleTokens,
  };
}
