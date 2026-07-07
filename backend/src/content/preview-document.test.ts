import { describe, it, expect } from 'vitest';
import type { SduiSlide } from '@leads-generator/shared';

import {
  buildGrowhaleyDocument,
  previewPlaceholderDataUri,
  withPreviewPlaceholders,
} from './preview-document.js';
import { SatoriRenderer } from './satori-renderer.js';

function photoSlide(): SduiSlide {
  return {
    slide_number: 1,
    slide_type: 'content',
    container_layout: 'background_overlay',
    layout_variant_id: 'gw_photo_statement',
    image_requirement: 'required',
    layout_source: 'ai_selected',
    typography_scale: 'editorial_bold',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'FOTO' }],
      core_content: [
        { type: 'header', text: 'Judul Foto' },
        { type: 'image_placeholder', requires_generation: true, image_object_context: 'x' },
      ],
      action_footer: [],
    },
  } as SduiSlide;
}

describe('withPreviewPlaceholders', () => {
  it('fills empty image_placeholder slots with the placeholder data URI', () => {
    const out = withPreviewPlaceholders(photoSlide());
    const img = out.nested_groups.core_content?.find((c) => c.type === 'image_placeholder');
    expect(img?.imageUrl).toBe(previewPlaceholderDataUri());
    expect(previewPlaceholderDataUri().startsWith('data:image/png;base64,')).toBe(true);
  });

  it('does not overwrite a slot that already has an imageUrl', () => {
    const slide = photoSlide();
    slide.nested_groups.core_content![1]!.imageUrl = 'data:image/png;base64,AAAA';
    const out = withPreviewPlaceholders(slide);
    expect(out.nested_groups.core_content?.[1]?.imageUrl).toBe('data:image/png;base64,AAAA');
  });
});

describe('preview render (no image generation)', () => {
  it('renders a photo-layout slide keeping the photo template via placeholder', { timeout: 90_000 }, async () => {
    const slide = withPreviewPlaceholders(photoSlide());
    const doc = buildGrowhaleyDocument('4:5', [slide]);
    const { png, metrics } = await new SatoriRenderer().renderSlideWithMetrics(slide, doc, []);
    expect(png.length).toBeGreaterThan(10_000);
    expect(metrics.overflow).toBe(false);
  });
});
