/**
 * Pure Lead filtering predicate and filter validation for the
 * Lead_Query_Service (Task 14.3).
 *
 * Design references:
 * - design.md → Lead_Query_Service → `LeadFilter` (R9.2–R9.5, R9.7, R9.8).
 * - Requirements:
 *   - R9.2 substring search (1..100 char, trimmed, case-insensitive) over
 *     the Lead's descriptive fields.
 *   - R9.3 filter by Lead_Status.
 *   - R9.4 filter by Source.
 *   - R9.5 inclusive Lead_Score range filter.
 *   - R9.7 combining criteria is an intersection (logical AND).
 *   - R9.8 reject a score range whose lower bound exceeds the upper bound or
 *     whose bounds fall outside 0..100 — WITHOUT changing the results.
 *
 * Both exported functions are PURE: they never mutate their inputs and have
 * no side effects, which is what the Property 25 / Property 26 tests pin
 * down.
 *
 * ---------------------------------------------------------------------------
 * Design note — which fields the substring search covers (R9.2)
 * ---------------------------------------------------------------------------
 * R9.2 says the search matches a Lead's "nama, kontak, atau niche". The
 * {@link Lead} entity exposes `name`, `publicContact`, `profileUrl` and
 * `location` but has NO dedicated `niche` field — "niche/industri" is a
 * criterion of the Scan_Configuration (the scan that *discovered* the Lead),
 * not an attribute persisted on the Lead row. For the Lead-list search we
 * therefore interpret "niche" loosely as the Lead's descriptive public
 * fields and search across `name + publicContact + location`. This matches
 * the physical trigram index `idx_lead_search_trgm`, which is defined over
 * `name + public_contact + location`, so the future SQL-pushed-down search
 * (Task 21 perf) will use the exact same field set.
 */

import type { Lead, LeadStatus, WhatsAppVerificationStatus } from '@leads-generator/shared';
import type { AIState } from '@leads-generator/shared';
import { isBusinessWebsiteUrl } from '../url/business-website.js';

/**
 * Filter criteria for the Lead list. Every field is optional; a field that
 * is `undefined` imposes no constraint. Mirrors design.md → `LeadFilter`.
 */
export interface LeadFilter {
  /** Case-insensitive substring, 1..100 characters after trimming (R9.2). */
  search?: string;
  /** Restrict to these Lead_Statuses (R9.3). */
  statuses?: LeadStatus[];
  /**
   * Restrict to Leads whose `acquiredSource` is one of these (R9.4).
   *
   * Design note: a Lead can be attached to several Sources via
   * `lead_source`, but the canonical "where this Lead came from" attribute
   * persisted on the Lead row is `acquiredSource`. The filter therefore
   * tests membership of `lead.acquiredSource` in `sources`.
   */
  sources?: string[];
  /** Inclusive lower bound of the Lead_Score range, 0..100 (R9.5). */
  scoreMin?: number;
  /** Inclusive upper bound of the Lead_Score range, 0..100 (R9.5). */
  scoreMax?: number;
  /** Inclusive lower bound for discoveredAt. */
  discoveredFrom?: Date;
  /** Inclusive upper bound for discoveredAt. */
  discoveredTo?: Date;
  /** Restrict to 1..5 AI star ratings derived from `aiIntentScore`. */
  ratings?: number[];
  /** Restrict by whether the Lead has a real business website URL. */
  websiteStatuses?: ('have_website' | 'no_website')[];
  /** Restrict by persisted AI enrichment lifecycle. */
  aiStates?: AIState[];
  /** Restrict by manual WhatsApp verification outcome. */
  whatsappVerificationStatuses?: WhatsAppVerificationStatus[];
}

/** Minimum length (after trimming) of a search term (R9.2). */
export const SEARCH_MIN = 1;
/** Maximum length (after trimming) of a search term (R9.2). */
export const SEARCH_MAX = 100;

/** Inclusive lower limit of a valid Lead_Score bound (R9.8). */
const SCORE_FLOOR = 0;
/** Inclusive upper limit of a valid Lead_Score bound (R9.8). */
const SCORE_CEILING = 100;

/**
 * Outcome of {@link validateLeadFilter}. On success the `normalized` filter
 * carries the trimmed search term so callers (and {@link matchesFilter})
 * operate on the canonical value. On failure `messages` lists every
 * validation error (non-empty).
 */
export type FilterValidation =
  | { ok: true; normalized: LeadFilter }
  | { ok: false; messages: string[] };

/**
 * Validate a {@link LeadFilter} (R9.2 search length, R9.8 score range).
 *
 * Rules:
 * - `search`, if present, is trimmed; its trimmed length must be within
 *   {@link SEARCH_MIN}..{@link SEARCH_MAX} (R9.2). The trimmed value is
 *   stored on the normalized filter.
 * - For the score range only the bounds that are PROVIDED are checked
 *   (R9.8): each provided bound must lie within 0..100, and when BOTH are
 *   provided `scoreMin` must not exceed `scoreMax`. A provided bound is also
 *   rejected when it is not a finite integer (scores are integers, R7.2).
 *
 * All applicable messages are collected so the UI can show them together;
 * the result is `ok` only when no message was produced. This function is
 * pure and never mutates its argument.
 */
