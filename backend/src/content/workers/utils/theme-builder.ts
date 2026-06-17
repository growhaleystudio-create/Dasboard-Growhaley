/**
 * theme-builder.ts
 * 
 * Theme building utilities for SDUI carousel rendering.
 * Handles brand kit transformation, color calculations, and typography configuration.
 */

import type {
  BrandKit,
  BrandTextRole,
  BrandTypographyRole,
  SduiThemeConfig,
  SduiTypographyOverride,
} from '@leads-generator/shared';

/**
 * Parse hex color string to RGB components
 * Supports both 3-digit (#abc) and 6-digit (#aabbcc) formats
 */
export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const c = hex.replace(/^#/, '');
  if (c.length === 3) {
    const r = parseInt(c[0]! + c[0], 16);
    const g = parseInt(c[1]! + c[1], 16);
    const b = parseInt(c[2]! + c[2], 16);
    return Number.isNaN(r) ? null : { r, g, b };
  }
  if (c.length === 6) {
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return Number.isNaN(r) ? null : { r, g, b };
  }
  return null;
}

/**
 * Calculate relative luminance of a color (0-1 scale)
 * Uses the standard WCAG formula for perceived brightness
 */
export function luminance(hex: string): number {
  const c = parseHex(hex) ?? { r: 255, g: 255, b: 255 };
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

/**
 * Validate and sanitize typography override from user input
 * Ensures values are within acceptable ranges
 */
export function sanitizeTypographyOverride(raw: unknown): SduiTypographyOverride | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const out: SduiTypographyOverride = {};
  
  if (typeof r.coverSizePx === 'number' && Number.isFinite(r.coverSizePx) && r.coverSizePx >= 12 && r.coverSizePx <= 180) {
    out.coverSizePx = Math.round(r.coverSizePx);
  }
  if (typeof r.headerSizePx === 'number' && Number.isFinite(r.headerSizePx) && r.headerSizePx >= 12 && r.headerSizePx <= 180) {
    out.headerSizePx = Math.round(r.headerSizePx);
  }
  if (typeof r.bodySizePx === 'number' && Number.isFinite(r.bodySizePx) && r.bodySizePx >= 8 && r.bodySizePx <= 96) {
    out.bodySizePx = Math.round(r.bodySizePx);
  }
  
  return out.coverSizePx !== undefined || out.headerSizePx !== undefined || out.bodySizePx !== undefined ? out : undefined;
}

/**
 * Extract typography sizes from theme config
 * Used to persist user-customized font sizes
 */
export function typographyFromTheme(theme: SduiThemeConfig): SduiTypographyOverride | undefined {
  const out: SduiTypographyOverride = {};
  if (theme.coverSizePx !== undefined) out.coverSizePx = theme.coverSizePx;
  if (theme.headerSizePx !== undefined) out.headerSizePx = theme.headerSizePx;
  if (theme.bodySizePx !== undefined) out.bodySizePx = theme.bodySizePx;
  return out.coverSizePx !== undefined || out.headerSizePx !== undefined || out.bodySizePx !== undefined ? out : undefined;
}

/**
 * Build complete theme configuration from brand kit
 * 
 * This is the core theme builder that transforms a brand kit into a render-ready
 * theme config with calculated colors, font families, and typography scales.
 * 
 * @param brandKit - The brand kit with fonts, colors, and typography settings
 * @param baseBodySizePx - Base body font size (typically calculated from canvas width)
 * @param typographyOverride - Optional user overrides for font sizes
 * @returns Complete SduiThemeConfig ready for rendering
 */
