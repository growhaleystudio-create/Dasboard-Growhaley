/**
 * sdui-planner.ts — AI "Brain" for the Server-Driven UI carousel pipeline.
 *
 * Produces ONLY the textual + structural content of a carousel (nested groups,
 * component types, typography archetype). It never decides pixel sizes, colors,
 * or fonts — those are locked by the Brand Kit and applied by the Satori
 * renderer (the "Worker").
 *
 * Reuses the same AiCallWrapper + ProviderEndpointResolver infrastructure as the
 * legacy planner (budget pre-check, audit trail, endpoint allow-listing).
 *
 * feature-update.md → Modul 3 (AI Planner Engine), No-Reference mode.
 */

import { LAYOUT_CATALOG, LAYOUT_VARIANT_IDS, layoutFamilyFor, ok, err } from '@leads-generator/shared';
import type {
  Result,
  AspectRatio,
  SduiSlide,
  SduiComponent,
  TypographyScale,
  VisualReference,
  ImageRequirement,
  SduiTypographyOverride,
} from '@leads-generator/shared';

import type { AiCallWrapper, AiCallContext } from './ai-call-wrapper.js';
import { providerKindFromBaseUrl, requireProviderBaseUrl } from './provider-key-routing.js';
import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';
import {
  applySduiTextGuardrails,
  resolveSduiTextLimits,
  sduiContentQualityIssues,
  sduiTextFitIssues,
} from './sdui-text-guardrails.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SduiPlannerInput {
  teamId: string;
  jobId: string;
  actorId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  /** Exact number of slides requested by the user (already clamped to maxSlides). */
  slideCount: number;
  /** Maximum slides allowed by the master template. */
  maxSlides: number;
  /** Default tone for copywriting. */
  tone: string;
  /** Optional pre-render chat feedback (Fase A revision). */
  feedback?: string;
  /** Optional previous draft to revise (paired with feedback). */
  previousSlides?: SduiSlide[];
  /** Special worker repair pass after image generation failed. */
  repairMode?: 'image_failure_no_image';
  /** Slide numbers affected by image provider failure during repair mode. */
  failedImageSlideNumbers?: number[];
  /** Effective font sizes from Brand Kit or generator config, used for adaptive text limits. */
  typographyOverride?: SduiTypographyOverride | undefined;
  /**
   * Fase 3: reference mode.
   * 'no_reference' = AI autonomous (default)
   * 'auto_match'   = AI picks best from catalog
   * 'manual'       = user picked a specific reference
   */
  referenceMode?: 'no_reference' | 'auto_match' | 'manual';
  /** Catalog of available references (for auto_match mode). */
  referenceCatalog?: Pick<VisualReference, 'id' | 'name' | 'dna' | 'tags'>[];
  /** The manually chosen reference (for manual mode). */
  chosenReference?: Pick<VisualReference, 'id' | 'name' | 'dna'>;
}

export type SduiPlannerError =
  | { kind: 'non_json' }
  | { kind: 'validation_error'; message: string }
  | { kind: 'budget_exceeded' }
  | { kind: 'endpoint_mismatch' }
  | { kind: 'insecure_transport' }
  | { kind: 'privacy_violation' }
  | { kind: 'timeout' }
  | { kind: 'provider_error'; message: string };

export interface SduiPlanResult {
  slides: SduiSlide[];
  /** Non-terminal issues that the worker should repair or audit before render. */
  qualityWarnings?: string[];
  /** Populated when AI chose a reference automatically (auto_match mode). */
  chosenReferenceId?: string;
}

export interface SduiPlanner {
  plan(input: SduiPlannerInput, signal: AbortSignal): Promise<Result<SduiPlanResult, SduiPlannerError>>;
}

export interface SduiPlannerDeps {
  wrapper: AiCallWrapper;
  settings: TeamAiSettingsService;
}

const GEMINI_TEXT_PATH = '/v1beta/models/gemini-2.5-flash-lite:generateContent';
const HEADER_HARD_MAX = 80;
const BODY_HARD_MAX = 180;
const QUOTE_HARD_MAX = 160;
const CHECKLIST_ITEM_HARD_MAX = 90;

export function promptExplicitlyRequestsImages(prompt: string): boolean {
  return /\b(gambar|image|foto|photo|ilustrasi|illustration|visual|visualisasi)\b/i.test(prompt);
}

function hasImagePlaceholder(slide: SduiSlide): boolean {
  return (['top_meta', 'core_content', 'action_footer'] as const)
    .some((group) => (slide.nested_groups[group] ?? []).some((component) => component.type === 'image_placeholder'));
}

