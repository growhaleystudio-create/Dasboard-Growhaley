/**
 * BackgroundScanner — active detection of text and logo artefacts in
 * a Background_Image before it is composited onto a Slide.
 *
 * This scanner is intentionally a BEST-EFFORT heuristic using `sharp`
 * (already in project deps). It does NOT perform OCR or deep-learning
 * inference. Its purpose is to catch obvious cases where the AI model
 * accidentally inserted text-like or logo-like content into the background,
 * which would violate brand fidelity rules (R5.5).
 *
 * Detection strategy
 * ──────────────────
 * 1. **Text detection** — text tends to create regions of very high local
 *    contrast along horizontal edges (rapid row-wise pixel transitions).
 *    Algorithm:
 *      a. Convert image to greyscale.
 *      b. Resize to a standard analysis resolution (256 × N) to normalise.
 *      c. Extract raw pixel data.
 *      d. For each pixel, compute the horizontal gradient magnitude
 *         |p[x] - p[x-1]| (simple first-order difference).
 *      e. Count pixels where gradient > EDGE_THRESHOLD.
 *      f. If the fraction of "edge pixels" > TEXT_EDGE_RATIO → flag as text.
 *
 * 2. **Logo detection** — logos often contain tight clusters of uniform
 *    colour surrounded by contrasting areas (a "blob" signature).
 *    Algorithm:
 *      a. Use the same greyscale downsampled buffer.
 *      b. Scan non-overlapping NxN tiles (TILE_SIZE = 20px).
 *      c. For each tile, compute variance of pixel values.
 *      d. If a tile has very LOW variance (uniform fill, < LOW_VAR_THRESH)
 *         AND its mean colour differs significantly from the image-wide
 *         mean (> CONTRAST_THRESH), treat it as a suspicious region.
 *      e. If the count of such suspicious tiles > LOGO_TILE_COUNT → flag as logo.
 *
 * Tuning notes
 * ─────────────
 * - These are conservative thresholds that prefer false-negatives over
 *   false-positives: the scanner will only flag *obviously* contaminated
 *   images so that clean, richly-textured backgrounds are not rejected.
 * - The Renderer falls back to regeneration on `clean=false`; after one
 *   regeneration attempt it uses a solid brand-colour background (R5.6).
 * - NEVER rely solely on AI model guarantees — this scanner is the active
 *   independent check (R5.5).
 *
 * Design: Components and Interfaces → BackgroundScanner; Strategi Kesetiaan Brand Hibrida
 * Requirements: 5.5
 */

import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Public interface (mirrors the design contract exactly)
// ---------------------------------------------------------------------------

export interface ScanResult {
  /** true when no text or logo artefacts were detected. */
  clean: boolean;
  /** List of detected problem types (may be empty when clean=true). */
  detected: ('text' | 'logo')[];
}

export interface BackgroundScanner {
  /**
   * Scan `image` for text and logo artefacts before compositing.
   *
   * Returns `{ clean: true, detected: [] }` when the image looks safe.
   * Returns `{ clean: false, detected: [...] }` when suspicious regions
   * are found — the Renderer should then apply its fallback strategy (R5.6).
   */
  scan(image: Buffer): Promise<ScanResult>;
}

// ---------------------------------------------------------------------------
// Tunable thresholds (exported for tests)
// ---------------------------------------------------------------------------

/** Width to which the image is downsampled for analysis (preserves aspect). */
export const ANALYSIS_WIDTH = 256;

/**
 * Horizontal gradient magnitude above which a pixel is counted as an "edge".
 * Range: 0-255. Higher = less sensitive.
 */
export const EDGE_THRESHOLD = 40;

/**
 * Fraction of all pixels that must be "edge pixels" for the image to be
 * flagged as likely containing text. Higher = less sensitive.
 * Typical richly-textured backgrounds: 0.08–0.15.
 * Text-heavy images: > 0.25.
 */
export const TEXT_EDGE_RATIO = 0.22;