export function validateLeadFilter(f: LeadFilter): FilterValidation {
  const messages: string[] = [];

  // --- Build the normalized copy up-front (search is trimmed). ----------
  const normalized: LeadFilter = { ...f };

  // --- R9.2: search length (after trimming). ----------------------------
  if (f.search !== undefined) {
    const trimmed = f.search.trim();
    normalized.search = trimmed;
    if (trimmed.length < SEARCH_MIN || trimmed.length > SEARCH_MAX) {
      messages.push(
        `Kata kunci pencarian harus sepanjang ${SEARCH_MIN} sampai ${SEARCH_MAX} karakter setelah dipangkas.`,
      );
    }
  }

  // --- R9.8: score-range bounds. ----------------------------------------
  const hasMin = f.scoreMin !== undefined;
  const hasMax = f.scoreMax !== undefined;

  if (hasMin && !isValidBound(f.scoreMin!)) {
    messages.push(rangeMessage());
  }
  if (hasMax && !isValidBound(f.scoreMax!)) {
    messages.push(rangeMessage());
  }
  // Only meaningful to compare when both bounds are present AND individually
  // in-range; otherwise the out-of-range message already covers it.
  if (
    hasMin &&
    hasMax &&
    isValidBound(f.scoreMin!) &&
    isValidBound(f.scoreMax!) &&
    f.scoreMin! > f.scoreMax!
  ) {
    messages.push(rangeMessage());
  }

  if (messages.length > 0) {
    return { ok: false, messages };
  }
  return { ok: true, normalized };
}

/**
 * A score bound is valid when it is a finite integer within 0..100 (R9.8).
 */
function isValidBound(value: number): boolean {
  return Number.isInteger(value) && value >= SCORE_FLOOR && value <= SCORE_CEILING;
}

/** The single canonical Lead_Score range validation message (R9.8). */
function rangeMessage(): string {
  return `Rentang Lead_Score tidak valid: batas harus berada di antara ${SCORE_FLOOR} sampai ${SCORE_CEILING} dan batas bawah tidak boleh melebihi batas atas.`;
}

/**
 * Pure predicate: does `lead` satisfy ALL provided criteria of `f`
 * (intersection / logical AND, R9.7)?
 *
 * A criterion is "provided" when its field is not `undefined`; an absent
 * field imposes no constraint. Each provided criterion must hold:
 *
 * - `search` (R9.2): the trimmed, lower-cased term occurs as a substring of
 *   `name + ' ' + publicContact + ' ' + location` (all lower-cased; missing
 *   fields treated as empty). An empty trimmed term matches every Lead.
 * - `statuses` (R9.3): `lead.status` is a member of `statuses`. A provided
 *   but empty array therefore matches NO Lead.
 * - `sources` (R9.4): `lead.acquiredSource` is defined AND a member of
 *   `sources`. A Lead with no `acquiredSource` never matches a source
 *   filter; a provided but empty array matches NO Lead.
 * - score range (R9.5): applied when `scoreMin` and/or `scoreMax` is
 *   provided. The Lead's `score` must be non-null and satisfy
 *   `(scoreMin ?? 0) <= score <= (scoreMax ?? 100)` inclusively. An unscored
 *   Lead (`score === null`) never satisfies a score-range filter.
 *
 * Pure: reads only `lead` and `f`; mutates nothing.
 */
export function matchesFilter(lead: Lead, f: LeadFilter): boolean {
  // --- R9.2: case-insensitive substring search. -------------------------
  if (f.search !== undefined) {
    const needle = f.search.trim().toLowerCase();
    const haystack =
      `${lead.name ?? ''} ${lead.publicContact ?? ''} ${lead.location ?? ''}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  // --- R9.3: status membership. -----------------------------------------
  if (f.statuses !== undefined && !f.statuses.includes(lead.status)) {
    return false;
  }

  // --- R9.4: source membership. -----------------------------------------
  if (f.sources !== undefined) {
    if (lead.acquiredSource === undefined || !f.sources.includes(lead.acquiredSource)) {
      return false;
    }
  }

  // --- R9.5: inclusive score range. -------------------------------------
  if (f.scoreMin !== undefined || f.scoreMax !== undefined) {
    if (lead.score === null) return false;
    const min = f.scoreMin ?? SCORE_FLOOR;
    const max = f.scoreMax ?? SCORE_CEILING;
    if (lead.score < min || lead.score > max) return false;
  }

  if (f.discoveredFrom !== undefined && lead.discoveredAt < f.discoveredFrom) {
    return false;
  }

  if (f.discoveredTo !== undefined && lead.discoveredAt > f.discoveredTo) {
    return false;
  }

  if (f.ratings !== undefined) {
    const rating = ratingFromLead(lead);
    if (rating === null || !f.ratings.includes(rating)) return false;
  }

  if (f.websiteStatuses !== undefined) {
    const websiteStatus = hasBusinessWebsite(lead.profileUrl) ? 'have_website' : 'no_website';
    if (!f.websiteStatuses.includes(websiteStatus)) return false;
  }

  if (f.aiStates !== undefined && !f.aiStates.includes(lead.aiState)) {
    return false;
  }

  if (
    f.whatsappVerificationStatuses !== undefined &&
    !f.whatsappVerificationStatuses.includes(lead.whatsappVerificationStatus)
  ) {
    return false;
  }

  return true;
}

function ratingFromLead(lead: Lead): number | null {
  const score = lead.aiIntentScore ?? lead.score;
  if (score === null) return null;
  return Math.max(1, Math.min(5, Math.round(score / 20)));
}

function hasBusinessWebsite(value: string | undefined): boolean {
  return isBusinessWebsiteUrl(value);
}
