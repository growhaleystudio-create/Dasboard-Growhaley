/**
 * Unit tests for DefaultSlideLayoutCatalog.
 *
 * Tests verify:
 * - variantsFor returns matching variants for known composition types
 * - variantsFor falls back to generic-default for unknown compositions
 * - variantsFor returns results for all 3 aspect ratios
 * - defaultFor always returns a variant with isDefault=true
 * - defaultFor throws for an empty catalog (programmer error guard)
 * - composition signature is order-independent
 *
 * Requirements: 6.1, 6.4
 */

import { describe, it, expect } from 'vitest';
import type { AspectRatio, BlockType } from '@leads-generator/shared';
import {
  DefaultSlideLayoutCatalog,
  type SlideLayoutVariant,
} from './slide-layout-catalog.js';

const ALL_RATIOS: AspectRatio[] = ['1:1', '4:5', '9:16'];

describe('DefaultSlideLayoutCatalog.variantsFor', () => {
  const catalog = new DefaultSlideLayoutCatalog();

  it('returns cover-centered variant for ["heading"] and each aspect ratio', () => {
    for (const ratio of ALL_RATIOS) {
      const variants = catalog.variantsFor(['heading'], ratio);
      expect(variants.length).toBeGreaterThanOrEqual(1);
      expect(variants.some((v) => v.id === 'cover-centered')).toBe(true);
    }
  });

  it('returns text-traditional variant for ["heading","body"] (order should not matter)', () => {
    for (const ratio of ALL_RATIOS) {
      const variants1 = catalog.variantsFor(['heading', 'body'], ratio);
      const variants2 = catalog.variantsFor(['body', 'heading'], ratio);
      // Both orderings should return the same variants
      const ids1 = variants1.map((v) => v.id).sort();
      const ids2 = variants2.map((v) => v.id).sort();
      expect(ids1).toEqual(ids2);
      expect(variants1.some((v) => v.id === 'text-traditional')).toBe(true);
    }
  });

  it('returns data-standard variant for ["heading","body","chart"]', () => {
    const variants = catalog.variantsFor(['heading', 'body', 'chart'], '1:1');
    expect(variants.some((v) => v.id === 'data-standard')).toBe(true);
  });

  it('returns mockup-standard variant for ["mockup","body"]', () => {
    const variants = catalog.variantsFor(['mockup', 'body'], '4:5');
    expect(variants.some((v) => v.id === 'mockup-standard')).toBe(true);
  });

  it('returns chart-standard variant for ["heading","chart"]', () => {
    const variants = catalog.variantsFor(['heading', 'chart'], '9:16');
    expect(variants.some((v) => v.id === 'chart-standard')).toBe(true);
  });

  it('returns stat-standard variant for ["heading","body","stat"]', () => {
    const variants = catalog.variantsFor(['heading', 'body', 'stat'], '1:1');
    expect(variants.some((v) => v.id === 'stat-standard')).toBe(true);
  });

  it('returns list-standard variant for ["heading","bullet"]', () => {
    const variants = catalog.variantsFor(['heading', 'bullet'], '4:5');
    expect(variants.some((v) => v.id === 'list-standard')).toBe(true);
  });

  it('returns quote-centered variant for ["quote"]', () => {
    const variants = catalog.variantsFor(['quote'], '1:1');
    expect(variants.some((v) => v.id === 'quote-centered')).toBe(true);
  });

  it('returns cta-centered variant for ["cta"]', () => {
    const variants = catalog.variantsFor(['cta'], '9:16');
    expect(variants.some((v) => v.id === 'cta-centered')).toBe(true);
  });

  it('falls back to generic-default for an unknown composition', () => {
    const unknownBlocks: BlockType[] = ['image', 'stat', 'cta', 'mockup'];
    for (const ratio of ALL_RATIOS) {
      const variants = catalog.variantsFor(unknownBlocks, ratio);
      expect(variants.length).toBeGreaterThanOrEqual(1);
      expect(variants.some((v) => v.compositionType === 'default')).toBe(true);
    }
  });

  it('returns at least 1 variant for every aspect ratio (guarantees non-empty)', () => {
    const compositions: BlockType[][] = [
      ['heading'],
      ['heading', 'body'],
      ['heading', 'body', 'chart'],
      ['mockup', 'body'],
      ['heading', 'chart'],
      ['heading', 'body', 'stat'],
      ['heading', 'bullet'],
      ['quote'],
      ['cta'],
      ['image'], // unknown — falls back to generic-default
    ];
    for (const blocks of compositions) {
      for (const ratio of ALL_RATIOS) {
        const variants = catalog.variantsFor(blocks, ratio);
        expect(variants.length, `empty for ${blocks.join(',')} @ ${ratio}`).toBeGreaterThanOrEqual(
          1,
        );
      }
    }
  });
});

