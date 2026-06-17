/**
 * content-sanitizer.test.ts
 *
 * Unit tests for content sanitization utilities
 */

import { describe, it, expect } from 'vitest';
import { ContentSanitizer } from '../content-sanitizer.js';
import type { SduiSlide } from '@leads-generator/shared';

describe('ContentSanitizer', () => {
  describe('cleanContentTag', () => {
    it('should convert to uppercase', () => {
      expect(ContentSanitizer.cleanContentTag('product')).toBe('PRODUCT');
      expect(ContentSanitizer.cleanContentTag('Feature')).toBe('FEATURE');
    });

    it('should remove special characters', () => {
      expect(ContentSanitizer.cleanContentTag('Product | Feature')).toBe('PRODUCT FEATURE');
      expect(ContentSanitizer.cleanContentTag('Item #1')).toBe('ITEM 1');
      expect(ContentSanitizer.cleanContentTag('Part / Section')).toBe('PART SECTION');
    });

    it('should preserve hyphens', () => {
      expect(ContentSanitizer.cleanContentTag('e-commerce')).toBe('E-COMMERCE');
      expect(ContentSanitizer.cleanContentTag('user-friendly')).toBe('USER-FRIENDLY');
    });

    it('should normalize whitespace', () => {
      expect(ContentSanitizer.cleanContentTag('product    feature')).toBe('PRODUCT FEATURE');
      expect(ContentSanitizer.cleanContentTag('  item   test  ')).toBe('ITEM TEST');
    });

    it('should limit to 3 words', () => {
      expect(ContentSanitizer.cleanContentTag('one two three four five')).toBe('ONE TWO THREE');
    });

    it('should limit to 24 characters', () => {
      const longTag = 'VERYLONGTAGTHATEXCEEDSTWENTYFOURCHARACTERS';
      const result = ContentSanitizer.cleanContentTag(longTag);
      expect(result.length).toBeLessThanOrEqual(24);
      expect(result).toBe('VERYLONGTAGTHATEXCEEDSTW');
    });

    it('should handle unicode characters', () => {
      expect(ContentSanitizer.cleanContentTag('café')).toBe('CAFÉ');
      expect(ContentSanitizer.cleanContentTag('日本語')).toBe('日本語');
    });

    it('should handle empty string', () => {
      expect(ContentSanitizer.cleanContentTag('')).toBe('');
      expect(ContentSanitizer.cleanContentTag('   ')).toBe('');
    });

    it('should remove emojis and special symbols', () => {
      expect(ContentSanitizer.cleanContentTag('Product 🎉')).toBe('PRODUCT');
      expect(ContentSanitizer.cleanContentTag('Test @ Symbol')).toBe('TEST SYMBOL');
    });
  });

  describe('sanitizeContentTags', () => {
    it('should return empty array for non-array input', () => {
      expect(ContentSanitizer.sanitizeContentTags(null)).toEqual([]);
      expect(ContentSanitizer.sanitizeContentTags(undefined)).toEqual([]);
      expect(ContentSanitizer.sanitizeContentTags('string')).toEqual([]);
      expect(ContentSanitizer.sanitizeContentTags(123)).toEqual([]);
      expect(ContentSanitizer.sanitizeContentTags({})).toEqual([]);
    });

    it('should filter out non-string values', () => {
      const input = ['valid', 123, null, 'another', undefined, true];
      const result = ContentSanitizer.sanitizeContentTags(input);
      expect(result).toEqual(['VALID', 'ANOTHER']);
    });

    it('should clean each tag', () => {
      const input = ['product | feature', 'item #1', 'test/case'];
      const result = ContentSanitizer.sanitizeContentTags(input);
      expect(result).toEqual(['PRODUCT FEATURE', 'ITEM 1', 'TEST CASE']);
    });

    it('should remove duplicates', () => {
      const input = ['product', 'feature', 'PRODUCT', 'product'];
      const result = ContentSanitizer.sanitizeContentTags(input);
      expect(result).toEqual(['PRODUCT', 'FEATURE']);
    });

    it('should limit to 10 tags', () => {
      const input = Array.from({ length: 15 }, (_, i) => `tag${i}`);
      const result = ContentSanitizer.sanitizeContentTags(input);
      expect(result).toHaveLength(10);
    });

    it('should filter out empty tags after cleaning', () => {
      const input = ['valid', '   ', '###', '', 'another'];
      const result = ContentSanitizer.sanitizeContentTags(input);
      expect(result).toEqual(['VALID', 'ANOTHER']);
    });

    it('should handle empty array', () => {
      expect(ContentSanitizer.sanitizeContentTags([])).toEqual([]);
    });

    it('should handle mixed valid and invalid inputs', () => {
      const input = ['Product', 123, 'Feature', null, 'Test'];
      const result = ContentSanitizer.sanitizeContentTags(input);
      expect(result).toEqual(['PRODUCT', 'FEATURE', 'TEST']);
    });
  });

  describe('sanitizeConversationContext', () => {
    it('should return empty array for non-array input', () => {
      expect(ContentSanitizer.sanitizeConversationContext(null)).toEqual([]);
      expect(ContentSanitizer.sanitizeConversationContext(undefined)).toEqual([]);
      expect(ContentSanitizer.sanitizeConversationContext('string')).toEqual([]);
      expect(ContentSanitizer.sanitizeConversationContext({})).toEqual([]);
    });

    it('should accept valid user messages', () => {
      const input = [{ role: 'user', text: 'Hello world' }];
      const result = ContentSanitizer.sanitizeConversationContext(input);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'user',
        text: 'Hello world',
      });
    });

    it('should accept valid assistant messages', () => {
      const input = [{ role: 'assistant', text: 'Hi there!' }];
      const result = ContentSanitizer.sanitizeConversationContext(input);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'assistant',
        text: 'Hi there!',
      });
    });

    it('should reject invalid roles', () => {
      const input = [
        { role: 'system', text: 'System message' },
        { role: 'admin', text: 'Admin message' },
        { role: 'user', text: 'Valid message' },
      ];
      const result = ContentSanitizer.sanitizeConversationContext(input);
      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe('user');
    });

    it('should normalize whitespace in text', () => {
      const input = [{ role: 'user', text: 'Hello    world   with    spaces' }];
      const result = ContentSanitizer.sanitizeConversationContext(input);
      expect(result[0]?.text).toBe('Hello world with spaces');
    });

    it('should limit individual messages to 800 characters', () => {
      const longText = 'a'.repeat(1000);
      const input = [{ role: 'user', text: longText }];
      const result = ContentSanitizer.sanitizeConversationContext(input);
      expect(result[0]?.text).toHaveLength(800);
    });

    it('should limit total context to 5000 characters', () => {
      const input = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: 'a'.repeat(600),
      }));
      const result = ContentSanitizer.sanitizeConversationContext(input);
      const totalLength = result.reduce((sum, msg) => sum + msg.text.length, 0);
      expect(totalLength).toBeLessThanOrEqual(5000);
    });

    it('should keep last 10 messages only', () => {
      const input = Array.from({ length: 15 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `Message ${i}`,
      }));
      const result = ContentSanitizer.sanitizeConversationContext(input);
      expect(result).toHaveLength(10);
      // Should keep messages 5-14 (last 10)
      expect(result[0]?.text).toBe('Message 5');
    });

    it('should preserve optional createdAt field', () => {
      const input = [{ role: 'user', text: 'Hello', createdAt: '2024-01-01T00:00:00Z' }];
      const result = ContentSanitizer.sanitizeConversationContext(input);
      expect(result[0]?.createdAt).toBe('2024-01-01T00:00:00Z');
    });

    it('should limit createdAt to 64 characters', () => {
      const longDate = 'a'.repeat(100);
      const input = [{ role: 'user', text: 'Hello', createdAt: longDate }];
      const result = ContentSanitizer.sanitizeConversationContext(input);
      expect(result[0]?.createdAt).toHaveLength(64);
    });

    it('should skip messages without text', () => {
      const input = [
        { role: 'user' },
        { role: 'user', text: 'Valid' },
        { role: 'assistant', text: '' },
      ];
      const result = ContentSanitizer.sanitizeConversationContext(input);
      expect(result).toHaveLength(1);
      expect(result[0]?.text).toBe('Valid');
    });

    it('should skip non-object items', () => {
      const input = ['string item', { role: 'user', text: 'Valid' }, 123, null];
      const result = ContentSanitizer.sanitizeConversationContext(input);
      expect(result).toHaveLength(1);
    });

    it('should handle empty array', () => {
      expect(ContentSanitizer.sanitizeConversationContext([])).toEqual([]);
    });
  });

  describe('applyContentTags', () => {
    const createMockSlide = (slideNumber: number): SduiSlide => ({
      slide_number: slideNumber,
      slide_type: 'content',
      container_layout: 'text_dominant',
      layout_variant_id: 'text_stack',
      image_requirement: 'none',
      image_status: 'not_needed',
      layout_source: 'ai_selected',
      typography_scale: 'balanced_classic',
      nested_groups: {
        top_meta: [],
        core_content: [{ type: 'header', text: `Slide ${slideNumber}` }],
        action_footer: [],
      },
    });

    it('should return unchanged slides when tags array is empty', () => {
      const slides = [createMockSlide(1), createMockSlide(2)];
      const result = ContentSanitizer.applyContentTags(slides, []);
      expect(result).toEqual(slides);
    });

    it('should add tag to top_meta of each slide', () => {
      const slides = [createMockSlide(1), createMockSlide(2)];
      const tags = ['TAG A', 'TAG B'];
      const result = ContentSanitizer.applyContentTags(slides, tags);

      expect(result[0]).toBeDefined();
      expect(result[0]!.nested_groups!.top_meta![0]!).toEqual({
        type: 'tag',
        text: 'TAG A',
        textTransform: 'uppercase',
      });
      expect(result[1]).toBeDefined();
      expect(result[1]!.nested_groups!.top_meta![0]!).toEqual({
        type: 'tag',
        text: 'TAG B',
        textTransform: 'uppercase',
      });
    });

    it('should cycle tags when more slides than tags', () => {
      const slides = [createMockSlide(1), createMockSlide(2), createMockSlide(3)];
      const tags = ['TAG A', 'TAG B'];
      const result = ContentSanitizer.applyContentTags(slides, tags);

      expect(result[0]!.nested_groups!.top_meta![0]!.text).toBe('TAG A');
      expect(result[1]!.nested_groups!.top_meta![0]!.text).toBe('TAG B');
      expect(result[2]!.nested_groups!.top_meta![0]!.text).toBe('TAG A'); // cycles back
    });

    it('should remove existing tag components before adding new one', () => {
      const slideWithTag: SduiSlide = {
        ...createMockSlide(1),
        nested_groups: {
          top_meta: [
            { type: 'tag', text: 'OLD TAG', textTransform: 'uppercase' },
            { type: 'byline', text: 'Author' },
          ],
          core_content: [{ type: 'header', text: 'Slide 1' }],
          action_footer: [],
        },
      };

      const result = ContentSanitizer.applyContentTags([slideWithTag], ['NEW TAG']);
      const topMeta = result[0]!.nested_groups!.top_meta!;

      // Should have exactly one tag component (the new one)
      const tagComponents = topMeta.filter((c) => c.type === 'tag');
      expect(tagComponents).toHaveLength(1);
      expect(tagComponents[0]!.text).toBe('NEW TAG');

      // Should preserve other components
      expect(topMeta.some((c) => c.type === 'byline')).toBe(true);
    });

    it('should preserve other top_meta components', () => {
      const slideWithMeta: SduiSlide = {
        ...createMockSlide(1),
        nested_groups: {
          top_meta: [
            { type: 'byline', text: 'Author Name' },
            { type: 'caption', text: 'Caption text' },
          ],
          core_content: [{ type: 'header', text: 'Slide 1' }],
          action_footer: [],
        },
      };

      const result = ContentSanitizer.applyContentTags([slideWithMeta], ['TAG']);
      const slide = result[0]!;

      expect(slide.nested_groups!.top_meta!).toHaveLength(3); // tag + byline + caption
      expect(slide.nested_groups!.top_meta!.some((c) => c.type === 'byline')).toBe(true);
      expect(slide.nested_groups!.top_meta!.some((c) => c.type === 'caption')).toBe(true);
    });

    it('should handle slides with empty top_meta', () => {
      const slide = createMockSlide(1);
      const result = ContentSanitizer.applyContentTags([slide], ['TAG']);

      expect(result[0]!.nested_groups!.top_meta!).toHaveLength(1);
      expect(result[0]!.nested_groups!.top_meta![0]!).toEqual({
        type: 'tag',
        text: 'TAG',
        textTransform: 'uppercase',
      });
    });

    it('should not mutate original slides', () => {
      const slides = [createMockSlide(1)];
      const originalTopMetaLength = slides[0]!.nested_groups!.top_meta!.length;

      ContentSanitizer.applyContentTags(slides, ['TAG']);

      // Original should be unchanged
      expect(slides[0]!.nested_groups.top_meta).toHaveLength(originalTopMetaLength);
    });

    it('should handle single tag for multiple slides', () => {
      const slides = [createMockSlide(1), createMockSlide(2), createMockSlide(3)];
      const result = ContentSanitizer.applyContentTags(slides, ['SAME TAG']);

      expect(result[0]!.nested_groups!.top_meta![0]!.text).toBe('SAME TAG');
      expect(result[1]!.nested_groups!.top_meta![0]!.text).toBe('SAME TAG');
      expect(result[2]!.nested_groups!.top_meta![0]!.text).toBe('SAME TAG');
    });
  });
});
