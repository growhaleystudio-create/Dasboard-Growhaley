import { describe, expect, it } from 'vitest';
import type { SduiComponent, SduiSlide } from '@leads-generator/shared';
import { LayoutProcessor } from './workers/processors/layout-processor.js';

function slide(
  n: number,
  components: SduiComponent[],
  layout_variant_id?: SduiSlide['layout_variant_id'],
  image_requirement: SduiSlide['image_requirement'] = 'none',
): SduiSlide {
  return {
    slide_number: n,
    slide_type: n === 1 ? 'cover' : 'content',
    container_layout: 'text_dominant',
    ...(layout_variant_id ? { layout_variant_id } : {}),
    image_requirement,
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: `S${n}` }],
      core_content: components,
      action_footer: [],
    },
  };
}

describe('SDUI layout diversity resolver', () => {
  it('avoids repeated layout ids and reaches 4 unique variants for a 5-slide deck when possible', () => {
    const slides = [
      slide(
        1,
        [
          { type: 'header', text: 'Cover' },
          { type: 'body', text: 'Intro' },
        ],
        'gw_poster_cover',
      ),
      slide(
        2,
        [
          { type: 'header', text: 'Point' },
          { type: 'body', text: 'Body' },
        ],
        'gw_poster_statement',
      ),
      slide(
        3,
        [
          { type: 'header', text: 'Checklist' },
          { type: 'checklist', items: ['A', 'B'] },
        ],
        'gw_poster_list',
      ),
      slide(4, [{ type: 'quote', text: 'Quote' }], 'gw_poster_quote'),
      slide(
        5,
        [
          { type: 'header', text: 'CTA' },
          { type: 'body', text: 'Go' },
          { type: 'button_cta', label: 'Start' },
        ],
        'gw_poster_cta',
      ),
    ];

    const resolved = LayoutProcessor.enforceLayoutDiversity(slides);

    for (let i = 1; i < resolved.length; i++) {
      expect(resolved[i]!.layout_variant_id).not.toBe(resolved[i - 1]!.layout_variant_id);
    }
    // With 3 families, diversity is tracked at the variant level
    expect(new Set(resolved.map((s) => s.layout_variant_id)).size).toBeGreaterThanOrEqual(4);
  });

  it('keeps repaired slides on no-image layouts only', () => {
    const slides = [
      slide(
        1,
        [
          { type: 'header', text: 'Cover' },
          { type: 'image_placeholder', image_object_context: 'hero' },
        ],
        'gw_photo_statement',
        'required',
      ),
      slide(
        2,
        [
          { type: 'header', text: 'Explain' },
          { type: 'body', text: 'No image after repair' },
        ],
        'gw_photo_rotated',
        'none',
      ),
    ];

    const resolved = LayoutProcessor.enforceLayoutDiversity(slides, {
      forceNoImageSlideNumbers: new Set([2]),
    });

    expect(resolved[1]!.layout_variant_id).not.toBe('gw_photo_rotated');
    expect(LayoutProcessor.isValidNoImageRepair(resolved[1]!)).toBe(true);
  });

  it('does not force non-stat text into stat layouts just to increase family diversity', () => {
    const slides = [
      slide(
        1,
        [
          { type: 'header', text: 'AI untuk Promosi UMKM' },
          { type: 'body', text: 'Intro singkat' },
        ],
        'gw_poster_cover',
      ),
      slide(
        2,
        [
          { type: 'header', text: 'Promosi Lebih Cepat' },
          { type: 'body', text: 'AI membantu membuat caption dan ide konten.' },
        ],
        'gw_poster_statement',
      ),
      slide(
        3,
        [
          { type: 'header', text: 'Benefit Utama' },
          { type: 'checklist', items: ['Ide konten cepat', 'Caption konsisten'] },
        ],
        'gw_poster_list',
      ),
      slide(
        4,
        [
          { type: 'header', text: 'Contoh Implementasi' },
          {
            type: 'body',
            text: 'Gunakan AI untuk membuat deskripsi produk yang persuasif dan postingan media sosial.',
          },
        ],
        'gw_photo_rotated',
        'required',
      ),
      slide(
        5,
        [
          { type: 'header', text: 'Mulai Hari Ini' },
          { type: 'button_cta', label: 'Mulai Sekarang' },
        ],
        'gw_poster_cta',
      ),
    ];

    const resolved = LayoutProcessor.enforceLayoutDiversity(slides);
    const fourth = resolved[3]!;

    expect(fourth.layout_family).toBe('poster');
    expect(fourth.layout_variant_id).not.toBe('gw_poster_stat');
    expect(fourth.image_requirement).toBe('none');
    expect(fourth.image_status).toBe('not_needed');
  });

  it('does not treat words containing "angka" as statistics', () => {
    const slides = [
      slide(
        1,
        [
          { type: 'header', text: 'AI untuk Promosi UMKM' },
          { type: 'body', text: 'Intro singkat' },
        ],
        'gw_poster_cover',
      ),
      slide(
        2,
        [
          { type: 'header', text: 'Promosi Lebih Cepat' },
          { type: 'body', text: 'AI membantu membuat caption.' },
        ],
        'gw_poster_statement',
      ),
      slide(
        3,
        [
          { type: 'header', text: 'Benefit Utama' },
          { type: 'checklist', items: ['Ide cepat', 'Caption konsisten'] },
        ],
        'gw_poster_list',
      ),
      slide(4, [{ type: 'quote', text: 'AI membantu promosi tetap konsisten.' }], 'gw_poster_quote'),
      slide(
        5,
        [
          { type: 'header', text: 'Siap Mengembangkan' },
          {
            type: 'body',
            text: 'Mulai dengan mempelajari platform AI gratis yang tersedia atau ikuti workshop.',
          },
          { type: 'button_cta', label: 'Konsultasi Gratis' },
        ],
        'gw_poster_stat',
      ),
    ];

    const resolved = LayoutProcessor.enforceLayoutDiversity(slides);
    const fifth = resolved[4]!;

    expect(fifth.layout_variant_id).not.toBe('gw_poster_stat');
    expect(fifth.layout_variant_id).toBe('gw_poster_cta');
  });

  it('rejects image_placeholder in repaired slides', () => {
    const repaired = slide(
      2,
      [
        { type: 'header', text: 'Bad repair' },
        { type: 'image_placeholder', image_object_context: 'still here' },
      ],
      'gw_poster_statement',
      'none',
    );

    expect(LayoutProcessor.isValidNoImageRepair(repaired)).toBe(false);
  });
});
