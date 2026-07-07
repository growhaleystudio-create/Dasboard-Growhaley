import { describe, expect, it } from 'vitest';

import { getMiravaQuality, getMiravaRatio, getMiravaStyle } from './mirava-image-client.js';

describe('mirava image client helpers', () => {
  it('uses supported quality values for Imaginer models', () => {
    expect(getMiravaQuality('gpt-image-2')).toBe('medium');
    expect(getMiravaQuality('gpt-image-1.5')).toBe('1K');
    expect(getMiravaQuality('nano-banana-2')).toBe('2K');
    expect(getMiravaQuality('flux-pro-2.0')).toBe('1K');
  });

  it('maps ratios to supported values per model', () => {
    expect(getMiravaRatio('nano-banana-2', '1:1')).toBe('1:1');
    expect(getMiravaRatio('nano-banana-2', '4:5')).toBe('9:16');
    expect(getMiravaRatio('nano-banana-2', '9:16')).toBe('9:16');

    expect(getMiravaRatio('gpt-image-2', '1:1')).toBe('1:1');
    expect(getMiravaRatio('gpt-image-2', '4:5')).toBe('2:3');
    expect(getMiravaRatio('gpt-image-2', '9:16')).toBe('9:16');
  });

  it('does not force unsupported styles', () => {
    expect(getMiravaStyle('gpt-image-2', 'hand drawn doodle sketch')).toBe('dynamic');
    expect(getMiravaStyle('nano-banana-2', 'hand drawn doodle sketch')).toBeUndefined();
    expect(getMiravaStyle('nano-banana-2', 'anime portrait')).toBe('anime');
  });
});