function hasComponent(slide: SduiSlide, type: SduiComponent['type']): boolean {
  return (['top_meta', 'core_content', 'action_footer'] as const)
    .some((group) => (slide.nested_groups[group] ?? []).some((component) => component.type === type));
}

function imageContextFromPrompt(prompt: string): string {
  const compactPrompt = prompt.replace(/\s+/g, ' ').trim().slice(0, 180);
  return `content visual matching the user's requested image style and topic: ${compactPrompt}`;
}

function visualLayerNeedsGeneratedArtwork(component: SduiComponent): boolean {
  return component.type === 'visual_layer' && (
    component.visual_treatment === 'boxed_image' ||
    component.visual_treatment === 'circle_asset' ||
    component.visual_treatment === 'transparent_cutout' ||
    component.visual_treatment === 'full_bleed_background' ||
    component.visual_treatment === 'floating_object' ||
    component.visual_treatment === 'editorial_collage' ||
    component.visual_treatment === 'ui_mockup_board'
  );
}

function visualLayerImageContext(slide: SduiSlide, prompt: string): string {
  const visualLayer = (['core_content', 'action_footer', 'top_meta'] as const)
    .flatMap((group) => slide.nested_groups[group] ?? [])
    .find(visualLayerNeedsGeneratedArtwork);
  const brief = visualLayer?.visual_brief?.trim();
  const treatment = visualLayer?.visual_treatment?.replace(/_/g, ' ');
  const base = brief && brief.length > 0 ? brief : imageContextFromPrompt(prompt);
  return treatment ? `${base}. Visual treatment: ${treatment}.` : base;
}

function ensureImagePlaceholderForVisualLayers(prompt: string, slides: SduiSlide[]): SduiSlide[] {
  const promptRequestsImages = promptExplicitlyRequestsImages(prompt);
  return slides.map((slide) => {
    if (hasImagePlaceholder(slide)) return slide;
    const components = (['core_content', 'action_footer', 'top_meta'] as const)
      .flatMap((group) => slide.nested_groups[group] ?? []);
    const hasArtworkVisualLayer = components.some(visualLayerNeedsGeneratedArtwork);
    const slideRequestsImage = slide.image_requirement === 'required' || slide.image_requirement === 'optional';
    if (!hasArtworkVisualLayer || (!slideRequestsImage && !promptRequestsImages)) return slide;

    const imagePlaceholder: SduiComponent = {
      type: 'image_placeholder',
      requires_generation: true,
      image_object_context: visualLayerImageContext(slide, prompt),
    };
    const layoutVariant = slide.slide_type === 'cover'
      ? 'cover_image_full'
      : slide.nested_groups.core_content?.some((component) => component.type === 'checklist')
        ? 'split_checklist_image'
        : slide.nested_groups.action_footer?.some((component) => component.type === 'button_cta')
          ? 'split_header_body_cta'
          : 'split_text_left_image_right';
    const layoutFamily = layoutFamilyFor(layoutVariant);
    const imageRequirement: ImageRequirement = slide.image_requirement === 'required' ? 'required' : 'optional';

    return {
      ...slide,
      container_layout: slide.slide_type === 'cover' ? 'background_overlay' : 'split_screen',
      contentDirection: slide.slide_type === 'cover' ? 'column' : 'row',
      layout_variant_id: layoutVariant,
      ...(layoutFamily ? { layout_family: layoutFamily } : {}),
      layout_source: slide.layout_source && slide.layout_source !== 'ai_selected' ? slide.layout_source : 'worker_adjusted',
      image_requirement: imageRequirement,
      nested_groups: {
        ...slide.nested_groups,
        core_content: [...(slide.nested_groups.core_content ?? []), imagePlaceholder],
      },
    };
  });
}

