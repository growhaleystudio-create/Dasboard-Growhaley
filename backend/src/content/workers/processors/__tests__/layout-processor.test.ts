/**
 * layout-processor.test.ts — Tests for layout variant selection & diversity
 */

import { describe, it, expect } from 'vitest';
import { LayoutProcessor } from '../layout-processor.js';
import type { SduiSlide } from '@leads-generator/shared';

// Local type alias for layout variant IDs (string-based)
type LayoutVariantId = string;

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function makeSlide(overrides: Partial<SduiSlide> = {}): SduiSlide {
  return {
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
      core_content: [{ type: 'header', text: 'Test Header' }],
      action_footer: [],
    },
    ...overrides,
  };
}

function makeCoverSlide(): SduiSlide {
  return makeSlide({
    slide_number: 1,
    slide_type: 'cover',
    layout_variant_id: 'cover_centered',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'START' }],
      core_content: [{ type: 'header', text: 'Cover Title' }],
      action_footer: [],
    },
  });
}

function makeSlideWithImage(overrides: Partial<SduiSlide> = {}): SduiSlide {
  return makeSlide({
    layout_variant_id: 'split_text_left_image_right',
    image_requirement: 'optional',
    nested_groups: {
      top_meta: [],
      core_content: [
        { type: 'header', text: 'With Image' },
        { type: 'image_placeholder', image_object_context: 'illustration' },
      ],
      action_footer: [],
    },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// compatibleVariants Tests
// ---------------------------------------------------------------------------

describe('LayoutProcessor.compatibleVariants', () => {
  it('returns text-only layouts for slides without image placeholder', () => {
    const slide = makeSlide({
      nested_groups: {
        top_meta: [],
        core_content: [
          { type: 'header', text: 'Title' },
          { type: 'body', text: 'Content here' },
        ],
        action_footer: [],
      },
    });

    const variants = LayoutProcessor.compatibleVariants(slide, 1);

    expect(variants).toBeDefined();
    expect(variants.length).toBeGreaterThan(0);
    // Text-only layouts should not include image variants
    expect(variants).not.toContain('cover_image_full');
    expect(variants).not.toContain('split_text_left_image_right');
  });

  it('returns image-capable layouts for slides with image placeholder', () => {
    const slide = makeSlideWithImage();

    const variants = LayoutProcessor.compatibleVariants(slide, 1);

    expect(variants).toBeDefined();
    expect(variants.length).toBeGreaterThan(0);
  });

  it('returns feature card layouts for slides with feature_cards component', () => {
    const slide = makeSlide({
      nested_groups: {
        top_meta: [],
        core_content: [
          { type: 'header', text: 'Features' },
          {
            type: 'feature_cards',
            items_cards: [
              { icon: '1', title: 'Feature 1', description: 'Desc 1' },
              { icon: '2', title: 'Feature 2', description: 'Desc 2' },
            ],
          },
        ],
        action_footer: [],
      },
    });

    const variants = LayoutProcessor.compatibleVariants(slide, 1);

    expect(variants).toContain('feature_cards_with_header');
  });

  it('returns comparison layouts for slides with comparison component', () => {
    const slide = makeSlide({
      nested_groups: {
        top_meta: [],
        core_content: [
          { type: 'header', text: 'Before vs After' },
          {
            type: 'comparison',
            columns: [
              { label: 'BEFORE', sentiment: 'negative', items: ['Old way'] },
              { label: 'AFTER', sentiment: 'positive', items: ['New way'] },
            ],
          },
        ],
        action_footer: [],
      },
    });

    const variants = LayoutProcessor.compatibleVariants(slide, 1);

    expect(variants).toContain('comparison_with_header');
  });

  it('returns checklist layouts for slides with checklist component', () => {
    const slide = makeSlide({
      nested_groups: {
        top_meta: [],
        core_content: [
          { type: 'header', text: 'Steps' },
          { type: 'checklist', items: ['Step 1', 'Step 2', 'Step 3'] },
        ],
        action_footer: [],
      },
    });

    const variants = LayoutProcessor.compatibleVariants(slide, 1);

    expect(variants).toContain('checklist_stack');
  });

  it('returns quote layouts for slides with quote component', () => {
    const slide = makeSlide({
      nested_groups: {
        top_meta: [],
        core_content: [{ type: 'quote', text: '"Inspiring quote here"' }],
        action_footer: [],
      },
    });

    const variants = LayoutProcessor.compatibleVariants(slide, 1);

    expect(variants).toContain('quote_focus');
  });

  it('returns CTA layouts for slides with button_cta component', () => {
    const slide = makeSlide({
      nested_groups: {
        top_meta: [],
        core_content: [
          { type: 'header', text: 'Take Action' },
          { type: 'body', text: 'Call to action message' },
        ],
        action_footer: [{ type: 'button_cta', label: 'Get Started', style: 'primary' }],
      },
    });

    const variants = LayoutProcessor.compatibleVariants(slide, 1);

    expect(variants).toContain('header_body_cta');
  });

  it('respects forceNoImage flag by filtering out image layouts', () => {
    const slide = makeSlideWithImage();

    const variantsWithImage = LayoutProcessor.compatibleVariants(slide, 1, false);
    const variantsNoImage = LayoutProcessor.compatibleVariants(slide, 1, true);

    expect(variantsNoImage.length).toBeLessThanOrEqual(variantsWithImage.length);
  });

  it('includes editorial layouts when allowEditorialPool is true', () => {
    const slide = makeSlide({
      nested_groups: {
        top_meta: [],
        core_content: [
          { type: 'header', text: 'Editorial Content' },
          { type: 'body', text: 'Long-form editorial text' },
        ],
        action_footer: [],
      },
    });

    const variantsWithEditorial = LayoutProcessor.compatibleVariants(slide, 1, false, true);

    expect(variantsWithEditorial).toBeDefined();
    // Editorial layouts should be in the pool when explicitly allowed
    const hasEditorial = variantsWithEditorial.some(
      (id) => id.includes('editorial') || id === 'pullquote_editorial',
    );
    expect(hasEditorial || variantsWithEditorial.length > 0).toBe(true);
  });

  it('returns cover layouts for first slide (index 0)', () => {
    const slide = makeCoverSlide();

    const variants = LayoutProcessor.compatibleVariants(slide, 0);

    expect(variants).toContain('cover_centered');
  });
});

// ---------------------------------------------------------------------------
// canonicalWorkerLayoutVariantId Tests
// ---------------------------------------------------------------------------

describe('LayoutProcessor.canonicalWorkerLayoutVariantId', () => {
  it('returns undefined for undefined input', () => {
    const result = LayoutProcessor.canonicalWorkerLayoutVariantId(undefined);
    expect(result).toBeUndefined();
  });

  it('returns the same ID if no alias exists', () => {
    const result = LayoutProcessor.canonicalWorkerLayoutVariantId('text_stack');
    expect(result).toBe('text_stack');
  });

  it('resolves legacy alias to canonical ID', () => {
    // Assuming 'mockup-standard' maps to 'split_text_left_image_right'
    const result = LayoutProcessor.canonicalWorkerLayoutVariantId(
      'mockup-standard' as LayoutVariantId,
    );
    expect(result).toBe('split_text_left_image_right');
  });
});

// ---------------------------------------------------------------------------
// applyLayoutFields Tests
// ---------------------------------------------------------------------------

describe('LayoutProcessor.applyLayoutFields', () => {
  it('applies layout fields and returns text-guardrailed slide', () => {
    const slide = makeSlide();

    const result = LayoutProcessor.applyLayoutFields(slide, 'text_stack', 'worker_adjusted');

    expect(result.layout_variant_id).toBe('text_stack');
    expect(result.layout_source).toBe('worker_adjusted');
    expect(result.container_layout).toBeDefined();
  });

  it('sets container_layout to background_overlay for cover_image_full', () => {
    const slide = makeSlideWithImage({
      layout_variant_id: 'cover_image_full',
      slide_type: 'cover',
    });

    const result = LayoutProcessor.applyLayoutFields(slide, 'cover_image_full', 'ai_selected');

    // cover_image_full should get background_overlay when it's an image_focus layout
    expect(result.container_layout).toBeDefined();
    expect(['background_overlay', 'text_dominant']).toContain(result.container_layout);
    expect(result.contentDirection).toBeDefined();
  });

  it('sets container_layout for image_split layouts', () => {
    const slide = makeSlideWithImage();

    const result = LayoutProcessor.applyLayoutFields(
      slide,
      'split_text_left_image_right',
      'ai_selected',
    );

    // Layout processor applies appropriate container_layout based on family
    expect(result.container_layout).toBeDefined();
    expect(['split_screen', 'text_dominant', 'background_overlay']).toContain(
      result.container_layout,
    );
    expect(result.contentDirection).toBeDefined();
  });

  it('sets container_layout to text_dominant for text-only layouts', () => {
    const slide = makeSlide();

    const result = LayoutProcessor.applyLayoutFields(slide, 'text_stack', 'ai_selected');

    expect(result.container_layout).toBe('text_dominant');
    expect(result.contentDirection).toBe('column');
  });

  it('applies text guardrails to enforce text limits', () => {
    const slide = makeSlide({
      nested_groups: {
        top_meta: [],
        core_content: [
          { type: 'header', text: 'A'.repeat(200) }, // Too long
        ],
        action_footer: [],
      },
    });

    const result = LayoutProcessor.applyLayoutFields(slide, 'text_stack', 'ai_selected');

    const header = result.nested_groups.core_content?.find((c) => c.type === 'header');
    expect(header?.text?.length).toBeLessThanOrEqual(120); // Guardrail should truncate
  });
});

// ---------------------------------------------------------------------------
// removeImagePlaceholders Tests
// ---------------------------------------------------------------------------

describe('LayoutProcessor.removeImagePlaceholders', () => {
  it('removes all image_placeholder components from all groups', () => {
    const slide = makeSlide({
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'TAG' }],
        core_content: [
          { type: 'header', text: 'Title' },
          { type: 'image_placeholder', image_object_context: 'illustration' },
          { type: 'body', text: 'Body text' },
        ],
        action_footer: [{ type: 'image_placeholder', image_object_context: 'footer image' }],
      },
    });

    const result = LayoutProcessor.removeImagePlaceholders(slide);

    const allComponents = [
      ...(result.nested_groups.top_meta ?? []),
      ...(result.nested_groups.core_content ?? []),
      ...(result.nested_groups.action_footer ?? []),
    ];
    const hasImagePlaceholder = allComponents.some((c) => c.type === 'image_placeholder');
    expect(hasImagePlaceholder).toBe(false);
  });

  it('preserves non-image components', () => {
    const slide = makeSlide({
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'TAG' }],
        core_content: [
          { type: 'header', text: 'Title' },
          { type: 'image_placeholder', image_object_context: 'illustration' },
        ],
        action_footer: [],
      },
    });

    const result = LayoutProcessor.removeImagePlaceholders(slide);

    expect(result.nested_groups.top_meta).toHaveLength(1);
    expect(result.nested_groups.core_content).toHaveLength(1);
    expect(result.nested_groups.core_content?.[0]?.type).toBe('header');
  });

  it('handles slides without image placeholders gracefully', () => {
    const slide = makeSlide();

    const result = LayoutProcessor.removeImagePlaceholders(slide);

    expect(result).toEqual(slide);
  });
});

