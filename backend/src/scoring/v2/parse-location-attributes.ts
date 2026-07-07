/**
 * Rescue business attributes stuffed into the `location` string.
 *
 * The Google Maps scraper concatenated `…name  <rating>(<reviews>)<category>`
 * into `location` instead of populating `auditAttributes`, so the scorer never
 * saw a rating, review count, or category (see the dry-run findings). This pure
 * parser extracts them back out.
 *
 * Format specifics (Indonesian locale):
 *   - rating uses a decimal COMMA: `4,7`
 *   - review count uses a thousands DOT: `3.320` → 3320
 *   - category is the trailing text: `Firma Hukum`, `Klinik Medis`
 *
 * Returns `null` when the string is a plain address (no embedded rating), so a
 * caller can safely skip leads that have nothing to rescue.
 */

import type { LeadAuditAttributes } from '@leads-generator/shared';

export interface ParsedLocationAttributes {
  rating: number;
  reviewCount: number;
  category: string;
}

// <rating>,d ( <reviews with optional thousands dots/commas> ) <category>
const PATTERN = /(\d(?:[.,]\d)?)\s*\(([\d.,]+)\)\s*(.+)$/;

// Trailing text that looks like a street address, not a business category.
const ADDRESS_MARKER = /\b(jl\.?|jalan|no\.?|kec\.?|kel\.?|kota|kabupaten|rt\b|rw\b|street|ave)\b/i;

const MAX_CATEGORY_LENGTH = 60;

export function parseLocationAttributes(
  location: string | undefined | null,
): ParsedLocationAttributes | null {
  if (!location) return null;

  const match = PATTERN.exec(location);
  if (!match) return null;

  const rating = Number.parseFloat(match[1]!.replace(',', '.'));
  const reviewCount = Number.parseInt(match[2]!.replace(/\D+/g, ''), 10);
  const category = match[3]!.trim();

  if (!Number.isFinite(rating) || rating < 0 || rating > 5) return null;
  if (!Number.isFinite(reviewCount) || reviewCount < 0) return null;
  if (category.length === 0 || category.length > MAX_CATEGORY_LENGTH) return null;
  // Reject matches whose "category" is really the rest of a street address.
  if (ADDRESS_MARKER.test(category)) return null;

  return { rating, reviewCount, category };
}

/**
 * Merge parsed attributes onto any existing ones, without overwriting fields
 * already present. Returns `null` when there is nothing to rescue.
 */
export function mergeLocationAttributes(
  location: string | undefined | null,
  existing: LeadAuditAttributes | undefined,
): LeadAuditAttributes | null {
  const parsed = parseLocationAttributes(location);
  if (!parsed) return null;

  const merged: LeadAuditAttributes = { ...(existing ?? {}) };
  let changed = false;
  if (merged.rating === undefined) {
    merged.rating = parsed.rating;
    changed = true;
  }
  if (merged.reviewCount === undefined) {
    merged.reviewCount = parsed.reviewCount;
    changed = true;
  }
  if (merged.category === undefined) {
    merged.category = parsed.category;
    changed = true;
  }
  return changed ? merged : null;
}
