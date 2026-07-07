/**
 * SlideLayoutCatalog — static catalog of slide layout variants.
 *
 * Varian tata letak didefinisikan di kode (version-controlled), bukan tabel DB,
 * agar erat dengan kode Renderer dan dapat diuji secara deterministik.
 * (Design: Data Models → Slide_Layout Variant Model)
 *
 * Chrome safe zones (fixed, same for every variant):
 *   - Top   : y=0..80  (logo + pagination)
 *   - Bottom: y=940..1000 (URL footer)
 *   - Content area: y=100..900, x=0..1000 (normalized 0..1000 units)
 *
 * Requirements: 6.1, 6.4
 */

import type { AspectRatio, BlockType } from './content.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Normalized bounding box in 0..1000 unit space. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A region mapping a block type to a normalized bounding box. */
export interface LayoutRegion {
  blockType: BlockType;
  box: Box;
}

/**
 * A single slide layout variant — a preset flexbox template for satori.
 * `regions` define where each block is placed within the 0..1000 unit space.
 */
export interface SlideLayoutVariant {
  /** Unique identifier, e.g. 'heading-only' */
  id: string;
  /** Composition signature, e.g. 'heading', 'heading+body'. Sorted alphabetically. */
  compositionType: string;
  /** Aspect ratios this variant supports. */
  aspectRatios: AspectRatio[];
  /** Block placements in normalized 0..1000 unit space. */
  regions: LayoutRegion[];
  /** Whether this variant is the fallback default for its compositionType (R5.7, R6.4). */
  isDefault: boolean;
}

/** Catalog interface — returns variants for a given block composition + aspect ratio. */
export interface SlideLayoutCatalog {
  /**
   * Returns all variants that match the given block composition and aspect ratio.
   * Guarantees ≥ 1 result by falling back to the generic-default variant (R5.7, R6.4).
   */
  variantsFor(blocks: BlockType[], aspectRatio: AspectRatio): SlideLayoutVariant[];