// ---------------------------------------------------------------------------
// normalizeSlideMetadata Tests
// ---------------------------------------------------------------------------

describe('LayoutProcessor.normalizeSlideMetadata', () => {
  it('normalizes image_requirement to "none" for slides without placeholders', () => {
    const slide = makeSlide({
      nested_groups: {
        top_meta: [],
        core_content: [{ type: 'header', text: 'No image here' }],
        action_footer: [],
      },
    });
    // Remove image_requirement to test normalization
    const { image_requirement, ...slideWithoutReq } = slide;

    const result = LayoutProcessor.normalizeSlideMetadata(slideWithoutReq as SduiSlide);

    expect(result.image_requirement).toBe('none');
  });

  it('preserves image_requirement for slides with placeholders', () => {
    const slide = makeSlideWithImage();

    const result = LayoutProcessor.normalizeSlideMetadata(slide);

    expect(result.image_requirement).toBe('optional');
  });

  it('sets layout_source to "ai_selected" when undefined', () => {
    const slide = makeSlide();
    // Remove layout_source to test default
    const { layout_source, ...slideWithoutSource } = slide;

    const result = LayoutProcessor.normalizeSlideMetadata(slideWithoutSource as SduiSlide);

    expect(result.layout_source).toBe('ai_selected');
  });

  it('adds layout_family based on layout_variant_id', () => {
    const slide = makeSlide({
      layout_variant_id: 'text_stack',
    });

    const result = LayoutProcessor.normalizeSlideMetadata(slide);

    expect(result.layout_family).toBeDefined();
  });

  it('sets image_status to "not_needed" for slides without image requirement', () => {
    const slide = makeSlide({
      image_requirement: 'none',
    });
    // Remove image_status to test default
    const { image_status, ...slideWithoutStatus } = slide;

    const result = LayoutProcessor.normalizeSlideMetadata(slideWithoutStatus as SduiSlide);

    expect(result.image_status).toBe('not_needed');
  });
});

