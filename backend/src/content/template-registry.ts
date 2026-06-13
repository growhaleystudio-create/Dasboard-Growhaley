/**
 * template-registry.ts — Source of truth untuk 30 Master Template.
 *
 * Arsitektur:
 * - AI Planner hanya memilih template_id (string).
 * - Registry ini yang menentukan kontrak rasio, kebutuhan gambar, dan
 *   komponen yang wajib/opsional. AI tidak bisa mengubah ini.
 * - Pembagian bucket:
 *   template_01..10 → Text-only (requires_image: false)
 *   template_11..20 → Vertical 4:5
 *   template_21..25 → Square 1:1
 *   template_26..30 → Horizontal 16:9
 */

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

export type ImageBoardRatio = '4:5' | '1:1' | '16:9';

export interface TemplateContract {
  /** Unique stable ID, e.g. "template_12". Never changes. */
  id: string;
  /** Human-readable name for the UI / planner prompt. */
  name: string;
  /** Whether this template renders an image board at all. */
  requires_image: boolean;
  /**
   * The locked aspect ratio for the image board inside this template.
   * Null when requires_image is false.
   */
  image_board_ratio: ImageBoardRatio | null;
  /**
   * Components this template MUST receive. AI must include all of these.
   */
  required_components: ComponentType[];
  /**
   * Components this template CAN render but doesn't require.
   */
  optional_components: ComponentType[];
  /** Brief layout description for the AI planner prompt. */
  layout_hint: string;
}

export type ComponentType =
  | 'header'
  | 'body'
  | 'quote'
  | 'checklist'
  | 'button_cta'
  | 'image_placeholder'
  | 'stat';

// ---------------------------------------------------------------------------
// 30 Master Templates
// ---------------------------------------------------------------------------

