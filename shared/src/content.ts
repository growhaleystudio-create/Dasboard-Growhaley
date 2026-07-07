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
// Generation job timing contract
// ---------------------------------------------------------------------------

/**
 * Maximum wall-clock time a single carousel generation job may run in the
 * worker. Mirrors the BullMQ `lockDuration` so a job is never reaped while
 * the worker still legitimately owns it.
 */
export const CONTENT_JOB_MAX_RUNTIME_MS = 600_000;

/**
 * Age (from job creation) after which a still-`pending` job is considered
 * orphaned and lazily marked `failed`/`timeout` by the status endpoint.
 * Must exceed {@link CONTENT_JOB_MAX_RUNTIME_MS}; the extra buffer absorbs
 * queue wait time (worker concurrency is limited).
 */
export const CONTENT_JOB_REAPER_DEADLINE_MS = CONTENT_JOB_MAX_RUNTIME_MS + 120_000;

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
  /**
   * Non-terminal planner warnings surfaced to the user (e.g. text that was
   * auto-adjusted by guardrails, unresolved quality issues after repair).
   */
  qualityWarnings?: string[];
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
  // === GROWHALEY POSTER FAMILY (100% grafis) ===
  | 'gw_poster_cover' // display type raksasa staggered + kicker + wordmark
  | 'gw_poster_statement' // statement besar + body pendek
  | 'gw_poster_list' // display header + checklist/numbered bold rows
  | 'gw_poster_stat' // angka raksasa + label, aksen {01}
  | 'gw_poster_quote' // kutipan besar dengan ornamen kurung kurawal
  | 'gw_poster_cta' // display text + tombol CTA blok lime
  | 'gw_poster_cards' // comparison / feature cards gaya poster
  // === GROWHALEY PHOTO FAMILY (foto full-bleed) ===
  | 'gw_photo_rotated' // foto full-bleed + teks lime rotasi 90° di tepi
  | 'gw_photo_statement' // foto full-bleed + scrim + display text bawah
  // === GROWHALEY COLLAGE FAMILY (multi-image) ===
  | 'gw_collage_showcase'; // bg blue + teks lime raksasa + kartu foto overlap

export type LayoutFamily = 'poster' | 'photo' | 'collage';

export type LayoutStylePreference = 'auto' | 'poster' | 'photo' | 'collage';

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
  /**
   * Density floor (min characters / min list items). Text below these reads
   * as an underfilled canvas; the planner's quality check reports it so the
   * repair pass enriches the copy instead of leaving dead space.
   */
  headerMin?: number;
  bodyMin?: number;
  quoteMin?: number;
  checklistItemsMin?: number;
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

// ---------------------------------------------------------------------------
// Growhaley composition parameters — AI-selectable variation WITHIN the
// design system. Every value is an enum from the brand guideline; the
// renderer sanitizes combinations so output can never go off-brand.
// ---------------------------------------------------------------------------

/** Poster canvas color (Warna Palet, brand guideline p.32). */
export type GwPaletteChoice = 'lime' | 'cream' | 'blue' | 'ink';
/** Ornament/highlight accent color. */
export type GwAccentChoice = 'magenta' | 'blue' | 'lime' | 'cream';
/** Headline composition style. */
export type GwHeaderComposition = 'staggered' | 'left' | 'center' | 'right';
/** Radial gradient blob anchor ('none' = flat color). */
export type GwBlobPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'none';
/** Density of {01}/{ } brace ornaments. */
export type GwOrnamentLevel = 'none' | 'minimal' | 'rich';
/** Collage card scatter pattern. */
export type GwCollageScatter = 'cascade' | 'zigzag' | 'stack';

export const GW_PALETTE_CHOICES: readonly GwPaletteChoice[] = ['lime', 'cream', 'blue', 'ink'];
export const GW_ACCENT_CHOICES: readonly GwAccentChoice[] = ['magenta', 'blue', 'lime', 'cream'];
export const GW_HEADER_COMPOSITIONS: readonly GwHeaderComposition[] = [
  'staggered',
  'left',
  'center',
  'right',
];
export const GW_BLOB_POSITIONS: readonly GwBlobPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
  'none',
];
export const GW_ORNAMENT_LEVELS: readonly GwOrnamentLevel[] = ['none', 'minimal', 'rich'];
export const GW_COLLAGE_SCATTERS: readonly GwCollageScatter[] = ['cascade', 'zigzag', 'stack'];

/** Brand hex per palette/accent choice (guideline p.32). Single source for
 *  the renderer AND the frontend composition swatches. */
export const GW_PALETTE_HEX: Record<GwPaletteChoice, string> = {
  lime: '#e8ff03',
  cream: '#fff7e8',
  blue: '#177db5',
  ink: '#232326',
};
export const GW_ACCENT_HEX: Record<GwAccentChoice, string> = {
  magenta: '#da457f',
  blue: '#177db5',
  lime: '#e8ff03',
  cream: '#fff7e8',
};

