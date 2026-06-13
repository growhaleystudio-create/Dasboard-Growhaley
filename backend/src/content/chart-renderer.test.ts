/**
 * Unit tests for SvgChartRenderer (task 14.2)
 *
 * Core properties verified:
 *   1. Determinism: render(same inputs) → same Buffer every time.
 *   2. Non-empty Buffer: result is a valid non-zero-length PNG.
 *   3. Graceful empty series: renders "No data" without throwing.
 *   4. All three chart kinds (bar | line | pie) produce output.
 *   5. Palette cycling does not throw on short / empty palettes.
 *
 * Requirements: 7.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import type { ChartData } from '@leads-generator/shared';
import { SvgChartRenderer, buildChartSvg } from './chart-renderer.js';
import { parseContentPlan } from './content-plan-validator.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PALETTE = ['#6366f1', '#ec4899', '#22c55e', '#f59e0b'];
const SIZE = { w: 320, h: 240 };

const BAR_DATA: ChartData = {
  kind: 'bar',
  series: [
    { label: 'Jan', value: 40 },
    { label: 'Feb', value: 80 },
    { label: 'Mar', value: 60 },
  ],
};

const LINE_DATA: ChartData = {
  kind: 'line',
  series: [
    { label: 'Q1', value: 100 },
    { label: 'Q2', value: 150 },
    { label: 'Q3', value: 120 },
    { label: 'Q4', value: 200 },
  ],
};

const PIE_DATA: ChartData = {
  kind: 'pie',
  series: [
    { label: 'A', value: 30 },
    { label: 'B', value: 50 },
    { label: 'C', value: 20 },
  ],
};

const EMPTY_BAR: ChartData = { kind: 'bar', series: [] };
const EMPTY_LINE: ChartData = { kind: 'line', series: [] };
const EMPTY_PIE: ChartData = { kind: 'pie', series: [] };

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function render(data: ChartData): Buffer {
  return new SvgChartRenderer().render(data, PALETTE, SIZE);
}

// ---------------------------------------------------------------------------
// SVG builder tests (fast, no image rasterisation)
// ---------------------------------------------------------------------------

describe('buildChartSvg', () => {
  it('returns a string starting with <svg for bar data', () => {
    const svg = buildChartSvg(BAR_DATA, PALETTE, SIZE);
    expect(svg).toMatch(/^<svg /);
  });

  it('returns a string starting with <svg for line data', () => {
    const svg = buildChartSvg(LINE_DATA, PALETTE, SIZE);
    expect(svg).toMatch(/^<svg /);
  });

  it('returns a string starting with <svg for pie data', () => {
    const svg = buildChartSvg(PIE_DATA, PALETTE, SIZE);
    expect(svg).toMatch(/^<svg /);
  });

  it('contains "No data" text for empty series', () => {
    for (const empty of [EMPTY_BAR, EMPTY_LINE, EMPTY_PIE]) {
      const svg = buildChartSvg(empty, PALETTE, SIZE);
      expect(svg).toContain('No data');
    }
  });

  it('is deterministic: same inputs produce the same SVG string', () => {
    const svg1 = buildChartSvg(BAR_DATA, PALETTE, SIZE);
    const svg2 = buildChartSvg(BAR_DATA, PALETTE, SIZE);
    expect(svg1).toBe(svg2);
  });

  it('encodes special characters safely in labels', () => {
    const data: ChartData = {
      kind: 'bar',
      series: [{ label: '<script>alert("xss")</script>', value: 10 }],
    };
    const svg = buildChartSvg(data, PALETTE, SIZE);
    // Raw unescaped < should not appear in text content positions.
    // The label is truncated + escaped, so we check for &lt; entity.
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;');
  });

  it('works with empty palette — falls back to grey', () => {
    const svg = buildChartSvg(BAR_DATA, [], SIZE);
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('#94a3b8');
  });
});

// ---------------------------------------------------------------------------
// SvgChartRenderer integration tests (rasterisation via sharp)
// ---------------------------------------------------------------------------

describe('SvgChartRenderer.render', () => {
  it.each([
    ['bar', BAR_DATA],
    ['line', LINE_DATA],
    ['pie', PIE_DATA],
  ] as const)('renders %s chart to a non-empty Buffer', (_kind, data) => {
    const buf = render(data);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it('renders empty-series charts without throwing', () => {
    expect(() => render(EMPTY_BAR)).not.toThrow();
    expect(() => render(EMPTY_LINE)).not.toThrow();
    expect(() => render(EMPTY_PIE)).not.toThrow();
  });

  /**
   * Determinism property: identical inputs must produce byte-for-byte identical
   * PNG output. This is the core guarantee of task 14.2 (Requirements 7.1).
   */
  it('is deterministic: same ChartData + palette + size → same Buffer (bar)', () => {
    const buf1 = render(BAR_DATA);
    const buf2 = render(BAR_DATA);
    expect(buf1.equals(buf2)).toBe(true);
  });

  it('is deterministic: same ChartData + palette + size → same Buffer (line)', () => {
    const buf1 = render(LINE_DATA);
    const buf2 = render(LINE_DATA);
    expect(buf1.equals(buf2)).toBe(true);
  });

  it('is deterministic: same ChartData + palette + size → same Buffer (pie)', () => {
    const buf1 = render(PIE_DATA);
    const buf2 = render(PIE_DATA);
    expect(buf1.equals(buf2)).toBe(true);
  });

  it('produces different Buffers for different data', () => {
    const bufBar = render(BAR_DATA);
    const bufLine = render(LINE_DATA);
    // Bar and line charts with different data must not produce identical bytes
    expect(bufBar.equals(bufLine)).toBe(false);
  });

  it('produces different Buffers for different palettes', () => {
    const buf1 = new SvgChartRenderer().render(BAR_DATA, ['#ff0000', '#00ff00'], SIZE);
    const buf2 = new SvgChartRenderer().render(BAR_DATA, ['#0000ff', '#ffff00'], SIZE);
    expect(buf1.equals(buf2)).toBe(false);
  });

  it('produces different Buffers for different sizes', () => {
    const buf1 = new SvgChartRenderer().render(BAR_DATA, PALETTE, { w: 320, h: 240 });
    const buf2 = new SvgChartRenderer().render(BAR_DATA, PALETTE, { w: 480, h: 360 });
    expect(buf1.equals(buf2)).toBe(false);
  });

  it('produces a valid PNG (checks PNG magic bytes)', () => {
    const buf = render(BAR_DATA);
    // PNG magic: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // 'P'
    expect(buf[2]).toBe(0x4e); // 'N'
    expect(buf[3]).toBe(0x47); // 'G'
  });
});