/** Side length (in px) of the square tiles used for logo detection. */
export const TILE_SIZE = 20;

/**
 * Pixel variance threshold below which a tile is considered "uniform fill".
 * A tile with all-same-colour pixels has variance = 0.
 */
export const LOW_VAR_THRESH = 120;

/**
 * How much the tile mean must differ from the global image mean for the tile
 * to be counted as a "suspicious" high-contrast uniform region.
 */
export const CONTRAST_THRESH = 60;

/**
 * Minimum number of suspicious tiles before the image is flagged as
 * potentially containing a logo. Higher = less sensitive.
 */
export const LOGO_TILE_COUNT = 6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute arithmetic mean of a Uint8Array. */
function mean(pixels: Buffer): number {
  if (pixels.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pixels.length; i++) sum += pixels[i] as number;
  return sum / pixels.length;
}

/** Compute variance of a Uint8Array given a pre-computed mean. */
function variance(pixels: Buffer, mu: number): number {
  if (pixels.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < pixels.length; i++) {
    const diff = (pixels[i] as number) - mu;
    sumSq += diff * diff;
  }
  return sumSq / pixels.length;
}

// ---------------------------------------------------------------------------
// DefaultBackgroundScanner
// ---------------------------------------------------------------------------

export class DefaultBackgroundScanner implements BackgroundScanner {
  async scan(image: Buffer): Promise<ScanResult> {
    // Decode and normalise: greyscale, resize to ANALYSIS_WIDTH, get raw pixels.
    const { data: raw, info } = await sharp(image)
      .greyscale()
      .resize({ width: ANALYSIS_WIDTH, withoutEnlargement: false })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = raw as Buffer;
    const width = info.width;
    const height = info.height;

    const detected: ('text' | 'logo')[] = [];

    // -------------------------------------------------------------------
    // 1. TEXT DETECTION — horizontal edge density
    // -------------------------------------------------------------------
    let edgePixelCount = 0;
    const totalPixels = width * height;

    for (let row = 0; row < height; row++) {
      for (let col = 1; col < width; col++) {
        const idx = row * width + col;
        const prev = pixels[idx - 1] as number;
        const curr = pixels[idx] as number;
        const grad = Math.abs(curr - prev);
        if (grad > EDGE_THRESHOLD) edgePixelCount++;
      }
    }

    const edgeFraction = totalPixels > 0 ? edgePixelCount / totalPixels : 0;
    if (edgeFraction > TEXT_EDGE_RATIO) {
      detected.push('text');
    }

    // -------------------------------------------------------------------
    // 2. LOGO DETECTION — high-contrast uniform tile clusters
    // -------------------------------------------------------------------
    const globalMean = mean(pixels);
    let suspiciousTileCount = 0;

    for (let tileRow = 0; tileRow + TILE_SIZE <= height; tileRow += TILE_SIZE) {
      for (let tileCol = 0; tileCol + TILE_SIZE <= width; tileCol += TILE_SIZE) {
        // Extract tile pixels into a contiguous sub-array.
        const tilePixels: number[] = [];
        for (let r = tileRow; r < tileRow + TILE_SIZE; r++) {
          for (let c = tileCol; c < tileCol + TILE_SIZE; c++) {
            tilePixels.push(pixels[r * width + c] as number);
          }
        }

        const tileBuf = Buffer.from(tilePixels);
        const tileMean = mean(tileBuf);
        const tileVar = variance(tileBuf, tileMean);

        // Uniform fill (low variance) AND colour differs from global mean.
        if (
          tileVar < LOW_VAR_THRESH &&
          Math.abs(tileMean - globalMean) > CONTRAST_THRESH
        ) {
          suspiciousTileCount++;
        }
      }
    }

    if (suspiciousTileCount >= LOGO_TILE_COUNT) {
      detected.push('logo');
    }

    return {
      clean: detected.length === 0,
      detected,
    };
  }
}
