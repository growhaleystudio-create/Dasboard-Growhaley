/**
 * ChartRenderer — deterministic chart rendering without AI.
 *
 * Converts ChartData supplied by the User into an SVG string using pure
 * arithmetic, then rasterises it to a PNG Buffer via @resvg/resvg-js (Resvg).
 * The same ChartData + palette + size always produces the exact same Buffer.
 *
 * Design: Components and Interfaces → ChartRenderer; Pilihan Teknologi (Renderer)
 * Requirements: 7.1
 */

import { Resvg } from '@resvg/resvg-js';
import type { ChartData } from '@leads-generator/shared';

export type { ChartData };

export interface ChartSize {
  w: number;
  h: number;
}

export interface ChartRenderer {
  /**
   * Render `data` into a PNG Buffer.
   *
   * - Deterministic: same inputs → same output Buffer.
   * - No AI calls, no external processes, no fetch.
   * - Gracefully renders "No data" when `data.series` is empty.
   */
  render(data: ChartData, palette: string[], size: ChartSize): Buffer;
}

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

/** Escape text for safe SVG embedding. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Pick a palette colour, cycling if needed. Falls back to a neutral grey. */
function pickColor(palette: string[], index: number): string {
  if (palette.length === 0) return '#94a3b8';
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return palette[index % palette.length]!;
}

/** Wrap SVG content in a root <svg> element. */
function wrapSvg(w: number, h: number, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="#ffffff"/>` +
    body +
    `</svg>`
  );
}

/** Render a "No data" placeholder SVG. */
function noDataSvg(w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  return wrapSvg(
    w,
    h,
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="sans-serif" font-size="16" fill="#94a3b8">No data</text>`,
  );
}

// ---------------------------------------------------------------------------
// Bar chart
// ---------------------------------------------------------------------------

function buildBarSvg(data: ChartData, palette: string[], w: number, h: number): string {
  const series = data.series;
  const n = series.length;
  if (n === 0) return noDataSvg(w, h);

  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 36; // room for labels

  const chartW = w - paddingLeft - paddingRight;
  const chartH = h - paddingTop - paddingBottom;

  const maxVal = Math.max(...series.map((s) => s.value), 0);
  const scale = maxVal === 0 ? 0 : chartH / maxVal;

  const barWidth = (chartW / n) * 0.6;
  const gap = chartW / n;

  let body = '';

  // Y-axis line
  body += `<line x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${paddingTop + chartH}" stroke="#e2e8f0" stroke-width="1"/>`;
  // X-axis baseline
  body += `<line x1="${paddingLeft}" y1="${paddingTop + chartH}" x2="${paddingLeft + chartW}" y2="${paddingTop + chartH}" stroke="#e2e8f0" stroke-width="1"/>`;

  for (let i = 0; i < n; i++) {
    const item = series[i]!;
    const barH = item.value * scale;
    const x = paddingLeft + i * gap + (gap - barWidth) / 2;
    const y = paddingTop + chartH - barH;
    const color = pickColor(palette, i);

    body += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barH.toFixed(2)}" fill="${escapeXml(color)}" rx="2"/>`;

    // Label below bar
    const labelX = x + barWidth / 2;
    const labelY = paddingTop + chartH + 18;
    const label = item.label.length > 8 ? item.label.slice(0, 7) + '…' : item.label;
    body += `<text x="${labelX.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#475569">${escapeXml(label)}</text>`;
  }

  return wrapSvg(w, h, body);
}

// ---------------------------------------------------------------------------
// Line chart
// ---------------------------------------------------------------------------

function buildLineSvg(data: ChartData, palette: string[], w: number, h: number): string {
  const series = data.series;
  const n = series.length;
  if (n === 0) return noDataSvg(w, h);

  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 36;

  const chartW = w - paddingLeft - paddingRight;
  const chartH = h - paddingTop - paddingBottom;

  const maxVal = Math.max(...series.map((s) => s.value), 0);
  const minVal = Math.min(...series.map((s) => s.value), 0);
  const range = maxVal - minVal;
  const scaleY = range === 0 ? 0 : chartH / range;

  const stepX = n > 1 ? chartW / (n - 1) : chartW / 2;

  const points = series.map((item, i) => {
    const px = paddingLeft + (n > 1 ? i * stepX : chartW / 2);
    const py = paddingTop + chartH - (item.value - minVal) * scaleY;
    return { px, py, label: item.label };
  });

  const lineColor = pickColor(palette, 0);
  const dotColor = pickColor(palette, 1);

  let body = '';

  // Axes
  body += `<line x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${paddingTop + chartH}" stroke="#e2e8f0" stroke-width="1"/>`;
  body += `<line x1="${paddingLeft}" y1="${paddingTop + chartH}" x2="${paddingLeft + chartW}" y2="${paddingTop + chartH}" stroke="#e2e8f0" stroke-width="1"/>`;

  // Polyline
  if (n > 1) {
    const pts = points.map((p) => `${p.px.toFixed(2)},${p.py.toFixed(2)}`).join(' ');
    body += `<polyline points="${pts}" fill="none" stroke="${escapeXml(lineColor)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  // Dots and labels
  for (const p of points) {
    body += `<circle cx="${p.px.toFixed(2)}" cy="${p.py.toFixed(2)}" r="4" fill="${escapeXml(dotColor)}" stroke="#ffffff" stroke-width="1.5"/>`;
    const label = p.label.length > 8 ? p.label.slice(0, 7) + '…' : p.label;
    body += `<text x="${p.px.toFixed(2)}" y="${(paddingTop + chartH + 18).toFixed(2)}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#475569">${escapeXml(label)}</text>`;
  }

  return wrapSvg(w, h, body);
}

// ---------------------------------------------------------------------------
// Pie chart
// ---------------------------------------------------------------------------

/**
 * Compute SVG arc path data for a pie segment.
 * Uses exact trigonometry so the result is identical for the same inputs.
 */
function pieSegmentPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number, // radians
  endAngle: number,   // radians
): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${cx.toFixed(4)} ${cy.toFixed(4)}`,
    `L ${x1.toFixed(4)} ${y1.toFixed(4)}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(4)} ${y2.toFixed(4)}`,
    'Z',
  ].join(' ');
}

