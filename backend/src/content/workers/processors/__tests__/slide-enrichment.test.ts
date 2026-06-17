/**
 * slide-enrichment.test.ts
 *
 * Comprehensive tests for slide enrichment and repair functions.
 */

import { describe, it, expect } from 'vitest';
import { SlideEnrichment } from '../slide-enrichment.js';
import type { SduiSlide, SduiComponent } from '@leads-generator/shared';

const createTestSlide = (overrides: Partial<SduiSlide> = {}): SduiSlide => ({
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

describe('SlideEnrichment', () => {
  describe('fallbackBodyForSlide', () => {
    it('should generate fallback body with header', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Main Topic' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.fallbackBodyForSlide(slide, 'Create engaging content');
      expect(result).toBe('Main Topic: ringkas poin utama tentang Create engaging content.');
    });

    it('should use quote as fallback when no header', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'quote', text: 'Inspiring quote' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.fallbackBodyForSlide(slide, 'motivation tips');
      expect(result).toBe('Inspiring quote: ringkas poin utama tentang motivation tips.');
    });

    it('should use slide number when no header or quote', () => {
      const slide = createTestSlide({ slide_number: 3 });
      const result = SlideEnrichment.fallbackBodyForSlide(slide, 'some prompt');
      expect(result).toBe('Slide 3: ringkas poin utama tentang some prompt.');
    });

    it('should truncate prompt to 90 chars', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Topic' }],
          action_footer: [],
        },
      });
      const longPrompt = 'A'.repeat(100);
      const result = SlideEnrichment.fallbackBodyForSlide(slide, longPrompt);
      expect(result).toContain('A'.repeat(90));
      expect(result).not.toContain('A'.repeat(91));
    });

    it('should use default topic when prompt is empty', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Header' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.fallbackBodyForSlide(slide, '');
      expect(result).toContain('topik ini');
    });
  });

  describe('fallbackChecklistItems', () => {
    it('should generate 3 checklist items', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Key Points' }],
          action_footer: [],
        },
      });
      const items = SlideEnrichment.fallbackChecklistItems(slide, 'marketing strategy');
      expect(items).toHaveLength(3);
      expect(items[0]).toContain('Fokus utama: Key Points');
      expect(items[1]).toContain('Contoh untuk marketing strategy');
      expect(items[2]).toBe('Aksi berikutnya jelas');
    });

    it('should truncate items to text limit', () => {
      const slide = createTestSlide({
        layout_variant_id: 'checklist_stack',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'A'.repeat(100) }],
          action_footer: [],
        },
      });
      const items = SlideEnrichment.fallbackChecklistItems(slide, 'X'.repeat(100));
      items.forEach((item) => {
        expect(item.length).toBeLessThanOrEqual(55);
      });
    });

    it('should use default header when missing', () => {
      const slide = createTestSlide();
      const items = SlideEnrichment.fallbackChecklistItems(slide, 'test');
      expect(items[0]).toContain('Fokus utama: Fokus');
    });
  });

  describe('fallbackFeatureCards', () => {
    it('should generate 3 feature cards', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Product Benefits' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.fallbackFeatureCards(slide, 'SaaS platform');
      expect(result.type).toBe('feature_cards');
      expect(result.items_cards).toHaveLength(3);
      expect(result.items_cards![0]!.title).toBe('Masalah utama');
      expect(result.items_cards![1]!.title).toBe('Solusi praktis');
      expect(result.items_cards![2]!.title).toBe('Hasil terukur');
    });

    it('should include prompt topic in descriptions', () => {
      const slide = createTestSlide();
      const result = SlideEnrichment.fallbackFeatureCards(slide, 'AI automation');
      const descriptions = result.items_cards!.map((card) => card.description).join(' ');
      expect(descriptions).toContain('AI automation');
    });

    it('should truncate header in first card description', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'A'.repeat(100) }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.fallbackFeatureCards(slide, 'test');
      expect(result.items_cards![0]!.description!.length).toBeLessThan(100);
    });
  });

  describe('fallbackComparison', () => {
    it('should generate before/after comparison', () => {
      const slide = createTestSlide();
      const result = SlideEnrichment.fallbackComparison(slide, 'workflow optimization');
      expect(result.type).toBe('comparison');
      expect(result.columns).toHaveLength(2);
      expect(result.columns![0]!.label).toBe('SEBELUM');
      expect(result.columns![0]!.sentiment).toBe('negative');
      expect(result.columns![1]!.label).toBe('SESUDAH');
      expect(result.columns![1]!.sentiment).toBe('positive');
    });

    it('should include topic in negative column', () => {
      const slide = createTestSlide();
      const result = SlideEnrichment.fallbackComparison(slide, 'content creation');
      const items = result.columns![0]!.items.join(' ');
      expect(items).toContain('content creation');
    });
  });

  describe('fallbackCallout', () => {
    it('should generate tip callout with fallback body', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Important Note' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.fallbackCallout(slide, 'test prompt');
      expect(result.type).toBe('callout');
      expect(result.variant).toBe('tip');
      expect(result.text).toContain('Important Note');
      expect(result.text).toContain('test prompt');
    });
  });

  describe('upsertCoreComponent', () => {
    it('should add component when not exists', () => {
      const slide = createTestSlide();
      const component: SduiComponent = { type: 'body', text: 'New body text' };
      const result = SlideEnrichment.upsertCoreComponent(slide, component);
      expect(result.nested_groups.core_content).toHaveLength(1);
      expect(result.nested_groups.core_content![0]).toEqual(component);
    });

    it('should replace existing component of same type', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Old header' },
            { type: 'body', text: 'Old body' },
          ],
          action_footer: [],
        },
      });
      const newHeader: SduiComponent = { type: 'header', text: 'New header' };
      const result = SlideEnrichment.upsertCoreComponent(slide, newHeader);
      expect(result.nested_groups.core_content).toHaveLength(2);
      expect(result.nested_groups.core_content![0]!.text).toBe('New header');
      expect(result.nested_groups.core_content![1]!.text).toBe('Old body');
    });

    it('should preserve other groups when upserting', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [{ type: 'tag', text: 'TAG' }],
          core_content: [],
          action_footer: [{ type: 'button_cta', label: 'Click me', style: 'primary' }],
        },
      });
      const result = SlideEnrichment.upsertCoreComponent(slide, { type: 'body', text: 'Text' });
      expect(result.nested_groups.top_meta).toHaveLength(1);
      expect(result.nested_groups.action_footer).toHaveLength(1);
    });
  });

  describe('enrichSparseSlide', () => {
    it('should not modify non-sparse slides', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Title' },
            { type: 'body', text: 'Content here with enough text' },
          ],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.enrichSparseSlide(slide, 0, 'test');
      // Sparse check: has 2 content units (header + body), so should not be sparse
      expect(result.nested_groups.core_content).toHaveLength(2);
    });

    it('should add comparison for before/after keywords', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Before and after comparison' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.enrichSparseSlide(slide, 0, 'show the difference');
      const hasComparison = result.nested_groups.core_content!.some((c) => c.type === 'comparison');
      expect(hasComparison).toBe(true);
    });

    it('should add feature cards for benefit keywords', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Key benefits and features' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.enrichSparseSlide(slide, 0, 'list the main benefits');
      const hasFeatureCards = result.nested_groups.core_content!.some(
        (c) => c.type === 'feature_cards',
      );
      expect(hasFeatureCards).toBe(true);
    });

    it('should add header when missing for content slides', () => {
      const slide = createTestSlide({
        slide_type: 'content',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'body', text: 'Some body text' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.enrichSparseSlide(slide, 2, 'prompt');
      const header = result.nested_groups.core_content!.find((c) => c.type === 'header');
      expect(header).toBeDefined();
      expect(header!.text).toContain('Poin 3'); // index 2 → display as 3
    });

    it('should not add header for cover slides', () => {
      const slide = createTestSlide({
        slide_type: 'cover',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'body', text: 'Cover text' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.enrichSparseSlide(slide, 0, 'prompt');
      const hasHeader = result.nested_groups.core_content!.some((c) => c.type === 'header');
      expect(hasHeader).toBe(false);
    });
  });

  describe('repairIncompleteTextComponents', () => {
    it('should repair incomplete body text', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Complete Header' },
            { type: 'body', text: 'This text is incomplete because it ends abruptly and' },
          ],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.repairIncompleteTextComponents(slide, 'test topic');
      const body = result.nested_groups.core_content!.find((c) => c.type === 'body');
      expect(body!.text).not.toBe('This text is incomplete because it ends abruptly and');
      expect(body!.text).toContain('Complete Header');
    });

    it('should repair incomplete checklist items', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Steps' },
            { type: 'checklist', items: ['Complete item', 'Incomplete sentence without proper'] },
          ],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.repairIncompleteTextComponents(slide, 'workflow');
      const checklist = result.nested_groups.core_content!.find((c) => c.type === 'checklist');
      expect(checklist!.items![0]).toBe('Complete item');
      expect(checklist!.items![1]).not.toBe('Incomplete sentence without proper');
    });

    it('should process all nested groups', () => {
      const slide = createTestSlide({
        nested_groups: {
          top_meta: [{ type: 'body', text: 'Incomplete top meta text without' }],
          core_content: [{ type: 'body', text: 'Incomplete core text ending in' }],
          action_footer: [{ type: 'body', text: 'Incomplete footer text that' }],
        },
      });
      const result = SlideEnrichment.repairIncompleteTextComponents(slide, 'test');
      // All incomplete texts should be repaired
      expect(result.nested_groups.top_meta![0]!.text).not.toContain('without');
      expect(result.nested_groups.core_content![0]!.text).not.toContain('ending in');
      expect(result.nested_groups.action_footer![0]!.text).not.toContain('that');
    });
  });

  describe('makeSlideQualityRepairable', () => {
    it('should add header when missing for non-cover content slide', () => {
      const slide = createTestSlide({
        slide_type: 'content',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'body', text: 'Body without header' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.makeSlideQualityRepairable(slide, 1, 'test');
      const hasHeader = result.nested_groups.core_content!.some((c) => c.type === 'header');
      expect(hasHeader).toBe(true);
    });

    it('should add body for text layout family', () => {
      const slide = createTestSlide({
        layout_variant_id: 'text_stack',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Title only' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.makeSlideQualityRepairable(slide, 0, 'prompt');
      const hasBody = result.nested_groups.core_content!.some((c) => c.type === 'body');
      expect(hasBody).toBe(true);
    });

    it('should add checklist for checklist layout family', () => {
      const slide = createTestSlide({
        layout_variant_id: 'checklist_stack',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Title' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.makeSlideQualityRepairable(slide, 0, 'items');
      const hasChecklist = result.nested_groups.core_content!.some((c) => c.type === 'checklist');
      expect(hasChecklist).toBe(true);
    });

    it('should add quote for quote layout family', () => {
      const slide = createTestSlide({
        layout_variant_id: 'quote_focus',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Quote slide' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.makeSlideQualityRepairable(slide, 0, 'inspiration');
      const hasQuote = result.nested_groups.core_content!.some((c) => c.type === 'quote');
      expect(hasQuote).toBe(true);
    });

    it('should add CTA button for cta layout family', () => {
      const slide = createTestSlide({
        layout_variant_id: 'cta_centered',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'Call to action' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.makeSlideQualityRepairable(slide, 0, 'signup');
      const hasCTA = result.nested_groups.action_footer!.some((c) => c.type === 'button_cta');
      expect(hasCTA).toBe(true);
    });
  });

  describe('finalizeRenderableSlide', () => {
    const mockApplyLayoutFields = (
      slide: SduiSlide,
      layoutId: string,
      source: NonNullable<SduiSlide['layout_source']>,
    ): SduiSlide => ({
      ...slide,
      layout_variant_id: layoutId,
      layout_source: source,
    });

    it('should apply layout fields and text guardrails', () => {
      const slide = createTestSlide({
        layout_variant_id: 'text_stack',
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Title' },
            { type: 'body', text: 'Content' },
          ],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.finalizeRenderableSlide(
        slide,
        0,
        'prompt',
        {},
        mockApplyLayoutFields,
      );
      expect(result.layout_variant_id).toBe('text_stack');
    });

    it('should add checklist for checklist family', () => {
      const slide = createTestSlide({
        layout_variant_id: 'checklist_stack',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'header', text: 'List' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.finalizeRenderableSlide(
        slide,
        0,
        'items',
        {},
        mockApplyLayoutFields,
      );
      const hasChecklist = result.nested_groups.core_content!.some((c) => c.type === 'checklist');
      expect(hasChecklist).toBe(true);
    });

    it('should set image_requirement to none for image layouts without placeholder', () => {
      const slide = createTestSlide({
        layout_variant_id: 'split_text_left_image_right',
        image_requirement: 'optional',
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Title' },
            { type: 'body', text: 'Text' },
          ],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.finalizeRenderableSlide(
        slide,
        0,
        'prompt',
        {},
        mockApplyLayoutFields,
      );
      expect(result.image_requirement).toBe('none');
      expect(result.image_status).toBe('not_needed');
    });

    it('should add header when missing for content slides', () => {
      const slide = createTestSlide({
        slide_type: 'content',
        layout_variant_id: 'text_stack',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'body', text: 'Just body text' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.finalizeRenderableSlide(
        slide,
        2,
        'prompt',
        {},
        mockApplyLayoutFields,
      );
      const hasHeader = result.nested_groups.core_content!.some((c) => c.type === 'header');
      expect(hasHeader).toBe(true);
    });

    it('should not add header for cover slides', () => {
      const slide = createTestSlide({
        slide_type: 'cover',
        layout_variant_id: 'cover_centered',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'body', text: 'Cover text' }],
          action_footer: [],
        },
      });
      const result = SlideEnrichment.finalizeRenderableSlide(
        slide,
        0,
        'prompt',
        {},
        mockApplyLayoutFields,
      );
      const headerCount = result.nested_groups.core_content!.filter(
        (c) => c.type === 'header',
      ).length;
      expect(headerCount).toBe(0);
    });
  });
});
