import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { getLayoutCatalogItem } from '@leads-generator/shared';
import type { BrandKit, CarouselWorkflowArtifact, MasterTemplate, SduiSlide } from '@leads-generator/shared';
import type { SduiCarouselWorkerDeps } from './sdui-carousel-worker.js';
import { processSduiCarouselJob } from './sdui-carousel-worker.js';
import { resolveSduiTextLimits } from './sdui-text-guardrails.js';

function brandKit(): BrandKit {
  return {
    id: 'brand-1',
    teamId: 'team-1',
    logoUrl: '',
    colors: ['#187DB4', '#1a1d24'],
    fonts: [],
    chrome: {
      logoPlacement: 'none',
      siteUrl: 'example.com',
      pageNumberFormat: '{current}/{total}',
    },
    typography: {
      header: { fontFamily: '', color: '#1a1d24' },
      body: { fontFamily: '', color: '#5b626e' },
      highlightColor: '#187DB4',
      background: '#F4F3EF',
      paginationColor: '#5b626e',
      metaTextColor: '#5b626e',
      accent: '#187DB4',
    },
    updatedAt: new Date(),
  };
}

function masterTemplate(): MasterTemplate {
  return {
    id: 'template-1',
    teamId: 'team-1',
    brandKitId: 'brand-1',
    allowedBlocks: ['heading', 'body', 'image'],
    maxSlides: 5,
    textLimits: [],
    aspectRatios: ['1:1'],
    defaultTone: 'professional',
    updatedAt: new Date(),
  };
}

function textSlide(n: number): SduiSlide {
  return {
    slide_number: n,
    slide_type: n === 1 ? 'cover' : 'content',
    container_layout: 'text_dominant',
    layout_variant_id: n === 1 ? 'cover_centered' : 'text_stack',
    image_requirement: 'none',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: `S${n}` }],
      core_content: [
        { type: 'header', text: n === 1 ? 'Cover' : 'Text Slide' },
        { type: 'body', text: 'Body text' },
      ],
      action_footer: [],
    },
  };
}

function overlongTextSlide(): SduiSlide {
  return {
    slide_number: 1,
    slide_type: 'content',
    container_layout: 'text_dominant',
    layout_variant_id: 'text_stack',
    image_requirement: 'none',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'TAG YANG TERLALU PANJANG' }],
      core_content: [
        { type: 'header', text: 'H'.repeat(120) },
        { type: 'body', text: 'B'.repeat(220) },
      ],
      action_footer: [],
    },
  };
}

function imageSlide(n = 2): SduiSlide {
  return {
    slide_number: n,
    slide_type: 'content',
    container_layout: 'split_screen',
    layout_variant_id: 'split_text_left_image_right',
    image_requirement: 'required',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    contentDirection: 'row',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'VISUAL' }],
      core_content: [
        { type: 'header', text: 'Visual Proof' },
        { type: 'body', text: 'Needs image' },
        { type: 'image_placeholder', requires_generation: true, image_object_context: 'clean product dashboard' },
      ],
      action_footer: [],
    },
  };
}

function optionalImageSlide(n = 2): SduiSlide {
  return {
    ...imageSlide(n),
    image_requirement: 'optional',
  };
}

function emptyChecklistSlide(n = 2): SduiSlide {
  return {
    slide_number: n,
    slide_type: 'content',
    container_layout: 'text_dominant',
    layout_variant_id: 'checklist_stack',
    image_requirement: 'none',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'BENEFIT' }],
      core_content: [
        { type: 'header', text: 'Keunggulan AI' },
        { type: 'checklist', items: [] },
      ],
      action_footer: [],
    },
  };
}

function checklistSlide(n = 3): SduiSlide {
  return {
    slide_number: n,
    slide_type: 'content',
    container_layout: 'text_dominant',
    layout_variant_id: 'checklist_stack',
    image_requirement: 'none',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'BENEFIT' }],
      core_content: [
        { type: 'header', text: 'Benefit Utama' },
        { type: 'checklist', items: ['Ide konten cepat', 'Caption konsisten', 'Evaluasi mudah'] },
      ],
      action_footer: [],
    },
  };
}

function missingImagePlaceholderTextSlide(n = 4): SduiSlide {
  return {
    slide_number: n,
    slide_type: 'content',
    container_layout: 'split_screen',
    layout_variant_id: 'split_text_left_image_right',
    image_requirement: 'required',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    contentDirection: 'row',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'PRAKTIK CERDAS' }],
      core_content: [
        { type: 'header', text: 'Contoh Implementasi' },
        { type: 'body', text: 'Gunakan AI untuk membuat deskripsi produk yang persuasif dan postingan media sosial.' },
      ],
      action_footer: [],
    },
  };
}

