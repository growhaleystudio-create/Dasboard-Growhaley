/**
 * Tests for slide-content-analyzer.ts
 */

import { describe, it, expect } from 'vitest';
import { SlideContentAnalyzer } from '../slide-content-analyzer.js';
import type { SduiSlide } from '@leads-generator/shared';

describe('SlideContentAnalyzer', () => {
  // Helper to create minimal slide
  const createSlide = (overrides: Partial<SduiSlide> = {}): SduiSlide => ({
    slide_number: 1,
    slide_type: 'content',
    container_layout: 'text_dominant',
    layout_variant_id: 'text_stack',
    image_requirement: 'none',
    image_status: 'not_needed',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [],
      core_content: [],
      action_footer: [],
    },
    ...overrides,
  });

  describe('firstText', () => {
    it('should extract header text from core_content', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Main Title' }],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.firstText(slide, 'header')).toBe('Main Title');
    });

    it('should extract body text from core_content', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'body', text: 'Body content here' }],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.firstText(slide, 'body')).toBe('Body content here');
    });

    it('should extract quote text', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'quote', text: 'Inspirational quote' }],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.firstText(slide, 'quote')).toBe('Inspirational quote');
    });

    it('should return undefined when component type not found', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'body', text: 'Only body' }],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.firstText(slide, 'header')).toBeUndefined();
    });

    it('should trim whitespace from text', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: '  Padded Title  ' }],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.firstText(slide, 'header')).toBe('Padded Title');
    });

    it('should return undefined for empty text', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: '   ' }],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.firstText(slide, 'header')).toBeUndefined();
    });

    it('should find text in top_meta group', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [{ type: 'header', text: 'Meta Header' }],
          core_content: [],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.firstText(slide, 'header')).toBe('Meta Header');
    });

    it('should find text in action_footer group', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [],
          action_footer: [{ type: 'body', text: 'Footer content' }],
        },
      });
      expect(SlideContentAnalyzer.firstText(slide, 'body')).toBe('Footer content');
    });

    it('should return first match when multiple exist', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'First header' },
            { type: 'body', text: 'Body text' },
            { type: 'header', text: 'Second header' },
          ],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.firstText(slide, 'header')).toBe('First header');
    });
  });

  describe('uniqueIssues', () => {
    it('should return empty array for empty input', () => {
      expect(SlideContentAnalyzer.uniqueIssues([])).toEqual([]);
    });

    it('should preserve unique issues', () => {
      const issues = ['issue1', 'issue2', 'issue3'];
      expect(SlideContentAnalyzer.uniqueIssues(issues)).toEqual(issues);
    });

    it('should remove duplicate issues', () => {
      const issues = ['issue1', 'issue2', 'issue1', 'issue3', 'issue2'];
      const result = SlideContentAnalyzer.uniqueIssues(issues);
      expect(result).toHaveLength(3);
      expect(result).toContain('issue1');
      expect(result).toContain('issue2');
      expect(result).toContain('issue3');
    });

    it('should handle all identical issues', () => {
      const issues = ['same', 'same', 'same'];
      expect(SlideContentAnalyzer.uniqueIssues(issues)).toEqual(['same']);
    });

    it('should preserve order of first occurrence', () => {
      const issues = ['c', 'b', 'a', 'b', 'c'];
      const result = SlideContentAnalyzer.uniqueIssues(issues);
      expect(result).toEqual(['c', 'b', 'a']);
    });
  });

  describe('shortPromptTopic', () => {
    it('should return default for empty prompt', () => {
      expect(SlideContentAnalyzer.shortPromptTopic('')).toBe('Konten utama');
    });

    it('should return default for whitespace-only prompt', () => {
      expect(SlideContentAnalyzer.shortPromptTopic('   ')).toBe('Konten utama');
    });

    it('should return short prompt as-is', () => {
      expect(SlideContentAnalyzer.shortPromptTopic('Create marketing content')).toBe('Create marketing content');
    });

    it('should truncate long prompt at 72 chars', () => {
      const longPrompt = 'This is a very long prompt that exceeds the maximum character limit of 72 characters';
      const result = SlideContentAnalyzer.shortPromptTopic(longPrompt);
      expect(result.length).toBeLessThanOrEqual(72);
      expect(result).toMatch(/\.\.\.$/);
    });

    it('should normalize multiple spaces', () => {
      const prompt = 'Multiple    spaces    between    words';
      const result = SlideContentAnalyzer.shortPromptTopic(prompt);
      expect(result).toBe('Multiple spaces between words');
    });

    it('should trim leading/trailing whitespace', () => {
      const prompt = '   Padded prompt   ';
      expect(SlideContentAnalyzer.shortPromptTopic(prompt)).toBe('Padded prompt');
    });

    it('should handle exactly 72 characters', () => {
      const prompt = 'a'.repeat(72);
      const result = SlideContentAnalyzer.shortPromptTopic(prompt);
      expect(result).toBe(prompt);
      expect(result.length).toBe(72);
    });

    it('should truncate at 69 chars with ellipsis for 73+ chars', () => {
      const prompt = 'a'.repeat(75);
      const result = SlideContentAnalyzer.shortPromptTopic(prompt);
      expect(result.length).toBe(72); // 69 + 3 ('...')
      expect(result).toBe('a'.repeat(69) + '...');
    });

    it('should handle Indonesian prompt', () => {
      const prompt = 'Buat konten marketing untuk produk baru';
      expect(SlideContentAnalyzer.shortPromptTopic(prompt)).toBe('Buat konten marketing untuk produk baru');
    });
  });

  describe('isValidNoImageRepair', () => {
    it('should return true for text-only slide', () => {
      const slide = createSlide({
        layout_variant_id: 'text_stack',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Title' }],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.isValidNoImageRepair(slide)).toBe(true);
    });

    it('should return false when slide has image placeholder', () => {
      const slide = createSlide({
        layout_variant_id: 'text_stack',
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Title' },
            { type: 'image_placeholder' },
          ],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.isValidNoImageRepair(slide)).toBe(false);
    });

    it('should return true for layout not in image-supporting families', () => {
      // split_image_focus_left is NOT in LAYOUT_FAMILY_MAP, defaults to 'text'
      const slide = createSlide({
        layout_variant_id: 'split_image_focus_left',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Title' }],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.isValidNoImageRepair(slide)).toBe(true);
    });

    it('should return true for undefined layout_variant_id', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Title' }],
          action_footer: [],
        },
      });
      // Remove layout_variant_id to test undefined case
      const slideWithoutLayout = { ...slide, layout_variant_id: undefined as any };
      expect(SlideContentAnalyzer.isValidNoImageRepair(slideWithoutLayout)).toBe(true);
    });

    it('should return true for cover_image_full layout (defaults to text family)', () => {
      // cover_image_full is NOT in LAYOUT_FAMILY_MAP, defaults to 'text'
      const slide = createSlide({
        layout_variant_id: 'cover_image_full',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Title' }],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.isValidNoImageRepair(slide)).toBe(true);
    });

    it('should return true for checklist_stack layout (no image support)', () => {
      const slide = createSlide({
        layout_variant_id: 'checklist_stack',
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Title' },
            { type: 'checklist', items: ['Item 1', 'Item 2'] },
          ],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.isValidNoImageRepair(slide)).toBe(true);
    });

    it('should return true for text_centered layout', () => {
      const slide = createSlide({
        layout_variant_id: 'text_centered',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'body', text: 'Centered text' }],
          action_footer: [],
        },
      });
      expect(SlideContentAnalyzer.isValidNoImageRepair(slide)).toBe(true);
    });
  });
});
