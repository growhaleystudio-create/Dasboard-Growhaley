import { describe, expect, it } from 'vitest';

import type { SduiSlide } from '@leads-generator/shared';

import { pickTemplate, resolveRendererTemplateId } from './template-picker.js';

function makeSlide(overrides: Partial<SduiSlide> = {}): SduiSlide {
  return {
    slide_number: 1,
    slide_type: 'content',
    container_layout: 'text_dominant',
    layout_variant_id: 'gw_poster_stat',
    image_requirement: 'required',
    image_status: 'generated',
    nested_groups: {
      top_meta: [],
      core_content: [
        { type: 'header', text: 'Tingkatkan Efisiensi' },
        { type: 'body', text: 'Automasi tugas rutin.' },
        {
          type: 'image_placeholder',
          requires_generation: true,
          image_object_context: 'small business automation illustration',
          imageUrl: 'data:image/png;base64,fake',
        },
      ],
      action_footer: [],
    },
    ...overrides,
  };
}

describe('template-picker image-capable template enforcement', () => {
  it('reroutes gw_poster_stat to an image-capable photo template when the slide has a renderable image', () => {
    const slide = makeSlide();

    expect(resolveRendererTemplateId(slide, '4:5')).toBe('gw_photo_statement');
    expect(pickTemplate(slide, '4:5')).toBe('gw_photo_statement');
  });

  it('keeps gw_poster_stat when no image placeholder is present', () => {
    const slide = makeSlide({
      nested_groups: {
        top_meta: [],
        core_content: [
          { type: 'header', text: 'Tingkatkan Efisiensi' },
          { type: 'body', text: 'Automasi tugas rutin.' },
        ],
        action_footer: [],
      },
      image_requirement: 'none',
      image_status: 'not_needed',
    });

    expect(resolveRendererTemplateId(slide, '4:5')).toBe('gw_poster_stat');
    expect(pickTemplate(slide, '4:5')).toBe('gw_poster_stat');
  });
});
