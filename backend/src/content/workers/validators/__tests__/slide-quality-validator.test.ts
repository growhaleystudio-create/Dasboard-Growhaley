/**
 * Tests for slide-quality-validator.ts
 */

import { describe, it, expect } from 'vitest';
import { SlideQualityValidator } from '../slide-quality-validator.js';
import type { SduiSlide, SduiComponent } from '@leads-generator/shared';

describe('SlideQualityValidator', () => {
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

  describe('slideHas', () => {
    it('should return true when component type exists', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Title' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.slideHas(slide, 'header')).toBe(true);
    });

    it('should return false when component type does not exist', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'body', text: 'Content' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.slideHas(slide, 'header')).toBe(false);
    });

    it('should check all nested groups', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [{ type: 'tag', text: 'TAG' }],
          core_content: [],
          action_footer: [{ type: 'button_cta', label: 'Click', style: 'primary' }],
        },
      });
      expect(SlideQualityValidator.slideHas(slide, 'tag')).toBe(true);
      expect(SlideQualityValidator.slideHas(slide, 'button_cta')).toBe(true);
    });
  });

  describe('hasImagePlaceholder', () => {
    it('should return true when image_placeholder exists', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'image_placeholder' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.hasImagePlaceholder(slide)).toBe(true);
    });

    it('should return false when no image_placeholder exists', () => {
      const slide = createSlide();
      expect(SlideQualityValidator.hasImagePlaceholder(slide)).toBe(false);
    });
  });

  describe('imagePlaceholderCount', () => {
    it('should count zero when no placeholders', () => {
      const slide = createSlide();
      expect(SlideQualityValidator.imagePlaceholderCount(slide)).toBe(0);
    });

    it('should count single placeholder', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'image_placeholder' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.imagePlaceholderCount(slide)).toBe(1);
    });

    it('should count multiple placeholders', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'image_placeholder' },
            { type: 'header', text: 'Title' },
            { type: 'image_placeholder' },
          ],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.imagePlaceholderCount(slide)).toBe(2);
    });
  });

  describe('requiredImagePlaceholderCount', () => {
    it('should return 0 for undefined layout', () => {
      expect(SlideQualityValidator.requiredImagePlaceholderCount(undefined)).toBe(0);
    });

    it('should return 1 for single-image layouts', () => {
      expect(SlideQualityValidator.requiredImagePlaceholderCount('split_text_left_image_right')).toBe(1);
    });

    it('should return 2 for dual-image layouts', () => {
      expect(SlideQualityValidator.requiredImagePlaceholderCount('dual_image_comparison')).toBe(2);
      expect(SlideQualityValidator.requiredImagePlaceholderCount('product_angle_pair')).toBe(2);
    });

    it('should return 3 for triple-image layouts', () => {
      expect(SlideQualityValidator.requiredImagePlaceholderCount('mini_gallery_3up')).toBe(3);
    });

    it('should return 4 for quad-image layouts', () => {
      expect(SlideQualityValidator.requiredImagePlaceholderCount('moodboard_grid')).toBe(4);
    });
  });

  describe('isMultiImageLayout', () => {
    it('should return false for undefined layout', () => {
      expect(SlideQualityValidator.isMultiImageLayout(undefined)).toBe(false);
    });

    it('should return false for single-image layouts', () => {
      expect(SlideQualityValidator.isMultiImageLayout('split_text_left_image_right')).toBe(false);
    });

    it('should return true for multi-image layouts', () => {
      expect(SlideQualityValidator.isMultiImageLayout('dual_image_comparison')).toBe(true);
      expect(SlideQualityValidator.isMultiImageLayout('mini_gallery_3up')).toBe(true);
      expect(SlideQualityValidator.isMultiImageLayout('moodboard_grid')).toBe(true);
    });
  });

  describe('componentContentUnits', () => {
    it('should return 1 for non-empty header', () => {
      expect(SlideQualityValidator.componentContentUnits({ type: 'header', text: 'Title' })).toBe(1);
    });

    it('should return 0 for empty header', () => {
      expect(SlideQualityValidator.componentContentUnits({ type: 'header', text: '' })).toBe(0);
      expect(SlideQualityValidator.componentContentUnits({ type: 'header', text: '   ' })).toBe(0);
    });

    it('should return 1 for non-empty body', () => {
      expect(SlideQualityValidator.componentContentUnits({ type: 'body', text: 'Content' })).toBe(1);
    });

    it('should return 1 for valid CTA', () => {
      expect(SlideQualityValidator.componentContentUnits({ type: 'button_cta', label: 'Click me', style: 'primary' })).toBe(1);
    });

    it('should return 0 for empty CTA', () => {
      expect(SlideQualityValidator.componentContentUnits({ type: 'button_cta', label: '', style: 'primary' })).toBe(0);
    });

    it('should return 1 for checklist with 2+ items', () => {
      expect(SlideQualityValidator.componentContentUnits({
        type: 'checklist',
        items: ['Item 1', 'Item 2'],
      })).toBe(1);
    });

    it('should return 0 for checklist with < 2 items', () => {
      expect(SlideQualityValidator.componentContentUnits({
        type: 'checklist',
        items: ['Item 1'],
      })).toBe(0);
      expect(SlideQualityValidator.componentContentUnits({
        type: 'checklist',
        items: [],
      })).toBe(0);
    });

    it('should return 1 for feature_cards with 2+ cards', () => {
      expect(SlideQualityValidator.componentContentUnits({
        type: 'feature_cards',
        items_cards: [
          { icon: '1', title: 'Card 1', description: 'Desc 1' },
          { icon: '2', title: 'Card 2', description: 'Desc 2' },
        ],
      })).toBe(1);
    });

    it('should return 1 for image_placeholder', () => {
      expect(SlideQualityValidator.componentContentUnits({ type: 'image_placeholder' })).toBe(1);
    });

    it('should return 0 for unknown components', () => {
      expect(SlideQualityValidator.componentContentUnits({ type: 'tag', text: 'TAG' })).toBe(0);
    });
  });

  describe('slideContentUnits', () => {
    it('should return 0 for empty slide', () => {
      const slide = createSlide();
      expect(SlideQualityValidator.slideContentUnits(slide)).toBe(0);
    });

    it('should count single component', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Title' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.slideContentUnits(slide)).toBe(1);
    });

    it('should sum multiple components', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Title' },
            { type: 'body', text: 'Content' },
            { type: 'image_placeholder' },
          ],
          action_footer: [{ type: 'button_cta', label: 'Click', style: 'primary' }],
        },
      });
      expect(SlideQualityValidator.slideContentUnits(slide)).toBe(4);
    });
  });

  describe('isSparseContentSlide', () => {
    it('should return false for cover slides', () => {
      const slide = createSlide({
        slide_type: 'cover',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Title' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.isSparseContentSlide(slide)).toBe(false);
    });

    it('should return true for content slide with < 2 units', () => {
      const slide = createSlide({
        slide_type: 'content',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Title' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.isSparseContentSlide(slide)).toBe(true);
    });

    it('should return false for content slide with >= 2 units', () => {
      const slide = createSlide({
        slide_type: 'content',
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Title' },
            { type: 'body', text: 'Content' },
          ],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.isSparseContentSlide(slide)).toBe(false);
    });
  });

  describe('hasStatSignal', () => {
    it('should detect numbers in text', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Increase by 150%' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.hasStatSignal(slide)).toBe(true);
    });

    it('should detect percentage symbols', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'body', text: 'Growth rate: 45%' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.hasStatSignal(slide)).toBe(true);
    });

    it('should detect stat keywords in Indonesian', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Data penjualan Rp 5 juta' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.hasStatSignal(slide)).toBe(true);
    });

    it('should return false for non-stat content', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Welcome to our product' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.hasStatSignal(slide)).toBe(false);
    });
  });

  describe('hasRenderableComponent', () => {
    it('should return true for valid text component', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Title' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.hasRenderableComponent(slide, 'header')).toBe(true);
    });

    it('should return false for empty text component', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: '' }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.hasRenderableComponent(slide, 'header')).toBe(false);
    });

    it('should validate checklist with items', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{
            type: 'checklist',
            items: ['Item 1', 'Item 2'],
          }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.hasRenderableComponent(slide, 'checklist')).toBe(true);
    });

    it('should reject checklist without items', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{
            type: 'checklist',
            items: [],
          }],
          action_footer: [],
        },
      });
      expect(SlideQualityValidator.hasRenderableComponent(slide, 'checklist')).toBe(false);
    });

    it('should validate CTA with label', () => {
      const slide = createSlide({
        nested_groups: {
          top_meta: [],
          core_content: [],
          action_footer: [{ type: 'button_cta', label: 'Click me', style: 'primary' }],
        },
      });
      expect(SlideQualityValidator.hasRenderableComponent(slide, 'button_cta')).toBe(true);
    });
  });

  describe('requiredVisualSlideCount', () => {
    it('should return 0 for text-only prompts', () => {
      expect(SlideQualityValidator.requiredVisualSlideCount('Create text content about marketing', 5)).toBe(0);
    });

    it('should return 1 for prompt with image mention', () => {
      expect(SlideQualityValidator.requiredVisualSlideCount('Add some ilustrasi for context', 5)).toBe(1);
    });

    it('should return 3 for visual-led with 5+ slides', () => {
      expect(SlideQualityValidator.requiredVisualSlideCount('Create visual-led carousel about products', 5)).toBe(3);
    });

    it('should return 2 for visual-led with 3-4 slides', () => {
      expect(SlideQualityValidator.requiredVisualSlideCount('Create image-heavy presentation', 4)).toBe(2);
    });

    it('should return 1 for visual-led with < 3 slides', () => {
      expect(SlideQualityValidator.requiredVisualSlideCount('Create photo-driven slides', 2)).toBe(1);
    });
  });

  describe('visualIntegrityIssues', () => {
    it('should return empty array when no visuals required', () => {
      const slides = [createSlide(), createSlide()];
      expect(SlideQualityValidator.visualIntegrityIssues('Text only content', slides)).toEqual([]);
    });

    it('should detect insufficient image slides', () => {
      const slides = [createSlide(), createSlide()];
      const issues = SlideQualityValidator.visualIntegrityIssues('Create visual-led carousel', slides);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]).toContain('image slides before render');
    });

    it('should detect insufficient generated images for visual-led prompts', () => {
      // Visual-led prompt with 5 slides requires 3 images, we have 1 placeholder but 0 generated
      const slides = [
        createSlide({
          nested_groups: {
            top_meta: [],
            core_content: [{ type: 'image_placeholder' }],
            action_footer: [],
          },
          image_status: 'not_needed', // has placeholder but not generated
        }),
        createSlide(),
        createSlide(),
        createSlide(),
        createSlide(),
      ];
      // Visual-led with 5 slides needs 3 image slides, we only have 1 → should fail
      const issues = SlideQualityValidator.visualIntegrityIssues('Create visual-led carousel', slides);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]).toContain('image slides before render');
    });

    it('should pass when requirements met', () => {
      const slides = [
        createSlide({
          nested_groups: {
            top_meta: [],
            core_content: [{ type: 'image_placeholder' }],
            action_footer: [],
          },
          image_status: 'generated',
        }),
        createSlide(),
      ];
      const issues = SlideQualityValidator.visualIntegrityIssues('Add ilustrasi for context', slides);
      expect(issues).toEqual([]);
    });
  });
});
