/**
 * Pure validation + normalization for Scan_Configuration input
 * (Task 8.1 + Task 8.3, R4.1–R4.4, R4.7, R4.3, R5.6).
 *
 * This module contains NO I/O and NO database access — it is a pure
 * function over plain input so it can be unit/property tested in
 * isolation and reused by `Scan_Config_Service` (see
 * `./scan-config-service.ts`).
 *
 * Design reference: design.md → Components and Interfaces →
 * Scan_Config_Service → "Pipeline validasi `save`":
 *
 *   1. Trim setiap keyword; buang keyword kosong.
 *   2. Validasi: minimal 1 keyword tak-kosong (R4.2), jumlah ≤ 50,
 *      panjang tiap keyword 2..100 (R4.7) — kumpulkan semua pesan
 *      kesalahan sekaligus.
 *   3. Validasi niche/location ≤ 100 char (R4.4).
 *   4. Minimal 1 Source dipilih (R4.3) — pure non-empty check here.
 *   5. Validasi interval penjadwalan 60..43200 menit (R5.6).
 *
 * The keyword / filter / source / interval errors are all collected
 * together so the caller surfaces every applicable message at once
 * (R4.7 spirit).
 *
 * Source-AVAILABILITY filtering (step 5 of the design pipeline) and the
 * "no source remaining" rejection (step 6) require the per-Team
 * connector registry and therefore live in `Scan_Config_Service`
 * (Task 8.3), NOT in this pure module.
 */

/** Minimum number of non-empty keywords accepted (R4.2). */
export const KEYWORD_MIN = 1;
/** Maximum number of keywords accepted (R4.7). */
export const KEYWORD_MAX = 50;
/** Minimum length of a single trimmed keyword (R4.1 / R4.7). */
export const KEYWORD_LEN_MIN = 2;
/** Maximum length of a single trimmed keyword (R4.1 / R4.7). */
export const KEYWORD_LEN_MAX = 100;
/** Maximum length of the optional niche / location filters (R4.4). */
export const FILTER_LEN_MAX = 100;
/** Minimum scheduling interval in minutes — 1 hour (R5.6). */
export const SCHEDULE_INTERVAL_MIN = 60;
/** Maximum scheduling interval in minutes — 30 days (R5.6). */
export const SCHEDULE_INTERVAL_MAX = 43_200;

/**
 * Canonical validation messages. Centralized so callers (and tests) can
 * assert on the exact wording, and so each rule emits a single
 * representative message rather than one-per-offending-keyword.
 */
export const VALIDATION_MESSAGES = {
  /** R4.2 — every keyword was empty (or only whitespace) after trim. */
  keywordRequired: 'minimal satu kata kunci tidak kosong wajib diisi',
  /** R4.7 — keyword count outside the 1..50 bound. */
  keywordCount: `jumlah kata kunci harus antara ${KEYWORD_MIN} sampai ${KEYWORD_MAX}`,
  /** R4.7 — at least one keyword length outside the 2..100 bound. */
  keywordLength: `panjang setiap kata kunci harus antara ${KEYWORD_LEN_MIN} sampai ${KEYWORD_LEN_MAX} karakter`,
  /** R4.4 — niche filter exceeds the 100-character bound. */
  nicheLength: `niche tidak boleh melebihi ${FILTER_LEN_MAX} karakter`,
  /** R4.4 — location filter exceeds the 100-character bound. */
  locationLength: `lokasi tidak boleh melebihi ${FILTER_LEN_MAX} karakter`,
  /** R4.3 — no Source selected (pure non-empty check). */
  sourceRequired: 'minimal satu Source wajib dipilih',
  /** R5.6 — schedule interval outside the 60..43200-minute bound. */
  scheduleInterval: `interval penjadwalan harus antara ${SCHEDULE_INTERVAL_MIN} sampai ${SCHEDULE_INTERVAL_MAX} menit`,
} as const;

/**
 * Raw, untrusted Scan_Configuration input as received from a caller
 * (API handler) before any normalization.
 */
export interface RawScanConfigInput {
  keywords: string[];
  niche?: string;
  location?: string;
  sourceIds: string[];
  scheduleIntervalMinutes?: number;
}

/**
 * Normalized Scan_Configuration input produced only when validation
 * passes. Keywords are trimmed and non-empty; `niche`/`location` are
 * trimmed and omitted entirely when empty after trimming.
 */