/** Accent choices that keep contrast on each palette background. The AI
 *  planner and the frontend swatch picker both validate against this table;
 *  an accent not listed for a palette is rejected/disabled. */
export const GW_ACCENT_ALLOWED: Record<GwPaletteChoice, readonly GwAccentChoice[]> = {
  lime: ['magenta', 'blue'],
  cream: ['blue', 'magenta'],
  blue: ['cream', 'lime', 'magenta'],
  ink: ['magenta', 'lime', 'cream'],
};

/** Per-slide visual composition chosen by the AI planner (all optional). */
export interface GwComposition {
  palette?: GwPaletteChoice;
  accent?: GwAccentChoice;
  headerComposition?: GwHeaderComposition;
  blob?: GwBlobPosition;
  ornaments?: GwOrnamentLevel;
  scatter?: GwCollageScatter;
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
  /** AI-selected Growhaley composition parameters (design-system locked). */
  composition?: GwComposition;
  nested_groups: SduiNestedGroups;
}

export const LAYOUT_CATALOG: readonly LayoutCatalogItem[] = [
  {
    id: 'gw_poster_cover',
    family: 'poster',
    requiredComponents: ['header'],
    supportsImage: false,
    bestFor: 'Opening slide: giant staggered display headline in brand color.',
    visualRole: 'No image; massive condensed typography carries the hook.',
    fallbackFamilies: ['poster'],
    textLimits: { tag: 24, header: 48, body: 120 },
  },
  {
    id: 'gw_poster_statement',
    family: 'poster',
    requiredComponents: ['header', 'body'],
    supportsImage: false,
    bestFor: 'Bold statement or explanation with a short supporting paragraph.',
    visualRole: 'No image; display statement + compact body.',
    fallbackFamilies: ['poster'],
    textLimits: { tag: 24, header: 70, body: 160 },
  },
  {
    id: 'gw_poster_list',
    family: 'poster',
    requiredComponents: ['header', 'checklist'],
    supportsImage: false,
    bestFor: 'Steps, tips, or checklist content as bold poster rows.',
    visualRole: 'No image; numbered/checklist rows in display type.',
    fallbackFamilies: ['poster'],
    textLimits: { tag: 24, header: 45, body: 100, checklistItem: 45, checklistItems: 6 },
  },
  {
    id: 'gw_poster_stat',
    family: 'poster',
    requiredComponents: ['stat_block'],
    supportsImage: false,
    bestFor: 'One hero metric or a row of KPIs with short context.',
    visualRole: 'No image; giant number with {01}-style accents.',
    fallbackFamilies: ['poster'],
    textLimits: { tag: 24, header: 40, body: 120 },
  },
  {
    id: 'gw_poster_quote',
    family: 'poster',
    requiredComponents: ['quote'],
    supportsImage: false,
    bestFor: 'Key insight, testimonial, or pull quote.',
    visualRole: 'No image; big quote framed by curly-brace ornaments.',
    fallbackFamilies: ['poster'],
    textLimits: { tag: 24, quote: 120, body: 60 },
  },
  {
    id: 'gw_poster_cta',
    family: 'poster',
    requiredComponents: ['header', 'button_cta'],
    supportsImage: false,
    bestFor: 'Closing slide with a clear call to action.',
    visualRole: 'No image; display text + lime CTA block.',
    fallbackFamilies: ['poster'],
    textLimits: { tag: 24, header: 45, body: 110, ctaLabel: 28 },
  },
  {
    id: 'gw_poster_cards',
    family: 'poster',
    requiredComponents: ['feature_cards'],
    supportsImage: false,
    bestFor: 'Feature cards or a two-column comparison in poster style.',
    visualRole: 'No image; bordered cards / comparison columns on brand color.',
    fallbackFamilies: ['poster'],
    textLimits: { tag: 24, header: 40, body: 80 },
  },
  {
    id: 'gw_photo_rotated',
    family: 'photo',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Photo-led slide with dramatic rotated typography on the edges.',
    visualRole: 'Full-bleed photo; lime display text rotated 90° along the rails.',
    fallbackFamilies: ['photo', 'poster'],
    textLimits: { tag: 24, header: 36, body: 130 },
  },
  {
    id: 'gw_photo_statement',
    family: 'photo',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Photo-led statement, cover with hero image, or visual CTA.',
    visualRole: 'Full-bleed photo with gradient scrim and bottom display text.',
    fallbackFamilies: ['photo', 'poster'],
    textLimits: { tag: 24, header: 55, body: 140, ctaLabel: 28 },
  },
  {
    id: 'gw_collage_showcase',
    family: 'collage',
    requiredComponents: ['header', 'image_placeholder'],
    supportsImage: true,
    bestFor: 'Portfolio/showcase with 2-4 overlapping project cards.',
    visualRole: 'Blue canvas, giant lime display text, overlapping photo cards with captions.',
    fallbackFamilies: ['photo', 'poster'],
    textLimits: { tag: 24, header: 30, body: 100 },
  },
];

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
