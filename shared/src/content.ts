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
  /** Desired logo height in rendered slides. Aspect ratio remains locked. */
  logoSizePx?: number | undefined;
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
  logo?:
    | {
        bytes: Buffer;
        contentType: string;
      }
    | undefined;
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

export type BrandTypographyRole =
  | 'cover'
  | 'header'
  | 'body'
  | 'tag'
  | 'quote'
  | 'list'
  | 'cta'
  | 'card'
  | 'stat'
  | 'caption'
  | 'chrome';

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
  tag?: BrandTextRole | undefined;
  quote?: BrandTextRole | undefined;
  list?: BrandTextRole | undefined;
  cta?: BrandTextRole | undefined;
  card?: BrandTextRole | undefined;
  stat?: BrandTextRole | undefined;
  caption?: BrandTextRole | undefined;
  chrome?: BrandTextRole | undefined;
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
  /** Hermes-style workflow artifact used to draft, render, review, and revise this carousel. */
  workflow?: CarouselWorkflowArtifact;
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
export type LegacyLayoutVariantId =
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
  | 'split_checklist_image' // checklist kiri + gambar kanan
  | 'split_image_checklist' // gambar kiri + checklist kanan
  | 'split_stat_image' // angka besar kiri + gambar kanan
  | 'image_top_checklist_bottom' // gambar atas + checklist bawah
  | 'quote_with_image' // quote center + gambar kecil bawah
  | 'header_body_cta' // judul + body + tombol CTA (column)
  | 'split_header_body_cta' // teks (judul+body+cta) kiri + gambar kanan
  | 'cover_checklist' // cover style + checklist poin dibawah judul
  | 'numbered_with_image' // judul + steps bernomor + gambar samping
  | 'big_stat_with_body' // angka raksasa + body + tombol kecil
  | 'two_column_text' // dua kolom teks sejajar (heading kiri, bullets kanan)
  | 'image_full_caption' // gambar hampir full + caption kecil di bawah
  | 'quote_stat_combo' // kutipan + angka statistik di bawah
  | 'cover_with_cta' // cover style + tombol CTA
  | 'checklist_with_body' // judul + body intro + checklist
  // === DYNAMIC RICH LAYOUTS ===
  | 'feature_cards_grid' // N cards (icon+judul+desc) dalam grid 2-3 kolom
  | 'feature_cards_with_header' // judul besar + grid kartu di bawah
  | 'comparison_columns' // dua kolom perbandingan (DULU vs SEKARANG, dll)
  | 'comparison_with_header' // judul + dua kolom perbandingan
  // === MULTI-IMAGE LAYOUTS ===
  | 'dual_image_comparison'
  | 'product_angle_pair'
  | 'use_case_gallery_2up'
  | 'mini_gallery_3up'
  | 'moodboard_grid'
  | 'step_visual_sequence'
  | 'problem_solution_visual_pair'
  | 'feature_visual_cards'
  | 'testimonial_with_portrait_and_product'
  | 'case_study_snapshot_grid'
  | 'dos_donts_visual_pair'
  | 'outfit_or_style_board'
  | 'menu_or_food_combo'
  | 'real_estate_room_pair'
  | 'app_screen_flow'
  | 'social_proof_wall'
  | 'event_moment_grid'
  | 'travel_itinerary_grid'
  | 'collection_showcase'
  | 'variant_selector_showcase'
  // === EDITORIAL LAYOUTS ===
  | 'editorial_feature_spread'
  | 'magazine_cover_story'
  | 'pullquote_editorial'
  | 'article_column_layout'
  | 'editorial_image_caption_grid'
  | 'profile_story_layout'
  | 'reportage_photo_essay'
  | 'opinion_big_statement'
  | 'timeline_editorial'
  | 'data_editorial'
  // === FLEXIBLE RICH STACK LAYOUTS (render any rich components in order) ===
  | 'editorial_rich_stack'
  | 'editorial_rich_split';

export type LayoutFamily =
  | 'cover'
  | 'text'
  | 'checklist'
  | 'quote'
  | 'stat'
  | 'cta'
  | 'image_split'
  | 'image_stack'
  | 'image_focus'
  | 'cards'
  | 'comparison'
  | 'multi_image'
  | 'editorial';

export type LayoutStylePreference =
  | 'auto'
  | 'scrapbook'
  | 'editorial'
  | 'bento'
  | 'timeline'
  | 'comparison'
  | 'ui_mockup'
  | 'chart'
  | 'seamless'
  | 'alternating_contrast';

export type ImagePreferenceMode = 'auto' | 'all_slides_image';

export type ImageRequirement = 'required' | 'optional' | 'none';
export type LayoutSource = 'ai_selected' | 'worker_adjusted' | 'ai_repaired_after_image_failure';
export type ImageStatus = 'not_needed' | 'generated' | 'provider_failed_repaired';

