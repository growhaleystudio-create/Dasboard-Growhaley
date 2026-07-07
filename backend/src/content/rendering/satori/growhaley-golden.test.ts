/**
 * growhaley-golden.test.ts — metrics-based golden test for the 10 Growhaley
 * templates across all 3 aspect ratios.
 *
 * Not a pixel diff (brittle); asserts the deterministic render metrics that
 * define "not broken": PNG produced, no content/chrome collision after the
 * measured correction pass, and no severely underfilled canvas.
 */

import { describe, it, expect } from 'vitest';
import type { AspectRatio } from '@leads-generator/shared';

import { SatoriRenderer } from '../../satori-renderer.js';
import { makeDoc } from '../../../dev/growhaley-qa-fixtures.js';

const RATIOS: AspectRatio[] = ['1:1', '4:5', '9:16'];

describe('growhaley templates golden metrics', () => {
  const renderer = new SatoriRenderer();

  for (const ratio of RATIOS) {
    it(`renders all templates within quality bounds at ${ratio}`, { timeout: 90_000 }, async () => {
      const doc = makeDoc(ratio);
      for (const slide of doc.slides) {
        const { png, metrics } = await renderer.renderSlideWithMetrics(slide, doc, []);
        const label = `${slide.layout_variant_id}@${ratio}`;

        expect(png.length, `${label}: empty png`).toBeGreaterThan(10_000);
        expect(metrics.overflow, `${label}: content collides with bottom chrome`).toBe(false);
        // Photo/collage layouts are bottom-anchored by design — the density
        // floor only applies to the poster family.
        const underfillExempt =
          (slide.layout_variant_id ?? '').startsWith('gw_photo_') ||
          slide.layout_variant_id === 'gw_collage_showcase';
        if (metrics.contentBoxCount > 0 && !underfillExempt) {
          expect(
            metrics.contentUsageRatio,
            `${label}: canvas severely underfilled (${metrics.contentUsageRatio.toFixed(2)})`,
          ).toBeGreaterThan(0.3);
        }
      }
    });
  }
});