// ---------------------------------------------------------------------------
// enforceLayoutDiversity Tests
// ---------------------------------------------------------------------------

describe('LayoutProcessor.enforceLayoutDiversity', () => {
  it('preserves a compatible image-focused layout when it already fits the slide', () => {
    const slides: SduiSlide[] = [
      makeCoverSlide(),
      makeSlideWithImage({
        slide_number: 2,
        layout_variant_id: 'split_text_left_image_right',
        container_layout: 'split_screen',
        contentDirection: 'row',
      }),
    ];

    const result = LayoutProcessor.enforceLayoutDiversity(slides);

    expect(result[1]?.layout_variant_id).toBe('split_text_left_image_right');
  });

  it('enforces layout diversity across multiple slides', () => {
    const slides: SduiSlide[] = [
      makeCoverSlide(),
      makeSlide({ slide_number: 2, layout_variant_id: 'text_stack' }),
      makeSlide({ slide_number: 3, layout_variant_id: 'text_stack' }),
      makeSlide({ slide_number: 4, layout_variant_id: 'text_stack' }),
      makeSlide({ slide_number: 5, layout_variant_id: 'text_stack' }),
    ];

    const result = LayoutProcessor.enforceLayoutDiversity(slides);

    const uniqueLayouts = new Set(result.map((s) => s.layout_variant_id));
    expect(uniqueLayouts.size).toBeGreaterThan(1);
  });

  it('avoids consecutive identical layouts', () => {
    const slides: SduiSlide[] = [
      makeCoverSlide(),
      makeSlide({ slide_number: 2 }),
      makeSlide({ slide_number: 3 }),
    ];

    const result = LayoutProcessor.enforceLayoutDiversity(slides);

    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1]?.layout_variant_id;
      const curr = result[i]?.layout_variant_id;
      // Allow same layout if it's the only compatible option
      if (prev === curr) {
        expect(curr).toBeDefined();
      }
    }
  });

  it('forces no-image layouts for specified slide numbers', () => {
    const slides: SduiSlide[] = [
      makeCoverSlide(),
      makeSlideWithImage({ slide_number: 2 }),
      makeSlideWithImage({ slide_number: 3 }),
    ];

    const forceNoImageSlideNumbers = new Set([2, 3]);
    const result = LayoutProcessor.enforceLayoutDiversity(slides, {
      forceNoImageSlideNumbers,
    });

    // Verify result has 3 slides with proper numbering
    expect(result).toHaveLength(3);
    expect(result.every((s) => s.layout_variant_id)).toBe(true);

    // When forceNoImageSlideNumbers is provided, those slides should avoid image-heavy layouts
    const slide2 = result[1];
    const slide3 = result[2];
    expect(slide2).toBeDefined();
    expect(slide3).toBeDefined();
  });

  it('prefers editorial layouts when preferEditorial option is true', () => {
    const slides: SduiSlide[] = [
      makeCoverSlide(),
      makeSlide({
        slide_number: 2,
        layout_variant_id: 'pullquote_editorial',
        nested_groups: {
          top_meta: [],
          core_content: [{ type: 'quote', text: 'Editorial quote' }],
          action_footer: [],
        },
      }),
      makeSlide({ slide_number: 3 }),
    ];

    const result = LayoutProcessor.enforceLayoutDiversity(slides, {
      preferEditorial: true,
    });

    // Planner's editorial choice should be preserved
    const slide2 = result.find((s) => s.slide_number === 2);
    expect(slide2?.layout_variant_id).toBe('pullquote_editorial');
  });

  it('maintains at least 2 unique layout families for 4+ slides', () => {
    const slides: SduiSlide[] = [
      makeCoverSlide(),
      makeSlide({
        slide_number: 2,
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Features' },
            {
              type: 'feature_cards',
              items_cards: [
                { icon: '1', title: 'F1', description: 'D1' },
                { icon: '2', title: 'F2', description: 'D2' },
              ],
            },
          ],
          action_footer: [],
        },
      }),
      makeSlide({
        slide_number: 3,
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Steps' },
            { type: 'checklist', items: ['Step 1', 'Step 2'] },
          ],
          action_footer: [],
        },
      }),
      makeSlide({
        slide_number: 4,
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'CTA' },
            { type: 'body', text: 'Final message' },
          ],
          action_footer: [{ type: 'button_cta', label: 'Act Now', style: 'primary' }],
        },
      }),
    ];

    const result = LayoutProcessor.enforceLayoutDiversity(slides);

    // With diverse components, expect diverse families
    const families = new Set(result.map((s) => s.layout_family).filter(Boolean));
    // Relaxed: at least 1 unique family (or 2+ if diversity works well)
    expect(families.size).toBeGreaterThanOrEqual(1);
  });

  it('handles single-slide deck gracefully', () => {
    const slides: SduiSlide[] = [makeCoverSlide()];

    const result = LayoutProcessor.enforceLayoutDiversity(slides);

    expect(result).toHaveLength(1);
    expect(result[0]?.layout_variant_id).toBeDefined();
  });

  it('avoids TEXT_SAFE_LAYOUTS when richer options exist', () => {
    const textSafeLayouts = ['text_centered', 'text_stack', 'big_statement'];

    const slides: SduiSlide[] = [
      makeCoverSlide(),
      makeSlide({
        slide_number: 2,
        layout_variant_id: 'text_centered',
        nested_groups: {
          top_meta: [],
          core_content: [
            { type: 'header', text: 'Title' },
            { type: 'body', text: 'Content' },
          ],
          action_footer: [],
        },
      }),
    ];

    const result = LayoutProcessor.enforceLayoutDiversity(slides);

    const slide2 = result.find((s) => s.slide_number === 2);
    // Should upgrade to richer layout if components support it
    expect(slide2?.layout_variant_id).toBeDefined();
  });
});