export function buildTheme(
  brandKit: BrandKit,
  baseBodySizePx: number,
  typographyOverride?: SduiTypographyOverride,
): SduiThemeConfig {
  const accentBrand = brandKit.colors[0] ?? '#187DB4';
  const darkest = [...brandKit.colors].sort((a, b) => luminance(a) - luminance(b))[0];
  const fallbackHeader = darkest && luminance(darkest) < 0.45 ? darkest : '#1a1d24';
  const t = brandKit.typography;

  const headerFamily = t?.header?.fontFamily || brandKit.fonts[0]?.family || '';
  const coverFamily = t?.cover?.fontFamily || headerFamily;
  const bodyFamily = t?.body?.fontFamily || brandKit.fonts[1]?.family || brandKit.fonts[0]?.family || '';
  
  const accent = t?.accent || accentBrand;
  const onAccent = luminance(accent) < 0.55 ? '#ffffff' : '#1a1d24';
  
  const colors = {
    background: t?.background || '#F4F3EF',
    header: t?.header?.color || t?.cover?.color || fallbackHeader,
    body: t?.body?.color || '#5b626e',
    highlight: t?.highlightColor || accentBrand,
    pagination: t?.paginationColor || '#5b626e',
    meta: t?.metaTextColor || '#5b626e',
    accent,
    onAccent,
  };

  const roleWithFallback = (role: BrandTypographyRole, fallback: BrandTextRole): BrandTextRole => {
    const source = t?.[role];
    const out: BrandTextRole = {
      fontFamily: source?.fontFamily || fallback.fontFamily,
      color: source?.color || fallback.color,
    };
    const size = source?.sizePx ?? fallback.sizePx;
    if (size !== undefined) out.sizePx = size;
    return out;
  };

  const bodyPx = typographyOverride?.bodySizePx ?? t?.body?.sizePx ?? baseBodySizePx;
  const headerPx = typographyOverride?.headerSizePx ?? t?.header?.sizePx;
  const coverPx = typographyOverride?.coverSizePx ?? t?.cover?.sizePx ?? headerPx;

  const headerRole = { fontFamily: headerFamily, color: colors.header, ...(headerPx !== undefined ? { sizePx: headerPx } : {}) };
  const coverRole = { fontFamily: coverFamily, color: t?.cover?.color || colors.header, ...(coverPx !== undefined ? { sizePx: coverPx } : {}) };
  const bodyRole = { fontFamily: bodyFamily, color: colors.body, sizePx: bodyPx };

  const typographyRoles: Partial<Record<BrandTypographyRole, BrandTextRole>> = {
    cover: roleWithFallback('cover', coverRole),
    header: roleWithFallback('header', headerRole),
    body: roleWithFallback('body', bodyRole),
    tag: roleWithFallback('tag', { fontFamily: headerFamily, color: colors.meta, sizePx: Math.round(bodyPx * 0.76) }),
    quote: roleWithFallback('quote', { fontFamily: coverFamily, color: colors.header, ...(headerPx !== undefined ? { sizePx: headerPx } : {}) }),
    list: roleWithFallback('list', { fontFamily: bodyFamily, color: colors.header, sizePx: Math.round(bodyPx * 0.95) }),
    cta: roleWithFallback('cta', { fontFamily: bodyFamily, color: colors.onAccent, sizePx: Math.round(bodyPx * 0.95) }),
    card: roleWithFallback('card', { fontFamily: bodyFamily, color: colors.header, sizePx: Math.round(bodyPx * 0.9) }),
    stat: roleWithFallback('stat', { fontFamily: coverFamily, color: colors.highlight, ...(coverPx !== undefined ? { sizePx: coverPx } : {}) }),
    caption: roleWithFallback('caption', { fontFamily: bodyFamily, color: colors.meta, sizePx: Math.round(bodyPx * 0.72) }),
    chrome: roleWithFallback('chrome', { fontFamily: bodyFamily, color: colors.pagination, sizePx: Math.round(bodyPx * 0.76) }),
  };

  return {
    logoUrl: brandKit.logoUrl,
    logoPlacement: brandKit.chrome.logoPlacement,
    logoSizePx: brandKit.chrome.logoSizePx,
    siteUrl: brandKit.chrome.siteUrl,
    pageNumberFormat: brandKit.chrome.pageNumberFormat,
    coverFontFamily: coverFamily,
    headerFontFamily: headerFamily,
    bodyFontFamily: bodyFamily,
    baseBodySizePx,
    coverSizePx: coverPx,
    headerSizePx: headerPx,
    bodySizePx: bodyPx,
    typographyRoles,
    colors,
  };
}

/**
 * ThemeBuilder - Static utility class for theme operations
 */
export const ThemeBuilder = {
  parseHex,
  luminance,
  sanitizeTypographyOverride,
  typographyFromTheme,
  buildTheme,
} as const;
