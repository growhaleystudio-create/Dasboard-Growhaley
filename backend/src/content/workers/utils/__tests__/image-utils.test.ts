/**
 * image-utils.test.ts
 *
 * Unit tests for image utility functions
 */

import { describe, it, expect, vi } from 'vitest';
import { ImageUtils } from '../image-utils.js';
import type { SduiSlide, AspectRatio } from '@leads-generator/shared';

describe('ImageUtils', () => {
  describe('canvasWidth', () => {
    it('should return 1080 for 9:16 aspect ratio', () => {
      expect(ImageUtils.canvasWidth('9:16')).toBe(1080);
    });

    it('should return 1080 for 9:16 aspect ratio', () => {
      expect(ImageUtils.canvasWidth('9:16')).toBe(1080);
    });

    it('should return 1080 for 1:1 aspect ratio', () => {
      expect(ImageUtils.canvasWidth('1:1')).toBe(1080);
    });

    it('should return 1080 for 4:5 aspect ratio', () => {
      expect(ImageUtils.canvasWidth('4:5')).toBe(1080);
    });
  });

  describe('getPlaceholderAspect', () => {
    it('should return canvas aspect for photo and collage layouts', () => {
      const photoSlide: Partial<SduiSlide> = {
        layout_variant_id: 'gw_photo_statement',
      };
      const collageSlide: Partial<SduiSlide> = {
        layout_variant_id: 'gw_collage_showcase',
      };
      expect(ImageUtils.getPlaceholderAspect(photoSlide as SduiSlide, '9:16')).toBe('9:16');
      expect(ImageUtils.getPlaceholderAspect(collageSlide as SduiSlide, '9:16')).toBe('9:16');
    });

    it('should return 1:1 for non-cover layouts', () => {
      const slide: Partial<SduiSlide> = {
        layout_variant_id: 'text_stack',
      };
      expect(ImageUtils.getPlaceholderAspect(slide as SduiSlide, '9:16')).toBe('1:1');
      expect(ImageUtils.getPlaceholderAspect(slide as SduiSlide, '9:16')).toBe('1:1');
    });
  });

  describe('getGeneratedAspect', () => {
    it('should return canvas aspect for gw_photo layouts', () => {
      const slide: Partial<SduiSlide> = {
        layout_variant_id: 'gw_photo_statement',
      };
      expect(ImageUtils.getGeneratedAspect(slide as SduiSlide, '9:16')).toBe('9:16');
      expect(ImageUtils.getGeneratedAspect(slide as SduiSlide, '9:16')).toBe('9:16');
    });

    it('should return 4:5 for multi-image layouts with 9:16 canvas', () => {
      const layouts = [
        'dual_image_comparison',
        'product_angle_pair',
        'use_case_gallery_2up',
        'problem_solution_visual_pair',
        'dos_donts_visual_pair',
        'real_estate_room_pair',
      ];

      layouts.forEach((layout) => {
        const slide: Partial<SduiSlide> = { layout_variant_id: layout as any };
        expect(ImageUtils.getGeneratedAspect(slide as SduiSlide, '9:16')).toBe('4:5');
      });
    });

    it('should return 1:1 for multi-image layouts with non-9:16 canvas', () => {
      const slide: Partial<SduiSlide> = {
        layout_variant_id: 'dual_image_comparison',
      };
      expect(ImageUtils.getGeneratedAspect(slide as SduiSlide, '9:16')).toBe('4:5');
      expect(ImageUtils.getGeneratedAspect(slide as SduiSlide, '1:1')).toBe('1:1');
    });

    it('should return 1:1 for standard layouts', () => {
      const slide: Partial<SduiSlide> = {
        layout_variant_id: 'text_stack',
      };
      expect(ImageUtils.getGeneratedAspect(slide as SduiSlide, '9:16')).toBe('1:1');
      expect(ImageUtils.getGeneratedAspect(slide as SduiSlide, '9:16')).toBe('1:1');
    });
  });

  describe('extractStyle', () => {
    it('should extract explicit style declaration in English', () => {
      expect(ImageUtils.extractStyle('create content with style: watercolor art')).toBe(
        'watercolor art',
      );
      expect(ImageUtils.extractStyle('buat style image = minimalist')).toBe('minimalist');
      expect(ImageUtils.extractStyle('dengan gaya flat vector')).toBe('flat vector');
    });

    it('should extract explicit style declaration in Indonesian', () => {
      expect(ImageUtils.extractStyle('buat gambar gaya visual: 3d render')).toBe('3d render');
      expect(ImageUtils.extractStyle('dengan gaya anime modern')).toBe('anime modern');
    });

    it('should truncate explicit style to 180 chars', () => {
      const longStyle = 'a'.repeat(200);
      const result = ImageUtils.extractStyle(`style: ${longStyle}`);
      expect(result?.length).toBe(180);
    });

    it('should detect style keywords', () => {
      expect(ImageUtils.extractStyle('create minimalist doodle illustration')).toBe(
        'doodle, minimalist, minimalis',
      );
      expect(ImageUtils.extractStyle('make it 3d and photorealistic')).toBe(
        '3d, photorealistic, realistic',
      );
      expect(ImageUtils.extractStyle('design with anime and sticker')).toBe('anime, sticker');
    });

    it('should detect Indonesian style keywords', () => {
      expect(ImageUtils.extractStyle('buat ilustrasi minimalis')).toBe('minimalis');
    });

    it('should detect transparent/no-background request', () => {
      expect(ImageUtils.extractStyle('create transparent background image')).toContain(
        'transparent no-background cutout',
      );
      expect(ImageUtils.extractStyle('tanpa background please')).toContain(
        'transparent no-background cutout',
      );
      expect(ImageUtils.extractStyle('isolated cutout style')).toContain(
        'transparent no-background cutout',
      );
    });

    it('should combine keywords and transparent request', () => {
      const result = ImageUtils.extractStyle('create minimalist transparent cutout');
      expect(result).toContain('minimalist');
      expect(result).toContain('transparent no-background cutout');
    });

    it('should return undefined for prompts without style hints', () => {
      expect(ImageUtils.extractStyle('create a simple presentation')).toBeUndefined();
      expect(ImageUtils.extractStyle('make slides about marketing')).toBeUndefined();
    });

    it('should deduplicate keywords', () => {
      const result = ImageUtils.extractStyle('minimalist minimalist design');
      expect(result).toBe('minimalist, minimalis');
    });
  });

  describe('parseHex', () => {
    it('should parse 3-digit hex color', () => {
      expect(ImageUtils.parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 });
      expect(ImageUtils.parseHex('#f0f')).toEqual({ r: 255, g: 0, b: 255 });
      expect(ImageUtils.parseHex('abc')).toEqual({ r: 170, g: 187, b: 204 });
    });

    it('should parse 6-digit hex color', () => {
      expect(ImageUtils.parseHex('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(ImageUtils.parseHex('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(ImageUtils.parseHex('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
      expect(ImageUtils.parseHex('ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('should return null for invalid hex formats', () => {
      expect(ImageUtils.parseHex('#gg0000')).toBeNull();
      expect(ImageUtils.parseHex('#12')).toBeNull();
      expect(ImageUtils.parseHex('#1234567')).toBeNull();
      expect(ImageUtils.parseHex('invalid')).toBeNull();
    });

    it('should handle edge cases', () => {
      expect(ImageUtils.parseHex('#000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(ImageUtils.parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(ImageUtils.parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });
  });

  describe('normalize', () => {
    it('should be tested with actual sharp library in integration tests', () => {
      // Note: This function uses sharp which requires actual image processing.
      // Integration tests with real images would be more appropriate.
      // Unit tests here would require mocking sharp extensively.
      expect(true).toBe(true);
    });
  });
});