export const TEMPLATE_REGISTRY: TemplateContract[] = [
  // =========================================================================
  // TEXT-ONLY BUCKET (01-10) — requires_image: false
  // =========================================================================
  {
    id: 'template_01',
    name: 'Cover Centered',
    requires_image: false,
    image_board_ratio: null,
    required_components: ['header'],
    optional_components: ['body'],
    layout_hint: 'Big title + subtitle centered. Best for opening slide.',
  },
  {
    id: 'template_02',
    name: 'Cover Editorial Left',
    requires_image: false,
    image_board_ratio: null,
    required_components: ['header'],
    optional_components: ['body'],
    layout_hint: 'Large left-aligned title (editorial magazine style). Best for cover.',
  },
  {
    id: 'template_03',
    name: 'Text Stack',
    requires_image: false,
    image_board_ratio: null,
    required_components: ['header', 'body'],
    optional_components: [],
    layout_hint: 'Left-aligned title + body paragraph. Clean and readable.',
  },
  {
    id: 'template_04',
    name: 'Text Centered',
    requires_image: false,
    image_board_ratio: null,
    required_components: ['header', 'body'],
    optional_components: [],
    layout_hint: 'Centered title + centered body. Balanced and symmetrical.',
  },
  {
    id: 'template_05',
    name: 'Checklist Stack',
    requires_image: false,
    image_board_ratio: null,
    required_components: ['header', 'checklist'],
    optional_components: ['body'],
    layout_hint: 'Title + bullet-point checklist. For listing benefits or steps.',
  },
  {
    id: 'template_06',
    name: 'Numbered Steps',
    requires_image: false,
    image_board_ratio: null,
    required_components: ['header', 'checklist'],
    optional_components: ['body'],
    layout_hint: 'Title + numbered sequential steps. For how-to content.',
  },
  {
    id: 'template_07',
    name: 'Quote Focus',
    requires_image: false,
    image_board_ratio: null,
    required_components: ['quote'],
    optional_components: ['body'],
    layout_hint: 'Large decorative quote centered. For testimonials or powerful statements.',
  },
  {
    id: 'template_08',
    name: 'Stat Highlight',
    requires_image: false,
    image_board_ratio: null,
    required_components: ['stat', 'body'],
    optional_components: [],
    layout_hint: 'Giant number/percentage + supporting text. For data-driven slides.',
  },
  {
    id: 'template_09',
    name: 'Big Statement',
    requires_image: false,
    image_board_ratio: null,
    required_components: ['header'],
    optional_components: ['body'],
    layout_hint: 'Single powerful oversized statement. Bold and minimal.',
  },
  {
    id: 'template_10',
    name: 'CTA Centered',
    requires_image: false,
    image_board_ratio: null,
    required_components: ['header', 'button_cta'],
    optional_components: ['body'],
    layout_hint: 'Title + body + call-to-action button centered. Best for closing slide.',
  },

  // =========================================================================
  // VERTICAL 4:5 BUCKET (11-20) — image board ratio 4:5
  // =========================================================================
  {
    id: 'template_11',
    name: 'Cover Image Full 4:5',
    requires_image: true,
    image_board_ratio: '4:5',
    required_components: ['header', 'image_placeholder'],
    optional_components: ['body'],
    layout_hint: 'Full-bleed image background + overlay title. Dramatic cover for Instagram feed.',
  },
  {
    id: 'template_12',
    name: 'Split Text-Left Image-Right 4:5',
    requires_image: true,
    image_board_ratio: '4:5',
    required_components: ['header', 'body', 'image_placeholder'],
    optional_components: [],
    layout_hint: 'Text 55% left, image board 45% right (vertical). Classic editorial layout.',
  },
  {
    id: 'template_13',
    name: 'Split Image-Left Text-Right 4:5',
    requires_image: true,
    image_board_ratio: '4:5',
    required_components: ['header', 'body', 'image_placeholder'],
    optional_components: [],
    layout_hint: 'Image 45% left, text 55% right (vertical). Variation of editorial split.',
  },
  {
    id: 'template_14',
    name: 'Image Top Text Bottom 4:5',
    requires_image: true,
    image_board_ratio: '4:5',
    required_components: ['header', 'image_placeholder'],
    optional_components: ['body'],
    layout_hint: 'Image board top 46%, title + body below. For product or visual storytelling.',
  },
  {
    id: 'template_15',
    name: 'Text Top Image Bottom 4:5',
    requires_image: true,
    image_board_ratio: '4:5',
    required_components: ['header', 'image_placeholder'],
    optional_components: ['body'],
    layout_hint: 'Title + body above, image board bottom 46%.',
  },
  {
    id: 'template_16',
    name: 'Split Checklist-Image 4:5',
    requires_image: true,
    image_board_ratio: '4:5',
    required_components: ['checklist', 'image_placeholder'],
    optional_components: ['header'],
    layout_hint: 'Checklist left, image right (vertical). For benefit lists with visual proof.',
  },
  {
    id: 'template_17',
    name: 'Numbered Steps + Image 4:5',
    requires_image: true,
    image_board_ratio: '4:5',
    required_components: ['header', 'checklist', 'image_placeholder'],
    optional_components: [],
    layout_hint: 'Steps numbered left, image right (vertical). How-to with visual.',
  },
  {
    id: 'template_18',
    name: 'Quote + Image 4:5',
    requires_image: true,
    image_board_ratio: '4:5',
    required_components: ['quote', 'image_placeholder'],
    optional_components: ['body'],
    layout_hint: 'Large quote centered, small image below (vertical). Testimonial style.',
  },
  {
    id: 'template_19',
    name: 'Header Body CTA + Image 4:5',
    requires_image: true,
    image_board_ratio: '4:5',
    required_components: ['header', 'body', 'button_cta', 'image_placeholder'],
    optional_components: [],
    layout_hint: 'Text + CTA button left, image right (vertical). Conversion slide.',
  },
  {
    id: 'template_20',
    name: 'Image Full Caption 4:5',
    requires_image: true,
    image_board_ratio: '4:5',
    required_components: ['image_placeholder', 'body'],
    optional_components: ['header'],
    layout_hint: 'Large image (72%) + caption text below (vertical). Visual-first storytelling.',
  },

  // =========================================================================
  // SQUARE 1:1 BUCKET (21-25) — image board ratio 1:1
  // =========================================================================
  {
    id: 'template_21',
    name: 'Cover Image Full 1:1',
    requires_image: true,
    image_board_ratio: '1:1',
    required_components: ['header', 'image_placeholder'],
    optional_components: ['body'],
    layout_hint: 'Full-bleed square image background + overlay text. Instagram square cover.',
  },
  {
    id: 'template_22',
    name: 'Split Text-Image 1:1',
    requires_image: true,
    image_board_ratio: '1:1',
    required_components: ['header', 'body', 'image_placeholder'],
    optional_components: [],
    layout_hint: 'Text 55% left, square image board 45% right. Balanced square layout.',
  },
  {
    id: 'template_23',
    name: 'Image Top Text Bottom 1:1',
    requires_image: true,
    image_board_ratio: '1:1',
    required_components: ['header', 'image_placeholder'],
    optional_components: ['body'],
    layout_hint: 'Square image top, title + body below.',
  },
  {
    id: 'template_24',
    name: 'Checklist + Image 1:1',
    requires_image: true,
    image_board_ratio: '1:1',
    required_components: ['checklist', 'image_placeholder'],
    optional_components: ['header'],
    layout_hint: 'Checklist left, square image right.',
  },
  {
    id: 'template_25',
    name: 'Stat + Image 1:1',
    requires_image: true,
    image_board_ratio: '1:1',
    required_components: ['stat', 'body', 'image_placeholder'],
    optional_components: [],
    layout_hint: 'Giant stat left, square image right. Data meets visual.',
  },

  // =========================================================================
  // HORIZONTAL 16:9 BUCKET (26-30) — image board ratio 16:9
  // =========================================================================
  {
    id: 'template_26',
    name: 'Cover Image Full 16:9',
    requires_image: true,
    image_board_ratio: '16:9',
    required_components: ['header', 'image_placeholder'],
    optional_components: ['body'],
    layout_hint: 'Full-bleed widescreen image + overlay text. LinkedIn/YouTube thumbnail style.',
  },
  {
    id: 'template_27',
    name: 'Image Top Text Bottom 16:9',
    requires_image: true,
    image_board_ratio: '16:9',
    required_components: ['header', 'image_placeholder'],
    optional_components: ['body'],
    layout_hint: 'Widescreen image top, text below. Strong horizontal visual.',
  },
  {
    id: 'template_28',
    name: 'Split Text-Image 16:9',
    requires_image: true,
    image_board_ratio: '16:9',
    required_components: ['header', 'body', 'image_placeholder'],
    optional_components: [],
    layout_hint: 'Text left, widescreen image right. Landscape split layout.',
  },
  {
    id: 'template_29',
    name: 'Image Full Caption 16:9',
    requires_image: true,
    image_board_ratio: '16:9',
    required_components: ['image_placeholder', 'body'],
    optional_components: [],
    layout_hint: 'Large widescreen image + caption. Pure visual content.',
  },
  {
    id: 'template_30',
    name: 'Header Checklist + Image 16:9',
    requires_image: true,
    image_board_ratio: '16:9',
    required_components: ['header', 'checklist', 'image_placeholder'],
    optional_components: [],
    layout_hint: 'Title + checklist left, widescreen image right.',
  },
];

// ---------------------------------------------------------------------------
// Registry accessors (O(1) lookup via Map)
// ---------------------------------------------------------------------------

const REGISTRY_MAP = new Map<string, TemplateContract>(
  TEMPLATE_REGISTRY.map((t) => [t.id, t]),
);

/**
 * Lookup a template contract by ID.
 * Returns null when the ID is unknown (never trust raw AI output blindly).
 */
export function getTemplate(id: string): TemplateContract | null {
  return REGISTRY_MAP.get(id) ?? null;
}

/**
 * Get the locked image-board ratio for a template.
 * Returns null for text-only templates.
 * This is the authoritative source — AI output is ignored.
 */
export function getImageBoardRatio(templateId: string): ImageBoardRatio | null {
  return getTemplate(templateId)?.image_board_ratio ?? null;
}

/** Returns true if the template requires an image board. */
export function requiresImage(templateId: string): boolean {
  return getTemplate(templateId)?.requires_image ?? false;
}

/** All template IDs in a flat array — used to populate the AI planner prompt. */
export const ALL_TEMPLATE_IDS: string[] = TEMPLATE_REGISTRY.map((t) => t.id);
