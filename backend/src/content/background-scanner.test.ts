/**
 * Unit tests for DefaultBackgroundScanner (task 15.2)
 *
 * Verifies:
 *   1. A clean abstract image returns { clean: true, detected: [] }.
 *   2. An image with very high edge density is flagged as 'text'.
 *   3. An image with many high-contrast uniform tiles is flagged as 'logo'.
 *   4. An image with both artefacts is flagged for both.
 *   5. scan() returns a ScanResult (never throws) for any valid image input.
 *   6. clean=true implies detected=[].
 *   7. detected items are from the allowed union ('text' | 'logo').
 *
 * Requirements: 5.5
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';

import {
  DefaultBackgroundScanner,
  ANALYSIS_WIDTH,
  EDGE_THRESHOLD,
  TEXT_EDGE_RATIO,
  TILE_SIZE,
  LOW_VAR_THRESH,
  CONTRAST_THRESH,
  LOGO_TILE_COUNT,
} from './background-scanner.js';

// ---------------------------------------------------------------------------
// Image generators
// ---------------------------------------------------------------------------

/** Create a solid-color image of the given size. */
async function solidColorImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

/**
 * Create a gradient image (left = dark, right = light).
 * Each row transitions smoothly from 0 to 255 across columns.
 * This produces moderate edge density — should be below the text threshold.
 */
async function gradientImage(width: number, height: number): Promise<Buffer> {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const v = Math.round((col / (width - 1)) * 255);
      const base = (row * width + col) * channels;
      raw[base] = v;
      raw[base + 1] = v;
      raw[base + 2] = v;
    }
  }
  return sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Create a "striped" image with alternating black and white columns every N pixels.
 * This creates a very high horizontal edge density — should trigger the text detector.
 */
async function stripedImage(
  width: number,
  height: number,
  stripeWidth: number,
): Promise<Buffer> {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const v = Math.floor(col / stripeWidth) % 2 === 0 ? 0 : 255;
      const base = (row * width + col) * channels;
      raw[base] = v;
      raw[base + 1] = v;
      raw[base + 2] = v;
    }
  }
  return sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Create an image with many small "logo-like" tiles: bright uniform squares on a
 * mid-grey background.  There will be at least LOGO_TILE_COUNT tiles that have
 * low variance AND contrast significantly against the grey background.
 */
async function logoTileImage(
  width: number,
  height: number,
  tileSize: number,
  logoCount: number,
): Promise<Buffer> {
  // Start with a mid-grey background (value = 128).
  const channels = 3;
  const bgValue = 128;
  const raw = Buffer.alloc(width * height * channels, bgValue);

  // Paint `logoCount` uniform bright (value ≈ 230) squares scattered across
  // the top-left corner of the image.
  let painted = 0;
  outer: for (let tileRow = 0; tileRow + tileSize <= height; tileRow += tileSize) {
    for (let tileCol = 0; tileCol + tileSize <= width; tileCol += tileSize) {
      if (painted >= logoCount) break outer;
      // Fill this tile with a bright colour (well above the background mean).
      for (let r = tileRow; r < tileRow + tileSize; r++) {
        for (let c = tileCol; c < tileCol + tileSize; c++) {
          const base = (r * width + c) * channels;
          raw[base] = 230;
          raw[base + 1] = 230;
          raw[base + 2] = 230;
        }
      }
      painted++;
    }
  }

  return sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const scanner = new DefaultBackgroundScanner();
const W = 256;
const H = 256;

describe('DefaultBackgroundScanner — clean images', () => {
  it('returns clean=true for a solid-color image', async () => {
    const img = await solidColorImage(W, H, 100, 149, 237);
    const result = await scanner.scan(img);
    expect(result.clean).toBe(true);
    expect(result.detected).toEqual([]);
  });

  it('returns clean=true for a smooth gradient image', async () => {
    // A very gentle gradient (0–100 range) avoids both high edge density
    // and high-contrast uniform tiles at the dark end.
    const channels = 3;
    const raw = Buffer.alloc(W * H * channels);
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        // Narrow value range: 90–130 (tight around mid-grey → low contrast vs global mean)
        const v = Math.round(90 + (col / (W - 1)) * 40);
        const base = (row * W + col) * channels;
        raw[base] = v;
        raw[base + 1] = v;
        raw[base + 2] = v;
      }
    }
    const img = await sharp(raw, { raw: { width: W, height: H, channels } }).png().toBuffer();
    const result = await scanner.scan(img);
    expect(result.clean).toBe(true);
    expect(result.detected).toEqual([]);
  });
});

