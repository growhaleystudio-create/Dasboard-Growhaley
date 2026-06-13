/**
 * Unit tests for PrivacyGuardImpl.
 *
 * Requirements tested: 15.1, 15.2, 15.3, 15.4
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PrivacyGuardImpl, LEAD_PII_KEYS } from './privacy-guard.js';
import type { AiPayload } from './privacy-guard.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGuard() {
  return new PrivacyGuardImpl();
}

function payload(fields: Record<string, unknown>): AiPayload {
  return { teamId: 'team-1', fields };
}

// ---------------------------------------------------------------------------
// Clean payload — should always pass
// ---------------------------------------------------------------------------

describe('PrivacyGuardImpl — clean payload', () => {
  it('passes when fields contain only brand/content keys', () => {
    const guard = makeGuard();
    const result = guard.assertNoLeadPII(
      payload({ prompt: 'Make a carousel', tone: 'professional', brandKitId: 'bk-1' }),
      false,
    );
    expect(result.ok).toBe(true);
  });

  it('passes when fields is an empty object', () => {
    const guard = makeGuard();
    const result = guard.assertNoLeadPII(payload({}), false);
    expect(result.ok).toBe(true);
  });

  it('passes when fields contain keys that are similar but not PII keys', () => {
    // e.g. "leadingTopic" is NOT in the PII list
    const guard = makeGuard();
    const result = guard.assertNoLeadPII(
      payload({ leadingTopic: 'growth hacking', emailCampaign: 'newsletter' }),
      false,
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PII fields blocked — explicitlyIncludedByUser=false
// ---------------------------------------------------------------------------

describe('PrivacyGuardImpl — PII blocked', () => {
  it.each([...LEAD_PII_KEYS])(
    'blocks payload containing PII key "%s"',
    (piiKey) => {
      const guard = makeGuard();
      const result = guard.assertNoLeadPII(
        payload({ [piiKey]: 'some-value', prompt: 'carousel' }),
        false,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL');
        // Narrow to the INTERNAL variant (which has `message`) for TS type safety
        if (result.error.code === 'INTERNAL') {
          expect(result.error.message).toContain('privacy_violation');
          // Error message must contain the key name but NOT the value
          expect(result.error.message).toContain(piiKey);
          expect(result.error.message).not.toContain('some-value');
        }
      }
    },
  );

  it('blocks payload containing multiple PII keys and lists all of them', () => {
    const guard = makeGuard();
    const result = guard.assertNoLeadPII(
      payload({ leadEmail: 'a@b.com', leadPhone: '123', prompt: 'carousel' }),
      false,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
      if (result.error.code === 'INTERNAL') {
        expect(result.error.message).toContain('leadEmail');
        expect(result.error.message).toContain('leadPhone');
        // Must not leak actual values
        expect(result.error.message).not.toContain('a@b.com');
        expect(result.error.message).not.toContain('123');
      }
    }
  });

  it('returns error code INTERNAL (not VALIDATION) on privacy violation', () => {
    const guard = makeGuard();
    const result = guard.assertNoLeadPII(payload({ leadName: 'Alice' }), false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
    }
  });
});

// ---------------------------------------------------------------------------
// Explicit inclusion — always ok regardless of PII fields
// ---------------------------------------------------------------------------

describe('PrivacyGuardImpl — explicitlyIncludedByUser=true', () => {
  it('allows payload with PII keys when user explicitly included them', () => {
    const guard = makeGuard();
    const result = guard.assertNoLeadPII(
      payload({ leadEmail: 'user@example.com', leadName: 'Bob', prompt: 'personalised carousel' }),
      true,
    );
    expect(result.ok).toBe(true);
  });

  it('allows payload with all known PII keys when explicitly included', () => {
    const guard = makeGuard();
    const allPiiFields = Object.fromEntries([...LEAD_PII_KEYS].map((k) => [k, 'val']));
    const result = guard.assertNoLeadPII(payload(allPiiFields), true);
    expect(result.ok).toBe(true);
  });

  it('allows clean payload when explicitly included (no false positives)', () => {
    const guard = makeGuard();
    const result = guard.assertNoLeadPII(
      payload({ prompt: 'no PII here', brandTone: 'bold' }),
      true,
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests — whitelist payload masukan AI
// ---------------------------------------------------------------------------

/**
 * Pool of brand/content input keys that are explicitly whitelisted as valid
 * AI payload fields (prompt User, aturan Master_Template, struktur
 * Approved_Example, aset Brand_Kit). None of these belong to LEAD_PII_KEYS.
 */