function headerOnlyTextSlide(n = 2): SduiSlide {
  return {
    slide_number: n,
    slide_type: 'content',
    container_layout: 'text_dominant',
    layout_variant_id: 'text_stack',
    image_requirement: 'none',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'BENEFIT' }],
      core_content: [
        { type: 'header', text: 'Benefit AI untuk Promosi' },
        { type: 'body', text: '   ' },
      ],
      action_footer: [],
    },
  };
}

function sparseBenefitSlide(n = 2): SduiSlide {
  return {
    slide_number: n,
    slide_type: 'content',
    container_layout: 'text_dominant',
    layout_variant_id: 'text_stack',
    image_requirement: 'none',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'BENEFIT' }],
      core_content: [
        { type: 'header', text: 'Manfaat AI untuk Tim Sales' },
      ],
      action_footer: [],
    },
  };
}

function oneImageMultiImageSlide(n = 2): SduiSlide {
  return {
    slide_number: n,
    slide_type: 'content',
    container_layout: 'split_screen',
    layout_variant_id: 'mini_gallery_3up',
    image_requirement: 'optional',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'GALLERY' }],
      core_content: [
        { type: 'header', text: 'Tiga Contoh Visual' },
        { type: 'body', text: 'Satu gambar saja tidak cukup untuk layout galeri tiga panel.' },
        { type: 'image_placeholder', requires_generation: true, image_object_context: 'single visual example' },
      ],
      action_footer: [],
    },
  };
}

function incompleteBodySlide(n = 3): SduiSlide {
  return {
    slide_number: n,
    slide_type: 'content',
    container_layout: 'text_dominant',
    layout_variant_id: 'text_stack',
    image_requirement: 'none',
    layout_source: 'ai_selected',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'INSIGHT' }],
      core_content: [
        { type: 'header', text: 'Kalimat yang Belum Selesai' },
        { type: 'body', text: 'Konten ini berhenti pada frasa yang menggantung,' },
      ],
      action_footer: [],
    },
  };
}

function ctaSlide(n = 5): SduiSlide {
  return {
    ...textSlide(n),
    layout_variant_id: 'cta_centered',
    layout_family: 'cta',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'LANGKAH' }],
      core_content: [
        { type: 'header', text: 'Mulai Hari Ini' },
      ],
      action_footer: [{ type: 'button_cta', label: 'Mulai Sekarang', style: 'primary' }],
    },
  };
}

function repairedNoImageSlide(n = 2): SduiSlide {
  return {
    ...textSlide(n),
    slide_type: 'content',
    layout_variant_id: 'text_stack',
    image_requirement: 'none',
    layout_source: 'ai_repaired_after_image_failure',
    image_status: 'provider_failed_repaired',
  };
}

async function png(): Promise<Buffer> {
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: { r: 24, g: 125, b: 180, alpha: 1 },
    },
  }).png().toBuffer();
}

