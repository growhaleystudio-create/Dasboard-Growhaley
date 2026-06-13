import { describe, expect, it } from 'vitest';
import type { SduiComponent, SduiSlide } from '@leads-generator/shared';
import { enforceLayoutDiversity, isValidNoImageRepair } from './sdui-carousel-worker.js';

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
  it('avoids repeated layout ids and reaches 4 families for a 5-slide deck when possible', () => {
    const slides = [
      slide(1, [{ type: 'header', text: 'Cover' }, { type: 'body', text: 'Intro' }], 'text_stack'),
      slide(2, [{ type: 'header', text: 'Point' }, { type: 'body', text: 'Body' }], 'text_stack'),
      slide(3, [{ type: 'header', text: 'Checklist' }, { type: 'checklist', items: ['A', 'B'] }], 'checklist_stack'),
      slide(4, [{ type: 'quote', text: 'Quote' }], 'quote_focus'),
      slide(5, [{ type: 'header', text: 'CTA' }, { type: 'body', text: 'Go' }, { type: 'button_cta', label: 'Start' }], 'header_body_cta'),
    ];

    const resolved = enforceLayoutDiversity(slides);

    for (let i = 1; i < resolved.length; i++) {
      expect(resolved[i]!.layout_variant_id).not.toBe(resolved[i - 1]!.layout_variant_id);
    }
    expect(new Set(resolved.map((s) => s.layout_family)).size).toBeGreaterThanOrEqual(4);
  });

  it('keeps repaired slides on no-image layouts only', () => {
    const slides = [
      slide(1, [{ type: 'header', text: 'Cover' }, { type: 'image_placeholder', image_object_context: 'hero' }], 'cover_image_full', 'required'),
      slide(2, [{ type: 'header', text: 'Explain' }, { type: 'body', text: 'No image after repair' }], 'split_text_left_image_right', 'none'),
    ];

    const resolved = enforceLayoutDiversity(slides, { forceNoImageSlideNumbers: new Set([2]) });

    expect(resolved[1]!.layout_variant_id).not.toBe('split_text_left_image_right');
    expect(isValidNoImageRepair(resolved[1]!)).toBe(true);
  });

  it('does not force non-stat text into stat layouts just to increase family diversity', () => {
    const slides = [
      slide(1, [{ type: 'header', text: 'AI untuk Promosi UMKM' }, { type: 'body', text: 'Intro singkat' }], 'cover_centered'),
      slide(2, [{ type: 'header', text: 'Promosi Lebih Cepat' }, { type: 'body', text: 'AI membantu membuat caption dan ide konten.' }], 'text_stack'),
      slide(3, [{ type: 'header', text: 'Benefit Utama' }, { type: 'checklist', items: ['Ide konten cepat', 'Caption konsisten'] }], 'checklist_stack'),
      slide(
        4,
        [
          { type: 'header', text: 'Contoh Implementasi' },
          { type: 'body', text: 'Gunakan AI untuk membuat deskripsi produk yang persuasif dan postingan media sosial.' },
        ],
        'split_text_left_image_right',
        'required',
      ),
      slide(5, [{ type: 'header', text: 'Mulai Hari Ini' }, { type: 'button_cta', label: 'Mulai Sekarang' }], 'cta_centered'),
    ];

    const resolved = enforceLayoutDiversity(slides);
    const fourth = resolved[3]!;

    expect(fourth.layout_family).toBe('text');
    expect(fourth.layout_variant_id).not.toBe('stat_highlight');
    expect(fourth.image_requirement).toBe('none');
    expect(fourth.image_status).toBe('not_needed');
  });

  it('does not treat words containing "angka" as statistics', () => {
    const slides = [
      slide(1, [{ type: 'header', text: 'AI untuk Promosi UMKM' }, { type: 'body', text: 'Intro singkat' }], 'cover_centered'),
      slide(2, [{ type: 'header', text: 'Promosi Lebih Cepat' }, { type: 'body', text: 'AI membantu membuat caption.' }], 'text_stack'),
      slide(3, [{ type: 'header', text: 'Benefit Utama' }, { type: 'checklist', items: ['Ide cepat', 'Caption konsisten'] }], 'checklist_stack'),
      slide(4, [{ type: 'quote', text: 'AI membantu promosi tetap konsisten.' }], 'quote_focus'),
      slide(
        5,
        [
          { type: 'header', text: 'Siap Mengembangkan' },
          { type: 'body', text: 'Mulai dengan mempelajari platform AI gratis yang tersedia atau ikuti workshop.' },
          { type: 'button_cta', label: 'Konsultasi Gratis' },
        ],
        'stat_highlight',
      ),
    ];

    const resolved = enforceLayoutDiversity(slides);
    const fifth = resolved[4]!;

    expect(fifth.layout_variant_id).not.toBe('stat_highlight');
    expect(fifth.layout_family).toBe('cta');
  });

  it('rejects image_placeholder in repaired slides', () => {
    const repaired = slide(
      2,
      [{ type: 'header', text: 'Bad repair' }, { type: 'image_placeholder', image_object_context: 'still here' }],
      'text_stack',
      'none',
    );

    expect(isValidNoImageRepair(repaired)).toBe(false);
  });
});