describe('DefaultSlideLayoutCatalog.defaultFor', () => {
  const catalog = new DefaultSlideLayoutCatalog();

  it('returns a variant with isDefault=true for known compositions', () => {
    const known: [BlockType[], AspectRatio][] = [
      [['heading'], '1:1'],
      [['heading', 'body'], '4:5'],
      [['heading', 'body', 'chart'], '9:16'],
      [['mockup', 'body'], '1:1'],
      [['heading', 'chart'], '4:5'],
      [['quote'], '9:16'],
      [['cta'], '1:1'],
    ];
    for (const [blocks, ratio] of known) {
      const variant = catalog.defaultFor(blocks, ratio);
      expect(variant.isDefault, `not default for ${blocks.join(',')} @ ${ratio}`).toBe(true);
    }
  });

  it('returns the generic-default variant for an unknown composition', () => {
    const variant = catalog.defaultFor(['image', 'body', 'stat'], '1:1');
    expect(variant.isDefault).toBe(true);
    expect(variant.compositionType).toBe('default');
  });

  it('throws if the catalog has no default variant for a composition (programmer error guard)', () => {
    // Provide a catalog that only has a non-default variant with no fallback
    const brokenVariants: SlideLayoutVariant[] = [
      {
        id: 'no-default',
        compositionType: 'heading',
        aspectRatios: ['1:1'],
        regions: [{ blockType: 'heading', box: { x: 0, y: 100, w: 1000, h: 800 } }],
        isDefault: false,
      },
    ];
    const brokenCatalog = new DefaultSlideLayoutCatalog(brokenVariants);
    expect(() => brokenCatalog.defaultFor(['heading'], '1:1')).toThrow(
      /no default variant found/,
    );
  });

  it('result from defaultFor is always included in variantsFor results', () => {
    const compositions: BlockType[][] = [
      ['heading'],
      ['heading', 'body'],
      ['cta'],
      ['image'], // unknown
    ];
    for (const blocks of compositions) {
      for (const ratio of ALL_RATIOS) {
        const all = catalog.variantsFor(blocks, ratio);
        const def = catalog.defaultFor(blocks, ratio);
        expect(all.some((v) => v.id === def.id)).toBe(true);
      }
    }
  });
});

describe('SlideLayoutVariant region boxes', () => {
  const catalog = new DefaultSlideLayoutCatalog();

  it('all regions are within the content area (y 100..900, x 0..1000)', () => {
    const allVariants = catalog.variantsFor(['heading'], '1:1').concat(
      catalog.variantsFor(['heading', 'body'], '1:1'),
      catalog.variantsFor(['quote'], '1:1'),
      catalog.variantsFor(['cta'], '1:1'),
      catalog.variantsFor(['heading', 'chart'], '1:1'),
    );
    for (const variant of allVariants) {
      for (const region of variant.regions) {
        const { x, y, w, h } = region.box;
        expect(y, `${variant.id} y=${y} below 100`).toBeGreaterThanOrEqual(100);
        expect(y + h, `${variant.id} y+h=${y + h} above 900`).toBeLessThanOrEqual(900);
        expect(x, `${variant.id} x=${x} < 0`).toBeGreaterThanOrEqual(0);
        expect(x + w, `${variant.id} x+w=${x + w} > 1000`).toBeLessThanOrEqual(1000);
      }
    }
  });
});
