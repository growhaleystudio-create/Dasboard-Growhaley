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

import type { AspectRatio, BlockType } from '@leads-generator/shared';

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

const STATIC_VARIANTS: SlideLayoutVariant[] = [
  // -------------------------------------------------------------------------
  // 1. heading-only  (compositionType: 'heading')
  // -------------------------------------------------------------------------
  {
    id: 'heading-only',
    compositionType: 'heading',
    aspectRatios: ALL_RATIOS,
    regions: [
      // Heading fills the full content area (centered vertically by renderer)
      { blockType: 'heading', box: contentBox(0, CONTENT_HEIGHT) },
    ],
    isDefault: true,
  },

  // -------------------------------------------------------------------------
  // 2. heading-body  (compositionType: 'body+heading' — sorted)
  // -------------------------------------------------------------------------
  {
    id: 'heading-body',
    compositionType: 'body+heading',
    aspectRatios: ALL_RATIOS,
    regions: [
      // Heading: top 40% of content area (320 units)
      { blockType: 'heading', box: contentBox(0, 320) },
      // Body: remaining 60% (480 units)
      { blockType: 'body', box: contentBox(320, 480) },
    ],
    isDefault: true,
  },

  // -------------------------------------------------------------------------
  // 3. heading-body-chart  (compositionType: 'body+chart+heading' — sorted)
  // -------------------------------------------------------------------------
  {
    id: 'heading-body-chart',
    compositionType: 'body+chart+heading',
    aspectRatios: ALL_RATIOS,
    regions: [
      // Heading: 25% (200 units)
      { blockType: 'heading', box: contentBox(0, 200) },
      // Body: 20% (160 units)
      { blockType: 'body', box: contentBox(200, 160) },
      // Chart: 55% (440 units)
      { blockType: 'chart', box: contentBox(360, 440) },
    ],
    isDefault: true,
  },

  // -------------------------------------------------------------------------
  // 4. mockup-body  (compositionType: 'body+mockup' — sorted)
  // -------------------------------------------------------------------------
  {
    id: 'mockup-body',
    compositionType: 'body+mockup',
    aspectRatios: ALL_RATIOS,
    regions: [
      // Mockup: 60% (480 units)
      { blockType: 'mockup', box: contentBox(0, 480) },
      // Body: 40% (320 units)
      { blockType: 'body', box: contentBox(480, 320) },
    ],
    isDefault: true,
  },

  // -------------------------------------------------------------------------
  // 5. heading-chart  (compositionType: 'chart+heading' — sorted)
  // -------------------------------------------------------------------------
  {
    id: 'heading-chart',
    compositionType: 'chart+heading',
    aspectRatios: ALL_RATIOS,
    regions: [
      // Heading: 25% (200 units)
      { blockType: 'heading', box: contentBox(0, 200) },
      // Chart: 75% (600 units)
      { blockType: 'chart', box: contentBox(200, 600) },
    ],
    isDefault: true,
  },

  // -------------------------------------------------------------------------
  // 6. heading-body-stat  (compositionType: 'body+heading+stat' — sorted)
  // -------------------------------------------------------------------------
  {
    id: 'heading-body-stat',
    compositionType: 'body+heading+stat',
    aspectRatios: ALL_RATIOS,
    regions: [
      // Heading: 25% (200 units)
      { blockType: 'heading', box: contentBox(0, 200) },
      // Body: 35% (280 units)
      { blockType: 'body', box: contentBox(200, 280) },
      // Stat: 40% (320 units)
      { blockType: 'stat', box: contentBox(480, 320) },
    ],
    isDefault: true,
  },

  // -------------------------------------------------------------------------
  // 7. heading-bullet  (compositionType: 'bullet+heading' — sorted)
  // -------------------------------------------------------------------------
  {
    id: 'heading-bullet',
    compositionType: 'bullet+heading',
    aspectRatios: ALL_RATIOS,
    regions: [
      // Heading: 30% (240 units)
      { blockType: 'heading', box: contentBox(0, 240) },
      // Bullet: 70% (560 units)
      { blockType: 'bullet', box: contentBox(240, 560) },
    ],
    isDefault: true,
  },

  // -------------------------------------------------------------------------
  // 8. quote-only  (compositionType: 'quote')
  // -------------------------------------------------------------------------
  {
    id: 'quote-only',
    compositionType: 'quote',
    aspectRatios: ALL_RATIOS,
    regions: [
      // Quote fills the full content area
      { blockType: 'quote', box: contentBox(0, CONTENT_HEIGHT) },
    ],
    isDefault: true,
  },

  // -------------------------------------------------------------------------
  // 9. cta-only  (compositionType: 'cta')
  // -------------------------------------------------------------------------
  {
    id: 'cta-only',
    compositionType: 'cta',
    aspectRatios: ALL_RATIOS,
    regions: [
      // CTA fills the full content area
      { blockType: 'cta', box: contentBox(0, CONTENT_HEIGHT) },
    ],
    isDefault: true,
  },

  // -------------------------------------------------------------------------
  // 10. generic-default  — fallback for ANY composition (compositionType: 'default')
  // -------------------------------------------------------------------------
  {
    id: 'generic-default',
    compositionType: 'default',
    aspectRatios: ALL_RATIOS,
    regions: [
      // Single full-content-area region; Renderer assigns blocks top-to-bottom
      { blockType: 'heading', box: contentBox(0, CONTENT_HEIGHT) },
    ],
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

  constructor(variants: SlideLayoutVariant[] = STATIC_VARIANTS) {
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
