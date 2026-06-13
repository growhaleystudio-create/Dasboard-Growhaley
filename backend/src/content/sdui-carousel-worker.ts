/**
 * sdui-carousel-worker.ts — BullMQ worker for the Server-Driven UI carousel
 * pipeline (feature-update.md v2).
 *
 * Pipeline per job (fail-fast, attempts: 1):
 *   1. Load job + optional master template + brand kit
 *   2. Build theme_config from the locked Brand Kit
 *   3. SDUI PLANNER → slides (No-Reference mode); enforce exact slide count
 *   4. For each slide needing an image → generate via image client (sync)
 *   5. SATORI RENDER each slide → PNG → upload → slide row
 *   6. All slides success → mark job success
 */

import { Worker, type Job } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import sharp from 'sharp';
import { LAYOUT_CATALOG, getLayoutCatalogItem, layoutFamilyFor, layoutSupportsImage } from '@leads-generator/shared';

import type {
  AspectRatio,
  BlockType,
  BrandKit,
  FailureReason,
  LayoutVariantId,
  SduiComponent,
  SduiDocument,
  SduiSlide,
  SduiSlideAudit,
  SduiThemeConfig,
  SduiTypographyOverride,
} from '@leads-generator/shared';

import type { ContentGenerationJobPayload } from './content-generator-service.js';
import { CONTENT_GENERATION_QUEUE_NAME } from './content-generator-service.js';
import type { SduiPlanner, SduiPlannerError } from './sdui-planner.js';
import { ensureExplicitImageRequest, promptExplicitlyRequestsImages } from './sdui-planner.js';
import { applySduiTextGuardrails, sduiContentQualityIssues, sduiTextFitIssues } from './sdui-text-guardrails.js';
import type { SatoriRenderer, BrandFontRef } from './satori-renderer.js';
import type { BackgroundImageClient, BackgroundRequest } from './background-image-client.js';
import type { ObjectStorage } from './object-storage.js';
import type { ContentGenerationJobRepository } from '../repository/content-generation-job-repository.js';
import type { ContentGenerationSlideRepository } from '../repository/content-generation-slide-repository.js';
import type { MasterTemplateRepository } from '../repository/master-template-repository.js';
import type { BrandKitRepository } from '../repository/brand-kit-repository.js';
import type { SduiTextGuardrailOptions } from './sdui-text-guardrails.js';