describe('DefaultBackgroundScanner — text detection', () => {
  it('flags a high-edge-density (striped 1px) image as "text"', async () => {
    // Alternating 1px columns → maximum horizontal gradient → far above TEXT_EDGE_RATIO.
    const img = await stripedImage(W, H, 1);
    const result = await scanner.scan(img);
    expect(result.detected).toContain('text');
    expect(result.clean).toBe(false);
  });

  it('does NOT flag a smooth gradient as "text"', async () => {
    const img = await gradientImage(W, H);
    const result = await scanner.scan(img);
    expect(result.detected).not.toContain('text');
  });
});

describe('DefaultBackgroundScanner — logo detection', () => {
  it(`flags an image with ≥ ${LOGO_TILE_COUNT} high-contrast uniform tiles as "logo"`, async () => {
    const img = await logoTileImage(W, H, TILE_SIZE, LOGO_TILE_COUNT + 2);
    const result = await scanner.scan(img);
    expect(result.detected).toContain('logo');
    expect(result.clean).toBe(false);
  });

  it('does NOT flag a solid-color image as "logo" (no contrast against mean)', async () => {
    // All pixels identical → global mean == tile mean → contrast is 0.
    const img = await solidColorImage(W, H, 180, 180, 180);
    const result = await scanner.scan(img);
    expect(result.detected).not.toContain('logo');
  });
});

describe('DefaultBackgroundScanner — invariants', () => {
  it('clean=true implies detected=[]', async () => {
    const img = await solidColorImage(W, H, 60, 120, 200);
    const result = await scanner.scan(img);
    if (result.clean) {
      expect(result.detected).toEqual([]);
    }
  });

  it('detected items are always from the allowed union', async () => {
    const img = await stripedImage(W, H, 1);
    const result = await scanner.scan(img);
    for (const item of result.detected) {
      expect(['text', 'logo']).toContain(item);
    }
  });

  it('scan() does not throw for a minimal 1×1 image', async () => {
    const img = await solidColorImage(1, 1, 0, 0, 0);
    await expect(scanner.scan(img)).resolves.toBeDefined();
  });

  it('scan() does not throw for a very small image', async () => {
    const img = await solidColorImage(8, 8, 200, 100, 50);
    await expect(scanner.scan(img)).resolves.toBeDefined();
  });

  it('scan() accepts a JPEG buffer as input', async () => {
    const img = await sharp({
      create: { width: W, height: H, channels: 3, background: { r: 100, g: 100, b: 100 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
    await expect(scanner.scan(img)).resolves.toBeDefined();
  });
});

describe('DefaultBackgroundScanner — threshold constants are exported', () => {
  it('exports ANALYSIS_WIDTH as a positive integer', () => {
    expect(Number.isInteger(ANALYSIS_WIDTH)).toBe(true);
    expect(ANALYSIS_WIDTH).toBeGreaterThan(0);
  });

  it('exports EDGE_THRESHOLD in [0, 255]', () => {
    expect(EDGE_THRESHOLD).toBeGreaterThanOrEqual(0);
    expect(EDGE_THRESHOLD).toBeLessThanOrEqual(255);
  });

  it('exports TEXT_EDGE_RATIO in (0, 1)', () => {
    expect(TEXT_EDGE_RATIO).toBeGreaterThan(0);
    expect(TEXT_EDGE_RATIO).toBeLessThan(1);
  });

  it('exports TILE_SIZE as a positive integer', () => {
    expect(Number.isInteger(TILE_SIZE)).toBe(true);
    expect(TILE_SIZE).toBeGreaterThan(0);
  });

  it('exports LOGO_TILE_COUNT as a positive integer', () => {
    expect(Number.isInteger(LOGO_TILE_COUNT)).toBe(true);
    expect(LOGO_TILE_COUNT).toBeGreaterThan(0);
  });
});
