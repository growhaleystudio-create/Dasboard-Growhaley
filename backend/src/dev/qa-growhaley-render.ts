/**
 * qa-growhaley-render.ts — renders ALL 10 Growhaley templates to PNGs for
 * visual QA of the brand overhaul, plus a metrics report per slide.
 *
 * Run: node dist/dev/qa-growhaley-render.js [ratio]
 *   ratio: 1:1 | 4:5 | 9:16 | all (default 4:5)
 * Output: backend/tmp/growhaley-qa/*.png + metrics.json
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { AspectRatio } from '@leads-generator/shared';

import { SatoriRenderer, type BrandFontRef, type SlideRenderMetrics } from '../content/satori-renderer.js';
import { makeDoc } from './growhaley-qa-fixtures.js';

const ALL_RATIOS: AspectRatio[] = ['1:1', '4:5', '9:16'];

async function main() {
  const arg = process.argv[2] ?? '4:5';
  const ratios: AspectRatio[] = arg === 'all' ? ALL_RATIOS : [arg as AspectRatio];

  const brandFonts: BrandFontRef[] = [];
  const renderer = new SatoriRenderer();
  const outDir = path.resolve(process.cwd(), 'tmp/growhaley-qa');
  await mkdir(outDir, { recursive: true });

  const report: Record<string, SlideRenderMetrics> = {};
  for (const ratio of ratios) {
    const doc = makeDoc(ratio);
    for (const s of doc.slides) {
      const { png, metrics } = await renderer.renderSlideWithMetrics(s, doc, brandFonts);
      const file = `${String(s.slide_number).padStart(2, '0')}-${s.layout_variant_id}-${ratio.replace(':', 'x')}.png`;
      await writeFile(path.join(outDir, file), png);
      report[file] = metrics;
      const underfillExempt =
        (s.layout_variant_id ?? '').startsWith('gw_photo_') ||
        s.layout_variant_id === 'gw_collage_showcase';
      const flag = metrics.overflow
        ? ' OVERFLOW'
        : !underfillExempt && metrics.contentUsageRatio < 0.4
          ? ' UNDERFILL'
          : '';
      console.log(
        `wrote ${file} usage=${metrics.contentUsageRatio.toFixed(2)} passes=${metrics.passes}${flag}`,
      );
    }
  }
  await writeFile(path.join(outDir, 'metrics.json'), JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