function makeDeps(overrides: {
  slides: SduiSlide[];
  plannerError?: { kind: 'non_json' } | { kind: 'validation_error'; message: string } | { kind: 'provider_error'; message: string };
  imageResult?: { ok: true; value: Buffer } | { ok: false; error: { code: 'INTERNAL'; message: string } };
  repairSlides?: SduiSlide[];
  prompt?: string;
  typographyOverride?: { coverSizePx?: number; headerSizePx?: number; bodySizePx?: number };
  workflow?: CarouselWorkflowArtifact;
}): SduiCarouselWorkerDeps & {
  renderedSlides: SduiSlide[];
  updatedInputs: Record<string, unknown>[];
} {
  const renderedSlides: SduiSlide[] = [];
  const updatedInputs: Record<string, unknown>[] = [];
  const planner = {
    plan: vi.fn(async () => {
      if (overrides.plannerError) return { ok: false as const, error: overrides.plannerError };
      if (!overrides.repairSlides) return { ok: false as const, error: { kind: 'provider_error' as const, message: 'no repair' } };
      return { ok: true as const, value: { slides: overrides.repairSlides } };
    }),
  };
  const deps = {
    planner,
    renderer: {
      renderSlide: vi.fn(async (slide: SduiSlide) => {
        renderedSlides.push(JSON.parse(JSON.stringify(slide)) as SduiSlide);
        return Buffer.from('rendered');
      }),
    },
    imageClient: {
      generate: vi.fn(async () => overrides.imageResult ?? { ok: true as const, value: Buffer.from('') }),
    },
    storage: {
      upload: vi.fn(async (_teamId: string, key: string) => ({ ok: true as const, value: `https://cdn.example.com/${key}` })),
      resolveForTeam: vi.fn(),
    },
    jobRepo: {
      findById: vi.fn(async () => ({
        id: 'job-1',
        teamId: 'team-1',
        masterTemplateId: 'template-1',
        prompt: overrides.prompt ?? 'test prompt',
        aspectRatio: '1:1',
        status: 'pending',
        reason: null,
        inputs: {
          requestedSlideCount: overrides.slides.length,
          ...(overrides.slides.length > 0 ? { sduiSlides: overrides.slides } : {}),
          ...(overrides.workflow ? { workflow: overrides.workflow } : {}),
          ...(overrides.typographyOverride ? { typographyOverride: overrides.typographyOverride } : {}),
        },
        createdAt: new Date(),
        finishedAt: null,
      })),
      setStatus: vi.fn(),
      setFinishedAt: vi.fn(),
      updateInputs: vi.fn(async (_teamId: string, _jobId: string, inputs: Record<string, unknown>) => {
        updatedInputs.push(inputs);
      }),
    },
    slideRepo: {
      insertSlide: vi.fn(),
      updateSlide: vi.fn(),
      listSlides: vi.fn(),
    },
    masterTemplateRepo: {
      findByTeam: vi.fn(async () => masterTemplate()),
    },
    brandKitRepo: {
      findByTeam: vi.fn(async () => brandKit()),
    },
    redisUrl: 'redis://localhost:6379',
    renderedSlides,
    updatedInputs,
  } as unknown as SduiCarouselWorkerDeps & { renderedSlides: SduiSlide[]; updatedInputs: Record<string, unknown>[] };
  return deps;
}

