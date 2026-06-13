/**
 * Tests for SharpMockupRenderer (task 14.3 / Property 17 — mockup half).
 *
 * Core property verified:
 *   Determinism: render(same image + frame + size) → byte-identical PNG, and
 *   the renderer never calls an AI image model / network (no fetch).
 *
 * Requirements: 7.2, 7.3 (and 7.1 shared with chart-renderer.test.ts)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import sharp from 'sharp';
import { SharpMockupRenderer } from './mockup-renderer.js';
import type { MockupFrame } from './mockup-renderer.js';

// ---------------------------------------------------------------------------
// Fixtures — tiny solid-colour PNGs generated deterministically via sharp.
// (Generators must be synchronous, so the input images are built up-front.)
// ---------------------------------------------------------------------------

const FRAMES: MockupFrame[] = ['phone', 'browser', 'plain'];

let inputImages: Buffer[] = [];

beforeAll(async () => {
  const specs = [
    { w: 40, h: 40, color: { r: 220, g: 38, b: 38, alpha: 1 } },
    { w: 64, h: 32, color: { r: 34, g: 197, b: 94, alpha: 1 } },
    { w: 48, h: 72, color: { r: 59, g: 130, b: 246, alpha: 1 } },
  ];
  inputImages = await Promise.all(
    specs.map((s) =>
      sharp({
        create: { width: s.w, height: s.h, channels: 4, background: s.color },
      })
        .png()
        .toBuffer(),
    ),
  );
});

const mockupSizeArb = fc.record({
  w: fc.integer({ min: 64, max: 120 }),
  h: fc.integer({ min: 64, max: 120 }),
});

// ---------------------------------------------------------------------------
// Basic example coverage (fast smoke checks)
// ---------------------------------------------------------------------------

describe('SharpMockupRenderer.render', () => {
  it.each(FRAMES)('renders a valid non-empty PNG for the %s frame', async (frame) => {
    const buf = await new SharpMockupRenderer().render(inputImages[0]!, frame, { w: 100, h: 100 });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(0);
    // PNG magic bytes
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // 'P'
    expect(buf[2]).toBe(0x4e); // 'N'
    expect(buf[3]).toBe(0x47); // 'G'
  });
});

// ---------------------------------------------------------------------------
// Property 17 — Mockup half: deterministic compositing without AI image model
// ---------------------------------------------------------------------------

describe('Property 17 — MockupRenderer deterministic, no AI image model', () => {
  // A network spy: compositing must never reach out to an AI provider / image model.
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
  it('renders byte-identical PNGs for identical mockup inputs and never calls fetch', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...inputImages),
        fc.constantFrom(...FRAMES),
        mockupSizeArb,
        async (image, frame, size) => {
          const renderer = new SharpMockupRenderer();

          const a = await renderer.render(image, frame, size);
          const b = await renderer.render(image, frame, size);

          // Deterministic: same inputs → byte-for-byte identical output.
          expect(Buffer.isBuffer(a)).toBe(true);
          expect(a.length).toBe(b.length);
          expect(a.equals(b)).toBe(true);

          // No AI image model / network call occurred during compositing.
          expect(fetchSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  // R7.2: the renderer is a pure deterministic function — no AI provider/image
  // model dependency is injected by construction or accepted by `render`.
  it('SharpMockupRenderer carries no AI provider dependency (pure by construction)', () => {
    expect(SharpMockupRenderer.length).toBe(0); // zero-arg constructor (no AI dep)
    expect(new SharpMockupRenderer().render.length).toBe(3); // render(image, frame, size)
  });
});
