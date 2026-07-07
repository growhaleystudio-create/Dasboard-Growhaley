import { describe, it, expect } from 'vitest';

import { measureSvgContent } from './svg-measure.js';

const DIMS = { width: 1080, height: 1080 };
const ZONE = { top: 147, bottom: 161 }; // gwSafeArea at pad=70

function svgWithRects(rects: Array<{ x: number; y: number; w: number; h: number }>): string {
  const body = rects
    .map(
      (r) =>
        `<mask id="m"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#fff"/></mask>`,
    )
    .join('');
  return `<svg width="1080" height="1080">${body}</svg>`;
}

describe('measureSvgContent', () => {
  it('ignores the full-canvas root rect', () => {
    const m = measureSvgContent(svgWithRects([{ x: 0, y: 0, w: 1080, h: 1080 }]), DIMS, ZONE);
    expect(m.contentBoxCount).toBe(0);
    expect(m.contentUsageRatio).toBe(0);
  });

  it('ignores structural boxes spanning the whole content zone (chrome spacer)', () => {
    // Zone height = 772; the flexGrow spacer between chrome rows is ~828 tall.
    const m = measureSvgContent(svgWithRects([{ x: 70, y: 126, w: 940, h: 828 }]), DIMS, ZONE);
    expect(m.contentBoxCount).toBe(0);
  });

  it('ignores chrome rows outside the content zone', () => {
    const m = measureSvgContent(
      svgWithRects([
        { x: 70, y: 70, w: 300, h: 48 }, // top chrome (logo row)
        { x: 70, y: 990, w: 200, h: 40 }, // bottom chrome (pagination)
      ]),
      DIMS,
      ZONE,
    );
    expect(m.contentBoxCount).toBe(0);
  });

  it('measures vertical extent of content boxes as a zone ratio', () => {
    // Zone: 147..919 → height 772. Content spans 200..600 → 400/772 ≈ 0.518.
    const m = measureSvgContent(
      svgWithRects([
        { x: 70, y: 200, w: 800, h: 120 },
        { x: 70, y: 480, w: 800, h: 120 },
      ]),
      DIMS,
      ZONE,
    );
    expect(m.contentBoxCount).toBe(2);
    expect(m.contentMinY).toBe(200);
    expect(m.contentMaxY).toBe(600);
    expect(m.contentUsageRatio).toBeGreaterThan(0.5);
    expect(m.contentUsageRatio).toBeLessThan(0.55);
    expect(m.overflow).toBe(false);
  });

  it('flags overflow when a content box crosses into the bottom chrome zone', () => {
    // Box center must stay inside the zone (919) for it to count as content.
    const m = measureSvgContent(
      svgWithRects([{ x: 70, y: 800, w: 800, h: 180 }]), // center 890, ends 980 > 919+8
      DIMS,
      ZONE,
    );
    expect(m.contentBoxCount).toBe(1);
    expect(m.overflow).toBe(true);
  });

  it('reports low usage for a lone small box (underfill signal)', () => {
    const m = measureSvgContent(svgWithRects([{ x: 70, y: 400, w: 800, h: 90 }]), DIMS, ZONE);
    expect(m.contentBoxCount).toBe(1);
    expect(m.contentUsageRatio).toBeLessThan(0.2);
  });
});