  /**
   * Returns the default variant for the given block composition and aspect ratio.
   * Always has a result; throws if catalog is misconfigured (programmer error).
   */
  defaultFor(blocks: BlockType[], aspectRatio: AspectRatio): SlideLayoutVariant;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_RATIOS: AspectRatio[] = ['1:1', '4:5', '9:16'];

/** Compute a sorted composition signature from a blocks array. */
function compositionSignature(blocks: BlockType[]): string {
  return [...blocks].sort().join('+');
}

// ---------------------------------------------------------------------------
// Static variant catalog
// ---------------------------------------------------------------------------

/**
 * Content area bounds (same for all variants — chrome safe zone is fixed):
 *   x: 0..1000, y: 100..900  (height = 800 units)
 *
 * Variants below subdivide this 800-unit height among their blocks.
 */

const CONTENT_TOP = 100;
const CONTENT_HEIGHT = 800; // y=100 to y=900
const CONTENT_X = 0;
const CONTENT_W = 1000;

/** Build a box relative to the content area. */
function contentBox(yOffset: number, h: number): Box {
  return { x: CONTENT_X, y: CONTENT_TOP + yOffset, w: CONTENT_W, h };
}

/**
 * NEW LAYOUT CATALOG — Modern, visual-first slide designs
 * Inspired by contemporary social media carousel aesthetics
 * 
 * 50+ variants organized by category:
 * - Cover slides (hero/title slides)
 * - Content slides (text + visual combinations)
 * - Data slides (stats, charts, comparisons)
 * - Quote/CTA slides (testimonials, calls-to-action)
 */

export const SLIDE_LAYOUT_VARIANTS: SlideLayoutVariant[] = [
  // =========================================================================
  // GROWHALEY CATALOG — 10 poster-style variants, single id space with the
  // renderer template registry (rendering/satori/templates/growhaley.ts).
  // =========================================================================

  // Poster: cover — giant staggered display headline
  {
    id: 'gw_poster_cover',
    compositionType: 'heading',
    aspectRatios: ALL_RATIOS,
    regions: [
      { blockType: 'heading', box: contentBox(0, 560) },
      { blockType: 'body', box: contentBox(640, 160) },
    ],
    isDefault: true,
  },

  // Poster: statement — display statement + short body
  {
    id: 'gw_poster_statement',
    compositionType: 'body+heading',
    aspectRatios: ALL_RATIOS,
    regions: [
      { blockType: 'heading', box: contentBox(0, 480) },
      { blockType: 'body', box: contentBox(520, 280) },
    ],
    isDefault: true,
  },

  // Poster: list — display header + bold checklist rows
  {
    id: 'gw_poster_list',
    compositionType: 'bullet+heading',
    aspectRatios: ALL_RATIOS,
    regions: [
      { blockType: 'heading', box: contentBox(0, 220) },
      { blockType: 'bullet', box: contentBox(260, 540) },
    ],
    isDefault: true,
  },

  // Poster: stat — hero metric with context
  {
    id: 'gw_poster_stat',
    compositionType: 'body+heading+stat',
    aspectRatios: ALL_RATIOS,
    regions: [
      { blockType: 'heading', box: contentBox(0, 160) },
      { blockType: 'stat', box: contentBox(180, 440) },
      { blockType: 'body', box: contentBox(660, 140) },
    ],
    isDefault: true,
  },

  // Poster: quote — big quote with curly-brace ornaments
  {
    id: 'gw_poster_quote',
    compositionType: 'quote',
    aspectRatios: ALL_RATIOS,
    regions: [{ blockType: 'quote', box: contentBox(0, CONTENT_HEIGHT) }],
    isDefault: true,
  },

  // Poster: cta — closing slide with lime CTA block
  {
    id: 'gw_poster_cta',
    compositionType: 'body+cta+heading',
    aspectRatios: ALL_RATIOS,
    regions: [
      { blockType: 'heading', box: contentBox(0, 320) },
      { blockType: 'body', box: contentBox(360, 240) },
      { blockType: 'cta', box: contentBox(640, 160) },
    ],
    isDefault: true,
  },

  // Photo: statement — full-bleed image + scrim + bottom display text
  {
    id: 'gw_photo_statement',
    compositionType: 'heading+image',
    aspectRatios: ALL_RATIOS,
    regions: [
      { blockType: 'image', box: contentBox(0, CONTENT_HEIGHT) },
      { blockType: 'heading', box: contentBox(520, 280) },
    ],
    isDefault: true,
  },

  // Photo: rotated — full-bleed image + rotated rail typography
  {
    id: 'gw_photo_rotated',
    compositionType: 'body+heading+image',
    aspectRatios: ALL_RATIOS,
    regions: [
      { blockType: 'image', box: contentBox(0, CONTENT_HEIGHT) },
      { blockType: 'heading', box: contentBox(560, 240) },
      { blockType: 'body', box: contentBox(560, 140) },
    ],
    isDefault: true,
  },

  // Collage: showcase — overlapping cards over giant display text
  {
    id: 'gw_collage_showcase',
    compositionType: 'image',
    aspectRatios: ALL_RATIOS,
    regions: [{ blockType: 'image', box: contentBox(0, CONTENT_HEIGHT) }],
    isDefault: true,
  },

  // Extra composition coverage so inferLayoutVariant() finds sane defaults
  { 
    id: 'gw_poster_stat',
    compositionType: 'heading+stat',
    aspectRatios: ALL_RATIOS,
    regions: [
      { blockType: 'heading', box: contentBox(0, 200) },
      { blockType: 'stat', box: contentBox(240, 560) },
    ],
    isDefault: true,
  },
  {
    id: 'gw_poster_stat',
    compositionType: 'stat',
    aspectRatios: ALL_RATIOS,
    regions: [{ blockType: 'stat', box: contentBox(0, CONTENT_HEIGHT) }],
    isDefault: true,
  },
  {
    id: 'gw_poster_quote',
    compositionType: 'body+quote',
    aspectRatios: ALL_RATIOS,
    regions: [
      { blockType: 'quote', box: contentBox(0, 560) },
      { blockType: 'body', box: contentBox(600, 200) },
    ],
    isDefault: true,
  },
  {
    id: 'gw_poster_cta',
    compositionType: 'cta',
    aspectRatios: ALL_RATIOS,
    regions: [{ blockType: 'cta', box: contentBox(0, CONTENT_HEIGHT) }],
    isDefault: true,
  },
  {
    id: 'gw_poster_cta',
    compositionType: 'cta+heading',
    aspectRatios: ALL_RATIOS,
    regions: [
      { blockType: 'heading', box: contentBox(0, 480) },
      { blockType: 'cta', box: contentBox(560, 240) },
    ],
    isDefault: true,
  },
  {
    id: 'gw_poster_list',
    compositionType: 'body+bullet+heading',
    aspectRatios: ALL_RATIOS,
    regions: [
      { blockType: 'heading', box: contentBox(0, 180) },
      { blockType: 'body', box: contentBox(200, 160) },
      { blockType: 'bullet', box: contentBox(380, 420) },
    ],
    isDefault: true,
  },
  {
    id: 'gw_photo_statement',
    compositionType: 'body+heading+image',
    aspectRatios: ALL_RATIOS,
    regions: [
      { blockType: 'image', box: contentBox(0, CONTENT_HEIGHT) },
      { blockType: 'heading', box: contentBox(480, 200) },
      { blockType: 'body', box: contentBox(700, 100) },
    ],
    isDefault: false,
  },
  {
    id: 'gw_poster_statement',
    compositionType: 'body',
    aspectRatios: ALL_RATIOS,
    regions: [{ blockType: 'body', box: contentBox(0, CONTENT_HEIGHT) }],
    isDefault: true,
  },

  // =========================================================================
  // FALLBACK: Generic default for any composition
  // =========================================================================
  {
    id: 'gw_poster_statement',
    compositionType: 'default',
    aspectRatios: ALL_RATIOS,
    regions: [{ blockType: 'heading', box: contentBox(0, CONTENT_HEIGHT) }],
    isDefault: true,
  },
];

// ---------------------------------------------------------------------------
// DefaultSlideLayoutCatalog implementation
// ---------------------------------------------------------------------------

/**
 * The default (and only) implementation of {@link SlideLayoutCatalog}.
 *
 * Matching logic for `variantsFor`:
 *  1. Compute the composition signature by sorting `blocks` and joining with '+'.
 *  2. Return variants where `compositionType` matches AND `aspectRatio` is supported.
 *  3. If no specific match, return the 'generic-default' variants for the given aspectRatio.
 *
 * `defaultFor`: picks the variant with `isDefault=true` from `variantsFor()`.
 * Throws only if catalog is fundamentally misconfigured (programmer error).
 */
export class DefaultSlideLayoutCatalog implements SlideLayoutCatalog {
  private readonly variants: SlideLayoutVariant[];

