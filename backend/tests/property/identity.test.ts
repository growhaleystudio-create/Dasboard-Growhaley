/**
 * Property-based test for the Deduplication_Service identity-key builder.
 *
 * Validates: Requirements 6.3
 *
 * Tag: Feature: leads-generator-dashboard, Property 9: Pencocokan
 * identitas case-insensitive & trim
 *
 * The property: for any two NormalizedLeads whose identity-bearing
 * fields differ ONLY in letter case and/or surrounding whitespace,
 * `buildIdentityKeys` must produce identical (kind, value) keys —
 * because the normalization rule is `trim()` + `toLowerCase()` (R6.3,
 * design.md → Algoritma Deduplikasi → Normalisasi & Kunci Identitas).
 *
 * Implementation notes:
 * - Identity-bearing strings are drawn from a safe ASCII alphabet so
 *   that case folding is round-trip stable. Some Unicode codepoints
 *   (e.g. `ß` → `SS` → `ss`) are intentionally excluded because their
 *   case folding is not a bijection and would not be a counterexample
 *   to R6.3 — R6.3 talks about "case + trim", not Unicode case-folding
 *   semantics.
 * - Email-rule values are synthesized as `local@domain.tld` so that
 *   `isEmailLike` accepts them on both sides of the comparison.
 * - Keys are compared as ordered `(kind, value)` pairs because
 *   `buildIdentityKeys` returns a list whose order matters (rules are
 *   evaluated in the order given by R6.3).
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import type { NormalizedLead } from '@leads-generator/shared';
import {
  defaultPbtParams,
  pbt,
  propertyTest,
} from '@leads-generator/shared/testing/pbt';

import {
  buildIdentityKeys,
  type IdentityKey,
} from '../../src/dedup/identity.js';

/**
 * Safe alphabet for identity-bearing fields. Restricted to ASCII letters,
 * digits, and a handful of separators so that `s.toUpperCase().toLowerCase()
 * === s` always holds and the case-flipping variant cleanly round-trips.
 */
const SAFE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789 -_./'.split('');
const safeChar = fc.constantFrom(...SAFE_CHARS);

/**
 * A "core" string used to build identity-bearing fields. We require it
 * to be already lowercase, non-empty after trim, and free of leading or
 * trailing whitespace so the case+trim variation we apply afterwards has
 * an observable effect (otherwise both sides normalize to `null` per
 * {@link normalizeForIdentity} and the property holds vacuously).
 */
const coreString = fc
  .stringOf(safeChar, { minLength: 1, maxLength: 40 })
  .map((s) => s.toLowerCase())
  .filter((s) => s.length > 0 && s === s.trim());

/** Whitespace padding (spaces, tabs, newlines), possibly empty. */
const whitespacePad = fc
  .stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 5 });

/**
 * Pair of strings `[a, b]` such that `a.trim().toLowerCase() ===
 * b.trim().toLowerCase()`. `a` is the canonical lower-case core; `b`
 * differs from `a` only in letter case and/or surrounding whitespace.
 */
function caseTrimVariant(): fc.Arbitrary<readonly [string, string]> {
  return fc
    .tuple(
      coreString,
      whitespacePad,
      whitespacePad,
      fc.array(fc.boolean(), { minLength: 0, maxLength: 40 }),
    )
    .map(([core, leftPad, rightPad, caseMask]) => {
      const flipped = Array.from(core, (ch, i) => {
        const upper = caseMask[i] ?? false;
        return upper ? ch.toUpperCase() : ch;
      }).join('');
      return [core, `${leftPad}${flipped}${rightPad}`] as const;
    });
}

/** ASCII identifier chunk used to build email-like values. */
const emailChunk = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
    minLength: 1,
    maxLength: 8,
  })
  .filter((s) => s.length > 0);

/**
 * Email-like variant pair: both sides parse as emails per
 * `isEmailLike` (`local@domain.tld`), and one side differs from the
 * other only in case and/or surrounding whitespace.
 */
function emailVariant(): fc.Arbitrary<readonly [string, string]> {
  return fc
    .tuple(
      emailChunk,
      emailChunk,
      emailChunk,
      whitespacePad,
      whitespacePad,
      fc.array(fc.boolean(), { minLength: 0, maxLength: 40 }),
    )
    .map(([local, domain, tld, leftPad, rightPad, caseMask]) => {
      const canonical = `${local}@${domain}.${tld}`;
      const flipped = Array.from(canonical, (ch, i) => {
        const upper = caseMask[i] ?? false;
        return upper ? ch.toUpperCase() : ch;
      }).join('');
      return [canonical, `${leftPad}${flipped}${rightPad}`] as const;
    });
}

/**
 * Build a NormalizedLead by selecting either the canonical or the
 * variant from each `[canonical, variant]` pair via `useVariant`. Two
 * leads built from the same `fields` with opposite `useVariant` values
 * differ only in letter case and surrounding whitespace.
 */
function makeLead(
  fields: {
    profileUrl: readonly [string, string] | null;
    publicContact: readonly [string, string] | null;
    name: readonly [string, string] | null;
    location: readonly [string, string] | null;
  },
  useVariant: boolean,
): NormalizedLead {
  const pick = (pair: readonly [string, string] | null): string | null => {
    if (pair === null) return null;
    return useVariant ? pair[1] : pair[0];
  };

  const profileUrl = pick(fields.profileUrl);
  const publicContact = pick(fields.publicContact);
  const name = pick(fields.name);
  const location = pick(fields.location);

  // exactOptionalPropertyTypes is enabled in tsconfig.base.json, so we
  // build the object with conditional spreads rather than assigning
  // `undefined` to the optional fields.
  return {
    teamId: 'team-1',
    sources: ['fiverr'],
    matchedKeywords: ['design'],
    discoveredAt: new Date('2024-01-01T00:00:00.000Z'),
    ...(profileUrl !== null ? { profileUrl } : {}),
    ...(publicContact !== null ? { publicContact } : {}),
    ...(name !== null ? { name } : {}),
    ...(location !== null ? { location } : {}),
  };
}

/** Compare two IdentityKey lists structurally. */
function keysEqual(a: IdentityKey[], b: IdentityKey[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.kind !== y.kind || x.value !== y.value) return false;
  }
  return true;
}

describe('Deduplication identity (R6.3)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 9: Pencocokan
  // identitas case-insensitive & trim
  propertyTest(it, 9, 'Pencocokan identitas case-insensitive & trim', () => {
    pbt.assert(
      pbt.property(
        // Each field is either absent (null) or a (canonical, variant) pair.
        fc.option(caseTrimVariant(), { nil: null }),
        fc.option(emailVariant(), { nil: null }),
        fc.option(caseTrimVariant(), { nil: null }),
        fc.option(caseTrimVariant(), { nil: null }),
        (profileUrl, publicContact, name, location) => {
          const fields = { profileUrl, publicContact, name, location };
          const canonical = makeLead(fields, false);
          const variant = makeLead(fields, true);

          const canonicalKeys = buildIdentityKeys(canonical);
          const variantKeys = buildIdentityKeys(variant);

          // Property: two NormalizedLeads that differ only in case and
          // surrounding whitespace produce identical identity keys (kind
          // and normalized value), in the same order.
          return keysEqual(canonicalKeys, variantKeys);
        },
      ),
      defaultPbtParams,
    );
  });
});
