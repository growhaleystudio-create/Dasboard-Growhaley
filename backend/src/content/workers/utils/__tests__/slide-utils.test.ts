/**
 * slide-utils.test.ts
 *
 * Unit tests for slide utility functions
 */

import { describe, it, expect } from 'vitest';
import { SlideUtils } from '../slide-utils.js';
import type { SduiSlide, SduiComponent } from '@leads-generator/shared';
import type { SduiPlannerError } from '../../../sdui-planner/index.js';

describe('SlideUtils', () => {
  const createMockSlide = (
    slideNumber: number,
    components: Partial<
      Record<'top_meta' | 'core_content' | 'action_footer', SduiComponent[]>
    > = {},
  ): SduiSlide => ({
    slide_number: slideNumber,
    slide_type: 'content',
    container_layout: 'text_dominant',
    layout_variant_id: 'text_stack',
    image_requirement: 'none',
    image_status: 'not_needed',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: components.top_meta ?? [],
      core_content: components.core_content ?? [{ type: 'header', text: `Slide ${slideNumber}` }],
      action_footer: components.action_footer ?? [],
    },
  });

  describe('slideComponents', () => {
    it('should extract all components from nested groups', () => {
      const slide = createMockSlide(1, {
        top_meta: [{ type: 'tag', text: 'TAG' }],
        core_content: [
          { type: 'header', text: 'Title' },
          { type: 'body', text: 'Content' },
        ],
        action_footer: [{ type: 'button_cta', label: 'Click', style: 'primary' }],
      });

      const components = SlideUtils.slideComponents(slide);

      expect(components).toHaveLength(4);
      expect(components[0]?.type).toBe('tag');
      expect(components[1]?.type).toBe('header');
      expect(components[2]?.type).toBe('body');
      expect(components[3]?.type).toBe('button_cta');
    });

    it('should handle empty nested groups', () => {
      const slide = createMockSlide(1, {
        top_meta: [],
        core_content: [],
        action_footer: [],
      });

      const components = SlideUtils.slideComponents(slide);
      expect(components).toHaveLength(0);
    });

    it('should flatten all groups into single array', () => {
      const slide = createMockSlide(1, {
        top_meta: [{ type: 'tag', text: 'A' }],
        core_content: [{ type: 'header', text: 'B' }],
        action_footer: [{ type: 'button_cta', label: 'C', style: 'primary' }],
      });

      const components = SlideUtils.slideComponents(slide);
      expect(components).toHaveLength(3);
      expect(components.map((c) => c.type)).toEqual(['tag', 'header', 'button_cta']);
    });

    it('should preserve order: top_meta, core_content, action_footer', () => {
      const slide = createMockSlide(1, {
        top_meta: [{ type: 'byline', text: 'Author' }],
        core_content: [{ type: 'quote', text: 'Quote text' }],
        action_footer: [{ type: 'caption', text: 'Caption' }],
      });

      const components = SlideUtils.slideComponents(slide);
      expect(components[0]?.type).toBe('byline');
      expect(components[1]?.type).toBe('quote');
      expect(components[2]?.type).toBe('caption');
    });
  });

  describe('slidesForPersist', () => {
    it('should remove base64 data URI images', () => {
      const slides: SduiSlide[] = [
        createMockSlide(1, {
          core_content: [
            {
              type: 'image_placeholder',
              imageUrl:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            },
            { type: 'header', text: 'Title' },
          ],
        }),
      ];

      const result = SlideUtils.slidesForPersist(slides);
      const imgComp = result[0]!.nested_groups!.core_content!.find(
        (c) => c.type === 'image_placeholder',
      );

      expect(imgComp).toBeDefined();
      expect(imgComp?.imageUrl).toBeUndefined();
    });

    it('should preserve non-inline images', () => {
      const slides: SduiSlide[] = [
        createMockSlide(1, {
          core_content: [{ type: 'image_placeholder', imageUrl: 'https://example.com/image.png' }],
        }),
      ];

      const result = SlideUtils.slidesForPersist(slides);
      const imgComp = result[0]!.nested_groups!.core_content![0];

      expect(imgComp?.imageUrl).toBe('https://example.com/image.png');
    });

    it('should not mutate original slides', () => {
      const slides: SduiSlide[] = [
        createMockSlide(1, {
          core_content: [{ type: 'image_placeholder', imageUrl: 'data:image/png;base64,abc123' }],
        }),
      ];
      const originalUrl = slides[0]!.nested_groups!.core_content![0]!.imageUrl;

      SlideUtils.slidesForPersist(slides);

      expect(slides[0]!.nested_groups!.core_content![0]!.imageUrl).toBe(originalUrl);
    });

    it('should handle slides without inline images', () => {
      const slides: SduiSlide[] = [
        createMockSlide(1, {
          core_content: [{ type: 'header', text: 'No images' }],
        }),
      ];

      const result = SlideUtils.slidesForPersist(slides);
      expect(result[0]).toEqual(slides[0]);
    });

    it('should strip inline images from all groups', () => {
      const slides: SduiSlide[] = [
        createMockSlide(1, {
          top_meta: [{ type: 'image_placeholder', imageUrl: 'data:image/png;base64,top' }],
          core_content: [{ type: 'image_placeholder', imageUrl: 'data:image/png;base64,core' }],
          action_footer: [{ type: 'image_placeholder', imageUrl: 'data:image/png;base64,footer' }],
        }),
      ];

      const result = SlideUtils.slidesForPersist(slides);
      const slide = result[0]!;

      expect(slide.nested_groups!.top_meta![0]!.imageUrl).toBeUndefined();
      expect(slide.nested_groups!.core_content![0]!.imageUrl).toBeUndefined();
      expect(slide.nested_groups!.action_footer![0]!.imageUrl).toBeUndefined();
    });

    it('should preserve other component properties', () => {
      const slides: SduiSlide[] = [
        createMockSlide(1, {
          core_content: [
            {
              type: 'image_placeholder',
              imageUrl: 'data:image/png;base64,abc',
              image_object_context: 'A product photo',
            },
          ],
        }),
      ];

      const result = SlideUtils.slidesForPersist(slides);
      const imgComp = result[0]!.nested_groups!.core_content![0];

      expect(imgComp?.type).toBe('image_placeholder');
      expect(imgComp?.image_object_context).toBe('A product photo');
      expect(imgComp?.imageUrl).toBeUndefined();
    });
  });

  describe('slideAudit', () => {
    it('should create audit metadata for slides', () => {
      const slides: SduiSlide[] = [
        {
          ...createMockSlide(1),
          layout_variant_id: 'cover_centered',
          layout_family: 'poster',
          image_requirement: 'none',
          image_status: 'not_needed',
          layout_source: 'ai_selected',
        },
      ];

      const audit = SlideUtils.slideAudit(slides);

      expect(audit).toHaveLength(1);
      expect(audit[0]).toEqual({
        slide_number: 1,
        layout_variant_id: 'cover_centered',
        layout_family: 'poster',
        image_requirement: 'none',
        layout_source: 'ai_selected',
        image_status: 'not_needed',
      });
    });

    it('should infer image_requirement from image placeholders', () => {
      const slides: SduiSlide[] = [
        createMockSlide(1, {
          core_content: [{ type: 'image_placeholder' }],
        }),
      ];
      // Remove explicit image_requirement
      delete slides[0]!.image_requirement;

      const audit = SlideUtils.slideAudit(slides);
      expect(audit[0]!.image_requirement).toBe('optional');
    });

    it('should default image_requirement to none when no placeholders', () => {
      const slides: SduiSlide[] = [
        createMockSlide(1, {
          core_content: [{ type: 'header', text: 'No image' }],
        }),
      ];
      delete slides[0]!.image_requirement;

      const audit = SlideUtils.slideAudit(slides);
      expect(audit[0]!.image_requirement).toBe('none');
    });

    it('should handle missing optional fields', () => {
      const slide = createMockSlide(1);
      delete (slide as any).layout_variant_id;
      delete (slide as any).layout_family;
      const slides: SduiSlide[] = [slide];

      const audit = SlideUtils.slideAudit(slides);
      expect(audit[0]).toHaveProperty('slide_number', 1);
      expect(audit[0]).not.toHaveProperty('layout_variant_id');
      expect(audit[0]).not.toHaveProperty('layout_family');
    });

    it('should default layout_source to ai_selected', () => {
      const slides: SduiSlide[] = [createMockSlide(1)];
      delete slides[0]!.layout_source;

      const audit = SlideUtils.slideAudit(slides);
      expect(audit[0]!.layout_source).toBe('ai_selected');
    });
  });

  describe('blockComposition', () => {
    it('should map component types to block types', () => {
      const slide = createMockSlide(1, {
        core_content: [
          { type: 'header', text: 'Title' },
          { type: 'body', text: 'Content' },
          { type: 'checklist', items: ['Item 1', 'Item 2'] },
        ],
      });

      const blocks = SlideUtils.blockComposition(slide);
      expect(blocks).toEqual(['heading', 'body', 'bullet']);
    });

    it('should include image blocks', () => {
      const slide = createMockSlide(1, {
        core_content: [{ type: 'header', text: 'Title' }, { type: 'image_placeholder' }],
      });

      const blocks = SlideUtils.blockComposition(slide);
      expect(blocks).toContain('image');
    });

    it('should include quote blocks', () => {
      const slide = createMockSlide(1, {
        core_content: [{ type: 'quote', text: 'Quote text' }],
      });

      const blocks = SlideUtils.blockComposition(slide);
      expect(blocks).toContain('quote');
    });

    it('should include cta blocks', () => {
      const slide = createMockSlide(1, {
        action_footer: [{ type: 'button_cta', label: 'Click me', style: 'primary' }],
      });

      const blocks = SlideUtils.blockComposition(slide);
      expect(blocks).toContain('cta');
    });

    it('should ignore unmapped component types', () => {
      const slide = createMockSlide(1, {
        top_meta: [{ type: 'tag', text: 'TAG' }],
        core_content: [
          { type: 'header', text: 'Title' },
          { type: 'byline', text: 'Author' },
        ],
      });

      const blocks = SlideUtils.blockComposition(slide);
      expect(blocks).toEqual(['heading']);
      expect(blocks).not.toContain('tag');
      expect(blocks).not.toContain('byline');
    });

    it('should return heading as default when no mapped blocks', () => {
      const slide = createMockSlide(1, {
        core_content: [{ type: 'byline', text: 'Author only' }],
      });

      const blocks = SlideUtils.blockComposition(slide);
      expect(blocks).toEqual(['heading']);
    });

    it('should scan all three groups', () => {
      const slide = createMockSlide(1, {
        top_meta: [{ type: 'image_placeholder' }],
        core_content: [{ type: 'header', text: 'Title' }],
        action_footer: [{ type: 'button_cta', label: 'CTA', style: 'primary' }],
      });

      const blocks = SlideUtils.blockComposition(slide);
      expect(blocks).toContain('image');
      expect(blocks).toContain('heading');
      expect(blocks).toContain('cta');
    });
  });

  describe('mapPlannerErr', () => {
    it('should map non_json to malformed_output', () => {
      const err: SduiPlannerError = { kind: 'non_json' };
      expect(SlideUtils.mapPlannerErr(err)).toBe('malformed_output');
    });

    it('should map validation_error to malformed_output', () => {
      const err: SduiPlannerError = { kind: 'validation_error', message: 'test error' };
      expect(SlideUtils.mapPlannerErr(err)).toBe('malformed_output');
    });

    it('should map budget_exceeded to budget_exceeded', () => {
      const err: SduiPlannerError = { kind: 'budget_exceeded' };
      expect(SlideUtils.mapPlannerErr(err)).toBe('budget_exceeded');
    });

    it('should map endpoint_mismatch to endpoint_mismatch', () => {
      const err: SduiPlannerError = { kind: 'endpoint_mismatch' };
      expect(SlideUtils.mapPlannerErr(err)).toBe('endpoint_mismatch');
    });

    it('should map insecure_transport to insecure_transport', () => {
      const err: SduiPlannerError = { kind: 'insecure_transport' };
      expect(SlideUtils.mapPlannerErr(err)).toBe('insecure_transport');
    });

    it('should map privacy_violation to privacy_violation', () => {
      const err: SduiPlannerError = { kind: 'privacy_violation' };
      expect(SlideUtils.mapPlannerErr(err)).toBe('privacy_violation');
    });

    it('should map timeout to timeout', () => {
      const err: SduiPlannerError = { kind: 'timeout' };
      expect(SlideUtils.mapPlannerErr(err)).toBe('timeout');
    });

    it('should map provider_error to provider_error', () => {
      const err: SduiPlannerError = { kind: 'provider_error', message: 'test error' };
      expect(SlideUtils.mapPlannerErr(err)).toBe('provider_error');
    });
  });
});
