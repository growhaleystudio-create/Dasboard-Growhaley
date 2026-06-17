import { describe, expect, it } from 'vitest';
import type { BrandKit, SduiSlide } from '@leads-generator/shared';
import { buildCarouselWorkflowArtifact } from './carousel-workflow.js';

function brandKit(): BrandKit {
  return {
    id: 'brand-1',
    teamId: 'team-1',
    logoUrl: '',
    colors: ['#187DB4', '#1a1d24'],
    fonts: [{ id: 'font-1', family: 'Inter', url: 'https://cdn/font.ttf' }],
    chrome: { logoPlacement: 'top-left', siteUrl: 'growhaley.com', pageNumberFormat: '{current}/{total}' },
    typography: {
      header: { fontFamily: 'Inter', color: '#1a1d24' },
      body: { fontFamily: 'Inter', color: '#5b626e' },
      highlightColor: '#187DB4',
      background: '#ffffff',
      paginationColor: '#5b626e',
      metaTextColor: '#5b626e',
      accent: '#187DB4',
    },
    updatedAt: new Date(),
  };
}

function slide(n: number, image = false): SduiSlide {
  return {
    slide_number: n,
    slide_type: n === 1 ? 'cover' : 'content',
    container_layout: image ? 'split_screen' : 'text_dominant',
    layout_variant_id: image ? 'split_text_left_image_right' : n === 5 ? 'cta_centered' : 'text_stack',
    image_requirement: image ? 'required' : 'none',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'PROMO' }],
      core_content: [
        { type: 'header', text: n === 1 ? 'Lampu Artisan' : `Detail ${n}` },
        { type: 'body', text: 'Material premium dan cahaya warm untuk studio kreatif.' },
        ...(image ? [{ type: 'image_placeholder' as const, requires_generation: true, image_object_context: `artisan lamp visual angle ${n}` }] : []),
      ],
      action_footer: n === 5 ? [{ type: 'button_cta', label: 'Lihat Koleksi', style: 'primary' }] : [],
    },
  };
}

describe('buildCarouselWorkflowArtifact', () => {
  it('creates Hermes workflow outline, per-slide prompts, and caption from SDUI slides', () => {
    const slides = [slide(1, true), slide(2, true), slide(3, true), slide(4), slide(5)];

    const workflow = buildCarouselWorkflowArtifact({
      prompt: 'Carousel promo produk lampu meja artisan untuk studio kreatif',
      slides,
      brandKit: brandKit(),
      source: 'planning',
    });

    expect(workflow.workflowStage).toBe('prompts');
    expect(workflow.outline).toHaveLength(5);
    expect(workflow.designSystemSnapshot.colors).toEqual(['#187DB4', '#1a1d24']);
    expect(workflow.slidePrompts).toHaveLength(5);
    expect(workflow.slidePrompts[0]!.prompt).toContain('Do not render text inside the generated image');
    expect(workflow.slidePrompts[0]!.exactHeadline).toBe('Lampu Artisan');
    expect(workflow.slidePrompts.filter((prompt) => prompt.visualBrief)).toHaveLength(3);
    expect(workflow.caption.hashtags.length).toBeLessThanOrEqual(3);
    expect(workflow.slides.every((item) => item.reviewStatus === 'draft')).toBe(true);
  });
});
