import { describe, expect, it, vi } from 'vitest';
import { getLayoutCatalogItem, type SduiSlide } from '@leads-generator/shared';
import { DefaultSduiPlanner, ensureExplicitImageRequest } from './sdui-planner/index.js';
import type { SduiPlannerDeps } from './sdui-planner/index.js';
import type { AiCallWrapper } from './ai-call-wrapper.js';
import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';
import { resolveSduiTextLimits } from './sdui-text-guardrails.js';

function makeDeps(responseJson: string): SduiPlannerDeps {
  return {
    wrapper: {
      execute: vi.fn().mockResolvedValue({ ok: true, value: responseJson }),
    } as unknown as AiCallWrapper,
    settings: {
      loadApiBaseUrl: vi.fn().mockResolvedValue('https://api.openai.com'),
      getSettings: vi.fn().mockResolvedValue({ textModel: 'gpt-4.1-mini' }),
    } as unknown as TeamAiSettingsService,
  };
}

function makeDepsSequence(responseJsons: string[]): SduiPlannerDeps {
  return {
    wrapper: {
      execute: vi.fn()
        .mockResolvedValueOnce({ ok: true, value: responseJsons[0] })
        .mockResolvedValueOnce({ ok: true, value: responseJsons[1] ?? responseJsons[0] }),
    } as unknown as AiCallWrapper,
    settings: {
      loadApiBaseUrl: vi.fn().mockResolvedValue('https://api.openai.com'),
      getSettings: vi.fn().mockResolvedValue({ textModel: 'gpt-4.1-mini' }),
    } as unknown as TeamAiSettingsService,
  };
}

function hasMeaningfulSupport(slide: SduiSlide): boolean {
  const components = (['top_meta', 'core_content', 'action_footer'] as const)
    .flatMap((group) => slide.nested_groups[group] ?? []);

  return components.some((component) => {
    if (component.type === 'body' || component.type === 'quote') {
      return Boolean(component.text?.trim());
    }
    if (component.type === 'button_cta') {
      return Boolean(component.label?.trim());
    }
    if (component.type === 'checklist') {
      return Boolean(component.items?.some((item) => item.trim().length > 0));
    }
    return false;
  });
}