export function ensureExplicitImageRequest(prompt: string, slides: SduiSlide[]): SduiSlide[] {
  const visualLayerNormalized = ensureImagePlaceholderForVisualLayers(prompt, slides);
  if (!promptExplicitlyRequestsImages(prompt) || visualLayerNormalized.some(hasImagePlaceholder)) return visualLayerNormalized;

  const targetIndex = visualLayerNormalized.findIndex((slide) =>
    slide.slide_type === 'content' && hasComponent(slide, 'header') && hasComponent(slide, 'body')
  );
  const fallbackIndex = visualLayerNormalized.findIndex((slide) => slide.slide_type === 'content' && hasComponent(slide, 'checklist'));
  const coverIndex = visualLayerNormalized.findIndex((slide) => slide.slide_type === 'cover' && hasComponent(slide, 'header'));
  const index = targetIndex >= 0 ? targetIndex : fallbackIndex >= 0 ? fallbackIndex : coverIndex >= 0 ? coverIndex : 0;

  return visualLayerNormalized.map((slide, slideIndex) => {
    if (slideIndex !== index) return slide;
    const { image_status: _imageStatus, ...slideWithoutImageStatus } = slide;
    const hasBody = hasComponent(slide, 'body');
    const hasChecklist = hasComponent(slide, 'checklist');
    const hasCta = hasComponent(slide, 'button_cta');
    const layoutVariant = slide.slide_type === 'cover'
      ? 'cover_image_full'
      : hasChecklist && !hasBody
        ? 'numbered_with_image'
        : hasCta
          ? 'split_header_body_cta'
          : 'split_text_left_image_right';
    const imagePlaceholder: SduiComponent = {
      type: 'image_placeholder',
      requires_generation: true,
      image_object_context: imageContextFromPrompt(prompt),
    };

    return {
      ...slideWithoutImageStatus,
      container_layout: slide.slide_type === 'cover' ? 'background_overlay' : 'split_screen',
      contentDirection: slide.slide_type === 'cover' ? 'column' : 'row',
      layout_variant_id: layoutVariant,
      layout_family: slide.slide_type === 'cover' ? 'image_focus' : 'image_split',
      layout_source: 'worker_adjusted',
      image_requirement: 'required',
      nested_groups: {
        ...slide.nested_groups,
        core_content: [...(slide.nested_groups.core_content ?? []), imagePlaceholder],
      },
    };
  });
}

function sduiImageRequirementIssues(input: Pick<SduiPlannerInput, 'prompt'>, slides: SduiSlide[]): string[] {
  const issues: string[] = [];
  if (promptExplicitlyRequestsImages(input.prompt) && !slides.some(hasImagePlaceholder)) {
    issues.push('user explicitly requested at least one image, but no slide contains image_placeholder');
  }
  for (const slide of slides) {
    if ((slide.image_requirement === 'required' || slide.image_requirement === 'optional') && !hasImagePlaceholder(slide)) {
      issues.push(`slide ${slide.slide_number}: image_requirement=${slide.image_requirement} requires an image_placeholder`);
    }
  }
  return issues;
}

