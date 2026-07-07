/**
 * svg-measure.ts — deterministic post-render measurement of a Satori SVG.
 *
 * Satori outputs one `<mask><rect x y width height/></mask>` per flex node,
 * so the SVG itself carries the true laid-out bounding boxes (real line
 * wraps included) — far more accurate than the pre-render char-count
 * heuristics in tokens.ts. We use those boxes to detect two failure modes
 * the estimator can't see:
 *
 *   - underfill: content occupies a small vertical slice of the content
 *     zone → giant dead bands on the poster canvas.
 *   - overflow: a content box crosses into the bottom chrome zone (or off
 *     the canvas entirely) → text collides with pagination/swipe chrome.
 *
 * The renderer runs a second pass with rescaled typography tokens when
 * either trips (see satori-renderer.ts).
 */

export interface SvgContentMetrics {
  /** Topmost Y of any content box (canvas px). Infinity when no content. */
  contentMinY: number;
  /** Bottommost Y of any content box (canvas px). -Infinity when no content. */
  contentMaxY: number;
  /** Vertical extent of content ÷ content-zone height, clamped to [0, 1.5]. */
  contentUsageRatio: number;
  /** True when a content box crosses the bottom chrome zone or canvas edge. */
  overflow: boolean;
  /** Number of boxes classified as content (diagnostics). */
  contentBoxCount: number;
}

const RECT_RE = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g;

export function measureSvgContent(
  svg: string,
  dims: { width: number; height: number },
  zone: { top: number; bottom: number },
): SvgContentMetrics {
  const zoneTop = zone.top;
  const zoneBottom = dims.height - zone.bottom;
  const zoneHeight = Math.max(1, zoneBottom - zoneTop);

  let minY = Infinity;
  let maxY = -Infinity;
  let overflow = false;
  let count = 0;

  for (const m of svg.matchAll(RECT_RE)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    const w = Number(m[3]);
    const h = Number(m[4]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || w <= 0 || h <= 0) continue;
    // Root canvas / full-bleed backgrounds / absolute chrome overlay: skip.
    if (w >= dims.width * 0.98 && h >= dims.height * 0.98) continue;
    // Structural containers and the chrome spacer span (at least) the whole
    // content zone — they are layout scaffolding, not content.
    if (h >= zoneHeight * 0.95) continue;
    // Chrome rows live outside the content zone — classify by box center.
    const centerY = y + h / 2;
    if (centerY < zoneTop || centerY > zoneBottom) continue;
    count += 1;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + h);
    if (y + h > zoneBottom + 8 || y + h > dims.height - 4) overflow = true;
  }

  const usage = count === 0 ? 0 : Math.min(1.5, Math.max(0, (maxY - minY) / zoneHeight));
  return {
    contentMinY: minY,
    contentMaxY: maxY,
    contentUsageRatio: usage,
    overflow,
    contentBoxCount: count,
  };
}
