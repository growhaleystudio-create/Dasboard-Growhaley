/**
 * theme-builder.test.ts
 * 
 * Unit tests for theme building utilities
 */

import { describe, it, expect } from 'vitest';
import { ThemeBuilder } from '../theme-builder.js';
import type { BrandKit } from '@leads-generator/shared';

describe('ThemeBuilder', () => {
  describe('parseHex', () => {
    it('should parse 3-digit hex color', () => {
      expect(ThemeBuilder.parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 });
      expect(ThemeBuilder.parseHex('#f0f')).toEqual({ r: 255, g: 0, b: 255 });
      expect(ThemeBuilder.parseHex('abc')).toEqual({ r: 170, g: 187, b: 204 });
    });

    it('should parse 6-digit hex color', () => {
      expect(ThemeBuilder.parseHex('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(ThemeBuilder.parseHex('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(ThemeBuilder.parseHex('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
      expect(ThemeBuilder.parseHex('ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('should return null for invalid hex formats', () => {
      expect(ThemeBuilder.parseHex('#gg0000')).toBeNull();
      expect(ThemeBuilder.parseHex('#12')).toBeNull();
      expect(ThemeBuilder.parseHex('#1234567')).toBeNull();
      expect(ThemeBuilder.parseHex('invalid')).toBeNull();
    });

    it('should handle edge cases', () => {
      expect(ThemeBuilder.parseHex('#000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(ThemeBuilder.parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(ThemeBuilder.parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });
  });

  describe('luminance', () => {
    it('should calculate luminance for black', () => {
      expect(ThemeBuilder.luminance('#000000')).toBe(0);
    });

    it('should calculate luminance for white', () => {
      expect(ThemeBuilder.luminance('#ffffff')).toBeCloseTo(1, 10);
    });

    it('should calculate luminance for gray', () => {
      const gray = ThemeBuilder.luminance('#808080');
      expect(gray).toBeGreaterThan(0);
      expect(gray).toBeLessThan(1);
    });

    it('should calculate luminance for brand colors', () => {
      expect(ThemeBuilder.luminance('#187DB4')).toBeGreaterThan(0);
      expect(ThemeBuilder.luminance('#187DB4')).toBeLessThan(1);
    });

    it('should use default white for invalid hex', () => {
      expect(ThemeBuilder.luminance('invalid')).toBeCloseTo(1, 10);
    });
  });

  describe('sanitizeTypographyOverride', () => {
    it('should return undefined for non-object input', () => {
      expect(ThemeBuilder.sanitizeTypographyOverride(null)).toBeUndefined();
      expect(ThemeBuilder.sanitizeTypographyOverride('string')).toBeUndefined();
      expect(ThemeBuilder.sanitizeTypographyOverride(123)).toBeUndefined();
      expect(ThemeBuilder.sanitizeTypographyOverride([])).toBeUndefined();
    });

    it('should sanitize valid cover size', () => {
      const result = ThemeBuilder.sanitizeTypographyOverride({ coverSizePx: 48 });
      expect(result).toEqual({ coverSizePx: 48 });
    });

    it('should sanitize valid header size', () => {
      const result = ThemeBuilder.sanitizeTypographyOverride({ headerSizePx: 32 });
      expect(result).toEqual({ headerSizePx: 32 });
    });

    it('should sanitize valid body size', () => {
      const result = ThemeBuilder.sanitizeTypographyOverride({ bodySizePx: 16 });
      expect(result).toEqual({ bodySizePx: 16 });
    });

    it('should sanitize all sizes together', () => {
      const result = ThemeBuilder.sanitizeTypographyOverride({
        coverSizePx: 48,
        headerSizePx: 32,
        bodySizePx: 16,
      });
      expect(result).toEqual({
        coverSizePx: 48,
        headerSizePx: 32,
        bodySizePx: 16,
      });
    });

    it('should round decimal values', () => {
      const result = ThemeBuilder.sanitizeTypographyOverride({
        coverSizePx: 48.7,
        headerSizePx: 32.3,
        bodySizePx: 16.5,
      });
      expect(result).toEqual({
        coverSizePx: 49,
        headerSizePx: 32,
        bodySizePx: 17,
      });
    });

    it('should reject out-of-range cover sizes', () => {
      expect(ThemeBuilder.sanitizeTypographyOverride({ coverSizePx: 11 })).toBeUndefined();
      expect(ThemeBuilder.sanitizeTypographyOverride({ coverSizePx: 181 })).toBeUndefined();
    });

    it('should reject out-of-range header sizes', () => {
      expect(ThemeBuilder.sanitizeTypographyOverride({ headerSizePx: 11 })).toBeUndefined();
      expect(ThemeBuilder.sanitizeTypographyOverride({ headerSizePx: 181 })).toBeUndefined();
    });

    it('should reject out-of-range body sizes', () => {
      expect(ThemeBuilder.sanitizeTypographyOverride({ bodySizePx: 7 })).toBeUndefined();
      expect(ThemeBuilder.sanitizeTypographyOverride({ bodySizePx: 97 })).toBeUndefined();
    });

    it('should reject non-finite numbers', () => {
      expect(ThemeBuilder.sanitizeTypographyOverride({ coverSizePx: Infinity })).toBeUndefined();
      expect(ThemeBuilder.sanitizeTypographyOverride({ headerSizePx: NaN })).toBeUndefined();
    });

    it('should ignore invalid properties', () => {
      const result = ThemeBuilder.sanitizeTypographyOverride({
        coverSizePx: 48,
        invalidProp: 'test',
        anotherInvalid: 123,
      });
      expect(result).toEqual({ coverSizePx: 48 });
    });
  });

  describe('typographyFromTheme', () => {
    it('should extract typography sizes from theme', () => {
      const theme: any = {
        coverSizePx: 48,
        headerSizePx: 32,
        bodySizePx: 16,
      };
      const result = ThemeBuilder.typographyFromTheme(theme);
      expect(result).toEqual({
        coverSizePx: 48,
        headerSizePx: 32,
        bodySizePx: 16,
      });
    });

    it('should return undefined when no sizes are defined', () => {
      const theme: any = {};
      expect(ThemeBuilder.typographyFromTheme(theme)).toBeUndefined();
    });

    it('should extract partial typography sizes', () => {
      const theme: any = {
        coverSizePx: 48,
      };
      const result = ThemeBuilder.typographyFromTheme(theme);
      expect(result).toEqual({ coverSizePx: 48 });
    });

    it('should handle undefined sizes', () => {
      const theme: any = {
        coverSizePx: undefined,
        headerSizePx: 32,
      };
      const result = ThemeBuilder.typographyFromTheme(theme);
      expect(result).toEqual({ headerSizePx: 32 });
    });
  });

  describe('buildTheme', () => {
    const mockBrandKit: BrandKit = {
      id: 'test-kit',
      teamId: 'team-1',
      colors: ['#187DB4', '#1a1d24'],
      fonts: [
        { id: 'font-1', family: 'Inter', url: 'https://fonts.test/inter.woff2' },
        { id: 'font-2', family: 'Roboto', url: 'https://fonts.test/roboto.woff2' },
      ],
      logoUrl: 'https://example.com/logo.png',
      chrome: {
        logoPlacement: 'top-left',
        logoSizePx: 48,
        pageNumberFormat: 'number',
        siteUrl: 'https://example.com',
      },
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    };

    it('should build theme with defaults', () => {
      const theme = ThemeBuilder.buildTheme(mockBrandKit, 32);
      
      expect(theme.baseBodySizePx).toBe(32);
      expect(theme.headerFontFamily).toBe('Inter');
      expect(theme.bodyFontFamily).toBe('Roboto');
      expect(theme.colors.background).toBe('#F4F3EF');
      expect(theme.logoPlacement).toBe('top-left');
    });

    it('should use first color as accent', () => {
      const theme = ThemeBuilder.buildTheme(mockBrandKit, 32);
      expect(theme.colors.accent).toBe('#187DB4');
    });

    it('should calculate onAccent color based on luminance', () => {
      const theme = ThemeBuilder.buildTheme(mockBrandKit, 32);
      // #187DB4 has low luminance, so onAccent should be white
      expect(theme.colors.onAccent).toBe('#ffffff');
    });

    it('should apply typography overrides', () => {
      const override = {
        coverSizePx: 48,
        headerSizePx: 36,
        bodySizePx: 18,
      };
      const theme = ThemeBuilder.buildTheme(mockBrandKit, 32, override);
      
      expect(theme.coverSizePx).toBe(48);
      expect(theme.headerSizePx).toBe(36);
      expect(theme.bodySizePx).toBe(18);
    });

    it('should calculate derived typography sizes', () => {
      const theme = ThemeBuilder.buildTheme(mockBrandKit, 32);
      
      // Tag should be 0.76 * body
      expect(theme.typographyRoles?.tag?.sizePx).toBe(Math.round(32 * 0.76));
      // Caption should be 0.72 * body
      expect(theme.typographyRoles?.caption?.sizePx).toBe(Math.round(32 * 0.72));
    });

    it('should use darkest color for header fallback', () => {
      const theme = ThemeBuilder.buildTheme(mockBrandKit, 32);
      // #1a1d24 is darker than #187DB4
      expect(theme.colors.header).toBe('#1a1d24');
    });

    it('should handle empty colors array', () => {
      const kitWithoutColors: BrandKit = {
        ...mockBrandKit,
        colors: [],
      };
      const theme = ThemeBuilder.buildTheme(kitWithoutColors, 32);
      expect(theme.colors.accent).toBe('#187DB4'); // default fallback
    });

    it('should handle missing fonts', () => {
      const kitWithoutFonts: BrandKit = {
        ...mockBrandKit,
        fonts: [],
      };
      const theme = ThemeBuilder.buildTheme(kitWithoutFonts, 32);
      expect(theme.headerFontFamily).toBe('');
      expect(theme.bodyFontFamily).toBe('');
    });

    it('should use brand kit typography if provided', () => {
      const kitWithTypography: BrandKit = {
        ...mockBrandKit,
        typography: {
          background: '#ffffff',
          accent: '#ff0000',
          highlightColor: '#ff9900',
          paginationColor: '#888888',
          metaTextColor: '#999999',
          header: { fontFamily: 'CustomHeader', color: '#333333', sizePx: 40 },
          body: { fontFamily: 'CustomBody', color: '#666666', sizePx: 18 },
        },
      };
      const theme = ThemeBuilder.buildTheme(kitWithTypography, 32);
      
      expect(theme.colors.background).toBe('#ffffff');
      expect(theme.colors.accent).toBe('#ff0000');
      expect(theme.headerFontFamily).toBe('CustomHeader');
      expect(theme.bodyFontFamily).toBe('CustomBody');
      expect(theme.headerSizePx).toBe(40);
      expect(theme.bodySizePx).toBe(18);
    });

    it('should create all typography roles', () => {
      const theme = ThemeBuilder.buildTheme(mockBrandKit, 32);
      
      expect(theme.typographyRoles?.cover).toBeDefined();
      expect(theme.typographyRoles?.header).toBeDefined();
      expect(theme.typographyRoles?.body).toBeDefined();
      expect(theme.typographyRoles?.tag).toBeDefined();
      expect(theme.typographyRoles?.quote).toBeDefined();
      expect(theme.typographyRoles?.list).toBeDefined();
      expect(theme.typographyRoles?.cta).toBeDefined();
      expect(theme.typographyRoles?.card).toBeDefined();
      expect(theme.typographyRoles?.stat).toBeDefined();
      expect(theme.typographyRoles?.caption).toBeDefined();
      expect(theme.typographyRoles?.chrome).toBeDefined();
    });
  });
});