describe('DefaultSduiPlanner image-aware metadata', () => {
  it('injects the content intelligence bank into the planner prompt', async () => {
    const response = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'cover_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'RISIKO', textTransform: 'uppercase' }],
            core_content: [{ type: 'header', text: 'Bahaya yang Sering Diabaikan', highlight: 'Bahaya' }],
            action_footer: [],
          },
        },
      ],
    });
    const deps = makeDeps(response);
    const planner = new DefaultSduiPlanner(deps);

    await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: 'bahaya pornografi untuk rumah tangga, style doodle, sertakan pencegahan efektif',
      aspectRatio: '1:1',
      slideCount: 1,
      maxSlides: 7,
      tone: 'calm',
    }, AbortSignal.timeout(30_000));

    const prompt = (deps.wrapper.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
      ? ((deps.wrapper.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as unknown)
      : undefined;
    expect(prompt).toBeDefined();

    const executeFn = (deps.wrapper.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as undefined | ((apiKey: string) => Promise<string>);
    expect(executeFn).toBeDefined();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: response } }] }),
    } as Response);

    if (executeFn) await executeFn('fake-key');
    const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string) as { messages: Array<{ content: string }> };
    expect(body.messages[0]?.content).toContain('[CREATIVE VARIATION]');
    expect(body.messages[0]?.content).toContain('variation_id');
    expect(body.messages[0]?.content).toContain('hasil konten tetap harus terasa sebagai draft baru');
    expect(body.messages[0]?.content).toContain('[CONTENT INTELLIGENCE BANK]');
    expect(body.messages[0]?.content).toContain('ATURAN PENGGUNAAN BANK DATASET');
    expect(body.messages[0]?.content).toContain('Default slide content harus padat');
    expect(body.messages[0]?.content).toContain('jangan kirim slide content hanya berisi header');
    expect(body.messages[0]?.content).toContain('promptFragment + avoid list');
    expect(body.messages[0]?.content).toContain('layoutCandidates dari recipe');
    expect(body.messages[0]?.content).toContain('WAJIB 2 sampai 4 komponen image_placeholder');
    expect(body.messages[0]?.content).toContain('gw_collage_showcase');
    expect(body.messages[0]?.content).toContain('warning_prevention_playbook');
    expect(body.messages[0]?.content).toContain('doodle_handdrawn');
    expect(body.messages[0]?.content).toContain('prevention_steps');
    fetchSpy.mockRestore();
  });

  it('accepts a long descriptive visual-heavy prompt without forcing a minimal-image plan', async () => {
    const longPrompt =
      'Buat carousel 5 slide tentang lampu meja artisan untuk studio kreatif kecil. ' +
      'Saya ingin style visual warm editorial, premium tetapi tetap playful, banyak gambar lampu sebagai transparent cutout tanpa background, ' +
      'ada detail cahaya amber yang jatuh ke meja kayu, bayangan lembut, tekstur metal brushed, kabel kain hitam, dan beberapa callout kecil tentang fitur dimmer. ' +
      'Kontennya jangan generik: tekankan bahwa lampu ini bukan cuma penerangan, tapi mood setter untuk kerja malam, membaca, dan shooting produk. ' +
      'Setiap slide boleh terasa berbeda dan kreatif, namun logo, tag, footer, dan pagination tetap tidak berubah.';
    const response = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'background_overlay',
          layout_variant_id: 'cover_image_full',
          image_requirement: 'required',
          typography_scale: 'editorial_bold',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'MOOD LIGHT', textTransform: 'uppercase' }],
            core_content: [
              { type: 'header', text: 'Lampu yang Mengatur Mood', highlight: 'Mood' },
              { type: 'body', text: 'Cahaya amber lembut untuk studio kecil yang hidup.' },
              { type: 'image_placeholder', requires_generation: true, image_object_context: 'warm editorial transparent cutout of an artisan desk lamp, amber glow, no background' },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 2,
          slide_type: 'content',
          container_layout: 'split_screen',
          layout_variant_id: 'split_text_left_image_right',
          image_requirement: 'required',
          typography_scale: 'balanced_classic',
          contentDirection: 'row',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'DETAIL', textTransform: 'uppercase' }],
            core_content: [
              { type: 'header', text: 'Material yang Terasa', highlight: 'Terasa' },
              { type: 'body', text: 'Metal brushed, kabel kain, dan siluet tipis membuat meja terasa rapi.' },
              { type: 'image_placeholder', requires_generation: true, image_object_context: 'transparent cutout close-up of brushed metal desk lamp with black fabric cable, premium editorial lighting' },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 3,
          slide_type: 'content',
          container_layout: 'split_screen',
          layout_variant_id: 'split_image_checklist',
          image_requirement: 'optional',
          typography_scale: 'balanced_classic',
          contentDirection: 'row',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'DIMMER', textTransform: 'uppercase' }],
            core_content: [
              { type: 'header', text: 'Satu Putar, Tiga Suasana', highlight: 'Tiga' },
              { type: 'checklist', items: ['Fokus kerja malam', 'Baca santai', 'Shooting produk'] },
              { type: 'image_placeholder', requires_generation: true, image_object_context: 'three small transparent cutout lamp scenes showing dimmer moods for work, reading, and product photography' },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 4,
          slide_type: 'content',
          container_layout: 'split_screen',
          layout_variant_id: 'quote_with_image',
          image_requirement: 'optional',
          typography_scale: 'editorial_bold',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'FEEL', textTransform: 'uppercase' }],
            core_content: [
              { type: 'quote', text: 'Saat cahaya tepat, meja kecil terasa seperti studio.', highlight: 'cahaya tepat' },
              { type: 'image_placeholder', requires_generation: true, image_object_context: 'floating transparent cutout artisan desk lamp casting soft amber shadow on wooden desk, editorial collage style' },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 5,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'cta_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'TRY IT', textTransform: 'uppercase' }],
            core_content: [{ type: 'header', text: 'Nyalakan Ritme Kerjamu', highlight: 'Ritme' }],
            action_footer: [{ type: 'button_cta', label: 'Lihat Koleksi', style: 'primary' }],
          },
        },
      ],
    });
    const deps = makeDeps(response);
    const planner = new DefaultSduiPlanner(deps);

    const result = await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: longPrompt,
      aspectRatio: '1:1',
      slideCount: 5,
      maxSlides: 7,
      tone: 'expressive',
    }, AbortSignal.timeout(30_000));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(deps.wrapper.execute).toHaveBeenCalled();
    expect(deps.wrapper.execute).toHaveBeenCalledTimes(2);
    const imageSlides = result.value.slides.filter((slide) =>
      (['top_meta', 'core_content', 'action_footer'] as const).some((group) =>
        slide.nested_groups[group]?.some((component) => component.type === 'image_placeholder'),
      ),
    );
    expect(imageSlides).toHaveLength(4);
    expect(result.value.slides.map((slide) => slide.image_requirement)).toEqual([
      'required',
      'required',
      'required',
      'required',
      'none',
    ]);
  });

  it('repairs over-limit planner copy instead of silently cutting it', async () => {
    const overLimit = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'gw_poster_stat',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'LABEL YANG TERLALU PANJANG' }],
            core_content: [
              { type: 'header', text: '9'.repeat(80) },
              { type: 'body', text: 'B'.repeat(180) },
            ],
            action_footer: [],
          },
        },
      ],
    });
    const rewritten = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'gw_poster_stat',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'DATA' }],
            core_content: [
              { type: 'header', text: '9x' },
              { type: 'body', text: 'Respons lebih cepat tanpa menambah beban tim.' },
            ],
            action_footer: [],
          },
        },
      ],
    });
    const deps = makeDepsSequence([overLimit, rewritten]);
    const planner = new DefaultSduiPlanner(deps);

    const result = await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: 'Buat slide statistik',
      aspectRatio: '1:1',
      slideCount: 1,
      maxSlides: 5,
      tone: 'professional',
    }, AbortSignal.timeout(30_000));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(deps.wrapper.execute).toHaveBeenCalledTimes(2);
    const slide = result.value.slides[0]!;
    const limits = getLayoutCatalogItem('gw_poster_stat')!.textLimits;
    const tag = slide.nested_groups.top_meta?.[0];
    const header = slide.nested_groups.core_content?.find((component) => component.type === 'header');
    const body = slide.nested_groups.core_content?.find((component) => component.type === 'body');

    expect(header?.text).toBe('9x');
    expect(body?.text).toBe('Respons lebih cepat tanpa menambah beban tim.');
    expect(tag?.text?.length).toBeLessThanOrEqual(limits.tag);
    expect(header?.text?.length).toBeLessThanOrEqual(limits.header!);
    expect(body?.text?.length).toBeLessThanOrEqual(limits.body!);
  });

  it('uses typographyOverride to tighten parsed text guardrails', async () => {
    const overLimit = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'gw_poster_statement',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [],
            core_content: [
              { type: 'header', text: 'H'.repeat(80) },
              { type: 'body', text: 'B'.repeat(180) },
            ],
            action_footer: [],
          },
        },
      ],
    });
    const rewritten = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'gw_poster_statement',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [],
            core_content: [
              { type: 'header', text: 'Ide Cepat' },
              { type: 'body', text: 'Ubah satu brief menjadi ide konten siap pakai.' },
            ],
            action_footer: [],
          },
        },
      ],
    });
    const deps = makeDepsSequence([overLimit, rewritten]);
    const planner = new DefaultSduiPlanner(deps);
    const typographyOverride = { headerSizePx: 96, bodySizePx: 44 };

    const result = await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: 'Buat slide edukasi',
      aspectRatio: '1:1',
      slideCount: 1,
      maxSlides: 5,
      tone: 'professional',
      typographyOverride,
    }, AbortSignal.timeout(30_000));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(deps.wrapper.execute).toHaveBeenCalledTimes(2);
    const slide = result.value.slides[0]!;
    const limits = resolveSduiTextLimits('gw_poster_statement', { typography: typographyOverride }, slide);
    const staticLimits = getLayoutCatalogItem('gw_poster_statement')!.textLimits;
    const header = slide.nested_groups.core_content?.find((component) => component.type === 'header');
    const body = slide.nested_groups.core_content?.find((component) => component.type === 'body');

    expect(limits.header).toBeLessThan(staticLimits.header!);
    expect(limits.body).toBeLessThan(staticLimits.body!);
    expect(header?.text?.length).toBeLessThanOrEqual(limits.header!);
    expect(body?.text?.length).toBeLessThanOrEqual(limits.body!);
  });

  it('repairs incomplete slides when AI returns an empty checklist', async () => {
    const incomplete = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'cover_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [],
            core_content: [{ type: 'header', text: 'AI untuk UMKM' }],
            action_footer: [],
          },
        },
        {
          slide_number: 2,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'checklist_stack',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'BENEFIT' }],
            core_content: [
              { type: 'header', text: 'Keunggulan AI' },
              { type: 'checklist', items: [] },
            ],
            action_footer: [],
          },
        },
      ],
    });
    const repaired = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'cover_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [],
            core_content: [{ type: 'header', text: 'AI untuk UMKM' }],
            action_footer: [],
          },
        },
        {
          slide_number: 2,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'checklist_stack',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'BENEFIT' }],
            core_content: [
              { type: 'header', text: 'Keunggulan AI' },
              { type: 'checklist', items: ['Otomatisasi promosi rutin', 'Analisis pelanggan lebih cepat', 'Konten lebih mudah dibuat'] },
            ],
            action_footer: [],
          },
        },
      ],
    });
    const deps = makeDepsSequence([incomplete, repaired]);
    const planner = new DefaultSduiPlanner(deps);

    const result = await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: 'Buat konten manfaat AI untuk UMKM',
      aspectRatio: '1:1',
      slideCount: 2,
      maxSlides: 5,
      tone: 'professional',
    }, AbortSignal.timeout(30_000));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(deps.wrapper.execute).toHaveBeenCalledTimes(2);
    const checklist = result.value.slides[1]!.nested_groups.core_content?.find((component) => component.type === 'checklist');
    expect(checklist?.items?.length).toBeGreaterThanOrEqual(2);
  });

  it('repairs explicit image requests when AI returns no image placeholders', async () => {
    const noImage = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'cover_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [],
            core_content: [
              { type: 'header', text: 'Pemanfaatan AI' },
              { type: 'body', text: 'AI membantu pekerjaan promosi lebih efisien.' },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 2,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'text_stack',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'MANFAAT' }],
            core_content: [
              { type: 'header', text: 'Promosi Lebih Mudah' },
              { type: 'body', text: 'Gunakan AI untuk membuat ide konten dan caption.' },
            ],
            action_footer: [],
          },
        },
      ],
    });
    const withImage = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'cover_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [],
            core_content: [
              { type: 'header', text: 'Pemanfaatan AI' },
              { type: 'body', text: 'AI membantu pekerjaan promosi lebih efisien.' },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 2,
          slide_type: 'content',
          container_layout: 'split_screen',
          layout_variant_id: 'split_text_left_image_right',
          image_requirement: 'required',
          typography_scale: 'balanced_classic',
          contentDirection: 'row',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'ILUSTRASI' }],
            core_content: [
              { type: 'header', text: 'AI untuk Promosi' },
              { type: 'body', text: 'Visual menunjukkan alur promosi yang dibantu AI.' },
              { type: 'image_placeholder', requires_generation: true, image_object_context: 'friendly illustration of a small business owner using AI marketing tools' },
            ],
            action_footer: [],
          },
        },
      ],
    });
    const deps = makeDepsSequence([noImage, withImage]);
    const planner = new DefaultSduiPlanner(deps);

    const result = await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: 'Buat carrousel tentang pemanfaatan AI, minimalnya dengan image.',
      aspectRatio: '1:1',
      slideCount: 2,
      maxSlides: 5,
      tone: 'professional',
    }, AbortSignal.timeout(30_000));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(deps.wrapper.execute).toHaveBeenCalledTimes(1);
    expect(result.value.slides.some((slide) =>
      slide.nested_groups.core_content?.some((component) => component.type === 'image_placeholder'),
    )).toBe(true);
  });

  it('repairs the UMKM benefits prompt when an AI draft leaves one content slide header-only', async () => {
    const incomplete = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'cover_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [],
            core_content: [{ type: 'header', text: 'AI untuk Promosi UMKM' }],
            action_footer: [],
          },
        },
        {
          slide_number: 2,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'text_stack',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'MANFAAT' }],
            core_content: [
              { type: 'header', text: 'Promosi Lebih Cepat' },
              { type: 'body', text: 'AI membantu membuat ide konten dan caption lebih efisien.' },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 3,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'checklist_stack',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'BENEFIT' }],
            core_content: [
              { type: 'header', text: 'Benefit Utama' },
              { type: 'checklist', items: [] },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 4,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'text_stack',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'AKSI' }],
            core_content: [
              { type: 'header', text: 'Mulai dari Konten Rutin' },
              { type: 'body', text: 'Tentukan produk unggulan, target pembeli, dan jadwal posting mingguan.' },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 5,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'header_body_cta',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'LANGKAH' }],
            core_content: [
              { type: 'header', text: 'Gunakan AI sebagai Asisten' },
              { type: 'body', text: 'Mulai dari riset ide, draft caption, lalu evaluasi performa konten.' },
            ],
            action_footer: [{ type: 'button_cta', label: 'Mulai Sekarang', style: 'primary' }],
          },
        },
      ],
    });
    const repaired = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'cover_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [],
            core_content: [{ type: 'header', text: 'AI untuk Promosi UMKM' }],
            action_footer: [],
          },
        },
        {
          slide_number: 2,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'text_stack',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'MANFAAT' }],
            core_content: [
              { type: 'header', text: 'Promosi Lebih Cepat' },
              { type: 'body', text: 'AI membantu membuat ide konten dan caption lebih efisien.' },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 3,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'checklist_stack',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'BENEFIT' }],
            core_content: [
              { type: 'header', text: 'Benefit Utama' },
              { type: 'checklist', items: ['Ide konten lebih cepat', 'Caption lebih konsisten', 'Evaluasi performa lebih mudah'] },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 4,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'text_stack',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'AKSI' }],
            core_content: [
              { type: 'header', text: 'Mulai dari Konten Rutin' },
              { type: 'body', text: 'Tentukan produk unggulan, target pembeli, dan jadwal posting mingguan.' },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 5,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'header_body_cta',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'LANGKAH' }],
            core_content: [
              { type: 'header', text: 'Gunakan AI sebagai Asisten' },
              { type: 'body', text: 'Mulai dari riset ide, draft caption, lalu evaluasi performa konten.' },
            ],
            action_footer: [{ type: 'button_cta', label: 'Mulai Sekarang', style: 'primary' }],
          },
        },
      ],
    });
    const deps = makeDepsSequence([incomplete, repaired]);
    const planner = new DefaultSduiPlanner(deps);

    const result = await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: 'Buat tentang manfaat penggunaan AI untuk promosi usaha UMKM, berikan list juga benefitnya apa dan apa yang harus dilakukan',
      aspectRatio: '1:1',
      slideCount: 5,
      maxSlides: 5,
      tone: 'professional',
    }, AbortSignal.timeout(30_000));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(deps.wrapper.execute).toHaveBeenCalledTimes(2);
    expect(result.value.slides).toHaveLength(5);
    expect(result.value.slides.filter((slide) => slide.slide_type === 'content').every(hasMeaningfulSupport)).toBe(true);
  });

  it('returns a repairable plan with quality warnings when completeness repair still leaves a header-only slide', async () => {
    const incomplete = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'cover_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [],
            core_content: [{ type: 'header', text: 'AI untuk UMKM' }],
            action_footer: [],
          },
        },
        {
          slide_number: 2,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'text_stack',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'BENEFIT' }],
            core_content: [
              { type: 'header', text: 'Promosi Lebih Mudah' },
              { type: 'body', text: '' },
            ],
            action_footer: [],
          },
        },
      ],
    });
    const deps = makeDepsSequence([incomplete, incomplete]);
    const planner = new DefaultSduiPlanner(deps);

    const result = await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: 'Buat manfaat AI untuk UMKM',
      aspectRatio: '1:1',
      slideCount: 2,
      maxSlides: 5,
      tone: 'professional',
    }, AbortSignal.timeout(30_000));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(deps.wrapper.execute).toHaveBeenCalledTimes(2);
    expect(result.value.slides).toHaveLength(2);
    expect(result.value.qualityWarnings?.join('; ')).toContain('content slide cannot be headline-only');
  });

  it('repairs semantically incomplete body and checklist text', async () => {
    const incomplete = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'cover_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [],
            core_content: [{ type: 'header', text: 'AI untuk UMKM' }],
            action_footer: [],
          },
        },
        {
          slide_number: 2,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'checklist_with_body',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'MASALAH' }],
            core_content: [
              { type: 'header', text: 'Hambatan Konten' },
              { type: 'body', text: 'Tim sering kesulitan menjaga ritme posting yang' },
              { type: 'checklist', items: ['Hubungan emosional yang', 'Ide konten belum konsisten'] },
            ],
            action_footer: [],
          },
        },
      ],
    });
    const repaired = JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'cover_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [],
            core_content: [{ type: 'header', text: 'AI untuk UMKM' }],
            action_footer: [],
          },
        },
        {
          slide_number: 2,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'checklist_with_body',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'MASALAH' }],
            core_content: [
              { type: 'header', text: 'Hambatan Konten' },
              { type: 'body', text: 'Tim sulit menjaga ritme posting secara konsisten.' },
              { type: 'checklist', items: ['Bangun koneksi emosional', 'Jaga ide konten tetap konsisten'] },
            ],
            action_footer: [],
          },
        },
      ],
    });
    const deps = makeDepsSequence([incomplete, repaired]);
    const planner = new DefaultSduiPlanner(deps);

    const result = await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: 'Buat masalah konten UMKM',
      aspectRatio: '1:1',
      slideCount: 2,
      maxSlides: 5,
      tone: 'professional',
    }, AbortSignal.timeout(30_000));

    expect(result.ok).toBe(true);
    expect(deps.wrapper.execute).toHaveBeenCalledTimes(2);
    if (!result.ok) throw new Error('expected ok');
    const content = result.value.slides[1]!.nested_groups.core_content ?? [];
    const body = content.find((component) => component.type === 'body');
    const checklist = content.find((component) => component.type === 'checklist');
    expect(body?.text).toBe('Tim sulit menjaga ritme posting secara konsisten.');
    expect(checklist?.items).toEqual(['Bangun koneksi emosional', 'Jaga ide konten tetap konsisten']);
  });

  it('keeps layout_variant_id and image_requirement on parsed slides', async () => {
    const planner = new DefaultSduiPlanner(makeDeps(JSON.stringify({
      chosen_reference_id: null,
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'gw_poster_cover',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'EDUKASI' }],
            core_content: [
              { type: 'header', text: 'Topik Sensitif' },
              { type: 'body', text: 'Gunakan teks yang jelas dan aman.' },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 2,
          slide_type: 'content',
          container_layout: 'split_screen',
          layout_variant_id: 'gw_photo_statement',
          image_requirement: 'required',
          typography_scale: 'balanced_classic',
          contentDirection: 'row',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'CONTOH' }],
            core_content: [
              { type: 'header', text: 'Contoh Produk' },
              { type: 'body', text: 'Visual membantu memahami konteks.' },
              { type: 'image_placeholder', requires_generation: true, image_object_context: 'clean product dashboard example' },
            ],
            action_footer: [],
          },
        },
      ],
    })));

    const result = await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: 'Buat carousel edukasi dengan contoh produk',
      aspectRatio: '1:1',
      slideCount: 2,
      maxSlides: 5,
      tone: 'professional',
    }, AbortSignal.timeout(30_000));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.slides[0]!.layout_variant_id).toBe('gw_poster_cover');
    expect(result.value.slides[0]!.layout_family).toBe('poster');
    expect(result.value.slides[0]!.image_requirement).toBe('none');
    expect(result.value.slides[0]!.image_status).toBe('not_needed');
    expect(result.value.slides[1]!.layout_variant_id).toBe('gw_photo_statement');
    expect(result.value.slides[1]!.layout_family).toBe('photo');
    expect(result.value.slides[1]!.image_requirement).toBe('required');
  });

  it('infers optional image_requirement when older AI output includes image_placeholder', async () => {
    const planner = new DefaultSduiPlanner(makeDeps(JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'background_overlay',
          layout_variant_id: 'cover_image_full',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [],
            core_content: [
              { type: 'header', text: 'Produk Baru' },
              { type: 'image_placeholder', requires_generation: true, image_object_context: 'new product photo' },
            ],
            action_footer: [],
          },
        },
      ],
    })));

    const result = await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: 'Buat carousel produk',
      aspectRatio: '1:1',
      slideCount: 1,
      maxSlides: 5,
      tone: 'professional',
    }, AbortSignal.timeout(30_000));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.slides[0]!.image_requirement).toBe('required');
  });

  it('upgrades visual-led promo/product decks to several required image slides', () => {
    const slides: SduiSlide[] = Array.from({ length: 5 }, (_, index) => ({
      slide_number: index + 1,
      slide_type: index === 0 ? 'cover' : 'content',
      container_layout: 'text_dominant',
      layout_variant_id: index === 0 ? 'cover_centered' : 'text_stack',
      image_requirement: 'none',
      layout_source: 'ai_selected',
      typography_scale: 'balanced_classic',
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'PROMO' }],
        core_content: [
          { type: 'header', text: index === 0 ? 'Lampu Artisan' : `Detail ${index}` },
          { type: 'body', text: 'Material premium dan cahaya warm untuk studio kreatif.' },
        ],
        action_footer: [],
      },
    }));

    const result = ensureExplicitImageRequest(
      'Carousel promo produk lampu meja artisan, banyak visual lampu dan mood studio',
      slides,
    );

    const imageSlides = result.filter((slide) =>
      (['top_meta', 'core_content', 'action_footer'] as const)
        .some((group) => (slide.nested_groups[group] ?? []).some((component) => component.type === 'image_placeholder')),
    );
    expect(imageSlides).toHaveLength(3);
    expect(imageSlides.every((slide) => slide.image_requirement === 'required')).toBe(true);
  });

  it('adds image_placeholder when visual_layer carries generated artwork for an image prompt', async () => {
    const planner = new DefaultSduiPlanner(makeDeps(JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'cover_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'HOOK' }],
            core_content: [
              { type: 'header', text: 'Lead Hilang Diam-Diam' },
              { type: 'body', text: 'Follow-up lambat membuat peluang cepat dingin.' },
            ],
            action_footer: [],
          },
        },
        {
          slide_number: 2,
          slide_type: 'content',
          container_layout: 'text_dominant',
          layout_variant_id: 'text_stack',
          image_requirement: 'required',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'VISUAL' }],
            core_content: [
              { type: 'header', text: 'Sinyal Tercecer' },
              { type: 'body', text: 'Lead masuk dari banyak channel dan tidak segera ditangani.' },
              {
                type: 'visual_layer',
                visual_treatment: 'ui_mockup_board',
                visual_brief: 'modern SaaS dashboard mockup with floating lead cards and connector lines',
                anchor: 'center',
                allowedOverflow: true,
              },
            ],
            action_footer: [],
          },
        },
      ],
    })));

    const result = await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: 'Buat carousel dengan gambar modern SaaS, floating cards, connector lines',
      aspectRatio: '1:1',
      slideCount: 2,
      maxSlides: 5,
      tone: 'professional',
    }, AbortSignal.timeout(30_000));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const slide = result.value.slides[1]!;
    const image = slide.nested_groups.core_content?.find((component) => component.type === 'image_placeholder');
    expect(image?.image_object_context).toContain('modern SaaS dashboard mockup');
    expect(slide.image_requirement).toBe('required');
    expect(slide.layout_variant_id).toBe('gw_photo_statement');
  });

  it('extracts JSON when provider wraps the planner response in extra text', async () => {
    const wrapped = `Sure, here is the JSON:\n${JSON.stringify({
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          container_layout: 'text_dominant',
          layout_variant_id: 'cover_centered',
          image_requirement: 'none',
          typography_scale: 'balanced_classic',
          nested_groups: {
            top_meta: [{ type: 'tag', text: 'EDUKASI' }],
            core_content: [
              { type: 'header', text: 'Follow-Up Cepat' },
              { type: 'body', text: 'Respons cepat membantu lead tetap hangat.' },
            ],
            action_footer: [],
          },
        },
      ],
    })}\nDone.`;
    const planner = new DefaultSduiPlanner(makeDeps(wrapped));

    const result = await planner.plan({
      teamId: 'team-1',
      jobId: 'job-1',
      actorId: 'actor-1',
      prompt: 'Buat carousel edukasi',
      aspectRatio: '1:1',
      slideCount: 1,
      maxSlides: 5,
      tone: 'professional',
    }, AbortSignal.timeout(30_000));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.slides[0]!.nested_groups.core_content?.[0]?.text).toBe('Follow-Up Cepat');
  });
});