function promptLayoutCatalog(typographyOverride: SduiTypographyOverride | undefined) {
  return LAYOUT_CATALOG.map((layout) => ({
    id: layout.id,
    family: layout.family,
    requiredComponents: layout.requiredComponents,
    supportsImage: layout.supportsImage,
    bestFor: layout.bestFor,
    visualRole: layout.visualRole,
    fallbackFamilies: layout.fallbackFamilies,
    textLimits: resolveSduiTextLimits(layout.id, { typography: typographyOverride }),
  }));
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(input: SduiPlannerInput): string {
  // ---- Reference section -------------------------------------------------
  let refSection = '';
  const mode = input.referenceMode ?? 'no_reference';

  if (mode === 'auto_match' && input.referenceCatalog && input.referenceCatalog.length > 0) {
    const catalog = input.referenceCatalog.map((r) => ({
      id: r.id,
      name: r.name,
      tags: r.tags,
      dna: r.dna,
    }));
    refSection =
      `\n\n[MODE: AUTO_MATCH] Berikut katalog referensi layout yang tersedia. ` +
      `Pilih 1 yang paling relevan dengan topik dan isi field "chosen_reference_id" di level root output JSON.\n` +
      `Katalog: ${JSON.stringify(catalog)}\n` +
      `Terapkan arsitektur komponen (component_sequence) dan typography_scale dari referensi yang dipilih pada SETIAP slide.`;
  } else if (mode === 'manual' && input.chosenReference) {
    const r = input.chosenReference;
    refSection =
      `\n\n[MODE: MANUAL_GALLERY] Pengguna telah memilih referensi layout: "${r.name}" (id: ${r.id}).\n` +
      `Visual DNA: ${JSON.stringify(r.dna)}\n` +
      `WAJIB menerapkan component_sequence [${r.dna.componentSequence.join(', ')}] dan typography_scale "${r.dna.typographyScale}" ` +
      `serta layout_archetype "${r.dna.layoutArchetype}" pada SETIAP slide.`;
  }

  const repairSlideNumbers = input.failedImageSlideNumbers ?? [];
  const noImageRepairLayouts = LAYOUT_CATALOG
    .filter((layout) => !layout.supportsImage)
    .map((layout) => ({ id: layout.id, family: layout.family, requiredComponents: layout.requiredComponents, bestFor: layout.bestFor }));
  const repairSection = input.repairMode === 'image_failure_no_image'
    ? `\n\n[MODE: IMAGE_FAILURE_REPAIR]
Image generation provider gagal untuk slide nomor: ${JSON.stringify(repairSlideNumbers)}.
Tugasmu adalah memperbaiki HANYA slide terdampak agar memakai layout TANPA image.
Aturan repair:
- Untuk slide terdampak, pilih layout_variant_id hanya dari katalog no-image berikut: ${JSON.stringify(noImageRepairLayouts)}.
- Untuk slide terdampak, set image_requirement = "none".
- Untuk slide terdampak, HAPUS semua komponen bertipe "image_placeholder".
- Jangan membuat placeholder kosong, visual abstrak lokal, atau komponen pengganti yang membutuhkan gambar.
- Pertahankan jumlah slide, urutan slide, bahasa, dan pesan utama.
- Slide yang tidak terdampak boleh dipertahankan apa adanya kecuali perlu sedikit penyesuaian agar deck tetap mengalir.`
    : '';

  const effectiveLayoutCatalog = promptLayoutCatalog(input.typographyOverride);
  const typographySection = input.typographyOverride
    ? `\nUkuran teks efektif dari setting: ${JSON.stringify(input.typographyOverride)}. Jadikan textLimits sebagai constraint kreatif: ringkas, ubah struktur, atau pilih layout lain agar ide user tetap tersampaikan tanpa dipotong.`
    : '';
  const explicitImageSection = promptExplicitlyRequestsImages(input.prompt) && input.repairMode !== 'image_failure_no_image'
    ? `\n\n[USER EXPLICITLY REQUESTED IMAGE]
Prompt user meminta gambar/image/foto/ilustrasi/visual. WAJIB buat minimal 1 slide dengan:
- image_requirement = "required"
- layout_variant_id dari layout supportsImage=true
- komponen image_placeholder di core_content
- image_object_context konkret dalam Bahasa Inggris.
Jangan mengembalikan semua slide image_requirement="none".`
    : '';

  const base = `Kamu adalah AI Planner untuk carousel media sosial (Instagram/LinkedIn). Tugasmu HANYA menyusun struktur konten dan menulis teks. Kamu DILARANG menentukan ukuran piksel, warna, atau font — itu dikunci oleh Brand Kit.${typographySection}${explicitImageSection}

Kembalikan HANYA JSON valid (tanpa markdown, tanpa penjelasan) dengan skema:
{
  "chosen_reference_id": "ref-id-jika-auto_match" (atau null),
  "slides": [
	    {
	      "slide_number": 1,
	      "slide_type": "cover" | "content",
	      "container_layout": "text_dominant" | "split_screen" | "background_overlay",
	      "layout_variant_id": ${JSON.stringify(LAYOUT_VARIANT_IDS)},
	      "image_requirement": "required" | "optional" | "none",
	      "typography_scale": "editorial_bold" | "balanced_classic" | "information_dense",
	      "contentDirection": "column" | "row",
      "nested_groups": {
        "top_meta": [ { "type": "tag", "text": "LABEL", "textTransform": "uppercase" } ],
        "core_content": [
          { "type": "header", "text": "Judul", "highlight": "kata", "heightPercent": 25, "align": "left", "verticalAlign": "center" },
          { "type": "body", "text": "Penjelasan", "heightPercent": 15, "align": "left" },
          { "type": "image_placeholder", "requires_generation": true, "image_object_context": "English brief for required generated artwork" },
          { "type": "visual_layer", "visual_treatment": "floating_object", "visual_brief": "English brief for artwork/composition", "anchor": "center", "allowedOverflow": true, "mask": "organic", "safeTextZones": ["left", "bottom"] }
        ],
        "action_footer": [
          { "type": "button_cta", "label": "Swipe", "style": "primary" }
        ]
      }
    }
  ]
}

	ATURAN LAYOUT (PENTING):
- Pilih TEPAT 1 "layout_variant_id" dari katalog lengkap ini untuk tiap slide: ${JSON.stringify(effectiveLayoutCatalog)}.
- Set TEPAT 1 "image_requirement" per slide:
  * "required": visual sangat membantu pemahaman, demo, proof, product, before/after, mood, atau contoh konkret.
  * "optional": visual hanya dekoratif/penambah rasa; slide tetap kuat tanpa gambar.
  * "none": slide memang lebih kuat tanpa visual atau user tidak meminta visual untuk bagian itu.
- Kalau image_requirement = "required", pilih layout yang supportsImage=true dan wajib sertakan image_placeholder dengan image_object_context konkret dalam Bahasa Inggris.
- Kalau image_requirement = "optional", boleh pakai layout image jika visualnya relevan dengan prompt, mood, storytelling, contoh, atau kreativitas deck.
- Kalau image_requirement = "none", WAJIB pilih layout supportsImage=false dan JANGAN sertakan image_placeholder.
- Jika user menyebut style visual tertentu (misalnya photo realistic, 3D, watercolor, flat vector, anime, sticker, no background/transparan), masukkan style itu ke image_object_context dalam Bahasa Inggris.
- Untuk komposisi visual dinamis, kamu boleh menambahkan "visual_layer" sebagai metadata kreatif. Gunakan visual_treatment hanya dari: boxed_image, circle_asset, transparent_cutout, full_bleed_background, floating_object, pattern_layer, editorial_collage, ui_mockup_board, callout_card, connector_line.
- visual_layer TIDAK menggantikan image_placeholder untuk gambar wajib. Jika user minta gambar, tetap wajib sertakan image_placeholder pada minimal 1 slide; visual_layer hanya menjelaskan treatment/komposisi untuk composer generasi berikutnya.
- Untuk style seperti screenshot modern/editorial: gunakan kombinasi visual_layer ui_mockup_board, callout_card, connector_line, pattern_layer, floating_object, sambil tetap menjaga area tag/logo/footer/pagination tidak disentuh.
- VARIASIKAN family layout antar-slide. Untuk 5 slide, gunakan minimal 4 layout-family berbeda bila komponen dan cerita memungkinkan. Jangan pakai layout_variant_id yang sama dua slide berturut-turut.
- Kamu BOLEH menambahkan field heightPercent/align/dll, tapi worker akan mengabaikannya — fokus saja pilih template yang tepat + tulis konten yang bagus.
- "textTransform": "uppercase" hanya untuk tag.

Kontrak teknis:
- Hasilkan TEPAT ${input.slideCount} slide (tidak lebih, tidak kurang). slide_number mulai dari 1 berurutan.
- Slide pertama bertipe "cover", sisanya "content".
- Utamakan prompt user. textLimits adalah batas render, bukan alasan untuk membuang ide. Jika ide user panjang, ringkas secara natural, ubah menjadi checklist/CTA/quote, pilih layout lain, atau sebar ide ke slide lain dalam jumlah slide yang tersedia.
- Output akhir tetap harus muat dalam textLimits dari layout_variant_id yang dipilih:
  * header/body/quote/ctaLabel/checklistItem = maksimal karakter.
  * checklistItems = maksimal jumlah poin.
  * tag maksimal 1-3 kata dan sesuai textLimits.tag.
- Header sebaiknya headline singkat, tetapi boleh berupa statement utuh jika itu lebih sesuai dengan prompt dan masih muat.
- Jangan pernah membuat slide content yang hanya berisi header. Slide content wajib punya body, quote, checklist berisi minimal 2 item, atau CTA label yang relevan.
- Jika memilih layout checklist, komponen checklist WAJIB punya 2 sampai textLimits.checklistItems item non-empty. Jangan pernah mengirim checklist kosong.
- Semua body/quote/checklistItem harus berupa kalimat/frasa utuh dalam batas karakter, jangan terpotong di tengah kata atau tengah kalimat.
- Gunakan image_placeholder bila image_requirement required/optional dan gambar memperkuat prompt user. Jika user meminta deck yang visual-heavy, boleh gunakan lebih banyak slide visual selama tetap relevan dan layout mendukung.
- Untuk topik abstrak, boleh pilih visual metaforis/ilustratif jika prompt user meminta visual atau jika visual membuat carousel lebih kuat.
- top_meta: satu "tag" pendek (1-3 kata, textTransform uppercase).
- "highlight": 1 frasa (1-3 kata) dari teks header yang diberi aksen warna.
- Nada konten: ${input.tone}. Bahasa mengikuti bahasa prompt user.
- JANGAN menaruh url, logo, atau nomor halaman.${refSection}${repairSection}

Topik/prompt user: ${input.prompt}`;

  if (input.feedback && input.previousSlides && input.previousSlides.length > 0) {
    return (
      base +
      `\n\nIni revisi. Draft sebelumnya:\n${JSON.stringify({ slides: input.previousSlides })}\n\n` +
      `Umpan balik user: "${input.feedback}". Perbarui HANYA isi teks/komponen sesuai umpan balik, pertahankan jumlah slide dan struktur skema. Kembalikan JSON penuh.`
    );
  }
  return base;
}

function buildCompletenessRepairPrompt(input: SduiPlannerInput, slides: SduiSlide[], issues: string[]): string {
  return (
    buildPrompt({
      ...input,
      previousSlides: slides,
      feedback:
        `QUALITY REPAIR WAJIB. Perbaiki issue berikut: ${issues.join('; ')}. ` +
        `Jangan ubah jumlah slide. Jangan buat slide content hanya header. ` +
        `Checklist harus punya minimal 2 item non-empty. Body/quote harus non-empty bila layout membutuhkannya. ` +
        `Jika ada body/quote/checklistItem yang berakhir dengan kata sambung seperti "yang", "dan", "untuk", "dengan", tulis ulang menjadi frasa/kalimat pendek yang selesai. ` +
        `Jika teks terlalu panjang untuk textLimits, JANGAN sekadar memotong. Ringkas secara natural, pecah ide menjadi checklist/CTA bila cocok, atau pilih layout_variant_id lain yang lebih sesuai. ` +
        `Pilih layout_variant_id lain bila layout saat ini tidak cocok dengan isi. ` +
        `Tulis ulang teks agar utuh, kreatif, dan tetap dalam textLimits.`,
    }) +
    `\n\nValidasi akhir wajib lolos. Issue yang harus hilang: ${JSON.stringify(issues)}`
  );
}

// ---------------------------------------------------------------------------
// Parsing / validation
// ---------------------------------------------------------------------------

const COMPONENT_TYPES = new Set([
  'tag', 'header', 'body', 'checklist', 'button_cta', 'image_placeholder', 'visual_layer', 'quote',
]);
const LAYOUT_VARIANT_SET = new Set<string>(LAYOUT_VARIANT_IDS);

function sanitizeComponent(raw: unknown): SduiComponent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const type = r.type;
  if (typeof type !== 'string' || !COMPONENT_TYPES.has(type)) return null;

  const comp: SduiComponent = { type: type as SduiComponent['type'] };
  if (typeof r.text === 'string') {
    comp.text =
      type === 'header'
        ? r.text.slice(0, HEADER_HARD_MAX)
        : type === 'body'
          ? r.text.slice(0, BODY_HARD_MAX)
          : type === 'quote'
            ? r.text.slice(0, QUOTE_HARD_MAX)
            : r.text.slice(0, HEADER_HARD_MAX);
  }
  if (typeof r.highlight === 'string' && r.highlight.trim().length > 0) comp.highlight = r.highlight.slice(0, 60);
  if (typeof r.label === 'string') comp.label = r.label.slice(0, 30);
  if (Array.isArray(r.items)) comp.items = r.items.filter((i): i is string => typeof i === 'string').map((i) => i.slice(0, CHECKLIST_ITEM_HARD_MAX)).slice(0, 6);
  if (r.style === 'primary' || r.style === 'secondary') comp.style = r.style;
  if (r.requires_generation === true) comp.requires_generation = true;
  if (typeof r.asset_type === 'string') comp.asset_type = r.asset_type;
  if (typeof r.image_object_context === 'string') comp.image_object_context = r.image_object_context.slice(0, 300);
  if (
    r.visual_treatment === 'boxed_image' ||
    r.visual_treatment === 'circle_asset' ||
    r.visual_treatment === 'transparent_cutout' ||
    r.visual_treatment === 'full_bleed_background' ||
    r.visual_treatment === 'floating_object' ||
    r.visual_treatment === 'pattern_layer' ||
    r.visual_treatment === 'editorial_collage' ||
    r.visual_treatment === 'ui_mockup_board' ||
    r.visual_treatment === 'callout_card' ||
    r.visual_treatment === 'connector_line'
  ) {
    comp.visual_treatment = r.visual_treatment;
  }
  if (typeof r.visual_brief === 'string') comp.visual_brief = r.visual_brief.slice(0, 300);
  if (
    r.anchor === 'center' ||
    r.anchor === 'top' ||
    r.anchor === 'bottom' ||
    r.anchor === 'left' ||
    r.anchor === 'right' ||
    r.anchor === 'top-left' ||
    r.anchor === 'top-right' ||
    r.anchor === 'bottom-left' ||
    r.anchor === 'bottom-right'
  ) {
    comp.anchor = r.anchor;
  }
  if (typeof r.allowedOverflow === 'boolean') comp.allowedOverflow = r.allowedOverflow;
  if (
    r.mask === 'none' ||
    r.mask === 'circle' ||
    r.mask === 'rounded' ||
    r.mask === 'squircle' ||
    r.mask === 'organic'
  ) {
    comp.mask = r.mask;
  }
  if (Array.isArray(r.safeTextZones)) {
    const zones = r.safeTextZones.filter((zone): zone is 'top' | 'bottom' | 'left' | 'right' | 'center' =>
      zone === 'top' || zone === 'bottom' || zone === 'left' || zone === 'right' || zone === 'center',
    );
    if (zones.length > 0) comp.safeTextZones = [...new Set(zones)].slice(0, 5);
  }
  if (typeof r.targetId === 'string') comp.targetId = r.targetId.slice(0, 80);
  // Layout properties (Level 2)
  if (typeof r.heightPercent === 'number') comp.heightPercent = Math.max(5, Math.min(100, r.heightPercent));
  if (r.align === 'left' || r.align === 'center' || r.align === 'right') comp.align = r.align;
  if (r.verticalAlign === 'top' || r.verticalAlign === 'center' || r.verticalAlign === 'bottom') comp.verticalAlign = r.verticalAlign;
  if (r.textTransform === 'uppercase' || r.textTransform === 'none') comp.textTransform = r.textTransform;
  return comp;
}