export interface LayoutCatalogItem {
  id: LegacyLayoutVariantId;
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

export interface ContentConversationContextMessage {
  role: 'user' | 'assistant';
  text: string;
  createdAt?: string | undefined;
}

// Note: LayoutVariantId would be LegacyLayoutVariantId | string, but that
// collapses to just string. Use string directly where needed.

export interface SduiSlideAudit {
  slide_number: number;
  layout_variant_id?: string;
  layout_family?: LayoutFamily;
  image_requirement: ImageRequirement;
  layout_source: LayoutSource;
  image_status: ImageStatus;
}

export type CarouselWorkflowStage = 'outline' | 'prompts' | 'assets' | 'rendered' | 'approved';
export type CarouselWorkflowReviewStatus = 'draft' | 'needs_revision' | 'approved';

export interface CarouselWorkflowOutlineItem {
  slide_number: number;
  role: 'cover' | 'content' | 'cta';
  headline: string;
  body?: string | undefined;
  visualBrief?: string | undefined;
  cta?: string | undefined;
}

export interface CarouselWorkflowDesignSystemSnapshot {
  colors: string[];
  fonts: string[];
  chrome: ChromeDefinition;
  typography?: BrandTypography | undefined;
}

export interface CarouselWorkflowSlidePrompt {
  slide_number: number;
  prompt: string;
  exactHeadline?: string | undefined;
  exactBody?: string | undefined;
  visualBrief?: string | undefined;
}

export interface CarouselWorkflowSlideState {
  slide_number: number;
  reviewStatus: CarouselWorkflowReviewStatus;
  sduiSlide: SduiSlide;
  renderedImageUrl?: string | undefined;
  failedReason?: FailureReason | undefined;
}

export interface CarouselWorkflowCaption {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
}

export interface CarouselWorkflowArtifact {
  version: 1;
  workflowStage: CarouselWorkflowStage;
  source: 'planning' | 'auto' | 'legacy';
  outline: CarouselWorkflowOutlineItem[];
  designSystemSnapshot: CarouselWorkflowDesignSystemSnapshot;
  slidePrompts: CarouselWorkflowSlidePrompt[];
  slides: CarouselWorkflowSlideState[];
  caption: CarouselWorkflowCaption;
  createdAt: string;
  updatedAt: string;
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
  | 'quote'
  | 'feature_cards'
  | 'comparison'
  // === NEW RICH COMPONENTS ===
  | 'byline' // author/source signature: name + role + optional avatar
  | 'pull_quote' // large editorial quote with attribution
  | 'callout' // highlighted aside box (info/tip/warning/success)
  | 'caption' // small caption/credit under an image
  | 'stat_block' // big number + label + optional delta/trend
  | 'key_value_list' // aligned label:value rows (specs, summary)
  | 'data_table' // small data table (headers + rows)
  | 'stat_row' // row of mini KPIs (icon + value + label)
  | 'timeline' // time/phase + event pairs
  | 'numbered_list' // ordered rich-text list
  | 'progress_bar' // labeled metric/score bars
  | 'divider'; // section separator with optional label

/** A single card inside a feature_cards component. */
export interface FeatureCardItem {
  /** Emoji icon, e.g. "🎯" or "📊". Keep it 1-2 chars. */
  icon: string;
  /** Short bold label, max ~28 chars. */
  title: string;
  /** Optional one-line description, max ~60 chars. */
  description?: string;
}

/** One column inside a comparison component. */
export interface ComparisonColumn {
  /** Column header label, e.g. "DULU" or "SEKARANG". Max ~16 chars. */
  label: string;
  /** Visual emphasis: red/muted for negative, green/accent for positive. */
  sentiment?: 'positive' | 'negative' | 'neutral';
  /** List of items in this column. Max 4 items, each max ~48 chars. */
  items: string[];
}

/** One label:value row inside a key_value_list component. */
export interface KeyValueRow {
  /** Left label, e.g. "Durasi". Max ~24 chars. */
  label: string;
  /** Right value, e.g. "6 bulan". Max ~40 chars. */
  value: string;
}

/** One mini-KPI inside a stat_row component. */
export interface StatRowItem {
  /** Optional emoji icon. */
  icon?: string;
  /** The number/metric, e.g. "85%" or "3x". Max ~10 chars. */
  value: string;
  /** Short caption under the value. Max ~24 chars. */
  label: string;
}

/** One entry inside a timeline component. */
export interface TimelineItem {
  /** Time/phase marker, e.g. "2021" or "Fase 1". Max ~18 chars. */
  time: string;
  /** Event description. Max ~80 chars. */
  text: string;
}

/** One labeled bar inside a progress_bar component. */
export interface ProgressItem {
  /** Bar label. Max ~28 chars. */
  label: string;
  /** Fill percentage 0-100. */
  percent: number;
}

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
  /** feature_cards: array of icon+title+description cards rendered as a grid. */
  items_cards?: FeatureCardItem[];
  /** comparison: two-column side-by-side comparison list. */
  columns?: ComparisonColumn[];
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
  safeTextZones?: ('top' | 'bottom' | 'left' | 'right' | 'center')[];
  /** visual_layer: connector target id for callout/connector primitives. */
  targetId?: string;

