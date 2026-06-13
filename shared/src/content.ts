/**
 * Content carousel generator domain types for the
 * `ai-content-carousel-generator` feature.
 *
 * Mirrors the Components and Interfaces → Aksi RBAC & Tipe Bersama section
 * of design.md. Pure type contracts — no runtime logic.
 *
 * Requirements: 12.1; foundation for all requirements in the feature.
 */

import type { AppErrorCode } from './errors.js';

// ---------------------------------------------------------------------------
// Primitive / enum types
// ---------------------------------------------------------------------------

/** Supported slide aspect ratios. */
export type AspectRatio = '1:1' | '4:5' | '9:16';

/**
 * All layout block types that can appear in a slide.
 * 9 distinct types per design spec.
 */
export type BlockType =
  | 'heading'
  | 'body'
  | 'mockup'
  | 'chart'
  | 'quote'
  | 'stat'
  | 'bullet'
  | 'cta'
  | 'image';

/** Top-level generation job lifecycle status. */
export type JobStatus = 'pending' | 'success' | 'failed';

/** Per-slide rendering status within a job. */
export type SlideStatus = 'pending' | 'success' | 'failed';

/**
 * All structured failure reasons used in error handling.
 * Maps 1-to-1 with the Error Handling table in design.md.
 */
export type FailureReason =
  | 'validation_error'
  | 'budget_exceeded'
  | 'endpoint_mismatch'
  | 'insecure_transport'
  | 'privacy_violation'
  | 'background_unclean'
  | 'missing_chart_data'
  | 'missing_mockup'
  | 'upload_failed'
  | 'off_brand'
  | 'provider_error'
  | 'malformed_output'
  | 'timeout'
  | 'layout_unsatisfiable';

// ---------------------------------------------------------------------------
// Brand Kit types
// ---------------------------------------------------------------------------

/** A single brand color expressed as a hex string (e.g. `'#FF5733'`). */
export interface BrandColor {
  hex: string;
}

/** Logo and page-number chrome applied to every slide. */
export interface ChromeDefinition {
  /** Where the team logo is placed on each slide. */
  logoPlacement: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
  /** Format string for page numbers, e.g. `'{current}/{total}'` or `''` to hide. */
  pageNumberFormat: string;
  /** Team website shown in footer or chrome area. */
  siteUrl: string;
}

/**
 * Raw font file input when uploading a brand font.
 * `Buffer` is the Node.js global — no explicit import needed.
 */
export interface BrandFontInput {
  /** Raw font file bytes. */
  bytes: Buffer;
  /** CSS font-family name (e.g. `'Inter'`). */
  family: string;
  /** Numeric CSS font-weight (e.g. `400`, `700`). */
  weight?: number;
  /** CSS font-style. */
  style?: 'normal' | 'italic';
  /** Font file format. */
  format: 'ttf' | 'otf';
}

/**
 * Input payload for creating or replacing a team's BrandKit.
 */
export interface BrandKitInput {
  /** Raw logo file. */
  logo?: {
    bytes: Buffer;
    contentType: string;
  } | undefined;
  /** One or more brand fonts. */
  fonts?: BrandFontInput[] | undefined;
  /** Hex color strings (e.g. `['#FF5733', '#1A1A2E']`). */
  colors: string[];
  /** Slide chrome configuration. */
  chrome: ChromeDefinition;
  /** Optional per-role typography & color system. */
  typography?: BrandTypography;
}

/** A persisted brand font entry (after upload to object storage). */
export interface BrandFont {
  id: string;
  /** Public CDN URL to the font file. */
  url: string;
  family: string;
  weight?: number;
  style?: 'normal' | 'italic';
}

/**
 * Per-role text styling: which uploaded font, which hex color, and optional
 * preferred font size. Renderers may clamp/shrink `sizePx` to keep text inside
 * the slide safe area.
 * `fontFamily` must match the `family` of one uploaded BrandFont
 * (empty string = use the first uploaded font).
 */