function parseSlides(
  parsed: unknown,
  typographyOverride?: SduiTypographyOverride,
  options: { applyTextGuardrails?: boolean } = {},
): { slides: SduiSlide[]; chosenReferenceId?: string } | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const rawSlides = (parsed as Record<string, unknown>).slides;
  if (!Array.isArray(rawSlides)) return null;
  const chosenReferenceId = typeof (parsed as Record<string, unknown>).chosen_reference_id === 'string'
    ? ((parsed as Record<string, unknown>).chosen_reference_id as string)
    : undefined;

  const slides: SduiSlide[] = [];
  rawSlides.forEach((rs, i) => {
    if (typeof rs !== 'object' || rs === null) return;
    const r = rs as Record<string, unknown>;
    const groupsRaw = (r.nested_groups ?? {}) as Record<string, unknown>;

    const mapGroup = (key: string): SduiComponent[] => {
      const arr = groupsRaw[key];
      if (!Array.isArray(arr)) return [];
      return arr.map(sanitizeComponent).filter((c): c is SduiComponent => c !== null);
    };

    const slideType = r.slide_type === 'cover' || i === 0 ? 'cover' : 'content';
    const layout =
      r.container_layout === 'split_screen' || r.container_layout === 'background_overlay'
        ? r.container_layout
        : 'text_dominant';
	    const scale: TypographyScale =
      r.typography_scale === 'editorial_bold' ||
      r.typography_scale === 'information_dense' ||
      r.typography_scale === 'balanced_classic'
	        ? r.typography_scale
	        : 'balanced_classic';
	    const layoutVariant =
	      typeof r.layout_variant_id === 'string' && LAYOUT_VARIANT_SET.has(r.layout_variant_id)
	        ? (r.layout_variant_id as SduiSlide['layout_variant_id'])
	        : undefined;
    const layoutFamily = layoutFamilyFor(layoutVariant);
    const nestedGroups = {
      top_meta: mapGroup('top_meta'),
      core_content: mapGroup('core_content'),
      action_footer: mapGroup('action_footer'),
    };
    const hasImagePlaceholder = (['top_meta', 'core_content', 'action_footer'] as const).some((group) =>
      nestedGroups[group].some((component) => component.type === 'image_placeholder'),
    );
    const imageRequirement: ImageRequirement =
      r.image_requirement === 'required' || r.image_requirement === 'optional' || r.image_requirement === 'none'
        ? r.image_requirement
        : hasImagePlaceholder
          ? 'optional'
          : 'none';

    const slide: SduiSlide = {
	      slide_number: i + 1,
	      slide_type: slideType as SduiSlide['slide_type'],
	      container_layout: layout as SduiSlide['container_layout'],
	      ...(layoutVariant ? { layout_variant_id: layoutVariant } : {}),
      ...(layoutFamily ? { layout_family: layoutFamily } : {}),
      image_requirement: imageRequirement,
      layout_source: 'ai_selected',
      ...(imageRequirement === 'none' ? { image_status: 'not_needed' as const } : {}),
	      typography_scale: scale,
	      ...(r.contentDirection === 'row' || r.contentDirection === 'column'
	        ? { contentDirection: r.contentDirection as 'row' | 'column' }
	        : {}),
      nested_groups: nestedGroups,
    };
	    slides.push(options.applyTextGuardrails === true
      ? applySduiTextGuardrails(slide, { typography: typographyOverride })
      : slide);
  });

  if (slides.length === 0) return null;
  const out: { slides: SduiSlide[]; chosenReferenceId?: string } = { slides };
  if (chosenReferenceId) out.chosenReferenceId = chosenReferenceId;
  return out;
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function extractErrorMessage(error: import('@leads-generator/shared').AppError): string {
  return error.code === 'VALIDATION' ? error.messages.join(', ') : error.message;
}