  // -- New rich components --
  /** byline: contributor role, e.g. "Head of Growth". Name uses `text`. */
  role?: string;
  /** byline: optional avatar/portrait URL. */
  avatarUrl?: string;
  /** pull_quote: who said it. Quote text uses `text`. */
  attribution?: string;
  /** pull_quote: attribution role/company. */
  attributionRole?: string;
  /** callout: semantic emphasis. Body text uses `text`. */
  variant?: 'info' | 'tip' | 'warning' | 'success';
  /** callout/stat_row/stat_block: optional emoji icon. */
  icon?: string;
  /** caption: optional credit/source line. Caption text uses `text`. */
  credit?: string;
  /** stat_block: the big number/metric, e.g. "85%". (Falls back to `text`.) */
  value?: string;
  /** stat_block: delta string, e.g. "+12% MoM". */
  delta?: string;
  /** stat_block: direction of the delta for color/arrow. */
  trend?: 'up' | 'down' | 'flat';
  /** key_value_list: aligned label:value rows. */
  rows?: KeyValueRow[];
  /** data_table: column headers. */
  tableHeaders?: string[];
  /** data_table: table body rows (each row aligns to tableHeaders). */
  tableRows?: string[][];
  /** stat_row: row of mini KPIs. */
  stats?: StatRowItem[];
  /** timeline: time+event entries. */
  timeline?: TimelineItem[];
  /** progress_bar: labeled metric bars. */
  progress?: ProgressItem[];
  // numbered_list reuses `items`; divider reuses `text` (optional label).

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
  /** Supports both legacy SDUI layout IDs and new slide-layout catalog IDs. */
  layout_variant_id?: string;
  layout_family?: LayoutFamily;
  /** User-selected high-level visual style target for the deck/slide. */
  layout_style?: LayoutStylePreference;
  /** User-selected image preference mode propagated through the pipeline. */
  image_preference?: ImagePreferenceMode;
  image_requirement?: ImageRequirement;
  layout_source?: LayoutSource;
  image_status?: ImageStatus;
  typography_scale?: TypographyScale;
  /** Main content flow direction decided by AI: 'column' (default) or 'row' (side-by-side). */
  contentDirection?: 'column' | 'row';
  nested_groups: SduiNestedGroups;
}

export const LAYOUT_CATALOG: readonly LayoutCatalogItem[] = [
  {
    id: 'cover_centered',
    family: 'cover',
    requiredComponents: ['header'],
    supportsImage: false,
    bestFor: 'Opening slide with a clear title and subtitle.',
    visualRole: 'No image; typography carries the hook.',
    fallbackFamilies: ['text', 'checklist', 'cta'],
    textLimits: { tag: 16, header: 52, body: 110 },
  },
  {
    id: 'cover_editorial_left',
    family: 'cover',
    requiredComponents: ['header'],
    supportsImage: false,
    bestFor: 'Editorial opening slide with a strong left-aligned headline.',
    visualRole: 'No image; composition and negative space carry the hook.',
    fallbackFamilies: ['text', 'checklist', 'cta'],
    textLimits: { tag: 16, header: 54, body: 110 },
  },
  {
    id: 'cover_image_full',
    family: 'image_focus',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Dramatic opening when a concrete hero image is essential.',
    visualRole: 'Hero background image drives the first impression.',
    fallbackFamilies: ['cover', 'text'],
    textLimits: { tag: 16, header: 44, body: 100 },
  },
  {
    id: 'text_centered',
    family: 'text',
    requiredComponents: ['header', 'body'],
    supportsImage: false,
    bestFor: 'Balanced short explanation or educational point.',
    visualRole: 'No image; centered text clarity.',
    fallbackFamilies: ['checklist', 'quote', 'cta'],
    textLimits: { tag: 16, header: 44, body: 170 },
  },
  {
    id: 'text_stack',
    family: 'text',
    requiredComponents: ['header', 'body'],
    supportsImage: false,
    bestFor: 'Readable explanatory slide with title and paragraph.',
    visualRole: 'No image; structured copy carries the message.',
    fallbackFamilies: ['checklist', 'quote', 'stat'],
    textLimits: { tag: 16, header: 44, body: 180 },
  },
  {
    id: 'split_text_left_image_right',
    family: 'image_split',
    requiredComponents: ['header', 'body', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Concrete example, product, proof, or scene alongside explanation.',
    visualRole: 'Image supports the text in a side-by-side editorial split.',
    fallbackFamilies: ['text', 'checklist'],
    textLimits: { tag: 16, header: 34, body: 120 },
  },
  {
    id: 'split_image_left_text_right',
    family: 'image_split',
    requiredComponents: ['header', 'body', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Concrete visual lead with explanatory copy.',
    visualRole: 'Image leads the story, text explains.',
    fallbackFamilies: ['text', 'checklist'],
    textLimits: { tag: 16, header: 34, body: 120 },
  },
  {
    id: 'image_top_text_bottom',
    family: 'image_stack',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Visual example above a concise explanation.',
    visualRole: 'Image is the first-read element.',
    fallbackFamilies: ['text', 'checklist'],
    textLimits: { tag: 16, header: 38, body: 120 },
  },
  {
    id: 'text_top_image_bottom',
    family: 'image_stack',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Short claim followed by concrete visual proof.',
    visualRole: 'Image reinforces the text after reading.',
    fallbackFamilies: ['text', 'stat'],
    textLimits: { tag: 16, header: 38, body: 120 },
  },
  {
    id: 'checklist_stack',
    family: 'checklist',
    requiredComponents: ['header', 'checklist'],
    supportsImage: false,
    bestFor: 'Benefits, reasons, symptoms, steps, or warning signs.',
    visualRole: 'No image; list structure improves scanning.',
    fallbackFamilies: ['text', 'stat'],
    textLimits: { tag: 16, header: 38, body: 90, checklistItem: 55, checklistItems: 5 },
  },
  {
    id: 'numbered_steps',
    family: 'checklist',
    requiredComponents: ['header', 'checklist'],
    supportsImage: false,
    bestFor: 'Sequential guidance or process.',
    visualRole: 'No image; sequence is the visual structure.',
    fallbackFamilies: ['text', 'cta'],
    textLimits: { tag: 16, header: 38, body: 90, checklistItem: 52, checklistItems: 5 },
  },
  {
    id: 'quote_focus',
    family: 'quote',
    requiredComponents: ['quote'],
    supportsImage: false,
    bestFor: 'Testimonial, myth, principle, or memorable statement.',
    visualRole: 'No image; quote treatment is the visual anchor.',
    fallbackFamilies: ['text', 'stat'],
    textLimits: { tag: 16, quote: 130, body: 90 },
  },
  {
    id: 'stat_highlight',
    family: 'stat',
    requiredComponents: ['header', 'body'],
    supportsImage: false,
    bestFor: 'Data point, percentage, score, or key number.',
    visualRole: 'No image; the number becomes the visual.',
    fallbackFamilies: ['text', 'quote'],
    textLimits: { tag: 16, header: 18, body: 82 },
  },
  {
    id: 'big_statement',
    family: 'text',
    requiredComponents: ['header'],
    supportsImage: false,
    bestFor: 'One strong insight or transition statement.',
    visualRole: 'No image; oversized statement creates emphasis.',
    fallbackFamilies: ['quote', 'cta'],
    textLimits: { tag: 16, header: 52, body: 80 },
  },
  {
    id: 'cta_centered',
    family: 'cta',
    requiredComponents: ['header', 'button_cta'],
    supportsImage: false,
    bestFor: 'Closing action, resource, or next step.',
    visualRole: 'No image; CTA button anchors the slide.',
    fallbackFamilies: ['text', 'cover'],
    textLimits: { tag: 16, header: 40, body: 80, ctaLabel: 24 },
  },
  {
    id: 'split_checklist_image',
    family: 'image_split',
    requiredComponents: ['checklist', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Checklist paired with visual proof or example.',
    visualRole: 'Image supports a scannable checklist.',
    fallbackFamilies: ['checklist', 'text'],
    textLimits: { tag: 16, header: 32, checklistItem: 38, checklistItems: 4 },
  },
  {
    id: 'split_image_checklist',
    family: 'image_split',
    requiredComponents: ['checklist', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Visual-led checklist or comparison.',
    visualRole: 'Image leads, checklist interprets.',
    fallbackFamilies: ['checklist', 'text'],
    textLimits: { tag: 16, header: 32, checklistItem: 38, checklistItems: 4 },
  },
  {
    id: 'split_stat_image',
    family: 'image_split',
    requiredComponents: ['header', 'body', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Statistic with concrete visual context.',
    visualRole: 'Image contextualizes the metric.',
    fallbackFamilies: ['stat', 'text'],
    textLimits: { tag: 16, header: 16, body: 72 },
  },
  {
    id: 'image_top_checklist_bottom',
    family: 'image_stack',
    requiredComponents: ['checklist', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Visual example followed by actions or signs.',
    visualRole: 'Image introduces the list.',
    fallbackFamilies: ['checklist', 'text'],
    textLimits: { tag: 16, header: 34, checklistItem: 42, checklistItems: 4 },
  },
  {
    id: 'quote_with_image',
    family: 'image_focus',
    requiredComponents: ['quote', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Human/testimonial quote with portrait or scene.',
    visualRole: 'Image adds human context to quote.',
    fallbackFamilies: ['quote', 'text'],
    textLimits: { tag: 16, quote: 86, body: 60 },
  },
  {
    id: 'header_body_cta',
    family: 'cta',
    requiredComponents: ['header', 'body', 'button_cta'],
    supportsImage: false,
    bestFor: 'Actionable explanation with a button.',
    visualRole: 'No image; CTA action anchors message.',
    fallbackFamilies: ['text', 'cover'],
    textLimits: { tag: 16, header: 38, body: 130, ctaLabel: 24 },
  },
  {
    id: 'split_header_body_cta',
    family: 'image_split',
    requiredComponents: ['header', 'body', 'button_cta', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Conversion slide with product/proof image.',
    visualRole: 'Image supports the action prompt.',
    fallbackFamilies: ['cta', 'text'],
    textLimits: { tag: 16, header: 32, body: 76, ctaLabel: 22 },
  },
  {
    id: 'cover_checklist',
    family: 'checklist',
    requiredComponents: ['header', 'checklist'],
    supportsImage: false,
    bestFor: 'Cover with immediate key points.',
    visualRole: 'No image; checklist creates visual rhythm.',
    fallbackFamilies: ['cover', 'text'],
    textLimits: { tag: 16, header: 44, body: 70, checklistItem: 38, checklistItems: 3 },
  },
  {
    id: 'numbered_with_image',
    family: 'image_split',
    requiredComponents: ['header', 'checklist', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'How-to sequence with visual example.',
    visualRole: 'Image demonstrates the steps.',
    fallbackFamilies: ['checklist', 'text'],
    textLimits: { tag: 16, header: 32, checklistItem: 36, checklistItems: 4 },
  },
  {
    id: 'big_stat_with_body',
    family: 'stat',
    requiredComponents: ['header', 'body'],
    supportsImage: false,
    bestFor: 'Large metric plus explanation.',
    visualRole: 'No image; number is the hero.',
    fallbackFamilies: ['text', 'quote'],
    textLimits: { tag: 16, header: 16, body: 82, ctaLabel: 22 },
  },
  {
    id: 'two_column_text',
    family: 'checklist',
    requiredComponents: ['header', 'checklist'],
    supportsImage: false,
    bestFor: 'Comparison, dos/donts, or grouped notes.',
    visualRole: 'No image; two-column text adds variety.',
    fallbackFamilies: ['text', 'stat'],
    textLimits: { tag: 16, header: 34, checklistItem: 38, checklistItems: 4 },
  },
  {
    id: 'image_full_caption',
    family: 'image_focus',
    requiredComponents: ['image_placeholder', 'body'],
    supportsImage: true,
    bestFor: 'Visual-first storytelling with caption.',
    visualRole: 'Image is the main content.',
    fallbackFamilies: ['text', 'quote'],
    textLimits: { tag: 16, header: 32, body: 96 },
  },
  {
    id: 'quote_stat_combo',
    family: 'quote',
    requiredComponents: ['quote'],
    supportsImage: false,
    bestFor: 'Quote supported by stat/body copy.',
    visualRole: 'No image; quote/stat combo adds contrast.',
    fallbackFamilies: ['stat', 'text'],
    textLimits: { tag: 16, quote: 88, body: 24 },
  },
  {
    id: 'cover_with_cta',
    family: 'cta',
    requiredComponents: ['header', 'button_cta'],
    supportsImage: false,
    bestFor: 'Opening or closing slide with direct action.',
    visualRole: 'No image; title and CTA are focal.',
    fallbackFamilies: ['cover', 'text'],
    textLimits: { tag: 16, header: 44, body: 76, ctaLabel: 24 },
  },
  {
    id: 'checklist_with_body',
    family: 'checklist',
    requiredComponents: ['header', 'body', 'checklist'],
    supportsImage: false,
    bestFor: 'Explanation followed by scannable points.',
    visualRole: 'No image; body plus checklist balances depth and scanning.',
    fallbackFamilies: ['text', 'stat'],
    textLimits: { tag: 16, header: 36, body: 120, checklistItem: 50, checklistItems: 4 },
  },
  // Dynamic rich layouts
  {
    id: 'feature_cards_grid',
    family: 'cards',
    requiredComponents: ['feature_cards'],
    supportsImage: false,
    bestFor:
      'Showcase multiple features, benefits, or use cases as visual cards with icons. Best for 3–6 items.',
    visualRole: 'No image; card grid drives visual hierarchy.',
    fallbackFamilies: ['checklist', 'text'],
    textLimits: { tag: 16, header: 44, body: 80 },
  },
  {
    id: 'feature_cards_with_header',
    family: 'cards',
    requiredComponents: ['header', 'feature_cards'],
    supportsImage: false,
    bestFor:
      'Strong headline followed by feature cards. Best for "what we offer" or "why choose this" slides.',
    visualRole: 'No image; header + card grid.',
    fallbackFamilies: ['checklist', 'text'],
    textLimits: { tag: 16, header: 48, body: 70 },
  },
  {
    id: 'comparison_columns',
    family: 'comparison',
    requiredComponents: ['comparison'],
    supportsImage: false,
    bestFor:
      'Side-by-side comparison: DULU vs SEKARANG, Pros vs Cons, With vs Without. Ideal for 2–4 items per column.',
    visualRole: 'No image; two-column contrast layout.',
    fallbackFamilies: ['checklist', 'text'],
    textLimits: { tag: 16, header: 44, body: 60 },
  },
  {
    id: 'comparison_with_header',
    family: 'comparison',
    requiredComponents: ['header', 'comparison'],
    supportsImage: false,
    bestFor:
      'Headline framing a two-column comparison. Good for transformation stories or before/after scenarios.',
    visualRole: 'No image; header sets context for comparison.',
    fallbackFamilies: ['checklist', 'text'],
    textLimits: { tag: 16, header: 48, body: 60 },
  },
  // Multi-image layouts. These require 2+ image_placeholder components in core_content.
  {
    id: 'dual_image_comparison',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Before/after, old/new, problem/solution, or two visual alternatives side by side.',
    visualRole: 'Two equal image panels create direct comparison.',
    fallbackFamilies: ['comparison', 'image_split'],
    textLimits: { tag: 16, header: 38, body: 60 },
  },
  {
    id: 'product_angle_pair',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor:
      'Product front/detail, packaging/inside, full shot/close-up, or two important product angles.',
    visualRole: 'Two product images show scale and detail in one glance.',
    fallbackFamilies: ['image_split', 'image_focus'],
    textLimits: { tag: 16, header: 38, body: 60 },
  },
  {
    id: 'use_case_gallery_2up',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Two usage scenarios, audience segments, rooms, or situations.',
    visualRole: 'Two image cards compare use cases.',
    fallbackFamilies: ['cards', 'image_split'],
    textLimits: { tag: 16, header: 38, body: 60 },
  },
  {
    id: 'mini_gallery_3up',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Three quick examples, variations, ideas, or visual options.',
    visualRole: 'Three compact images create a mini gallery.',
    fallbackFamilies: ['cards', 'image_stack'],
    textLimits: { tag: 16, header: 36, body: 54 },
  },
  {
    id: 'moodboard_grid',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor:
      'Brand mood, campaign direction, interiors, fashion, beauty, or creative visual direction.',
    visualRole: 'Four-image grid conveys an aesthetic direction.',
    fallbackFamilies: ['image_focus', 'cards'],
    textLimits: { tag: 16, header: 34, body: 52 },
  },
  {
    id: 'step_visual_sequence',
    family: 'multi_image',
    requiredComponents: ['header', 'checklist', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Visual process, tutorial, recipe, onboarding, or sequence of actions.',
    visualRole: 'Three images aligned with steps show progression.',
    fallbackFamilies: ['checklist', 'image_split'],
    textLimits: { tag: 16, header: 34, checklistItem: 34, checklistItems: 3 },
  },
  {
    id: 'problem_solution_visual_pair',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'A visible problem contrasted with the improved solution.',
    visualRole: 'Two labeled visuals make transformation concrete.',
    fallbackFamilies: ['comparison', 'image_split'],
    textLimits: { tag: 16, header: 38, body: 60 },
  },
  {
    id: 'feature_visual_cards',
    family: 'multi_image',
    requiredComponents: ['feature_cards', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Feature cards where each feature needs a small supporting visual.',
    visualRole: 'Image-backed feature tiles increase scannability.',
    fallbackFamilies: ['cards', 'image_split'],
    textLimits: { tag: 16, header: 38, body: 54 },
  },
  {
    id: 'testimonial_with_portrait_and_product',
    family: 'multi_image',
    requiredComponents: ['quote', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Social proof that benefits from both customer/person and product/result imagery.',
    visualRole: 'Portrait plus product/result builds trust.',
    fallbackFamilies: ['quote', 'image_focus'],
    textLimits: { tag: 16, quote: 74, body: 50 },
  },
  {
    id: 'case_study_snapshot_grid',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Portfolio, campaign recap, before/process/after, or case study proof.',
    visualRole: 'Three snapshots summarize the case.',
    fallbackFamilies: ['cards', 'image_focus'],
    textLimits: { tag: 16, header: 36, body: 54 },
  },
  {
    id: 'dos_donts_visual_pair',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Correct vs incorrect behavior, design, habit, or setup.',
    visualRole: 'Two labeled visuals clarify do and do not.',
    fallbackFamilies: ['comparison', 'checklist'],
    textLimits: { tag: 16, header: 38, body: 60 },
  },
  {
    id: 'outfit_or_style_board',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Fashion, beauty, styling, accessories, and look boards.',
    visualRole: 'Main look plus detail tiles creates a style board.',
    fallbackFamilies: ['image_focus', 'cards'],
    textLimits: { tag: 16, header: 34, body: 52 },
  },
  {
    id: 'menu_or_food_combo',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Food menus, combo meals, hero dish plus drink/side/detail.',
    visualRole: 'Food image grid shows variety and texture.',
    fallbackFamilies: ['image_focus', 'cards'],
    textLimits: { tag: 16, header: 34, body: 52 },
  },
  {
    id: 'real_estate_room_pair',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Property exterior/interior, living room/bedroom, before/after staging.',
    visualRole: 'Two room/property images help buyers compare spaces.',
    fallbackFamilies: ['image_split', 'image_focus'],
    textLimits: { tag: 16, header: 36, body: 54 },
  },
  {
    id: 'app_screen_flow',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor:
      'SaaS/app flows with two or three screens, onboarding, dashboard workflow, or feature demo.',
    visualRole: 'Screen sequence communicates product flow.',
    fallbackFamilies: ['image_split', 'cards'],
    textLimits: { tag: 16, header: 36, body: 54 },
  },
  {
    id: 'social_proof_wall',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Review screenshots, UGC, customer results, chats, or proof collage.',
    visualRole: 'Multiple proof tiles build credibility.',
    fallbackFamilies: ['quote', 'cards'],
    textLimits: { tag: 16, header: 36, body: 54 },
  },
  {
    id: 'event_moment_grid',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Event recap with stage, audience, speaker, booth, or activation moments.',
    visualRole: 'Grid of event moments shows energy and scale.',
    fallbackFamilies: ['image_focus', 'cards'],
    textLimits: { tag: 16, header: 34, body: 52 },
  },
  {
    id: 'travel_itinerary_grid',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Travel itinerary, destination highlights, food, hotel, activity mix.',
    visualRole: 'Image grid previews itinerary variety.',
    fallbackFamilies: ['image_focus', 'cards'],
    textLimits: { tag: 16, header: 34, body: 52 },
  },
  {
    id: 'collection_showcase',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Catalog collections, bundles, product families, or multiple SKUs.',
    visualRole: 'Multiple product tiles show breadth of collection.',
    fallbackFamilies: ['cards', 'image_focus'],
    textLimits: { tag: 16, header: 34, body: 52 },
  },
  {
    id: 'variant_selector_showcase',
    family: 'multi_image',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Colorways, variants, sizes, materials, plans, or choices shown side by side.',
    visualRole: 'Variant tiles make options immediately visible.',
    fallbackFamilies: ['cards', 'comparison'],
    textLimits: { tag: 16, header: 34, body: 52 },
  },
  // Editorial layouts
  {
    id: 'editorial_feature_spread',
    family: 'editorial',
    requiredComponents: ['header', 'body', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Magazine-like feature story with strong headline, short dek, and art-directed image.',
    visualRole: 'Large editorial image plus headline/dek creates publication feel.',
    fallbackFamilies: ['image_split', 'cover'],
    textLimits: { tag: 16, header: 42, body: 200 },
  },
  {
    id: 'magazine_cover_story',
    family: 'editorial',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Editorial cover, campaign lead, profile issue, or premium story opener.',
    visualRole: 'Full-bleed cover image with bold type overlay.',
    fallbackFamilies: ['image_focus', 'cover'],
    textLimits: { tag: 16, header: 44, body: 160 },
  },
  {
    id: 'pullquote_editorial',
    family: 'editorial',
    requiredComponents: ['quote', 'body'],
    supportsImage: false,
    bestFor: 'A key quote, principle, or insight that deserves a publication-style pause.',
    visualRole: 'Oversized quote and small supporting copy drive rhythm.',
    fallbackFamilies: ['quote', 'text'],
    textLimits: { tag: 16, quote: 150, body: 180 },
  },
  {
    id: 'article_column_layout',
    family: 'editorial',
    requiredComponents: ['header', 'body'],
    supportsImage: false,
    bestFor:
      'Narrative explanation, thought leadership, essays, or educational mini-article slides.',
    visualRole: 'Two-column text layout creates article density.',
    fallbackFamilies: ['text', 'checklist'],
    textLimits: { tag: 16, header: 42, body: 230 },
  },
  {
    id: 'editorial_image_caption_grid',
    family: 'editorial',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Image-led editorial slide with caption/callout feel.',
    visualRole: 'One or two image tiles with caption-like body copy.',
    fallbackFamilies: ['image_focus', 'multi_image'],
    textLimits: { tag: 16, header: 36, body: 120 },
  },
  {
    id: 'profile_story_layout',
    family: 'editorial',
    requiredComponents: ['header', 'body', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Founder story, expert profile, customer story, or personal brand narrative.',
    visualRole: 'Portrait-led editorial layout adds human context.',
    fallbackFamilies: ['image_split', 'quote'],
    textLimits: { tag: 16, header: 36, body: 200 },
  },
  {
    id: 'reportage_photo_essay',
    family: 'editorial',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Reportage, documentary, event recap, field story, or observed reality.',
    visualRole: 'Photo essay grid with short narration.',
    fallbackFamilies: ['multi_image', 'image_focus'],
    textLimits: { tag: 16, header: 34, body: 110 },
  },
  {
    id: 'opinion_big_statement',
    family: 'editorial',
    requiredComponents: ['header', 'body'],
    supportsImage: false,
    bestFor: 'Opinion, contrarian take, thesis slide, or provocative editorial transition.',
    visualRole: 'Large statement with editorial kicker and short rationale.',
    fallbackFamilies: ['text', 'quote'],
    textLimits: { tag: 16, header: 56, body: 200 },
  },
  {
    id: 'timeline_editorial',
    family: 'editorial',
    requiredComponents: ['header', 'checklist'],
    supportsImage: false,
    bestFor: 'Chronology, phases, milestones, or story arc over time.',
    visualRole: 'Editorial timeline creates narrative progression.',
    fallbackFamilies: ['checklist', 'text'],
    textLimits: { tag: 16, header: 36, checklistItem: 80, checklistItems: 4 },
  },
  {
    id: 'data_editorial',
    family: 'editorial',
    requiredComponents: ['header', 'body'],
    supportsImage: false,
    bestFor: 'Data journalism, key metric, report insight, or analytical editorial point.',
    visualRole: 'Big number plus interpretive copy feels like data journalism.',
    fallbackFamilies: ['stat', 'text'],
    textLimits: { tag: 16, header: 18, body: 200 },
  },
  // Flexible rich-stack layouts: render header + any rich components (stat_block, key_value_list, data_table, stat_row, timeline, numbered_list, progress_bar, callout, pull_quote, byline, caption, divider, body) vertically, in order.
  {
    id: 'editorial_rich_stack',
    family: 'editorial',
    requiredComponents: ['header'],
    supportsImage: false,
    bestFor:
      'Dense editorial slide combining a headline with rich content blocks (stats, key-value specs, tables, timeline, progress bars, callouts, numbered lists). Use when a slide needs structured data or multiple content blocks together.',
    visualRole: 'No image; stacked rich blocks create an information-dense editorial page.',
    fallbackFamilies: ['text', 'stat', 'checklist'],
    textLimits: { tag: 16, header: 48, body: 240 },
  },
  {
    id: 'editorial_rich_split',
    family: 'editorial',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor:
      'Editorial slide with an image on one side and rich content blocks (stats, specs, callouts, timeline) on the other.',
    visualRole: 'Image plus stacked rich blocks balance visual and data.',
    fallbackFamilies: ['image_split', 'editorial'],
    textLimits: { tag: 16, header: 42, body: 200 },
  },
] as const;

export const LAYOUT_VARIANT_IDS: readonly LegacyLayoutVariantId[] = LAYOUT_CATALOG.map(
  (item) => item.id,
);

export function getLayoutCatalogItem(id: string | undefined): LayoutCatalogItem | undefined {
  return LAYOUT_CATALOG.find((item) => item.id === id);
}

export function layoutFamilyFor(id: string | undefined): LayoutFamily | undefined {
  return getLayoutCatalogItem(id)?.family;
}

export function layoutSupportsImage(id: string | undefined): boolean {
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
  logoSizePx?: number | undefined;
  siteUrl: string;
  pageNumberFormat: string;
  coverFontFamily?: string | undefined;
  headerFontFamily: string;
  bodyFontFamily: string;
  baseBodySizePx: number;
  coverSizePx?: number | undefined;
  headerSizePx?: number | undefined;
  bodySizePx?: number | undefined;
  typographyRoles?: Partial<Record<BrandTypographyRole, BrandTextRole>> | undefined;
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