function buildPieSvg(data: ChartData, palette: string[], w: number, h: number): string {
  const series = data.series;
  if (series.length === 0) return noDataSvg(w, h);

  // Filter out non-positive values for a valid pie
  const positive = series.filter((s) => s.value > 0);
  if (positive.length === 0) return noDataSvg(w, h);

  const total = positive.reduce((acc, s) => acc + s.value, 0);

  // Layout: pie on the left half, legend on the right
  const legendW = Math.min(120, w * 0.35);
  const pieAreaW = w - legendW;
  const cx = pieAreaW / 2;
  const cy = h / 2;
  const r = Math.min(pieAreaW, h) / 2 - 16;

  let body = '';
  let currentAngle = -Math.PI / 2; // start from top

  for (let i = 0; i < positive.length; i++) {
    const item = positive[i]!;
    const sweep = (item.value / total) * 2 * Math.PI;
    const endAngle = currentAngle + sweep;
    const color = pickColor(palette, i);

    const d = pieSegmentPath(cx, cy, r, currentAngle, endAngle);
    body += `<path d="${d}" fill="${escapeXml(color)}" stroke="#ffffff" stroke-width="1.5"/>`;

    currentAngle = endAngle;
  }

  // Legend
  const legendX = pieAreaW + 8;
  const itemH = 18;
  const startY = Math.max(16, cy - (positive.length * itemH) / 2);

  for (let i = 0; i < positive.length; i++) {
    const item = positive[i]!;
    const color = pickColor(palette, i);
    const ly = startY + i * itemH;
    const label = item.label.length > 10 ? item.label.slice(0, 9) + '…' : item.label;

    body += `<rect x="${legendX}" y="${(ly - 8).toFixed(2)}" width="10" height="10" fill="${escapeXml(color)}" rx="2"/>`;
    body += `<text x="${legendX + 14}" y="${ly.toFixed(2)}" font-family="sans-serif" font-size="10" fill="#475569">${escapeXml(label)}</text>`;
  }

  return wrapSvg(w, h, body);
}

// ---------------------------------------------------------------------------
// Public implementation
// ---------------------------------------------------------------------------

/**
 * Build the SVG string for the given chart data.
 * Exported separately so tests can inspect the intermediate SVG.
 */
export function buildChartSvg(data: ChartData, palette: string[], size: ChartSize): string {
  const { w, h } = size;

  if (data.series.length === 0) {
    return noDataSvg(w, h);
  }

  switch (data.kind) {
    case 'bar':
      return buildBarSvg(data, palette, w, h);
    case 'line':
      return buildLineSvg(data, palette, w, h);
    case 'pie':
      return buildPieSvg(data, palette, w, h);
    default: {
      // TypeScript exhaustive check
      const _exhaustive: never = data.kind;
      return noDataSvg(w, h);
    }
  }
}

/**
 * Concrete implementation of ChartRenderer.
 *
 * Uses `@resvg/resvg-js` (Resvg) to rasterise the SVG string → PNG Buffer
 * in a fully synchronous, zero-async manner. No temp files, no external
 * processes, no AI calls. Identical inputs always produce identical bytes.
 */
export class SvgChartRenderer implements ChartRenderer {
  render(data: ChartData, palette: string[], size: ChartSize): Buffer {
    const svg = buildChartSvg(data, palette, size);

    // Resvg accepts an SVG string and rasterises it synchronously.
    // fitTo ensures the output pixel dimensions match the requested size exactly.
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: size.w },
    });
    const pngData = resvg.render().asPng();

    // asPng() returns a Uint8Array — wrap in Buffer without copying.
    return Buffer.from(pngData);
  }
}