export interface BrandTextRole {
  fontFamily: string;
  color: string;
  sizePx?: number | undefined;
}

/**
 * Typography & color system for a Brand Kit. Cover, Header, and Body each pick
 * a font (dropdown), color, and optional preferred size. Highlight is
 * color-only (reuses the surrounding text's font). The chrome fields style
 * elements OUTSIDE the content safe box (background, pagination, meta text/pill).
 */
export interface BrandTypography {
  /** Cover/title role. Falls back to `header` for older Brand Kits. */
  cover?: BrandTextRole | undefined;
  header: BrandTextRole;
  body: BrandTextRole;
  /** Color applied to highlighted words inside header/body. */
  highlightColor: string;
  /** Canvas background color. */
  background: string;
  /** Pagination ("01 / 05") color. */
  paginationColor: string;
  /** Meta/placeholder text color (URL pill text, tag, swipe label). */
  metaTextColor: string;
  /** Accent color for pills/buttons (pill + swipe button background). */
  accent: string;
}

/**
 * A team's persisted BrandKit — the source of truth for brand assets
 * used during carousel rendering.
 */
export interface BrandKit {
  id: string;
  teamId: string;
  /** Public CDN URL to the uploaded logo. */
  logoUrl: string;
  fonts: BrandFont[];
  /** Hex color strings. */
  colors: string[];
  chrome: ChromeDefinition;
  /** Per-role typography & color system (optional for backward compatibility). */
  typography?: BrandTypography;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Master Template types
// ---------------------------------------------------------------------------

/** Maximum character count for a specific block type. */
export interface TextLengthLimit {
  blockType: BlockType;
  maxChars: number;
}

/**
 * Persisted master template that governs what a team's carousels may
 * contain (allowed blocks, max slides, aspect ratios, tone).
 */
export interface MasterTemplate {
  id: string;
  teamId: string;
  brandKitId: string;
  /** Block types permitted in slides. */
  allowedBlocks: BlockType[];
  /** Maximum number of slides per carousel. */
  maxSlides: number;
  /** Per-block character limits. */
  textLimits: TextLengthLimit[];
  /** Permitted slide aspect ratios. */
  aspectRatios: AspectRatio[];
  /** Default AI tone instruction (e.g. `'professional'`). */
  defaultTone: string;
  updatedAt: Date;
}

/**
 * Runtime-validated, immutable view of a MasterTemplate used inside the
 * generation pipeline (uses ReadonlySet / ReadonlyMap for safety).
 */
export interface MasterTemplateRules {
  readonly allowedBlocks: ReadonlySet<BlockType>;
  readonly maxSlides: number;
  /** Maps each BlockType to its max character count. */
  readonly textLimits: ReadonlyMap<BlockType, number>;
  readonly aspectRatios: ReadonlySet<AspectRatio>;
  readonly defaultTone: string;
  readonly brandKitId: string;
}

// ---------------------------------------------------------------------------
// Content Plan types
// ---------------------------------------------------------------------------

/** A single content block inside a slide. */
export interface ContentPlanBlock {
  type: BlockType;
  /** Rendered text (for heading, body, quote, stat, bullet, cta). */
  text?: string;
  /** Reference key to a ChartData payload for `chart` blocks. */
  chartDataRef?: string;
  /** Reference key to a mockup asset for `mockup` blocks. */
  mockupRef?: string;
  /** Reference key to an image asset for `image` blocks. */
  imageRef?: string;
}

/** A single slide in a content plan. */
export interface ContentPlanSlide {
  /** 0-based slide index. */
  index: number;
  /** Optional hint to the renderer about which layout variant to use. */
  layoutVariantHint?: string;
  blocks: ContentPlanBlock[];
}

/** The full structured content plan produced by the AI planner step. */
export interface ContentPlan {
  aspectRatio: AspectRatio;
  slides: ContentPlanSlide[];
}

// ---------------------------------------------------------------------------
// Chart data
// ---------------------------------------------------------------------------

/** Structured data payload for chart blocks. */
export interface ChartData {
  kind: 'bar' | 'line' | 'pie';
  series: {
    label: string;
    value: number;
  }[];
}

// ---------------------------------------------------------------------------
// Provider settings
// ---------------------------------------------------------------------------

/**
 * Per-team AI provider configuration for the Imagen/rendering backend.
 * `kind` determines whether the official Google endpoint or a third-party
 * proxy is used.
 */
export interface ProviderSetting {
  teamId: string;
  kind: 'google_official' | 'third_party_proxy';
  /** Base URL of the rendering endpoint. */
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// Approved example
// ---------------------------------------------------------------------------

/**
 * A human-approved carousel example used as a few-shot reference for the
 * AI content planner.
 */
export interface ApprovedExampleStructure {
  aspectRatio: AspectRatio;
  /** Semantic tags used for retrieval (e.g. `['product-launch', 'B2B']`). */
  tags: string[];
  slides: {
    blocks: BlockType[];
    layoutVariant?: string;
  }[];
}

// ---------------------------------------------------------------------------
// Job view (read model)
// ---------------------------------------------------------------------------

/**
 * Public read model of a carousel generation job, returned by the API.
 */
export interface JobView {
  jobId: string;
  status: JobStatus;
  /** Set on terminal failure. */
  reason?: FailureReason;
  /** Stable code derived from `reason`, useful for UI/debugging. */
  errorCode?: AppErrorCode;
  /** Final per-slide layout/image audit captured by the worker. */
  layoutAudit?: SduiSlideAudit[];
  slides: {
    index: number;
    status: SlideStatus;
    /** Public CDN URL available once the slide is successfully rendered. */
    imageUrl?: string;
    /** True when the renderer fell back to a safe default layout. */
    usedFallbackLayout: boolean;
    /** Set when this individual slide failed. */
    reason?: FailureReason;
    /** Stable code derived from slide `reason`, useful for UI/debugging. */
    errorCode?: AppErrorCode;
  }[];
}

// ---------------------------------------------------------------------------
// Server-Driven UI (SDUI) carousel contract — feature-update.md (v2)
// ---------------------------------------------------------------------------
//
// The SDUI model separates the AI "Brain" (text + structure only) from the
// deterministic rendering "Worker" (Satori → PNG). The AI never touches pixel
// sizes, colors, or fonts — those are locked by the Brand Kit.

/** Cover (first slide) vs regular content slide. */
export type SlideType = 'cover' | 'content';

/** Layout archetype the renderer applies inside the safe zone. */
export type ContainerLayout = 'text_dominant' | 'split_screen' | 'background_overlay';

/** Typography scale archetype → header/body size ratio multiplier. */
export type TypographyScale = 'editorial_bold' | 'balanced_classic' | 'information_dense';

/**
 * Controlled layout recipes selected by the AI planner and executed
 * deterministically by the renderer. These keep brand styling locked while
 * allowing deck composition to vary.
 */
export type LayoutVariantId =
  // === EXISTING 15 ===
  | 'cover_centered'
  | 'cover_editorial_left'
  | 'cover_image_full'
  | 'text_centered'
  | 'text_stack'
  | 'split_text_left_image_right'
  | 'split_image_left_text_right'
  | 'image_top_text_bottom'
  | 'text_top_image_bottom'
  | 'checklist_stack'
  | 'numbered_steps'
  | 'quote_focus'
  | 'stat_highlight'
  | 'big_statement'
  | 'cta_centered'
  // === NEW 15 (mixed components) ===
  | 'split_checklist_image'        // checklist kiri + gambar kanan
  | 'split_image_checklist'        // gambar kiri + checklist kanan
  | 'split_stat_image'             // angka besar kiri + gambar kanan
  | 'image_top_checklist_bottom'   // gambar atas + checklist bawah
  | 'quote_with_image'             // quote center + gambar kecil bawah
  | 'header_body_cta'              // judul + body + tombol CTA (column)
  | 'split_header_body_cta'        // teks (judul+body+cta) kiri + gambar kanan
  | 'cover_checklist'              // cover style + checklist poin dibawah judul
  | 'numbered_with_image'          // judul + steps bernomor + gambar samping
  | 'big_stat_with_body'           // angka raksasa + body + tombol kecil
  | 'two_column_text'              // dua kolom teks sejajar (heading kiri, bullets kanan)
  | 'image_full_caption'           // gambar hampir full + caption kecil di bawah
  | 'quote_stat_combo'             // kutipan + angka statistik di bawah
  | 'cover_with_cta'               // cover style + tombol CTA
  | 'checklist_with_body'          // judul + body intro + checklist

export type LayoutFamily =
  | 'cover'
  | 'text'
  | 'checklist'
  | 'quote'
  | 'stat'
  | 'cta'
  | 'image_split'
  | 'image_stack'
  | 'image_focus';

export type ImageRequirement = 'required' | 'optional' | 'none';
export type LayoutSource = 'ai_selected' | 'worker_adjusted' | 'ai_repaired_after_image_failure';
export type ImageStatus = 'not_needed' | 'generated' | 'provider_failed_repaired';

export interface LayoutCatalogItem {
  id: LayoutVariantId;
  family: LayoutFamily;
  requiredComponents: SduiComponentType[];
  supportsImage: boolean;
  bestFor: string;
  visualRole: string;
  fallbackFamilies: LayoutFamily[];
  textLimits: SduiLayoutTextLimits;
}

export interface SduiLayoutTextLimits {
  tag: number;
  header?: number;
  body?: number;
  quote?: number;
  ctaLabel?: number;
  checklistItem?: number;
  checklistItems?: number;
}

/** Per-generation typography size override from the generator config panel. */
export interface SduiTypographyOverride {
  coverSizePx?: number | undefined;
  headerSizePx?: number | undefined;
  bodySizePx?: number | undefined;
}

export interface SduiSlideAudit {
  slide_number: number;
  layout_variant_id?: LayoutVariantId;
  layout_family?: LayoutFamily;
  image_requirement: ImageRequirement;
  layout_source: LayoutSource;
  image_status: ImageStatus;
}

/** Component types allowed inside a slide's nested groups. */
export type SduiComponentType =
  | 'tag'
  | 'header'
  | 'body'
  | 'checklist'
  | 'button_cta'
  | 'image_placeholder'
  | 'visual_layer'
  | 'quote';

export type VisualLayerTreatment =
  | 'boxed_image'
  | 'circle_asset'
  | 'transparent_cutout'
  | 'full_bleed_background'
  | 'floating_object'
  | 'pattern_layer'
  | 'editorial_collage'
  | 'ui_mockup_board'
  | 'callout_card'
  | 'connector_line';

export type VisualLayerAnchor =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/** A single SDUI component within a nested group. */
export interface SduiComponent {
  type: SduiComponentType;
  /** Text for tag/header/body/quote. */
  text?: string;
  /** A contiguous phrase within `text` to render in the highlight color. */
  highlight?: string;
  /** Label for button_cta. */
  label?: string;
  /** Items for checklist. */
  items?: string[];
  /** Style hint for button_cta. */
  style?: 'primary' | 'secondary';
  /** image_placeholder: whether the worker must generate the image. */
  requires_generation?: boolean;
  /** image_placeholder: kind of asset (e.g. "ui_mockup", "photo"). */
  asset_type?: string;
  /** image_placeholder: natural-language description used as the image prompt. */
  image_object_context?: string;
  /** Filled by the worker once the image is generated/available (CDN URL or data URI). */
  imageUrl?: string;
  /** visual_layer: dynamic visual treatment used by the next-gen composer. */
  visual_treatment?: VisualLayerTreatment;
  /** visual_layer: subject/metaphor/style brief used for generation or deterministic rendering. */
  visual_brief?: string;
  /** visual_layer: preferred placement inside the content canvas. */
  anchor?: VisualLayerAnchor;
  /** visual_layer: allow artwork to escape its nominal bounds without touching locked chrome. */
  allowedOverflow?: boolean;
  /** visual_layer: shape/mask hint for renderer/compiler. */
  mask?: 'none' | 'circle' | 'rounded' | 'squircle' | 'organic';
  /** visual_layer: safe text zones inferred/planned for image-heavy compositions. */
  safeTextZones?: Array<'top' | 'bottom' | 'left' | 'right' | 'center'>;
  /** visual_layer: connector target id for callout/connector primitives. */
  targetId?: string;