export interface NormalizedScanConfigInput {
  keywords: string[];
  niche?: string;
  location?: string;
  sourceIds: string[];
  scheduleIntervalMinutes?: number;
}

/**
 * Outcome of {@link validateScanConfig}.
 *
 * - `errors` holds every applicable validation message (R4.7 requires all
 *   keyword violations be surfaced together).
 * - `normalized` is present **iff** `errors` is empty.
 */
export interface ValidationOutcome {
  normalized?: NormalizedScanConfigInput;
  errors: string[];
}

/**
 * Trim a keyword array and drop entries that are empty after trimming.
 */
function normalizeKeywords(keywords: string[]): string[] {
  return keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0);
}

/**
 * Normalize an optional filter value: trim it, then treat an
 * empty-after-trim value as "not provided" (`undefined`).
 */
function normalizeFilter(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validate and normalize raw Scan_Configuration input.
 *
 * Implements steps 1–5 of the design validation pipeline (R4.1, R4.2,
 * R4.3, R4.4, R4.7, R5.6). ALL applicable errors are collected and
 * returned together rather than failing on the first violation.
 *
 * Source-AVAILABILITY filtering (design step 5/6) is intentionally out of
 * scope here because it needs the per-Team connector registry — see
 * `Scan_Config_Service` (Task 8.3). This function only performs the pure
 * non-empty Source check (R4.3).
 *
 * @returns a {@link ValidationOutcome} whose `normalized` field is present
 *          only when `errors` is empty.
 */
export function validateScanConfig(input: RawScanConfigInput): ValidationOutcome {
  const errors: string[] = [];

  // Step 1 — trim keywords and drop empties (R4.1).
  const keywords = normalizeKeywords(input.keywords);

  // Step 2 — keyword count + per-keyword length bounds (R4.2, R4.7).
  if (keywords.length < KEYWORD_MIN) {
    // No non-empty keyword survived trimming (R4.2).
    errors.push(VALIDATION_MESSAGES.keywordRequired);
  } else if (keywords.length > KEYWORD_MAX) {
    // Too many keywords (R4.7). Reported alongside any length violation
    // detected below so the caller sees every applicable bound at once.
    errors.push(VALIDATION_MESSAGES.keywordCount);
  }

  // Per-keyword length bound (R4.7). Emit a single representative message
  // even when multiple keywords are out of range — do not spam one per
  // keyword — but always include the bound when any keyword violates it.
  const hasLengthViolation = keywords.some(
    (keyword) => keyword.length < KEYWORD_LEN_MIN || keyword.length > KEYWORD_LEN_MAX,
  );
  if (hasLengthViolation) {
    errors.push(VALIDATION_MESSAGES.keywordLength);
  }

  // Step 3 — optional niche / location bounds (R4.4).
  const niche = normalizeFilter(input.niche);
  if (niche !== undefined && niche.length > FILTER_LEN_MAX) {
    errors.push(VALIDATION_MESSAGES.nicheLength);
  }

  const location = normalizeFilter(input.location);
  if (location !== undefined && location.length > FILTER_LEN_MAX) {
    errors.push(VALIDATION_MESSAGES.locationLength);
  }

  // Step 4 — at least one Source selected (R4.3). This is the pure
  // non-empty check; availability filtering (R4.6/R4.8) needs the
  // connector registry and lives in Scan_Config_Service (Task 8.3).
  if (input.sourceIds.length === 0) {
    errors.push(VALIDATION_MESSAGES.sourceRequired);
  }

  // Step 5 — schedule interval bound 60..43200 minutes (R5.6). Only
  // validated when a schedule was provided (scheduling is optional).
  if (
    input.scheduleIntervalMinutes !== undefined &&
    (input.scheduleIntervalMinutes < SCHEDULE_INTERVAL_MIN ||
      input.scheduleIntervalMinutes > SCHEDULE_INTERVAL_MAX)
  ) {
    errors.push(VALIDATION_MESSAGES.scheduleInterval);
  }

  if (errors.length > 0) {
    return { errors };
  }

  const normalized: NormalizedScanConfigInput = {
    keywords,
    sourceIds: input.sourceIds,
    ...(niche !== undefined ? { niche } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(input.scheduleIntervalMinutes !== undefined
      ? { scheduleIntervalMinutes: input.scheduleIntervalMinutes }
      : {}),
  };

  return { normalized, errors };
}