  constructor(variants: SlideLayoutVariant[] = SLIDE_LAYOUT_VARIANTS) {
    this.variants = variants;
  }

  variantsFor(blocks: BlockType[], aspectRatio: AspectRatio): SlideLayoutVariant[] {
    const sig = compositionSignature(blocks);

    // Step 1: find variants matching signature + aspect ratio
    const matched = this.variants.filter(
      (v) => v.compositionType === sig && v.aspectRatios.includes(aspectRatio),
    );

    if (matched.length > 0) {
      return matched;
    }

    // Step 2: fallback to generic-default for the given aspect ratio
    const genericDefault = this.variants.filter(
      (v) => v.compositionType === 'default' && v.aspectRatios.includes(aspectRatio),
    );

    // generic-default covers all ratios, so this should always be non-empty
    return genericDefault;
  }

  defaultFor(blocks: BlockType[], aspectRatio: AspectRatio): SlideLayoutVariant {
    const candidates = this.variantsFor(blocks, aspectRatio);

    const defaultVariant = candidates.find((v) => v.isDefault);

    if (defaultVariant === undefined) {
      // This is a programmer error — the catalog must always have a default
      throw new Error(
        `SlideLayoutCatalog: no default variant found for composition ` +
          `'${compositionSignature(blocks)}' and aspectRatio '${aspectRatio}'. ` +
          `Ensure the static catalog includes a generic-default variant covering all aspect ratios.`,
      );
    }

    return defaultVariant;
  }
}

// ---------------------------------------------------------------------------
// Singleton export (convenience)
// ---------------------------------------------------------------------------

/** Singleton catalog instance using the static variant list. */
export const slideLayoutCatalog: SlideLayoutCatalog = new DefaultSlideLayoutCatalog();