describe('processSduiCarouselJob image-aware worker flow', () => {
  it('uses a worker fallback deck instead of failing CONTENT_PLAN_VALIDATION_ERROR when the initial planner output is invalid', async () => {
    const deps = makeDeps({
      slides: [],
      plannerError: { kind: 'validation_error', message: 'bad plan' },
      prompt: 'Buat carousel edukasi tentang strategi konten kreatif untuk brand lokal.',
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    expect(deps.renderer.renderSlide).toHaveBeenCalled();
    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');
    expect(deps.updatedInputs[0]).toMatchObject({
      plannerFallbackUsed: true,
      plannerFailureStage: 'initial_plan',
    });
    expect(deps.jobRepo.setStatus).not.toHaveBeenCalledWith('team-1', 'job-1', 'failed', 'validation_error');
  });

  it('applies selected layout text guardrails to reviewed draft slides before render', async () => {
    const deps = makeDeps({
      slides: [overlongTextSlide()],
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    const rendered = deps.renderedSlides[0]!;
    const adaptiveLimits = resolveSduiTextLimits(rendered.layout_variant_id, undefined, rendered);
    const tag = rendered.nested_groups.top_meta?.[0];
    const header = rendered.nested_groups.core_content?.find((component) => component.type === 'header');
    const body = rendered.nested_groups.core_content?.find((component) => component.type === 'body');

    expect(tag?.text?.length).toBeLessThanOrEqual(adaptiveLimits.tag);
    expect(header?.text?.length).toBeLessThanOrEqual(adaptiveLimits.header!);
    expect(body?.text?.length).toBeLessThanOrEqual(adaptiveLimits.body!);
    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');
  });

  it('uses per-job typography size override as the text guardrail reference', async () => {
    const typographyOverride = { coverSizePx: 96, headerSizePx: 96, bodySizePx: 44 };
    const deps = makeDeps({
      slides: [overlongTextSlide()],
      typographyOverride,
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    const rendered = deps.renderedSlides[0]!;
    const adaptiveLimits = resolveSduiTextLimits(rendered.layout_variant_id, { typography: typographyOverride }, rendered);
    const staticLimits = getLayoutCatalogItem(rendered.layout_variant_id)!.textLimits;
    const header = rendered.nested_groups.core_content?.find((component) => component.type === 'header');
    const body = rendered.nested_groups.core_content?.find((component) => component.type === 'body');

    expect(adaptiveLimits.header).toBeLessThan(staticLimits.header!);
    expect(adaptiveLimits.body).toBeLessThan(staticLimits.body!);
    expect(header?.text?.length).toBeLessThanOrEqual(adaptiveLimits.header!);
    expect(body?.text?.length).toBeLessThanOrEqual(adaptiveLimits.body!);
    expect(deps.updatedInputs[0]!.typographyOverride).toMatchObject(typographyOverride);
  });

  it('repairs a headline-only slide from an empty checklist draft before render', async () => {
    const deps = makeDeps({
      slides: [textSlide(1), emptyChecklistSlide(2)],
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    const repaired = deps.renderedSlides[1]!;
    const checklist = repaired.nested_groups.core_content?.find((component) => component.type === 'checklist');
    const body = repaired.nested_groups.core_content?.find((component) => component.type === 'body');
    expect((checklist?.items?.length ?? 0) + (body?.text?.trim().length ? 1 : 0)).toBeGreaterThanOrEqual(1);
    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');
  });

  it('repairs a text layout whose body is empty before render', async () => {
    const deps = makeDeps({
      slides: [textSlide(1), headerOnlyTextSlide(2)],
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    const repaired = deps.renderedSlides[1]!;
    const body = repaired.nested_groups.core_content?.find((component) => component.type === 'body');
    expect(body?.text).toContain('Benefit AI untuk Promosi');
    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');
  });

  it('densifies sparse content slides and avoids text-safe layout fallback when richer structure fits', async () => {
    const deps = makeDeps({
      slides: [textSlide(1), sparseBenefitSlide(2)],
      prompt: 'Buat carousel tentang benefit AI untuk tim sales B2B.',
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    const repaired = deps.renderedSlides[1]!;
    const cards = repaired.nested_groups.core_content?.find((component) => component.type === 'feature_cards');
    expect(['feature_cards_with_header', 'feature_cards_grid']).toContain(repaired.layout_variant_id);
    expect(cards?.items_cards?.length).toBeGreaterThanOrEqual(2);
    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');
  });

  it('does not keep a multi-image layout when the slide only has one image placeholder', async () => {
    const deps = makeDeps({
      slides: [textSlide(1), oneImageMultiImageSlide(2)],
      imageResult: { ok: true, value: await png() },
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    const repaired = deps.renderedSlides[1]!;
    expect(repaired.layout_variant_id).not.toBe('mini_gallery_3up');
    expect(getLayoutCatalogItem(repaired.layout_variant_id)?.family).not.toBe('multi_image');
    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');
  });

  it('uses deterministic quality repair instead of failing layout_unsatisfiable for headline-only and incomplete text', async () => {
    const deps = makeDeps({
      slides: [textSlide(1), headerOnlyTextSlide(2), incompleteBodySlide(3)],
      prompt: 'bahaya pornografi untuk rumah tangga dan pencegahannya',
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    const second = deps.renderedSlides[1]!;
    const third = deps.renderedSlides[2]!;
    const secondBody = second.nested_groups.core_content?.find((component) => component.type === 'body');
    const thirdBody = third.nested_groups.core_content?.find((component) => component.type === 'body');

    expect(secondBody?.text?.trim().length).toBeGreaterThan(0);
    expect(thirdBody?.text).not.toMatch(/[,;:–-]\s*$/u);
    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');
    expect(deps.jobRepo.setStatus).not.toHaveBeenCalledWith('team-1', 'job-1', 'failed', 'layout_unsatisfiable');
  });

  it('does not turn a non-stat slide into stat_highlight when an image-required draft is missing its placeholder', async () => {
    const deps = makeDeps({
      slides: [textSlide(1), textSlide(2), checklistSlide(3), missingImagePlaceholderTextSlide(4), ctaSlide(5)],
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    const fourth = deps.renderedSlides[3]!;
    const header = fourth.nested_groups.core_content?.find((component) => component.type === 'header');

    expect(fourth.layout_variant_id).not.toBe('stat_highlight');
    expect(['text', 'editorial']).toContain(fourth.layout_family);
    expect(fourth.image_requirement).toBe('none');
    expect(fourth.image_status).toBe('not_needed');
    expect(header?.text).toBe('Contoh Implementasi');
    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');
  });

  it('repairs an explicit image request instead of succeeding with no image placeholders', async () => {
    const deps = makeDeps({
      prompt: 'Buat carrousel tentang pemanfaatan AI, minimalnya dengan image.',
      slides: [textSlide(1), textSlide(2), checklistSlide(3), textSlide(4), ctaSlide(5)],
      repairSlides: [textSlide(1), imageSlide(2), checklistSlide(3), textSlide(4), ctaSlide(5)],
      imageResult: { ok: true, value: await png() },
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    expect(deps.planner.plan).not.toHaveBeenCalled();
    expect(deps.imageClient.generate).toHaveBeenCalledTimes(3);
    const renderedImageSlide = deps.renderedSlides.find((slide) =>
      slide.nested_groups.core_content?.some((component) => component.type === 'image_placeholder'),
    );
    expect(renderedImageSlide?.image_status).toBe('generated');
    expect(renderedImageSlide?.image_requirement).toBe('required');
    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');
  });

  it('does not persist base64 image data into job inputs (DB bloat guard)', async () => {
    const deps = makeDeps({
      slides: [textSlide(1), imageSlide(2)],
      imageResult: { ok: true, value: await png() },
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');

    // The renderer MUST still receive the inline base64 image for this run…
    const renderedImageSlide = deps.renderedSlides.find((s) =>
      s.nested_groups.core_content?.some((c) => c.type === 'image_placeholder'),
    );
    const renderedImgComp = renderedImageSlide?.nested_groups.core_content?.find(
      (c) => c.type === 'image_placeholder',
    );
    expect(renderedImgComp?.imageUrl?.startsWith('data:image')).toBe(true);

    // …but the persisted job inputs must NOT carry the base64 (pure DB bloat).
    const persisted = deps.updatedInputs
      .map((i) => i.sduiSlides as SduiSlide[] | undefined)
      .filter((s): s is SduiSlide[] => Array.isArray(s));
    const lastPersist = persisted[persisted.length - 1]!;
    const anyBase64 = lastPersist.some((s) =>
      (['top_meta', 'core_content', 'action_footer'] as const).some((g) =>
        (s.nested_groups[g] ?? []).some(
          (c) => typeof c.imageUrl === 'string' && c.imageUrl.startsWith('data:'),
        ),
      ),
    );
    expect(anyBase64).toBe(false);
  });

  it('renders slides from workflow input and persists rendered workflow artifact', async () => {
    const workflow: CarouselWorkflowArtifact = {
      version: 1,
      workflowStage: 'prompts',
      source: 'planning',
      outline: [{ slide_number: 1, role: 'cover', headline: 'Workflow Cover' }],
      designSystemSnapshot: {
        colors: ['#187DB4'],
        fonts: [],
        chrome: { logoPlacement: 'none', siteUrl: 'example.com', pageNumberFormat: '{current}/{total}' },
      },
      slidePrompts: [{ slide_number: 1, prompt: 'Slide 1 prompt', exactHeadline: 'Workflow Cover' }],
      slides: [{ slide_number: 1, reviewStatus: 'approved', sduiSlide: textSlide(1) }],
      caption: { hook: 'Workflow Cover', body: 'Body', cta: 'Save', hashtags: ['#carousel'] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const deps = makeDeps({ slides: [], workflow });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    expect(deps.planner.plan).not.toHaveBeenCalled();
    expect(deps.renderer.renderSlide).toHaveBeenCalledOnce();
    const persistedWorkflow = deps.updatedInputs.at(-1)?.workflow as CarouselWorkflowArtifact | undefined;
    expect(persistedWorkflow?.workflowStage).toBe('rendered');
    expect(persistedWorkflow?.slides[0]?.renderedImageUrl).toBe('https://cdn.example.com/jobs/job-1/slide-0.png');
    expect(persistedWorkflow?.slidePrompts[0]?.prompt).toContain('Do not render text inside the generated image');
  });

  it('keeps an image-focused layout when image generation succeeds', async () => {
    const deps = makeDeps({
      prompt: 'generate gambar untuk topik keamanan digital, buat style image doodle minimalist',
      slides: [textSlide(1), imageSlide(2)],
      imageResult: { ok: true, value: await png() },
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    expect(deps.imageClient.generate).toHaveBeenCalledOnce();
    expect((deps.imageClient.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({
      prompt: 'clean product dashboard',
      stylePrompt: 'doodle minimalist',
      aspectRatio: '1:1',
      kind: 'content',
    });
    expect(deps.planner.plan).not.toHaveBeenCalled();
    const renderedImageSlide = deps.renderedSlides[1]!;
    expect(renderedImageSlide.layout_variant_id).toBe('split_text_left_image_right');
    expect(renderedImageSlide.image_status).toBe('generated');
    expect(renderedImageSlide.nested_groups.core_content?.some((component) => component.type === 'image_placeholder' && Boolean(component.imageUrl))).toBe(true);
    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');
  });

  it('repairs failed optional image slides into no-image layouts and audits the repair', async () => {
    const deps = makeDeps({
      slides: [textSlide(1), optionalImageSlide(2), textSlide(3)],
      imageResult: { ok: false, error: { code: 'INTERNAL', message: 'provider down' } },
      repairSlides: [textSlide(1), repairedNoImageSlide(2), textSlide(3)],
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    expect(deps.planner.plan).toHaveBeenCalledOnce();
    expect((deps.planner.plan as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      repairMode: 'image_failure_no_image',
      failedImageSlideNumbers: [2],
    });
    const repaired = deps.renderedSlides[1]!;
    expect(repaired.image_requirement).toBe('none');
    expect(repaired.image_status).toBe('provider_failed_repaired');
    expect(repaired.layout_source).toBe('ai_repaired_after_image_failure');
    expect(repaired.nested_groups.core_content?.some((component) => component.type === 'image_placeholder')).toBe(false);
    const audit = deps.updatedInputs[0]!.layoutAudit as Array<Record<string, unknown>>;
    expect(audit[1]).toMatchObject({
      slide_number: 2,
      image_requirement: 'none',
      image_status: 'provider_failed_repaired',
      layout_source: 'ai_repaired_after_image_failure',
    });
    expect(deps.slideRepo.updateSlide).toHaveBeenCalledWith(
      'team-1',
      'job-1',
      1,
      expect.objectContaining({ usedFallback: true }),
    );
  });

  it('uses deterministic no-image fallback when AI repair still returns an image placeholder', async () => {
    const deps = makeDeps({
      slides: [textSlide(1), optionalImageSlide(2)],
      imageResult: { ok: false, error: { code: 'INTERNAL', message: 'provider down' } },
      repairSlides: [textSlide(1), imageSlide(2)],
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    const repaired = deps.renderedSlides[1]!;
    expect(repaired.image_requirement).toBe('none');
    expect(repaired.image_status).toBe('provider_failed_repaired');
    expect(repaired.layout_source).toBe('ai_repaired_after_image_failure');
    expect(repaired.nested_groups.core_content?.some((component) => component.type === 'image_placeholder')).toBe(false);
    expect(deps.slideRepo.updateSlide).toHaveBeenCalledWith(
      'team-1',
      'job-1',
      1,
      expect.objectContaining({ usedFallback: true }),
    );
    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');
  });

  it('uses deterministic no-image fallback when AI no-image repair fails', async () => {
    const deps = makeDeps({
      slides: [textSlide(1), optionalImageSlide(2)],
      imageResult: { ok: false, error: { code: 'INTERNAL', message: 'provider down' } },
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    const repaired = deps.renderedSlides[1]!;
    expect(repaired.image_requirement).toBe('none');
    expect(repaired.image_status).toBe('provider_failed_repaired');
    expect(repaired.nested_groups.core_content?.some((component) => component.type === 'image_placeholder')).toBe(false);
    expect(deps.jobRepo.setStatus).toHaveBeenLastCalledWith('team-1', 'job-1', 'success');
  });

  it('fails the job honestly when a required image slide cannot be generated after retry', async () => {
    const deps = makeDeps({
      slides: [textSlide(1), imageSlide(2), textSlide(3)],
      imageResult: { ok: false, error: { code: 'INTERNAL', message: 'provider down' } },
    });

    await processSduiCarouselJob(deps, { teamId: 'team-1', jobId: 'job-1', actorId: 'actor-1' });

    // Job must be marked failed — required image cannot silently disappear
    expect(deps.jobRepo.setStatus).toHaveBeenCalledWith('team-1', 'job-1', 'failed', 'provider_error');
    // Slide rows are inserted as 'pending' first to satisfy the
    // `slide_failed_has_reason` CHECK constraint (reason IS NOT NULL
    // when status = 'failed'). Failed slides are then marked via updateSlide.
    expect(deps.slideRepo.insertSlide).toHaveBeenCalledWith(
      expect.objectContaining({ index: 1, status: 'pending' }),
    );
    expect(deps.slideRepo.updateSlide).toHaveBeenCalledWith(
      'team-1',
      'job-1',
      1,
      expect.objectContaining({ status: 'failed', reason: 'provider_error' }),
    );
    // No slides should have been rendered (we exit before render loop)
    expect(deps.renderedSlides).toHaveLength(0);
    // Planner repair should NOT have been called
    expect(deps.planner.plan).not.toHaveBeenCalled();
  });
});
