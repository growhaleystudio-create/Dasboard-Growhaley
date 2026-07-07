/**
 * Identity-key normalization for the Deduplication_Service (R6.3).
 *
 * Design references:
 * - design.md → Algoritma Deduplikasi → Normalisasi & Kunci Identitas
 *   (R6.3): values are compared after `trim()` + `toLowerCase()`; the
 *   matching rules are evaluated in order; empty / whitespace-only values are NEVER used
 *   as a key (so two Leads that are simply both blank do not collapse).
 *
 * This module is a pure utility — no I/O, no clock reads, no randomness.
 * It is consumed by `Deduplication_Service.ingest` (Task 9.3) which
 * matches an incoming {@link NormalizedLead} against existing Leads via
 * the keys produced here.
 */

import type { NormalizedLead } from '@leads-generator/shared';

/**
 * A single matchable identity key derived from a {@link NormalizedLead}.
 *
 * The discriminant `kind` records which of the three R6.3 rules produced
 * the key. The `value` is already normalized (trimmed + lowercased), so
 * callers can compare keys with a plain string equality.
 */
export type IdentityKey =
  | { kind: 'phone'; value: string }
  | { kind: 'profile_url'; value: string }
  | { kind: 'email'; value: string }
  /** Serialized as `${nameNorm}|${locationNorm}` so it is a single string. */
  | { kind: 'name_location'; value: string };

/**
 * Normalize a string for identity comparison.
 *
 * Rule (R6.3): `trim()` then `toLowerCase()`. Returns `null` when the
 * input is `null`, `undefined`, or becomes empty after trimming, so
 * callers can treat "missing" and "blank" identically and skip these
 * values when building keys.
 */
export function normalizeForIdentity(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Heuristic detector for whether a `publicContact` value looks like an
 * email address.
 *
 * Deduplication only treats `publicContact` as the email-rule key when
 * the value has the shape `local@domain.tld`. A loose check is enough
 * here — the rule's job is to avoid using arbitrary public contacts
 * (phone numbers, handles, URLs) as email keys, not to validate RFC 5322.
 */
export function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Normalize a phone-ish public contact into digits only. Returns `null`
 * when the input is not plausibly a phone number, so the dedup key is
 * reserved for real phone contacts rather than arbitrary short strings.
 */
export function normalizePhoneForIdentity(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 6 ? digits : null;
}

/**
 * Build the ordered list of identity keys for a {@link NormalizedLead}.
 *
 * Order is significant: callers should attempt to match against existing
 * Leads in the order returned. Empty or whitespace-only fields are
 * skipped per R6.3.
 *
 * Rules:
 * 1. `publicContact` that looks like a phone number → emit `{ kind: 'phone' }`.
 * 2. `profileUrl` normalizes to non-empty → emit `{ kind: 'profile_url' }` only
 *    when no phone key exists. This avoids false-positive merges between
 *    branches/outlets that share one corporate website.
 * 3. `publicContact` normalizes to non-empty AND looks like an email
 *    (see {@link isEmailLike}) → emit `{ kind: 'email' }`.
 * 4. Both `name` AND `location` normalize to non-empty → emit
 *    `{ kind: 'name_location', value: '${nameNorm}|${locationNorm}' }`.
 *
 * The returned list MAY be empty when none of the three rules apply; in
 * that case the lead has no usable identity and the dedup service should
 * treat it as a brand-new canonical entry (R6.4, R6.6).
 */
export function buildIdentityKeys(lead: NormalizedLead): IdentityKey[] {
  const keys: IdentityKey[] = [];

  const phone = normalizePhoneForIdentity(lead.publicContact);
  if (phone !== null) {
    keys.push({ kind: 'phone', value: phone });
  }

  const profileUrl = normalizeForIdentity(lead.profileUrl);
  if (profileUrl !== null && phone === null) {
    keys.push({ kind: 'profile_url', value: profileUrl });
  }

  const publicContact = normalizeForIdentity(lead.publicContact);
  if (publicContact !== null && isEmailLike(publicContact)) {
    keys.push({ kind: 'email', value: publicContact });
  }

  const name = normalizeForIdentity(lead.name);
  const location = normalizeForIdentity(lead.location);
  if (name !== null && location !== null) {
    keys.push({ kind: 'name_location', value: `${name}|${location}` });
  }

  return keys;
}