const WHITELIST_POOL: string[] = [
  'prompt',
  'tone',
  'brandKitId',
  'masterRules',
  'exampleStructure',
  'aspectRatio',
  'colors',
  'logoUrl',
];

const PII_POOL: string[] = [...LEAD_PII_KEYS];

// Sanity: the whitelist pool must never overlap with the PII registry,
// otherwise the generators below would be ill-defined.
for (const key of WHITELIST_POOL) {
  if (LEAD_PII_KEYS.has(key)) {
    throw new Error(`WHITELIST_POOL key "${key}" must not be a PII key`);
  }
}

describe('PrivacyGuardImpl — Property 29: Whitelist payload masukan AI', () => {
  // Feature: ai-content-carousel-generator, Property 29: Whitelist payload masukan AI
  // Validates: Requirements 15.1
  // **Validates: Requirements 15.1**

  const guard = makeGuard();

  // Property A — payloads composed only of whitelisted keys always pass.
  it('A) allows payloads whose keys are all within the brand/content whitelist', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.constantFrom(...WHITELIST_POOL), fc.anything()),
        (fields) => {
          const result = guard.assertNoLeadPII(payload(fields), false);
          expect(result.ok).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property B — any PII key present (without explicit inclusion) is blocked,
  // and the error reports the offending key NAMES but never the PII VALUES.
  it('B) blocks payloads containing any PII key, reporting key names but not values', () => {
    fc.assert(
      fc.property(
        fc.subarray(WHITELIST_POOL),
        fc.uniqueArray(fc.constantFrom(...PII_POOL), { minLength: 1 }),
        fc.string(),
        (whitelistKeys, piiKeys, rawValue) => {
          // Sentinel-prefixed value: the "::" marker can never appear in the
          // error message (which only ever lists key names + "privacy_violation"),
          // so a non-containment assertion reliably proves no value leakage.
          const piiValue = `pii-value::${rawValue}`;

          const fields: Record<string, unknown> = {};
          for (const k of whitelistKeys) fields[k] = 'brand-input';
          for (const k of piiKeys) fields[k] = piiValue;

          const result = guard.assertNoLeadPII(payload(fields), false);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe('INTERNAL');
            if (result.error.code === 'INTERNAL') {
              expect(result.error.message).toContain('privacy_violation');
              for (const k of piiKeys) {
                expect(result.error.message).toContain(k);
              }
              expect(result.error.message).not.toContain(piiValue);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property C — biconditional: a mixed payload passes iff it contains no PII key.
  it('C) passes iff no field key is a member of LEAD_PII_KEYS', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.constantFrom(...WHITELIST_POOL, ...PII_POOL),
          fc.anything(),
        ),
        (fields) => {
          const containsPii = Object.keys(fields).some((k) =>
            LEAD_PII_KEYS.has(k),
          );
          const result = guard.assertNoLeadPII(payload(fields), false);
          expect(result.ok).toBe(!containsPii);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property D — explicit inclusion always bypasses the whitelist check.
  it('D) always allows any payload when explicitlyIncludedByUser=true', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.constantFrom(...WHITELIST_POOL, ...PII_POOL),
          fc.anything(),
        ),
        (fields) => {
          const result = guard.assertNoLeadPII(payload(fields), true);
          expect(result.ok).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