export interface SduiCarouselWorkerDeps {
  planner: SduiPlanner;
  renderer: SatoriRenderer;
  imageClient: BackgroundImageClient;
  storage: ObjectStorage;
  jobRepo: ContentGenerationJobRepository;
  slideRepo: ContentGenerationSlideRepository;
  masterTemplateRepo: MasterTemplateRepository;
  brandKitRepo: BrandKitRepository;
  redisUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_GENERATION_RULES = {
  maxSlides: 7,
  defaultTone: 'professional',
} as const;

function canvasWidth(aspectRatio: AspectRatio): number {
  return 1080; // all supported ratios use a 1080px-wide canvas
}

function imagePlaceholderAspectRatio(slide: SduiSlide, canvasAspectRatio: AspectRatio): AspectRatio {
  return slide.layout_variant_id === 'cover_image_full' ? canvasAspectRatio : '1:1';
}

function imageStylePromptFromUserPrompt(prompt: string): string | undefined {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  const explicitStyle = compact.match(
    /(?:style(?:\s+image|\s+gambar)?|gaya(?:\s+gambar|\s+visual)?|dengan\s+gaya|buat\s+style(?:\s+image|\s+gambar)?)\s*[:=,-]?\s*(.+)$/i,
  )?.[1]?.trim();
  if (explicitStyle) return explicitStyle.slice(0, 180);

  const styleKeywords = [
    'doodle', 'minimalist', 'minimalis', 'watercolor', 'flat vector', 'vector',
    'soft 3d', '3d', 'photorealistic', 'realistic', 'anime', 'sticker',
    'isometric', 'clay', 'pixel art', 'line art',
  ];
  const lower = compact.toLowerCase();
  const matches = styleKeywords.filter((keyword) => lower.includes(keyword));
  if (/\b(transparent|transparan|no background|tanpa background|cutout|isolated)\b/i.test(compact)) {
    matches.push('transparent no-background cutout');
  }
  return matches.length > 0 ? [...new Set(matches)].join(', ') : undefined;
}

async function normalizeGeneratedImage(
  image: Buffer,
  slide: SduiSlide,
  canvasAspectRatio: AspectRatio,
  width: number,
): Promise<Buffer> {
  if (imagePlaceholderAspectRatio(slide, canvasAspectRatio) === '1:1') {
    return sharp(image)
      .resize(width, width, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  return sharp(image).resize(width, undefined, { withoutEnlargement: true }).png().toBuffer();
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const c = hex.replace(/^#/, '');
  if (c.length === 3) {
    const r = parseInt(c[0]! + c[0], 16), g = parseInt(c[1]! + c[1], 16), b = parseInt(c[2]! + c[2], 16);
    return Number.isNaN(r) ? null : { r, g, b };
  }
  if (c.length === 6) {
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return Number.isNaN(r) ? null : { r, g, b };
  }
  return null;
}

function slideComponents(slide: SduiSlide): SduiComponent[] {
  return (['top_meta', 'core_content', 'action_footer'] as const)
    .flatMap((group) => slide.nested_groups[group] ?? []);
}

function luminance(hex: string): number {
  const c = parseHex(hex) ?? { r: 255, g: 255, b: 255 };
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

function buildTheme(brandKit: BrandKit, baseBodySizePx: number, typographyOverride?: SduiTypographyOverride): SduiThemeConfig {
  const accentBrand = brandKit.colors[0] ?? '#187DB4';
  const darkest = [...brandKit.colors].sort((a, b) => luminance(a) - luminance(b))[0];
  const fallbackHeader = darkest && luminance(darkest) < 0.45 ? darkest : '#1a1d24';
  const t = brandKit.typography;

  const headerFamily = t?.header.fontFamily || brandKit.fonts[0]?.family || '';
  const coverFamily = t?.cover?.fontFamily || headerFamily;
  const bodyFamily = t?.body.fontFamily || brandKit.fonts[1]?.family || brandKit.fonts[0]?.family || '';
  const accent = t?.accent || accentBrand;
  const onAccent = luminance(accent) < 0.55 ? '#ffffff' : '#1a1d24';

  return {
    logoUrl: brandKit.logoUrl,
    logoPlacement: brandKit.chrome.logoPlacement,
    siteUrl: brandKit.chrome.siteUrl,
    pageNumberFormat: brandKit.chrome.pageNumberFormat,
    coverFontFamily: coverFamily,
    headerFontFamily: headerFamily,
    bodyFontFamily: bodyFamily,
    baseBodySizePx,
    coverSizePx: typographyOverride?.coverSizePx ?? t?.cover?.sizePx,
    headerSizePx: typographyOverride?.headerSizePx ?? t?.header?.sizePx,
    bodySizePx: typographyOverride?.bodySizePx ?? t?.body?.sizePx,
    colors: {
      background: t?.background || '#F4F3EF',
      header: t?.header.color || t?.cover?.color || fallbackHeader,
      body: t?.body.color || '#5b626e',
      highlight: t?.highlightColor || accentBrand,
      pagination: t?.paginationColor || '#5b626e',
      meta: t?.metaTextColor || '#5b626e',
      accent,
      onAccent,
    },
  };
}

function sanitizeTypographyOverride(raw: unknown): SduiTypographyOverride | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const out: SduiTypographyOverride = {};
  if (typeof r.coverSizePx === 'number' && Number.isFinite(r.coverSizePx) && r.coverSizePx >= 12 && r.coverSizePx <= 180) {
    out.coverSizePx = Math.round(r.coverSizePx);
  }
  if (typeof r.headerSizePx === 'number' && Number.isFinite(r.headerSizePx) && r.headerSizePx >= 12 && r.headerSizePx <= 180) {
    out.headerSizePx = Math.round(r.headerSizePx);
  }
  if (typeof r.bodySizePx === 'number' && Number.isFinite(r.bodySizePx) && r.bodySizePx >= 8 && r.bodySizePx <= 96) {
    out.bodySizePx = Math.round(r.bodySizePx);
  }
  return out.coverSizePx !== undefined || out.headerSizePx !== undefined || out.bodySizePx !== undefined ? out : undefined;
}

function typographyFromTheme(theme: SduiThemeConfig): SduiTypographyOverride | undefined {
  const out: SduiTypographyOverride = {};
  if (theme.coverSizePx !== undefined) out.coverSizePx = theme.coverSizePx;
  if (theme.headerSizePx !== undefined) out.headerSizePx = theme.headerSizePx;
  if (theme.bodySizePx !== undefined) out.bodySizePx = theme.bodySizePx;
  return out.coverSizePx !== undefined || out.headerSizePx !== undefined || out.bodySizePx !== undefined ? out : undefined;
}

function mapPlannerErr(err: SduiPlannerError): FailureReason {
  switch (err.kind) {
    case 'non_json': return 'malformed_output';
    case 'validation_error': return 'malformed_output';
    case 'budget_exceeded': return 'budget_exceeded';
    case 'endpoint_mismatch': return 'endpoint_mismatch';
    case 'insecure_transport': return 'insecure_transport';
    case 'privacy_violation': return 'privacy_violation';
    case 'timeout': return 'timeout';
    case 'provider_error': return 'provider_error';
  }
}

function shortPromptTopic(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  if (!compact) return 'Konten utama';
  return compact.length > 72 ? `${compact.slice(0, 69).trimEnd()}...` : compact;
}

function buildFallbackSlides(prompt: string, slideCount: number): SduiSlide[] {
  const topic = shortPromptTopic(prompt);
  const targetCount = Math.max(1, Math.min(slideCount, DEFAULT_GENERATION_RULES.maxSlides));
  const slides: SduiSlide[] = [];

  slides.push({
    slide_number: 1,
    slide_type: 'cover',
    container_layout: 'text_dominant',
    layout_variant_id: 'cover_centered',
    image_requirement: 'none',
    image_status: 'not_needed',
    layout_source: 'worker_adjusted',
    typography_scale: 'editorial_bold',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'IDE KONTEN' }],
      core_content: [{ type: 'header', text: topic }],
      action_footer: [],
    },
  });

  for (let i = 2; i <= targetCount; i++) {
    const isLast = i === targetCount;
    slides.push({
      slide_number: i,
      slide_type: 'content',
      container_layout: 'text_dominant',
      layout_variant_id: isLast ? 'header_body_cta' : 'text_stack',
      image_requirement: 'none',
      image_status: 'not_needed',
      layout_source: 'worker_adjusted',
      typography_scale: 'balanced_classic',
      nested_groups: {
        top_meta: [{ type: 'tag', text: isLast ? 'NEXT' : `POIN ${i - 1}` }],
        core_content: [
          { type: 'header', text: isLast ? 'Arahkan ke aksi berikutnya' : `Sudut pandang ${i - 1}` },
          { type: 'body', text: isLast ? `Tutup carousel dengan ajakan yang relevan untuk ${topic}.` : `Kembangkan bagian ini dengan contoh, konteks, dan manfaat utama dari ${topic}.` },
        ],
        action_footer: isLast ? [{ type: 'button_cta', label: 'Mulai sekarang', style: 'primary' }] : [],
      },
    });
  }

  return slides;
}

async function failWithPlannerError(
  deps: SduiCarouselWorkerDeps,
  teamId: string,
  jobId: string,
  currentInputs: Record<string, unknown>,
  stage: string,
  plannerError: SduiPlannerError,
): Promise<void> {
  await deps.jobRepo.updateInputs(teamId, jobId, {
    ...currentInputs,
    plannerFailureStage: stage,
    plannerError,
  });
  await deps.jobRepo.setStatus(teamId, jobId, 'failed', mapPlannerErr(plannerError));
}

function blockComposition(slide: SduiSlide): BlockType[] {
  const map: Record<string, BlockType | undefined> = {
    header: 'heading', body: 'body', checklist: 'bullet', quote: 'quote',
    button_cta: 'cta', image_placeholder: 'image',
  };
  const out: BlockType[] = [];
  for (const group of ['top_meta', 'core_content', 'action_footer'] as const) {
    for (const c of slide.nested_groups[group] ?? []) {
      const b = map[c.type];
      if (b) out.push(b);
    }
  }
  return out.length > 0 ? out : ['heading'];
}

const DEFAULT_VARIANT_SEQUENCE: LayoutVariantId[] = [
  'cover_centered',
  'checklist_stack',
  'numbered_steps',
  'text_stack',
  'quote_focus',
  'header_body_cta',
  'cta_centered',
];

function slideHas(slide: SduiSlide, type: SduiComponent['type']): boolean {
  return slideComponents(slide).some((component) => component.type === type);
}

function hasImagePlaceholder(slide: SduiSlide): boolean {
  return slideHas(slide, 'image_placeholder');
}

function hasStatSignal(slide: SduiSlide): boolean {
  const text = slideComponents(slide)
    .filter((component) => component.type === 'header' || component.type === 'body')
    .map((component) => component.text ?? '')
    .join(' ');
  const tokens = text.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
  const statWords = new Set(['rp', 'juta', 'ribu', 'miliar', 'kali', 'persen', 'score', 'skor', 'rate', 'rasio', 'data', 'angka', 'metrik', 'statistik']);
  return tokens.some((token) =>
    /\d/.test(token) ||
    token.includes('%') ||
    /^\d+x$/.test(token) ||
    statWords.has(token)
  );
}

function compatibleVariants(slide: SduiSlide, index: number, forceNoImage = false): LayoutVariantId[] {
  const components = new Set(slideComponents(slide).map((component) => component.type));
  const wantsNoImage = forceNoImage || slide.image_requirement === 'none' || !components.has('image_placeholder');
  const statAllowed = hasStatSignal(slide);
  const variants = LAYOUT_CATALOG.filter((layout) => {
    if (wantsNoImage && layout.supportsImage) return false;
    if (layout.supportsImage && !components.has('image_placeholder')) return false;
    if (layout.family === 'stat' && !statAllowed) return false;
    if (index > 0 && layout.family === 'cover' && layout.id !== 'cover_with_cta') return false;
    return layout.requiredComponents.every((type) => components.has(type));
  }).map((layout) => layout.id);

  if (variants.length > 0) return variants;
  if (wantsNoImage) {
    if (components.has('button_cta') && components.has('body')) return ['header_body_cta'];
    if (components.has('button_cta')) return ['cta_centered'];
    if (components.has('checklist') && components.has('body')) return ['checklist_with_body'];
    if (components.has('checklist')) return ['checklist_stack', 'numbered_steps'];
    if (components.has('quote')) return ['quote_focus'];
    if (components.has('body')) return ['text_stack', 'text_centered'];
    return index === 0 ? ['cover_centered', 'cover_editorial_left'] : ['big_statement', 'text_stack'];
  }
  return DEFAULT_VARIANT_SEQUENCE;
}

function applyLayoutFields(slide: SduiSlide, layoutId: LayoutVariantId, source: NonNullable<SduiSlide['layout_source']>): SduiSlide {
  const family = layoutFamilyFor(layoutId);
  const supportsImage = layoutSupportsImage(layoutId);
  return {
    ...slide,
    layout_variant_id: layoutId,
    ...(family ? { layout_family: family } : {}),
    layout_source: source,
    ...(supportsImage && family === 'image_focus' && layoutId === 'cover_image_full'
      ? { container_layout: 'background_overlay' as const, contentDirection: 'column' as const }
      : supportsImage && family === 'image_split'
        ? { container_layout: 'split_screen' as const, contentDirection: 'row' as const }
        : { container_layout: 'text_dominant' as const, contentDirection: 'column' as const }),
  };
}

function removeImagePlaceholders(slide: SduiSlide): SduiSlide {
  return {
    ...slide,
    nested_groups: {
      top_meta: (slide.nested_groups.top_meta ?? []).filter((component) => component.type !== 'image_placeholder'),
      core_content: (slide.nested_groups.core_content ?? []).filter((component) => component.type !== 'image_placeholder'),
      action_footer: (slide.nested_groups.action_footer ?? []).filter((component) => component.type !== 'image_placeholder'),
    },
  };
}

function firstText(slide: SduiSlide, type: 'header' | 'body' | 'quote'): string | undefined {
  return slideComponents(slide).find((component) => component.type === type)?.text?.trim();
}

function fallbackBodyForSlide(slide: SduiSlide, prompt: string): string {
  const topic = prompt.replace(/\s+/g, ' ').trim().slice(0, 90) || 'topik ini';
  const header = firstText(slide, 'header') || firstText(slide, 'quote') || `Slide ${slide.slide_number}`;
  return `${header}: ringkas poin utama tentang ${topic}.`;
}

function fallbackChecklistItems(slide: SduiSlide, prompt: string): string[] {
  const topic = prompt.replace(/\s+/g, ' ').trim().slice(0, 42) || 'topik';
  const header = firstText(slide, 'header') || 'Fokus';
  return [
    `${header} yang paling penting`,
    `Contoh praktis untuk ${topic}`,
    'Langkah berikutnya yang jelas',
  ];
}

function hasRenderableComponent(slide: SduiSlide, type: SduiComponent['type']): boolean {
  const components = slideComponents(slide);
  return components.some((component) => {
    if (component.type !== type) return false;
    if (component.type === 'checklist') return (component.items ?? []).some((item) => item.trim().length > 0);
    if (component.type === 'button_cta') return typeof component.label === 'string' && component.label.trim().length > 0;
    if ('text' in component) return typeof component.text === 'string' && component.text.trim().length > 0;
    return true;
  });
}

function upsertCoreComponent(slide: SduiSlide, component: SduiComponent): SduiSlide {
  const core = slide.nested_groups.core_content ?? [];
  const index = core.findIndex((candidate) => candidate.type === component.type);
  const nextCore = index >= 0
    ? core.map((candidate, candidateIndex) => candidateIndex === index ? component : candidate)
    : [...core, component];
  return {
    ...slide,
    nested_groups: {
      ...slide.nested_groups,
      core_content: nextCore,
    },
  };
}

function makeSlideQualityRepairable(slide: SduiSlide, index: number, prompt: string): SduiSlide {
  let next = slide;
  if (!hasRenderableComponent(next, 'header') && !hasRenderableComponent(next, 'quote') && next.slide_type !== 'cover') {
    next = upsertCoreComponent(next, { type: 'header', text: firstText(next, 'body')?.slice(0, 48) || `Poin ${index + 1}` });
  }

  const layout = getLayoutCatalogItem(next.layout_variant_id);
  if (layout?.requiredComponents.includes('body') && !hasRenderableComponent(next, 'body')) {
    next = upsertCoreComponent(next, { type: 'body', text: fallbackBodyForSlide(next, prompt) });
  }
  if (layout?.requiredComponents.includes('checklist') && !hasRenderableComponent(next, 'checklist')) {
    next = upsertCoreComponent(next, { type: 'checklist', items: fallbackChecklistItems(next, prompt) });
  }
  if (layout?.requiredComponents.includes('quote') && !hasRenderableComponent(next, 'quote')) {
    next = upsertCoreComponent(next, { type: 'quote', text: fallbackBodyForSlide(next, prompt) });
  }
  if (layout?.requiredComponents.includes('button_cta') && !hasRenderableComponent(next, 'button_cta')) {
    next = {
      ...next,
      nested_groups: {
        ...next.nested_groups,
        action_footer: [
          ...(next.nested_groups.action_footer ?? []).filter((component) => component.type !== 'button_cta'),
          { type: 'button_cta', label: 'Lanjutkan', style: 'primary' },
        ],
      },
    };
  }

  const hasSupportingContent =
    hasRenderableComponent(next, 'body') ||
    hasRenderableComponent(next, 'quote') ||
    hasRenderableComponent(next, 'checklist') ||
    hasRenderableComponent(next, 'button_cta');
  if (next.slide_type === 'content' && !hasSupportingContent) {
    next = upsertCoreComponent(next, { type: 'body', text: fallbackBodyForSlide(next, prompt) });
  }

  return next;
}

async function repairSlidesForQuality(
  deps: SduiCarouselWorkerDeps,
  params: {
    teamId: string;
    jobId: string;
    prompt: string;
    aspectRatio: AspectRatio;
    maxSlides: number;
    tone: string;
    slides: SduiSlide[];
    issues: string[];
    textGuardrailOptions: SduiTextGuardrailOptions;
    signal: AbortSignal;
  },
): Promise<{ slides: SduiSlide[]; issues: string[]; source: 'ai_repair' | 'deterministic_repair' | 'unrepaired' }> {
  const repairResult = await deps.planner.plan(
    {
      teamId: params.teamId,
      jobId: params.jobId,
      actorId: 'system',
      prompt: params.prompt,
      aspectRatio: params.aspectRatio,
      slideCount: params.slides.length,
      maxSlides: params.maxSlides,
      tone: params.tone,
      previousSlides: params.slides,
      feedback: [
        'Repair the SDUI plan so it renders successfully.',
        'Keep the user prompt intent, but adapt layout and rewrite copy instead of cutting sentences.',
        'Every content slide needs supporting body, checklist, quote, or CTA.',
        'All text must fit the layout text limits and read as a complete sentence.',
        `Current issues: ${params.issues.join('; ')}`,
      ].join(' '),
      typographyOverride: params.textGuardrailOptions.typography,
    },
    params.signal,
  );

  if (repairResult.ok) {
    const aiSlides = repairResult.value.slides
      .slice(0, params.slides.length)
      .map((s, i) => applySduiTextGuardrails({ ...s, slide_number: i + 1 }, params.textGuardrailOptions));
    const aiIssues = [
      ...sduiTextFitIssues(aiSlides, params.textGuardrailOptions),
      ...sduiContentQualityIssues(aiSlides),
    ];
    if (aiSlides.length > 0 && aiIssues.length === 0) {
      return { slides: aiSlides, issues: [], source: 'ai_repair' };
    }
  }

  const deterministicSlides = params.slides
    .map((slide, index) => makeSlideQualityRepairable(slide, index, params.prompt))
    .map((slide) => applySduiTextGuardrails(slide, params.textGuardrailOptions));
  const deterministicIssues = [
    ...sduiTextFitIssues(deterministicSlides, params.textGuardrailOptions),
    ...sduiContentQualityIssues(deterministicSlides),
  ];
  if (deterministicIssues.length === 0) {
    return { slides: deterministicSlides, issues: [], source: 'deterministic_repair' };
  }

  return { slides: deterministicSlides, issues: deterministicIssues, source: 'unrepaired' };
}

function deterministicNoImageRepair(slide: SduiSlide, index: number): SduiSlide {
  const withoutImage = removeImagePlaceholders(slide);
  const compatible = compatibleVariants(withoutImage, index, true);
  const preferred = compatible.find((variant) => variant !== slide.layout_variant_id) ?? compatible[0] ?? 'text_stack';
  return {
    ...applyLayoutFields(withoutImage, preferred, 'ai_repaired_after_image_failure'),
    image_requirement: 'none',
    image_status: 'provider_failed_repaired',
  };
}

function normalizeSlideMetadata(slide: SduiSlide): SduiSlide {
  const hasImage = hasImagePlaceholder(slide);
  const imageRequirement = hasImage ? (slide.image_requirement ?? 'optional') : 'none';
  const layoutId = slide.layout_variant_id;
  const family = layoutFamilyFor(layoutId);
  return {
    ...slide,
    image_requirement: imageRequirement,
    layout_source: slide.layout_source ?? 'ai_selected',
    ...(slide.image_status ? { image_status: slide.image_status } : imageRequirement === 'none' ? { image_status: 'not_needed' as const } : {}),
    ...(family ? { layout_family: family } : {}),
  };
}

export function enforceLayoutDiversity(slides: SduiSlide[], options: { forceNoImageSlideNumbers?: Set<number> } = {}): SduiSlide[] {
  const out: SduiSlide[] = [];
  const targetUniqueFamilies = slides.length >= 5 ? 4 : slides.length >= 4 ? 3 : Math.min(slides.length, 2);

  for (let i = 0; i < slides.length; i++) {
    const slide = normalizeSlideMetadata(slides[i]!);
    const forceNoImage = options.forceNoImageSlideNumbers?.has(slide.slide_number) ?? false;
    const compatible = compatibleVariants(slide, i, forceNoImage);
    const previous = out[i - 1]?.layout_variant_id;
    const usedFamilies = new Set(out.map((s) => s.layout_family).filter(Boolean));
    const current = slide.layout_variant_id && compatible.includes(slide.layout_variant_id) && slide.layout_variant_id !== previous
      ? slide.layout_variant_id
      : undefined;
    const familyDiverse = compatible.find((id) => id !== previous && !usedFamilies.has(layoutFamilyFor(id)));
    const chosen = current ?? familyDiverse ?? compatible.find((id) => id !== previous) ?? compatible[0] ?? DEFAULT_VARIANT_SEQUENCE[i % DEFAULT_VARIANT_SEQUENCE.length]!;
    const normalized = applyLayoutFields(
      slide,
      chosen,
      chosen === slide.layout_variant_id ? (slide.layout_source ?? 'ai_selected') : 'worker_adjusted',
    );
    out.push(normalized);
  }

  if (out.length >= 4) {
    const uniqueFamilies = new Set(out.map((s) => s.layout_family).filter(Boolean));
    for (let i = 1; uniqueFamilies.size < targetUniqueFamilies && i < out.length - 1; i++) {
      const slide = out[i]!;
      const compatible = compatibleVariants(slide, i, options.forceNoImageSlideNumbers?.has(slide.slide_number) ?? false);
      const prev = out[i - 1]?.layout_variant_id;
      const nextSlide = out[i + 1];
      const next = compatible.find((id) => {
        const family = layoutFamilyFor(id);
        return family && !uniqueFamilies.has(family) && id !== prev && id !== nextSlide?.layout_variant_id;
      });
      if (next) {
        out[i] = applyLayoutFields(slide, next, 'worker_adjusted');
        const family = layoutFamilyFor(next);
        if (family) uniqueFamilies.add(family);
      }
    }
  }

  return out;
}

function slideAudit(slides: SduiSlide[]): SduiSlideAudit[] {
  return slides.map((slide) => ({
    slide_number: slide.slide_number,
    ...(slide.layout_variant_id ? { layout_variant_id: slide.layout_variant_id } : {}),
    ...(slide.layout_family ? { layout_family: slide.layout_family } : {}),
    image_requirement: slide.image_requirement ?? (hasImagePlaceholder(slide) ? 'optional' : 'none'),
    layout_source: slide.layout_source ?? 'ai_selected',
    image_status: slide.image_status ?? (hasImagePlaceholder(slide) ? 'not_needed' : 'not_needed'),
  }));
}

export function isValidNoImageRepair(slide: SduiSlide): boolean {
  if (hasImagePlaceholder(slide)) return false;
  if (slide.layout_variant_id && getLayoutCatalogItem(slide.layout_variant_id)?.supportsImage) return false;
  return true;
}

export async function processSduiCarouselJob(
  deps: SduiCarouselWorkerDeps,
  payload: ContentGenerationJobPayload,
  signal: AbortSignal = new AbortController().signal,
): Promise<void> {
  const { jobId, teamId } = payload;

  const jobRow = await deps.jobRepo.findById(teamId, jobId);
  if (!jobRow) throw new Error(`Job ${jobId} not found for team ${teamId}`);

  const inputs = jobRow.inputs as {
    requestedSlideCount?: number;
    sduiSlides?: SduiSlide[];
    layoutAudit?: SduiSlideAudit[];
    plannerQualityWarnings?: string[];
    typographyOverride?: SduiTypographyOverride;
  };

  const masterTemplate = await deps.masterTemplateRepo.findByTeam(teamId);
  const maxSlides = masterTemplate?.maxSlides ?? DEFAULT_GENERATION_RULES.maxSlides;
  const defaultTone = masterTemplate?.defaultTone ?? DEFAULT_GENERATION_RULES.defaultTone;

  const brandKit = await deps.brandKitRepo.findByTeam(teamId);
  if (!brandKit) {
    await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'off_brand');
    return;
  }

