/**
 * Lead Opportunity Scoring v2 — tunable constants.
 *
 * These are the ONLY knobs. The calibration gate (implementation plan Phase 2)
 * adjusts values here — nothing else — and freezes them once Precision@Hot
 * clears its target. Category tables are reused from v1 (`../constants.js`) so
 * the two engines stay aligned during the transition.
 */

export const LEAD_SCORING_V2_VERSION = '2026-07-v2';

/** Pillar weights. One set for ALL leads → scores are comparable across leads. */
export const PILLAR_WEIGHTS = {
  businessValue: 0.35,
  digitalGap: 0.4,
  reachability: 0.25,
} as const;

/** Sub-weights inside WebsiteQuality (only the `website` branch of DigitalGap). */
export const WEBSITE_QUALITY_WEIGHTS = {
  performance: 0.3,
  seo: 0.25,
  uiux: 0.25,
  conversion: 0.2,
} as const;

/** UI/UX blend: accessibility dominates, best-practices is the "well-tended" signal. */
export const UIUX_BLEND = {
  accessibility: 0.6,
  bestPractices: 0.4,
} as const;

/** BusinessValue blend: reviews (log-scaled) outweigh raw rating. */
export const BUSINESS_VALUE_BLEND = {
  reviews: 0.6,
  rating: 0.4,
} as const;

/** Conversion-readiness checklist (sums to 100). */
export const CONVERSION_POINTS = {
  contactChannel: 40,
  cta: 30,
  contactForm: 30,
} as const;

/** DigitalGap for dead/broken sites — fixed by status, no formula. */
export const DEAD_SITE_GAP = {
  parked: 100,
  inactive: 90,
  timeout: 80,
  fetch_failed: 80,
} as const;

/**
 * No-website DigitalGap = FLOOR + SPAN × blend(categoryNeed, marketPresence).
 * FLOOR 70 is an explicit ranking rule: a business with no website is never
 * treated as "less in need" than one whose site is still alive.
 */
export const NO_WEBSITE_GAP = {
  floor: 70,
  span: 30,
  categoryNeedWeight: 0.5,
  marketPresenceWeight: 0.5,
} as const;

/** Neutral fallback for a missing Lighthouse category (also dents confidence). */
export const NEUTRAL_SUBSCORE = 50;

/** Reachability scores by detected contact type. */
export const REACHABILITY_SCORE = {
  mobile: 100,
  landline: 60,
  invalid: 20,
  missing: 0,
} as const;

/** Confidence = sum of 4 data checks. Website check is two-tier (see confidence.ts). */
export const CONFIDENCE_POINTS = {
  contact: 25,
  business: 25,
  websiteResolvedFull: 25,
  websiteResolvedPartial: 15,
  freshness: 25,
} as const;

/** Confidence multiplier is linear: 0.7 at conf=0 → 1.0 at conf=100. */
export const CONFIDENCE_MULTIPLIER = {
  floor: 0.7,
  span: 0.3,
} as const;

/** Score-band thresholds (lower bound inclusive). PROVISIONAL until Phase 2. */
export const SCORE_BANDS = {
  hot: 75,
  warm: 55,
  nurture: 35,
} as const;

/**
 * Category → tier tables, keyed by substrings matched case-insensitively.
 *
 * v2 owns bilingual tables (Indonesian + English) because the scraped
 * categories are Indonesian ("Firma Hukum", "Klinik Medis") while the v1
 * tables were English-only and silently never matched. ORDER MATTERS: the
 * lookup returns the first key `category.includes(key)` hits, so the more
 * specific term ("klinik gigi") must precede the general one ("klinik").
 */
export const CATEGORY_FIT_BONUS_V2: Record<string, number> = {
  'klinik gigi': 5,
  dental: 5,
  klinik: 5,
  clinic: 5,
  'firma hukum': 5,
  'biro hukum': 5,
  'kantor hukum': 5,
  'layanan hukum': 5,
  pengacara: 5,
  lawyer: 5,
  kontraktor: 5,
  contractor: 5,
  pernikahan: 5,
  wedding: 5,
  hotel: 2,
  'cukur rambut': 2,
  salon: 2,
  barber: 2,
  restoran: 2,
  restaurant: 2,
  kafe: 2,
  cafe: 2,
  kopi: 2,
  coffee: 2,
};

export const CATEGORY_NEED_SCORE_V2: Record<string, number> = {
  'klinik gigi': 90,
  dental: 90,
  klinik: 90,
  clinic: 90,
  kontraktor: 88,
  contractor: 88,
  'firma hukum': 85,
  'biro hukum': 85,
  'kantor hukum': 85,
  'layanan hukum': 85,
  pengacara: 85,
  lawyer: 85,
  pernikahan: 85,
  wedding: 85,
  hotel: 80,
  'cukur rambut': 72,
  salon: 72,
  barber: 72,
  restoran: 68,
  restaurant: 68,
  kafe: 65,
  cafe: 65,
  kopi: 65,
  coffee: 65,
} as const;
