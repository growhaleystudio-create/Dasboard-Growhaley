import { describe, expect, it } from 'vitest';
import { getLayoutCatalogItem } from '@leads-generator/shared';
import type { SduiComponent, SduiSlide } from '@leads-generator/shared';
import {
  analyzeSduiTextCompleteness,
  appearsIncompleteSduiText,
  applySduiTextGuardrails,
  resolveSduiTextLimits,
  sduiContentQualityIssues,
} from './sdui-text-guardrails.js';

function baseSlide(layout: string, coreContent: SduiComponent[]): SduiSlide {
  return {
    slide_number: 1,
    slide_type: 'content',
    container_layout: 'text_dominant',
    layout_variant_id: layout,
    image_requirement: 'none',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'LABEL YANG TERLALU PANJANG' }],
      core_content: coreContent,
      action_footer: [
        { type: 'button_cta', label: 'Tombol aksi yang terlalu panjang sekali', style: 'primary' },
      ],
    },
  };
}

function findCore(slide: SduiSlide, type: SduiComponent['type']): SduiComponent {
  const component = slide.nested_groups.core_content?.find((item) => item.type === type);
  if (!component) throw new Error(`Missing ${type}`);
  return component;
}

describe('applySduiTextGuardrails', () => {
  it('explains incomplete text with stable reason codes', () => {
    expect(analyzeSduiTextCompleteness('Konten berhenti...')).toMatchObject({
      incomplete: true,
      issue: 'ellipsis',
    });
    expect(analyzeSduiTextCompleteness('Konten berhenti,')).toMatchObject({
      incomplete: true,
      issue: 'trailing_punctuation',
    });
    expect(analyzeSduiTextCompleteness('Variasikan konten (foto, video')).toMatchObject({
      incomplete: true,
      issue: 'unbalanced_pairs',
    });
    expect(analyzeSduiTextCompleteness('Hubungan emosional yang')).toMatchObject({
      incomplete: true,
      issue: 'dangling_connector',
    });
    expect(analyzeSduiTextCompleteness('Strategi agar tetap')).toMatchObject({
      incomplete: true,
      issue: 'dangling_modifier',
    });
    expect(analyzeSduiTextCompleteness('Masalah yang mereka')).toMatchObject({
      incomplete: true,
      issue: 'dangling_relative_pronoun',
    });
    expect(analyzeSduiTextCompleteness('Brand awareness, mendorong')).toMatchObject({
      incomplete: true,
      issue: 'dangling_action_verb',
    });
  });

  it('does not flag complete short text and CTA-like phrases', () => {
    expect(analyzeSduiTextCompleteness('Mulai Sekarang')).toEqual({ incomplete: false });
    expect(analyzeSduiTextCompleteness('Bangun koneksi emosional')).toEqual({ incomplete: false });
    expect(analyzeSduiTextCompleteness('Variasikan konten (foto, video, teks).')).toEqual({
      incomplete: false,
    });
    expect(analyzeSduiTextCompleteness('Pantau performa konten Anda.')).toEqual({
      incomplete: false,
    });
  });

  it('trims header, body, tag, and invalid highlight by selected split-image layout limits', () => {
    const layout = 'gw_photo_statement';
    const limits = getLayoutCatalogItem(layout)!.textLimits;
    const slide = baseSlide(layout, [
      {
        type: 'header',
        text: 'A very long header text',
        highlight: 'not present',
      },
      {
        type: 'body',
        text: 'This body text will be truncated based on layout limits to fit properly.',
        highlight: 'body text',
      },
      {
        type: 'image_placeholder',
        requires_generation: true,
        image_object_context: 'product dashboard',
      },
    ]);

    const guarded = applySduiTextGuardrails(slide);
    const tag = guarded.nested_groups.top_meta?.[0];
    const header = findCore(guarded, 'header');
    const body = findCore(guarded, 'body');

    expect(tag?.text?.length).toBeLessThanOrEqual(limits.tag);
    expect(header.text?.length).toBeLessThanOrEqual(limits.header!);
    expect(header.highlight).toBeUndefined();
    expect(body.text?.length).toBeLessThanOrEqual(limits.body!);
    expect(body.highlight).toBeDefined();
  });

  it('limits checklist item count and item length for step layouts', () => {
    const layout = 'gw_poster_list';
    const limits = getLayoutCatalogItem(layout)!.textLimits;
    const slide = baseSlide(layout, [
      { type: 'header', text: 'Process steps' },
      {
        type: 'checklist',
        items: Array.from(
          { length: 8 },
          (_, index) => `Step ${index + 1}: Do this action with care`,
        ),
      },
    ]);

    const guarded = applySduiTextGuardrails(slide);
    const checklist = findCore(guarded, 'checklist');

    expect(checklist.items).toHaveLength(limits.checklistItems!);
    for (const item of checklist.items ?? []) {
      expect(item.length).toBeLessThanOrEqual(limits.checklistItem!);
    }
  });

  it('uses CTA label limits from CTA-capable layouts', () => {
    const layout = 'gw_poster_cta';
    const limits = getLayoutCatalogItem(layout)!.textLimits;
    const slide = baseSlide(layout, [
      { type: 'header', text: 'Take action now' },
      {
        type: 'body',
        text: 'This explains why you should take action. It contains enough detail to be informative and convincing.',
      },
    ]);

    const guarded = applySduiTextGuardrails(slide);
    const button = guarded.nested_groups.action_footer?.[0];

    expect(findCore(guarded, 'header').text?.length).toBeLessThanOrEqual(limits.header!);
    expect(findCore(guarded, 'body').text?.length).toBeLessThanOrEqual(limits.body!);
    expect(button?.label?.length).toBeLessThanOrEqual(limits.ctaLabel!);
  });

  it('tightens text limits when configured font sizes are larger', () => {
    const layout = 'text_stack';
    const staticLimits = resolveSduiTextLimits(layout);
    const largeTextLimits = resolveSduiTextLimits(layout, {
      typography: { headerSizePx: 96, bodySizePx: 44 },
    });
    const slide = baseSlide(layout, [
      { type: 'header', text: 'H'.repeat(100) },
      { type: 'body', text: 'B'.repeat(220) },
    ]);

    const guarded = applySduiTextGuardrails(slide, {
      typography: { headerSizePx: 96, bodySizePx: 44 },
    });

    expect(largeTextLimits.header).toBeLessThan(staticLimits.header!);
    expect(largeTextLimits.body).toBeLessThan(staticLimits.body!);
    expect(findCore(guarded, 'header').text?.length).toBeLessThanOrEqual(largeTextLimits.header!);
    expect(findCore(guarded, 'body').text?.length).toBeLessThanOrEqual(largeTextLimits.body!);
  });

  it('reduces checklist item count when body font is large', () => {
    const layout = 'checklist_stack';
    const staticLimits = resolveSduiTextLimits(layout);
    const largeTextLimits = resolveSduiTextLimits(layout, {
      typography: { bodySizePx: 44 },
    });
    const slide = baseSlide(layout, [
      { type: 'header', text: 'H'.repeat(80) },
      {
        type: 'checklist',
        items: Array.from({ length: 8 }, (_, index) => `Poin ${index + 1} ${'x'.repeat(80)}`),
      },
    ]);

    const guarded = applySduiTextGuardrails(slide, {
      typography: { bodySizePx: 44 },
    });
    const checklist = findCore(guarded, 'checklist');

    expect(largeTextLimits.checklistItems).toBeLessThan(staticLimits.checklistItems!);
    expect(checklist.items).toHaveLength(largeTextLimits.checklistItems!);
  });

  it('removes empty checklist components and reports headline-only content slides', () => {
    const slide: SduiSlide = {
      ...baseSlide('gw_poster_list', [
        { type: 'header', text: 'Keunggulan AI untuk UMKM' },
        { type: 'checklist', items: [] },
      ]),
      nested_groups: {
        top_meta: [],
        core_content: [
          { type: 'header', text: 'Keunggulan AI untuk UMKM' },
          { type: 'checklist', items: [] },
        ],
        action_footer: [],
      },
    };

    const guarded = applySduiTextGuardrails(slide);
    const issues = sduiContentQualityIssues([guarded]);

    expect(
      guarded.nested_groups.core_content?.some((component) => component.type === 'checklist'),
    ).toBe(false);
    expect(
      issues.some((issue) => issue.includes('gw_poster_list') && issue.includes('checklist')),
    ).toBe(true);
    expect(issues).toContain('slide 1: content slide cannot be headline-only');
  });

  it('removes empty body components and reports header-only text slides', () => {
    const slide: SduiSlide = {
      ...baseSlide('gw_poster_statement', [
        { type: 'header', text: 'Benefit AI untuk Promosi' },
        { type: 'body', text: '   ' },
      ]),
      nested_groups: {
        top_meta: [],
        core_content: [
          { type: 'header', text: 'Benefit AI untuk Promosi' },
          { type: 'body', text: '   ' },
        ],
        action_footer: [],
      },
    };

    const guarded = applySduiTextGuardrails(slide);
    const issues = sduiContentQualityIssues([guarded]);

    expect(guarded.nested_groups.core_content?.some((component) => component.type === 'body')).toBe(
      false,
    );
    expect(issues.some((issue) => issue.includes('gw_poster_statement') && issue.includes('body'))).toBe(
      true,
    );
    expect(issues).toContain('slide 1: content slide cannot be headline-only');
  });

  it('trims at a word boundary instead of cutting through a word', () => {
    const slide = baseSlide('text_stack', [
      { type: 'header', text: 'Judul Utuh' },
      {
        type: 'body',
        text: 'AI membantu promosi UMKM agar lebih efektif dan menjangkau pelanggan baru',
      },
    ]);

    const guarded = applySduiTextGuardrails(slide, {
      typography: { bodySizePx: 96 },
    });
    const body = findCore(guarded, 'body').text!;

    expect(body.endsWith('pelang')).toBe(false);
    expect(body).toMatch(/\S$/);
  });

  it('adds a readable sentence ending when body text is shortened by limits', () => {
    const slide = baseSlide('text_stack', [
      { type: 'header', text: 'Judul Utuh' },
      {
        type: 'body',
        text: 'AI membantu promosi UMKM agar lebih efektif dan menjangkau pelanggan baru melalui konten yang konsisten setiap minggu dengan menggunakan teknologi terbaru dan strategi marketing yang sudah terbukti berhasil meningkatkan engagement dan konversi penjualan secara signifikan',
      },
    ]);

    const guarded = applySduiTextGuardrails(slide, {
      typography: { bodySizePx: 96 },
    });
    const body = findCore(guarded, 'body').text!;
    const originalLength =
      'AI membantu promosi UMKM agar lebih efektif dan menjangkau pelanggan baru melalui konten yang konsisten setiap minggu dengan menggunakan teknologi terbaru dan strategi marketing yang sudah terbukti berhasil meningkatkan engagement dan konversi penjualan secara signifikan'
        .length;

    expect(body.length).toBeLessThan(originalLength);
    expect(body.endsWith('.')).toBe(true);
    expect(appearsIncompleteSduiText(body)).toBe(false);
  });

  it('does not leave trimmed text ending with a dangling connector', () => {
    const slide = baseSlide('text_stack', [
      { type: 'header', text: 'Judul Utuh' },
      {
        type: 'body',
        text: 'AI membantu promosi UMKM agar lebih efektif dan membangun hubungan emosional yang kuat dengan pelanggan baru',
      },
    ]);

    const guarded = applySduiTextGuardrails(slide, {
      typography: { bodySizePx: 96 },
    });
    const body = findCore(guarded, 'body').text!;

    expect(body).not.toMatch(/\b(yang|dengan|untuk|dan)$/i);
    expect(appearsIncompleteSduiText(body)).toBe(false);
  });

  it('reports body and checklist items that look semantically incomplete', () => {
    const slide = baseSlide('checklist_with_body', [
      { type: 'header', text: 'Hambatan Konten' },
      { type: 'body', text: 'Tim sering kesulitan menjaga ritme posting yang' },
      {
        type: 'checklist',
        items: ['Hubungan emosional yang', 'Ide konten belum konsisten'],
      },
    ]);

    const guarded = applySduiTextGuardrails(slide);
    const issues = sduiContentQualityIssues([guarded]);

    expect(issues).toContain('slide 1: body appears incomplete (dangling_connector)');
    expect(issues).toContain('slide 1: checklist item 1 appears incomplete (dangling_connector)');
    expect(issues).not.toContain(
      'slide 1: checklist item 2 appears incomplete (dangling_connector)',
    );
  });

  it('reports modifier endings such as agar tetap as incomplete text', () => {
    const slide = baseSlide('text_stack', [
      { type: 'header', text: 'Analisis Konten' },
      { type: 'body', text: 'Pantau performa konten dan sesuaikan strategi agar tetap' },
    ]);

    const guarded = applySduiTextGuardrails(slide);

    expect(appearsIncompleteSduiText(findCore(guarded, 'body').text)).toBe(true);
    expect(sduiContentQualityIssues([guarded])).toContain(
      'slide 1: body appears incomplete (dangling_modifier)',
    );
  });

  it('reports dangling yang-pronoun endings and unbalanced parentheses', () => {
    const slide = baseSlide('checklist_with_body', [
      { type: 'header', text: 'Target Audiens' },
      { type: 'body', text: 'Kenali demografi, minat, dan masalah yang mereka' },
      {
        type: 'checklist',
        items: ['Variasikan jenis konten (foto, video', 'Ukur performa tiap minggu.'],
      },
    ]);

    const guarded = applySduiTextGuardrails(slide);
    const issues = sduiContentQualityIssues([guarded]);

    expect(issues).toContain('slide 1: body appears incomplete (dangling_relative_pronoun)');
    expect(issues).toContain('slide 1: checklist item 1 appears incomplete (unbalanced_pairs)');
    expect(issues).not.toContain('slide 1: checklist item 2 appears incomplete (unbalanced_pairs)');
  });

  it('reports final transitive action verbs as incomplete body text', () => {
    const slide = baseSlide('text_stack', [
      { type: 'header', text: 'Tujuan Konten' },
      { type: 'body', text: 'Tingkatkan kesadaran merek, dorong penjualan, atau bangun' },
    ]);
    const otherSlide = baseSlide('text_stack', [
      { type: 'header', text: 'Adaptasi Konten' },
      { type: 'body', text: 'Pelajari apa yang disukai audiens dan sesuaikan' },
    ]);
    const prefixedVerbSlide = baseSlide('text_stack', [
      { type: 'header', text: 'Brand Awareness' },
      { type: 'body', text: 'Setiap konten harus meningkatkan brand awareness, mendorong' },
    ]);

    expect(sduiContentQualityIssues([applySduiTextGuardrails(slide)])).toContain(
      'slide 1: body appears incomplete (dangling_action_verb)',
    );
    expect(sduiContentQualityIssues([applySduiTextGuardrails(otherSlide)])).toContain(
      'slide 1: body appears incomplete (dangling_action_verb)',
    );
    expect(sduiContentQualityIssues([applySduiTextGuardrails(prefixedVerbSlide)])).toContain(
      'slide 1: body appears incomplete (dangling_action_verb)',
    );
  });
});
