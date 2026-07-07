import { describe, it, expect } from 'vitest';

import {
  promptExplicitlyRequestsImages,
  promptExplicitlyRequestsNoImages,
} from './image-detection.js';

describe('promptExplicitlyRequestsNoImages', () => {
  it('detects explicit no-image / text-only intent', () => {
    for (const p of [
      'Semua slide TEKS SAJA tanpa gambar sama sekali',
      'buat deck text-only',
      'hanya teks aja',
      'cuma teks',
      'no image please',
      'tanpa foto',
    ]) {
      expect(promptExplicitlyRequestsNoImages(p), p).toBe(true);
    }
  });

  it('does not fire on ordinary or image-wanting prompts', () => {
    for (const p of ['buat carousel promo produk', 'pakai foto profesional', 'carousel edukasi']) {
      expect(promptExplicitlyRequestsNoImages(p), p).toBe(false);
    }
  });

  it('wins over the image detector when a negation contains "gambar"', () => {
    // Regression: "tanpa gambar" used to trip the image-required heuristic and
    // re-add photos to a text-only deck via the quality-gate repair path.
    const prompt = 'Buat carousel edukasi. Semua slide teks saja tanpa gambar.';
    expect(promptExplicitlyRequestsImages(prompt)).toBe(true);
    expect(promptExplicitlyRequestsNoImages(prompt)).toBe(true);
  });
});
