/**
 * Unit tests for SharpMockupRenderer.
 *
 * Validates:
 * - Requirement 7.2: MockupRenderer renders each `mockup` Content_Block from
 *   the user-supplied image deterministically by code, without any AI model.
 *
 * Tests verify:
 * 1. 'plain' frame produces a PNG Buffer.
 * 2. 'phone' frame produces a PNG Buffer of the correct dimensions.
 * 3. 'browser' frame produces a PNG Buffer of the correct dimensions.
 * 4. Same input → same output (deterministic / idempotent).
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { SharpMockupRenderer } from '../../src/content/mockup-renderer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal solid-colour PNG Buffer at the given size. */
async function makePng(width = 100, height = 100): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

/** Decode a PNG Buffer and return its metadata via sharp. */
async function metadata(buf: Buffer) {
  return sharp(buf).metadata();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const renderer = new SharpMockupRenderer();
const SIZE = { w: 400, h: 700 };

describe('MockupRenderer — plain frame (R7.2)', () => {
  it('produces a non-empty Buffer', async () => {
    const img = await makePng();
    const result = await renderer.render(img, 'plain', SIZE);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('output PNG has the requested dimensions', async () => {
    const img = await makePng();
    const result = await renderer.render(img, 'plain', SIZE);
    const meta = await metadata(result);

    expect(meta.width).toBe(SIZE.w);
    expect(meta.height).toBe(SIZE.h);
    expect(meta.format).toBe('png');
  });
});

describe('MockupRenderer — phone frame (R7.2)', () => {
  it('produces a non-empty Buffer', async () => {
    const img = await makePng();
    const result = await renderer.render(img, 'phone', SIZE);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('output PNG has the requested dimensions', async () => {
    const img = await makePng();
    const result = await renderer.render(img, 'phone', SIZE);
    const meta = await metadata(result);

    expect(meta.width).toBe(SIZE.w);
    expect(meta.height).toBe(SIZE.h);
    expect(meta.format).toBe('png');
  });
});

describe('MockupRenderer — browser frame (R7.2)', () => {
  it('produces a non-empty Buffer', async () => {
    const img = await makePng();
    const result = await renderer.render(img, 'browser', SIZE);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('output PNG has the requested dimensions', async () => {
    const img = await makePng();
    const result = await renderer.render(img, 'browser', SIZE);
    const meta = await metadata(result);

    expect(meta.width).toBe(SIZE.w);
    expect(meta.height).toBe(SIZE.h);
    expect(meta.format).toBe('png');
  });
});

describe('MockupRenderer — determinism (R7.2)', () => {
  it('plain: same input → same output across two calls', async () => {
    const img = await makePng(80, 80);

    const a = await renderer.render(img, 'plain', { w: 300, h: 300 });
    const b = await renderer.render(img, 'plain', { w: 300, h: 300 });

    expect(a.compare(b)).toBe(0);
  });

  it('phone: same input → same output across two calls', async () => {
    const img = await makePng(80, 80);

    const a = await renderer.render(img, 'phone', SIZE);
    const b = await renderer.render(img, 'phone', SIZE);

    expect(a.compare(b)).toBe(0);
  });

  it('browser: same input → same output across two calls', async () => {
    const img = await makePng(80, 80);

    const a = await renderer.render(img, 'browser', SIZE);
    const b = await renderer.render(img, 'browser', SIZE);

    expect(a.compare(b)).toBe(0);
  });

  it('different frames produce different outputs for the same input', async () => {
    const img = await makePng(100, 100);
    const size = { w: 400, h: 700 };

    const plain = await renderer.render(img, 'plain', size);
    const phone = await renderer.render(img, 'phone', size);
    const browser = await renderer.render(img, 'browser', size);

    // All three frames must differ from each other
    expect(plain.compare(phone)).not.toBe(0);
    expect(plain.compare(browser)).not.toBe(0);
    expect(phone.compare(browser)).not.toBe(0);
  });
});