// ---------------------------------------------------------------------------
// Property 17 — Chart half: deterministic chart rendering without AI image model
// ---------------------------------------------------------------------------

/**
 * Smart generators constrained to the valid ChartData input space.
 *
 *  - kind ∈ {bar, line, pie}
 *  - series: finite, non-negative values + bounded labels (escaped safely)
 *  - palette: hex colours (may be empty → renderer falls back to grey)
 *  - size: small bounded dimensions to keep 100 rasterisations fast
 */
const hexColorArb = fc
  .integer({ min: 0, max: 0xffffff })
  .map((n) => '#' + n.toString(16).padStart(6, '0'));

const paletteArb = fc.array(hexColorArb, { maxLength: 6 });

const chartDataArb: fc.Arbitrary<ChartData> = fc.record({
  kind: fc.constantFrom('bar', 'line', 'pie') as fc.Arbitrary<ChartData['kind']>,
  series: fc.array(
    fc.record({
      label: fc.string({ maxLength: 16 }),
      value: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
    }),
    { maxLength: 6 },
  ),
});

// Tiny dimensions keep 100 rasterisations fast while still proving byte-equality.
const chartSizeArb = fc.record({
  w: fc.integer({ min: 48, max: 96 }),
  h: fc.integer({ min: 48, max: 96 }),
});

describe('Property 17 — ChartRenderer deterministic, no AI image model', () => {
  // A network spy: rendering must never reach out to an AI provider / image model.
  let fetchSpy: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch as typeof globalThis.fetch;
  });

  // Feature: ai-content-carousel-generator, Property 17: Chart dan mockup deterministik dari data User tanpa AI gambar
  // **Validates: Requirements 7.1, 7.2, 7.3**
  it('renders byte-identical PNGs for identical chart inputs and never calls fetch', () => {
    fc.assert(
      fc.property(chartDataArb, paletteArb, chartSizeArb, (data, palette, size) => {
        const renderer = new SvgChartRenderer();

        const a = renderer.render(data, palette, size);
        const b = renderer.render(data, palette, size);

        // Deterministic: same inputs → byte-for-byte identical output.
        expect(Buffer.isBuffer(a)).toBe(true);
        expect(a.length).toBe(b.length);
        expect(a.equals(b)).toBe(true);

        // No AI image model / network call occurred during rendering.
        expect(fetchSpy).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  // R7.1: the renderer is a pure deterministic function — no AI provider/image
  // model dependency is injected by construction or accepted by `render`.
  it('SvgChartRenderer carries no AI provider dependency (pure by construction)', () => {
    expect(SvgChartRenderer.length).toBe(0); // zero-arg constructor (no AI dep)
    expect(new SvgChartRenderer().render.length).toBe(3); // render(data, palette, size)
  });

  // R7.3: the Planner/ContentPlan schema flags chart/mockup needs by REFERENCE
  // only (chartDataRef/mockupRef) and never carries fabricated inline data.
  it('ContentPlan schema keeps chart/mockup references and strips fabricated inline data (R7.3)', () => {
    const raw = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          blocks: [
            // The model attempts to hallucinate inline chart data alongside the ref.
            {
              type: 'chart',
              chartDataRef: 'user-supplied-chart-1',
              data: { kind: 'bar', series: [{ label: 'Q1', value: 9999 }] },
            },
            // The model attempts to hallucinate inline mockup content.
            {
              type: 'mockup',
              mockupRef: 'user-supplied-mockup-1',
              inlineImage: 'data:image/png;base64,ZmFrZQ==',
            },
          ],
        },
      ],
    };

    const result = parseContentPlan(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const chartBlock = result.value.slides[0]!.blocks[0]!;
      const mockupBlock = result.value.slides[0]!.blocks[1]!;

      // Needs are flagged purely via references to user-supplied data.
      expect(chartBlock.chartDataRef).toBe('user-supplied-chart-1');
      expect(mockupBlock.mockupRef).toBe('user-supplied-mockup-1');

      // Fabricated inline values never survive parsing into the plan.
      expect(chartBlock).not.toHaveProperty('data');
      expect(mockupBlock).not.toHaveProperty('inlineImage');
    }
  });
});