  const aspectRatio = jobRow.aspectRatio;
  const width = canvasWidth(aspectRatio);
  const baseBody = Math.round(width * 0.03);
  const typographyOverride = sanitizeTypographyOverride(inputs.typographyOverride);
  const theme = buildTheme(brandKit, baseBody, typographyOverride);
  const textGuardrailOptions = { typography: typographyFromTheme(theme) };

  const slideCount = Math.min(
    inputs.requestedSlideCount && inputs.requestedSlideCount > 0
      ? inputs.requestedSlideCount
      : Math.min(5, maxSlides),
    maxSlides,
  );

  let slides: SduiSlide[];
  let plannerQualityWarnings: string[] = [];

  if (inputs.sduiSlides && inputs.sduiSlides.length > 0) {
    slides = inputs.sduiSlides
      .slice(0, slideCount)
      .map((s, i) => applySduiTextGuardrails({ ...s, slide_number: i + 1 }, textGuardrailOptions));
  } else {
    const planResult = await deps.planner.plan(
      {
        teamId,
        jobId,
        actorId: 'system',
        prompt: jobRow.prompt,
        aspectRatio,
        slideCount,
        maxSlides,
        tone: defaultTone,
        typographyOverride: textGuardrailOptions.typography,
      },
      signal,
    );

    if (!planResult.ok) {
      console.warn('[sdui-worker] initial planner failed, using worker fallback deck:', planResult.error);
      plannerQualityWarnings = [`initial planner failed: ${planResult.error.kind}`];
      await deps.jobRepo.updateInputs(teamId, jobId, {
        ...jobRow.inputs,
        plannerFailureStage: 'initial_plan',
        plannerError: planResult.error,
        plannerFallbackUsed: true,
        ...(textGuardrailOptions.typography ? { typographyOverride: textGuardrailOptions.typography } : {}),
      });
      slides = buildFallbackSlides(jobRow.prompt, slideCount)
        .map((s, i) => applySduiTextGuardrails({ ...s, slide_number: i + 1 }, textGuardrailOptions));
    } else {
      plannerQualityWarnings = planResult.value.qualityWarnings ?? [];
      slides = planResult.value.slides
        .slice(0, slideCount)
        .map((s, i) => applySduiTextGuardrails({ ...s, slide_number: i + 1 }, textGuardrailOptions));
    }
  }