function mapWrapperError(message: string): SduiPlannerError {
  switch (message) {
    case 'budget_exceeded': return { kind: 'budget_exceeded' };
    case 'endpoint_mismatch': return { kind: 'endpoint_mismatch' };
    case 'insecure_transport': return { kind: 'insecure_transport' };
    case 'privacy_violation': return { kind: 'privacy_violation' };
    case 'timeout': return { kind: 'timeout' };
    default: return { kind: 'provider_error', message };
  }
}

// ---------------------------------------------------------------------------
// DefaultSduiPlanner
// ---------------------------------------------------------------------------

export class DefaultSduiPlanner implements SduiPlanner {
  constructor(private readonly deps: SduiPlannerDeps) {}

  async plan(input: SduiPlannerInput, signal: AbortSignal): Promise<Result<SduiPlanResult, SduiPlannerError>> {
    const fullPrompt = buildPrompt(input);
    const textBaseUrl = await this.deps.settings.loadApiBaseUrl(input.teamId, 'content_suggestion');

    const settings = await this.deps.settings.getSettings(input.teamId);
    const textModel = settings.textModel || 'gemini-2.5-flash-lite';

    const ctx: AiCallContext = {
      teamId: input.teamId,
      jobId: input.jobId,
      actorId: input.actorId,
      trigger: 'manual',
      callType: 'planner_text',
      apiKeyPurpose: 'content_suggestion',
      endpointUrl: 'dynamic:text-provider',
      dataScope: 'prompt + brand_kit_theme (sdui)',
    };

    const executePlannerPrompt = (promptText: string) => this.deps.wrapper.execute(ctx, async (apiKey) => {
      const baseUrl = requireProviderBaseUrl(textBaseUrl);
      const providerKind = providerKindFromBaseUrl(baseUrl);
      let response: Response;
      if (providerKind === 'openai_compatible') {
        response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: textModel,
            messages: [{ role: 'user', content: promptText }],
            temperature: 0.7,
            response_format: { type: 'json_object' },
          }),
          signal,
        });
      } else {
        const targetUrl = `${baseUrl}/v1beta/models/${textModel}:generateContent`;
        response = await fetch(`${targetUrl}?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
          }),
          signal,
        });
      }

      if (!response.ok) {
        const body = await response.text().catch(() => response.statusText);
        throw new Error(`provider_http_${response.status}: ${body}`);
      }

      let text: string | undefined;
      if (providerKind === 'openai_compatible') {
        const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
        text = data?.choices?.[0]?.message?.content;
      } else {
        const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      }
      if (typeof text !== 'string') throw new Error('provider_empty_response');
      return text;
    });

    const parsePlannerResult = (text: string): SduiPlanResult | null => {
      const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
          parsed = JSON.parse(cleaned.slice(start, end + 1));
        } catch {
          return null;
        }
      }

      return parseSlides(parsed, input.typographyOverride);
    };

    const wrapperResult = await executePlannerPrompt(fullPrompt);

    if (!wrapperResult.ok) {
      return err(mapWrapperError(extractErrorMessage(wrapperResult.error)));
    }

    const result = parsePlannerResult(wrapperResult.value);
    if (!result) return err({ kind: 'non_json' });
    result.slides = ensureExplicitImageRequest(input.prompt, result.slides);

    const qualityIssues = [
      ...sduiTextFitIssues(result.slides, { typography: input.typographyOverride }),
      ...sduiContentQualityIssues(result.slides),
      ...sduiImageRequirementIssues(input, result.slides),
    ];
    if (qualityIssues.length > 0) {
      const repairPrompt = buildCompletenessRepairPrompt(input, result.slides, qualityIssues);
      const repairWrapperResult = await executePlannerPrompt(repairPrompt);
      if (!repairWrapperResult.ok) {
        return err(mapWrapperError(extractErrorMessage(repairWrapperResult.error)));
      }
      const repaired = parsePlannerResult(repairWrapperResult.value);
      if (!repaired) return err({ kind: 'non_json' });
      repaired.slides = ensureExplicitImageRequest(input.prompt, repaired.slides);
      repaired.slides = repaired.slides.map((slide) => applySduiTextGuardrails(slide, { typography: input.typographyOverride }));
      const remainingIssues = [
        ...sduiTextFitIssues(repaired.slides, { typography: input.typographyOverride }),
        ...sduiContentQualityIssues(repaired.slides),
        ...sduiImageRequirementIssues(input, repaired.slides),
      ];
      if (remainingIssues.length > 0) {
        return ok({
          ...repaired,
          qualityWarnings: remainingIssues,
        }) as Result<SduiPlanResult, SduiPlannerError>;
      }
      return ok(repaired) as Result<SduiPlanResult, SduiPlannerError>;
    }

    result.slides = result.slides.map((slide) => applySduiTextGuardrails(slide, { typography: input.typographyOverride }));
    return ok(result) as Result<SduiPlanResult, SduiPlannerError>;
  }
}