  // -- Layout instructions (Level 2: AI decides per-component positioning) --
  /** Vertical portion this component occupies within the slide (0-100%). */
  heightPercent?: number;
  /** Horizontal alignment: 'left' | 'center' | 'right'. */
  align?: 'left' | 'center' | 'right';
  /** Vertical alignment within its area: 'top' | 'center' | 'bottom'. */
  verticalAlign?: 'top' | 'center' | 'bottom';
  /** Text transform: 'uppercase' | 'none'. */
  textTransform?: 'uppercase' | 'none';
}

/** Figma-like nested auto-layout groups for a slide. */
export interface SduiNestedGroups {
  top_meta?: SduiComponent[];
  core_content?: SduiComponent[];
  action_footer?: SduiComponent[];
}

/** A single slide in the SDUI document. */
export interface SduiSlide {
  slide_number: number;
  slide_type: SlideType;
  container_layout: ContainerLayout;
  layout_variant_id?: LayoutVariantId;
  layout_family?: LayoutFamily;
  image_requirement?: ImageRequirement;
  layout_source?: LayoutSource;
  image_status?: ImageStatus;
  typography_scale?: TypographyScale;
  /** Main content flow direction decided by AI: 'column' (default) or 'row' (side-by-side). */
  contentDirection?: 'column' | 'row';
  nested_groups: SduiNestedGroups;
}

export const LAYOUT_CATALOG: readonly LayoutCatalogItem[] = [
  { id: 'cover_centered', family: 'cover', requiredComponents: ['header'], supportsImage: false, bestFor: 'Opening slide with a clear title and subtitle.', visualRole: 'No image; typography carries the hook.', fallbackFamilies: ['text', 'checklist', 'cta'], textLimits: { tag: 16, header: 52, body: 90 } },
  { id: 'cover_editorial_left', family: 'cover', requiredComponents: ['header'], supportsImage: false, bestFor: 'Editorial opening slide with a strong left-aligned headline.', visualRole: 'No image; composition and negative space carry the hook.', fallbackFamilies: ['text', 'checklist', 'cta'], textLimits: { tag: 16, header: 54, body: 90 } },
  { id: 'cover_image_full', family: 'image_focus', requiredComponents: ['header', 'image_placeholder'], supportsImage: true, bestFor: 'Dramatic opening when a concrete hero image is essential.', visualRole: 'Hero background image drives the first impression.', fallbackFamilies: ['cover', 'text'], textLimits: { tag: 16, header: 44, body: 76 } },
  { id: 'text_centered', family: 'text', requiredComponents: ['header', 'body'], supportsImage: false, bestFor: 'Balanced short explanation or educational point.', visualRole: 'No image; centered text clarity.', fallbackFamilies: ['checklist', 'quote', 'cta'], textLimits: { tag: 16, header: 44, body: 120 } },
  { id: 'text_stack', family: 'text', requiredComponents: ['header', 'body'], supportsImage: false, bestFor: 'Readable explanatory slide with title and paragraph.', visualRole: 'No image; structured copy carries the message.', fallbackFamilies: ['checklist', 'quote', 'stat'], textLimits: { tag: 16, header: 44, body: 130 } },
  { id: 'split_text_left_image_right', family: 'image_split', requiredComponents: ['header', 'body', 'image_placeholder'], supportsImage: true, bestFor: 'Concrete example, product, proof, or scene alongside explanation.', visualRole: 'Image supports the text in a side-by-side editorial split.', fallbackFamilies: ['text', 'checklist'], textLimits: { tag: 16, header: 34, body: 88 } },
  { id: 'split_image_left_text_right', family: 'image_split', requiredComponents: ['header', 'body', 'image_placeholder'], supportsImage: true, bestFor: 'Concrete visual lead with explanatory copy.', visualRole: 'Image leads the story, text explains.', fallbackFamilies: ['text', 'checklist'], textLimits: { tag: 16, header: 34, body: 88 } },
  { id: 'image_top_text_bottom', family: 'image_stack', requiredComponents: ['header', 'image_placeholder'], supportsImage: true, bestFor: 'Visual example above a concise explanation.', visualRole: 'Image is the first-read element.', fallbackFamilies: ['text', 'checklist'], textLimits: { tag: 16, header: 38, body: 86 } },
  { id: 'text_top_image_bottom', family: 'image_stack', requiredComponents: ['header', 'image_placeholder'], supportsImage: true, bestFor: 'Short claim followed by concrete visual proof.', visualRole: 'Image reinforces the text after reading.', fallbackFamilies: ['text', 'stat'], textLimits: { tag: 16, header: 38, body: 86 } },
  { id: 'checklist_stack', family: 'checklist', requiredComponents: ['header', 'checklist'], supportsImage: false, bestFor: 'Benefits, reasons, symptoms, steps, or warning signs.', visualRole: 'No image; list structure improves scanning.', fallbackFamilies: ['text', 'stat'], textLimits: { tag: 16, header: 38, body: 70, checklistItem: 46, checklistItems: 5 } },
  { id: 'numbered_steps', family: 'checklist', requiredComponents: ['header', 'checklist'], supportsImage: false, bestFor: 'Sequential guidance or process.', visualRole: 'No image; sequence is the visual structure.', fallbackFamilies: ['text', 'cta'], textLimits: { tag: 16, header: 38, body: 70, checklistItem: 44, checklistItems: 4 } },
  { id: 'quote_focus', family: 'quote', requiredComponents: ['quote'], supportsImage: false, bestFor: 'Testimonial, myth, principle, or memorable statement.', visualRole: 'No image; quote treatment is the visual anchor.', fallbackFamilies: ['text', 'stat'], textLimits: { tag: 16, quote: 100, body: 70 } },
  { id: 'stat_highlight', family: 'stat', requiredComponents: ['header', 'body'], supportsImage: false, bestFor: 'Data point, percentage, score, or key number.', visualRole: 'No image; the number becomes the visual.', fallbackFamilies: ['text', 'quote'], textLimits: { tag: 16, header: 18, body: 82 } },
  { id: 'big_statement', family: 'text', requiredComponents: ['header'], supportsImage: false, bestFor: 'One strong insight or transition statement.', visualRole: 'No image; oversized statement creates emphasis.', fallbackFamilies: ['quote', 'cta'], textLimits: { tag: 16, header: 52, body: 80 } },
  { id: 'cta_centered', family: 'cta', requiredComponents: ['header', 'button_cta'], supportsImage: false, bestFor: 'Closing action, resource, or next step.', visualRole: 'No image; CTA button anchors the slide.', fallbackFamilies: ['text', 'cover'], textLimits: { tag: 16, header: 40, body: 80, ctaLabel: 24 } },
  { id: 'split_checklist_image', family: 'image_split', requiredComponents: ['checklist', 'image_placeholder'], supportsImage: true, bestFor: 'Checklist paired with visual proof or example.', visualRole: 'Image supports a scannable checklist.', fallbackFamilies: ['checklist', 'text'], textLimits: { tag: 16, header: 32, checklistItem: 38, checklistItems: 4 } },
  { id: 'split_image_checklist', family: 'image_split', requiredComponents: ['checklist', 'image_placeholder'], supportsImage: true, bestFor: 'Visual-led checklist or comparison.', visualRole: 'Image leads, checklist interprets.', fallbackFamilies: ['checklist', 'text'], textLimits: { tag: 16, header: 32, checklistItem: 38, checklistItems: 4 } },
  { id: 'split_stat_image', family: 'image_split', requiredComponents: ['header', 'body', 'image_placeholder'], supportsImage: true, bestFor: 'Statistic with concrete visual context.', visualRole: 'Image contextualizes the metric.', fallbackFamilies: ['stat', 'text'], textLimits: { tag: 16, header: 16, body: 72 } },
  { id: 'image_top_checklist_bottom', family: 'image_stack', requiredComponents: ['checklist', 'image_placeholder'], supportsImage: true, bestFor: 'Visual example followed by actions or signs.', visualRole: 'Image introduces the list.', fallbackFamilies: ['checklist', 'text'], textLimits: { tag: 16, header: 34, checklistItem: 42, checklistItems: 4 } },
  { id: 'quote_with_image', family: 'image_focus', requiredComponents: ['quote', 'image_placeholder'], supportsImage: true, bestFor: 'Human/testimonial quote with portrait or scene.', visualRole: 'Image adds human context to quote.', fallbackFamilies: ['quote', 'text'], textLimits: { tag: 16, quote: 86, body: 60 } },
  { id: 'header_body_cta', family: 'cta', requiredComponents: ['header', 'body', 'button_cta'], supportsImage: false, bestFor: 'Actionable explanation with a button.', visualRole: 'No image; CTA action anchors message.', fallbackFamilies: ['text', 'cover'], textLimits: { tag: 16, header: 38, body: 90, ctaLabel: 24 } },
  { id: 'split_header_body_cta', family: 'image_split', requiredComponents: ['header', 'body', 'button_cta', 'image_placeholder'], supportsImage: true, bestFor: 'Conversion slide with product/proof image.', visualRole: 'Image supports the action prompt.', fallbackFamilies: ['cta', 'text'], textLimits: { tag: 16, header: 32, body: 76, ctaLabel: 22 } },
  { id: 'cover_checklist', family: 'checklist', requiredComponents: ['header', 'checklist'], supportsImage: false, bestFor: 'Cover with immediate key points.', visualRole: 'No image; checklist creates visual rhythm.', fallbackFamilies: ['cover', 'text'], textLimits: { tag: 16, header: 44, body: 70, checklistItem: 38, checklistItems: 3 } },
  { id: 'numbered_with_image', family: 'image_split', requiredComponents: ['header', 'checklist', 'image_placeholder'], supportsImage: true, bestFor: 'How-to sequence with visual example.', visualRole: 'Image demonstrates the steps.', fallbackFamilies: ['checklist', 'text'], textLimits: { tag: 16, header: 32, checklistItem: 36, checklistItems: 4 } },
  { id: 'big_stat_with_body', family: 'stat', requiredComponents: ['header', 'body'], supportsImage: false, bestFor: 'Large metric plus explanation.', visualRole: 'No image; number is the hero.', fallbackFamilies: ['text', 'quote'], textLimits: { tag: 16, header: 16, body: 82, ctaLabel: 22 } },
  { id: 'two_column_text', family: 'checklist', requiredComponents: ['header', 'checklist'], supportsImage: false, bestFor: 'Comparison, dos/donts, or grouped notes.', visualRole: 'No image; two-column text adds variety.', fallbackFamilies: ['text', 'stat'], textLimits: { tag: 16, header: 34, checklistItem: 38, checklistItems: 4 } },
  { id: 'image_full_caption', family: 'image_focus', requiredComponents: ['image_placeholder', 'body'], supportsImage: true, bestFor: 'Visual-first storytelling with caption.', visualRole: 'Image is the main content.', fallbackFamilies: ['text', 'quote'], textLimits: { tag: 16, header: 32, body: 96 } },
  { id: 'quote_stat_combo', family: 'quote', requiredComponents: ['quote'], supportsImage: false, bestFor: 'Quote supported by stat/body copy.', visualRole: 'No image; quote/stat combo adds contrast.', fallbackFamilies: ['stat', 'text'], textLimits: { tag: 16, quote: 88, body: 24 } },
  { id: 'cover_with_cta', family: 'cta', requiredComponents: ['header', 'button_cta'], supportsImage: false, bestFor: 'Opening or closing slide with direct action.', visualRole: 'No image; title and CTA are focal.', fallbackFamilies: ['cover', 'text'], textLimits: { tag: 16, header: 44, body: 76, ctaLabel: 24 } },
  { id: 'checklist_with_body', family: 'checklist', requiredComponents: ['header', 'body', 'checklist'], supportsImage: false, bestFor: 'Explanation followed by scannable points.', visualRole: 'No image; body plus checklist balances depth and scanning.', fallbackFamilies: ['text', 'stat'], textLimits: { tag: 16, header: 36, body: 78, checklistItem: 40, checklistItems: 4 } },
] as const;

export const LAYOUT_VARIANT_IDS: readonly LayoutVariantId[] = LAYOUT_CATALOG.map((item) => item.id);

export function getLayoutCatalogItem(id: LayoutVariantId | string | undefined): LayoutCatalogItem | undefined {
  return LAYOUT_CATALOG.find((item) => item.id === id);
}

export function layoutFamilyFor(id: LayoutVariantId | string | undefined): LayoutFamily | undefined {
  return getLayoutCatalogItem(id)?.family;
}

export function layoutSupportsImage(id: LayoutVariantId | string | undefined): boolean {
  return getLayoutCatalogItem(id)?.supportsImage ?? false;
}

/** Spacing tokens (in px) used by the nested auto-layout renderer. */
export interface SduiSpacingTokens {
  canvas_padding: number;
  macro_gap: number;
  meso_gap: number;
  micro_gap: number;
}

/** Theme configuration merged from the Brand Kit (locked aesthetics). */
export interface SduiThemeConfig {
  logoUrl: string;
  logoPlacement: ChromeDefinition['logoPlacement'];
  siteUrl: string;
  pageNumberFormat: string;
  coverFontFamily?: string | undefined;
  headerFontFamily: string;
  bodyFontFamily: string;
  baseBodySizePx: number;
  coverSizePx?: number | undefined;
  headerSizePx?: number | undefined;
  bodySizePx?: number | undefined;
  colors: {
    background: string;
    /** Header text color. */
    header: string;
    /** Body text color. */
    body: string;
    /** Highlighted-word color (inside header/body). */
    highlight: string;
    /** Pagination color. */
    pagination: string;
    /** Meta/placeholder text color (pill text, tag, swipe label). */
    meta: string;
    /** Accent for pills/buttons. */
    accent: string;
    /** Readable text color on top of the accent. */
    onAccent: string;
  };
}

/** Full SDUI document produced by the planner + theme merge. */
export interface SduiDocument {
  aspectRatio: AspectRatio;
  theme: SduiThemeConfig;
  spacing: SduiSpacingTokens;
  slides: SduiSlide[];
}

// ---------------------------------------------------------------------------
// Visual Reference (Fase 3)
// ---------------------------------------------------------------------------

/** Visual DNA extracted from a reference image by Vision AI. */
export interface VisualDna {
  /** Ordered list of component type names detected in the reference. */
  componentSequence: string[];
  /** Ratio of header font size to body font size (e.g. 4.0 = editorial bold). */
  headerToBodyRatio: number;
  /** Dominant layout archetype detected. */
  layoutArchetype: 'text_dominant' | 'split_screen' | 'background_overlay';
  /** Mapped typography scale archetype. */
  typographyScale: 'editorial_bold' | 'balanced_classic' | 'information_dense';
}

/** A team-scoped visual reference (uploaded carousel image + extracted DNA). */
export interface VisualReference {
  id: string;
  teamId: string;
  name: string;
  imageUrl: string;
  dna: VisualDna;
  tags: string[];
  createdAt: Date;
}