  if (slides.length === 0) {
    slides = buildFallbackSlides(jobRow.prompt, slideCount)
      .map((s, i) => applySduiTextGuardrails({ ...s, slide_number: i + 1 }, textGuardrailOptions));
  }

  slides = ensureExplicitImageRequest(jobRow.prompt, slides)
    .map((slide) => applySduiTextGuardrails(slide, textGuardrailOptions));

  if (promptExplicitlyRequestsImages(jobRow.prompt) && !slides.some(hasImagePlaceholder)) {
    console.warn('[sdui-worker] prompt explicitly requested image, requesting AI image-layout repair');
    const repairResult = await deps.planner.plan(
      {
        teamId,
        jobId,
        actorId: 'system',
        prompt: jobRow.prompt,
        aspectRatio,
        slideCount: slides.length,
        maxSlides,
        tone: defaultTone,
        previousSlides: slides,
        feedback:
          'User explicitly requested at least one image/illustration. Revise the deck so at least one relevant slide uses an image-capable layout with image_requirement="required" and a concrete image_placeholder in core_content.',
        typographyOverride: textGuardrailOptions.typography,
      },
      signal,
    );

    if (!repairResult.ok) {
      console.warn('[sdui-worker] image-layout repair failed, using deterministic image placeholder:', repairResult.error);
      await deps.jobRepo.updateInputs(teamId, jobId, {
        ...jobRow.inputs,
        plannerFailureStage: 'image_requirement_repair',
        plannerError: repairResult.error,
        imageLayoutFallbackUsed: true,
        ...(textGuardrailOptions.typography ? { typographyOverride: textGuardrailOptions.typography } : {}),
      });
      slides = ensureExplicitImageRequest(jobRow.prompt, slides)
        .map((s, i) => applySduiTextGuardrails({ ...s, slide_number: i + 1 }, textGuardrailOptions));
    } else {
      slides = repairResult.value.slides
        .slice(0, slideCount)
        .map((s, i) => applySduiTextGuardrails({ ...s, slide_number: i + 1 }, textGuardrailOptions));
    }

    if (!slides.some(hasImagePlaceholder)) {
      await deps.jobRepo.updateInputs(teamId, jobId, {
        ...jobRow.inputs,
        sduiSlides: slides,
        imageQualityIssues: ['user explicitly requested image, but planner repair returned no image_placeholder'],
        ...(textGuardrailOptions.typography ? { typographyOverride: textGuardrailOptions.typography } : {}),
      });
      await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'provider_error');
      return;
    }
  }

  const preResolverQualityIssues = [
    ...plannerQualityWarnings,
    ...sduiTextFitIssues(slides, textGuardrailOptions),
    ...sduiContentQualityIssues(slides),
  ];
  if (preResolverQualityIssues.length > 0) {
    console.warn('[sdui-worker] content quality validation failed before layout resolve:', preResolverQualityIssues);
    const repair = await repairSlidesForQuality(deps, {
      teamId,
      jobId,
      prompt: jobRow.prompt,
      aspectRatio,
      maxSlides,
      tone: defaultTone,
      slides,
      issues: preResolverQualityIssues,
      textGuardrailOptions,
      signal,
    });
    slides = repair.slides;
    if (repair.issues.length > 0) {
      await deps.jobRepo.updateInputs(teamId, jobId, {
        ...jobRow.inputs,
        sduiSlides: slides,
        contentQualityIssues: repair.issues,
        contentQualityRepairSource: repair.source,
        ...(textGuardrailOptions.typography ? { typographyOverride: textGuardrailOptions.typography } : {}),
      });
      await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'layout_unsatisfiable');
      return;
    }
  }

  slides = enforceLayoutDiversity(slides).map((slide) => applySduiTextGuardrails(slide, textGuardrailOptions));

  const initialQualityIssues = [
    ...sduiTextFitIssues(slides, textGuardrailOptions),
    ...sduiContentQualityIssues(slides),
  ];
  if (initialQualityIssues.length > 0) {
    console.warn('[sdui-worker] content quality validation failed before render:', initialQualityIssues);
    const repair = await repairSlidesForQuality(deps, {
      teamId,
      jobId,
      prompt: jobRow.prompt,
      aspectRatio,
      maxSlides,
      tone: defaultTone,
      slides,
      issues: initialQualityIssues,
      textGuardrailOptions,
      signal,
    });
    slides = repair.slides;
    if (repair.issues.length > 0) {
      await deps.jobRepo.updateInputs(teamId, jobId, {
        ...jobRow.inputs,
        sduiSlides: slides,
        contentQualityIssues: repair.issues,
        contentQualityRepairSource: repair.source,
        ...(textGuardrailOptions.typography ? { typographyOverride: textGuardrailOptions.typography } : {}),
      });
      await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'layout_unsatisfiable');
      return;
    }
  }

  const imageTasks: Array<{ slide: SduiSlide; comp: SduiComponent }> = [];
  for (const slide of slides) {
    for (const group of ['action_footer', 'core_content'] as const) {
      for (const comp of slide.nested_groups[group] ?? []) {
        if (comp.type === 'image_placeholder') imageTasks.push({ slide, comp });
      }
    }
  }

  const failedImageSlideNumbers = new Set<number>();
  if (imageTasks.length > 0) {
    await Promise.all(
      imageTasks.map(async ({ slide, comp }) => {
        const prompt = comp.image_object_context?.trim() ||
          `professional illustration related to: ${jobRow.prompt.slice(0, 80)}`;
        try {
          const stylePrompt = imageStylePromptFromUserPrompt(jobRow.prompt);
          const request: BackgroundRequest = {
            prompt,
            aspectRatio: imagePlaceholderAspectRatio(slide, aspectRatio),
            palette: brandKit.colors,
            kind: 'content',
          };
          if (stylePrompt) request.stylePrompt = stylePrompt;

          const imgResult = await deps.imageClient.generate(
            teamId,
            request,
            signal,
          );
          if (imgResult.ok) {
            const png = await normalizeGeneratedImage(imgResult.value, slide, aspectRatio, width);
            comp.imageUrl = `data:image/png;base64,${png.toString('base64')}`;
            slide.image_status = 'generated';
          } else {
            console.warn('[sdui-worker] image gen failed, requesting AI no-image repair:', imgResult.error);
            failedImageSlideNumbers.add(slide.slide_number);
          }
        } catch (e) {
          console.warn('[sdui-worker] image gen exception, requesting AI no-image repair:', e);
          failedImageSlideNumbers.add(slide.slide_number);
        }
      }),
    );
  }

  slides = slides.map((slide) => slide.image_status || hasImagePlaceholder(slide)
    ? slide
    : { ...slide, image_status: 'not_needed' });

  if (failedImageSlideNumbers.size > 0) {
    const failedNumbers = [...failedImageSlideNumbers].sort((a, b) => a - b);
    const repairResult = await deps.planner.plan(
      {
        teamId,
        jobId,
        actorId: 'system',
        prompt: jobRow.prompt,
        aspectRatio,
        slideCount: slides.length,
        maxSlides,
        tone: defaultTone,
        previousSlides: slides,
        feedback: `Image generation failed for slide(s) ${failedNumbers.join(', ')}. Repair those slides using no-image layouts only.`,
        repairMode: 'image_failure_no_image',
        failedImageSlideNumbers: failedNumbers,
        typographyOverride: textGuardrailOptions.typography,
      },
      signal,
    );

    if (!repairResult.ok) {
      console.warn('[sdui-worker] AI no-image repair failed, using deterministic no-image fallback:', repairResult.error);
      slides = slides.map((slide, index) => failedImageSlideNumbers.has(slide.slide_number)
        ? deterministicNoImageRepair(slide, index)
        : slide);
    } else {
      const repairedByNumber = new Map(repairResult.value.slides.map((slide) => [slide.slide_number, slide]));
      slides = slides.map((slide, index) => {
        if (!failedImageSlideNumbers.has(slide.slide_number)) return slide;
        const repaired = repairedByNumber.get(slide.slide_number);
        const candidate = repaired
          ? applySduiTextGuardrails({
              ...repaired,
              slide_number: slide.slide_number,
              slide_type: slide.slide_type,
              image_requirement: 'none' as const,
              image_status: 'provider_failed_repaired' as const,
              layout_source: 'ai_repaired_after_image_failure' as const,
            }, textGuardrailOptions)
          : deterministicNoImageRepair(slide, index);
        return isValidNoImageRepair(candidate) ? candidate : deterministicNoImageRepair(slide, index);
      });
    }

    slides = enforceLayoutDiversity(slides, { forceNoImageSlideNumbers: failedImageSlideNumbers })
      .map((slide) => applySduiTextGuardrails(slide, textGuardrailOptions));
    slides = slides.map((slide) => failedImageSlideNumbers.has(slide.slide_number)
      ? applySduiTextGuardrails({ ...slide, image_requirement: 'none', image_status: 'provider_failed_repaired', layout_source: 'ai_repaired_after_image_failure' }, textGuardrailOptions)
      : slide);
  }

  slides = slides.map((slide) => applySduiTextGuardrails(slide, textGuardrailOptions));

  const finalQualityIssues = [
    ...sduiTextFitIssues(slides, textGuardrailOptions),
    ...sduiContentQualityIssues(slides),
  ];
  if (finalQualityIssues.length > 0) {
    console.warn('[sdui-worker] content quality validation failed after repair:', finalQualityIssues);
    const repair = await repairSlidesForQuality(deps, {
      teamId,
      jobId,
      prompt: jobRow.prompt,
      aspectRatio,
      maxSlides,
      tone: defaultTone,
      slides,
      issues: finalQualityIssues,
      textGuardrailOptions,
      signal,
    });
    slides = repair.slides;
    if (repair.issues.length > 0) {
      await deps.jobRepo.updateInputs(teamId, jobId, {
        ...jobRow.inputs,
        sduiSlides: slides,
        contentQualityIssues: repair.issues,
        contentQualityRepairSource: repair.source,
        ...(textGuardrailOptions.typography ? { typographyOverride: textGuardrailOptions.typography } : {}),
      });
      await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'layout_unsatisfiable');
      return;
    }
  }

  const finalInputs = {
    ...jobRow.inputs,
    sduiSlides: slides,
    layoutAudit: slideAudit(slides),
    ...(textGuardrailOptions.typography ? { typographyOverride: textGuardrailOptions.typography } : {}),
  };
  await deps.jobRepo.updateInputs(teamId, jobId, finalInputs);

  const doc: SduiDocument = {
    aspectRatio,
    theme,
    spacing: { canvas_padding: Math.round(width * 0.072), macro_gap: 40, meso_gap: 22, micro_gap: 12 },
    slides,
  };

  const brandFonts: BrandFontRef[] = brandKit.fonts
    .filter((f) => typeof f.url === 'string' && f.url.length > 0)
    .map((f) => ({ family: f.family, url: f.url }));

  for (const slide of slides) {
    const index = slide.slide_number - 1;
    await deps.slideRepo.insertSlide({
      teamId,
      jobId,
      index,
      status: 'pending',
      blockComposition: blockComposition(slide),
    });

    let png: Buffer;
    try {
      png = await deps.renderer.renderSlide(slide, doc, brandFonts);
    } catch (e) {
      console.error(`[sdui-worker] render failed slide ${index}:`, e);
      await deps.slideRepo.updateSlide(teamId, jobId, index, { status: 'failed', reason: 'provider_error' });
      await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'provider_error');
      return;
    }

    const uploadResult = await deps.storage.upload(teamId, `jobs/${jobId}/slide-${index}.png`, png, 'image/png');
    if (!uploadResult.ok) {
      await deps.slideRepo.updateSlide(teamId, jobId, index, { status: 'failed', reason: 'upload_failed' });
      await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'upload_failed');
      return;
    }

    await deps.slideRepo.updateSlide(teamId, jobId, index, {
      status: 'success',
      imageUrl: uploadResult.value,
      usedFallback: slide.image_status === 'provider_failed_repaired' || slide.layout_source === 'worker_adjusted',
    });
  }

  await deps.jobRepo.setStatus(teamId, jobId, 'success');
  await deps.jobRepo.setFinishedAt(teamId, jobId, new Date());
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createSduiCarouselWorker(deps: SduiCarouselWorkerDeps): Worker<ContentGenerationJobPayload> {
  const connection = new URL(deps.redisUrl);
  const connectionOptions: RedisOptions = {
    host: connection.hostname,
    port: Number(connection.port || 6379),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 30000,
    reconnectOnError: () => true,
    retryStrategy: (times: number) => Math.min(times * 500, 5000),
  };
  if (connection.username) connectionOptions.username = connection.username;
  if (connection.password) connectionOptions.password = connection.password;
  if (connection.protocol === 'rediss:') connectionOptions.tls = {};

  return new Worker<ContentGenerationJobPayload>(
    CONTENT_GENERATION_QUEUE_NAME,
    async (job: Job<ContentGenerationJobPayload>) => {
      await processSduiCarouselJob(deps, job.data, new AbortController().signal);
    },
    { connection: connectionOptions, concurrency: 2 },
  );
}
