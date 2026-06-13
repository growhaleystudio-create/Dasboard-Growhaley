/**
 * Property-based test for the AI payload privacy guarantee (Task 17.10).
 *
 * Validates: Requirements 13.7
 *
 * Tag: Feature: leads-generator-dashboard, Property 38: Privasi panggilan AI
 *
 * Property 38: for every Lead sent to the AI_Provider, the payload SHALL
 * contain ONLY the Public_Lead_Snapshot fields (name, public contact,
 * profile URL, location, matched keywords, post snippet) and NO other Lead
 * attribute outside that list.
 *
 * Strategy:
 * - Generate arbitrary, fully-populated `Lead` rows whose sensitive /
 *   internal attributes carry a unique `SECRET::` sentinel prefix so a
 *   leaked value is unambiguously detectable (it can never collide with a
 *   legitimately-projected public value).
 * - Also sprinkle in random *extra* keys that are not part of the `Lead`
 *   contract, to prove the builder is a true allow-list (not a deny-list).
 * - Assert: the snapshot's key set is a subset of the six allowed keys, and
 *   no `SECRET::`-tagged value leaks into any snapshot value.
 */
import { describe, it } from 'vitest';
import fc from 'fast-check';
import type { Lead, LeadStatus, AIState } from '@leads-generator/shared';
import {
  defaultPbtParams,
  pbt,
  propertyTest,
} from '@leads-generator/shared/testing/pbt';

import {
  PUBLIC_SNAPSHOT_FIELDS,
  buildPublicLeadSnapshot,
} from '../../src/ai/public-lead-snapshot.js';

const ALLOWED = new Set<string>(PUBLIC_SNAPSHOT_FIELDS);

/** Sentinel prefix marking values that must NEVER reach the AI payload. */
const SECRET = 'SECRET::';

/** Non-empty public string (legitimately projectable). */
const publicString = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0 && !s.includes(SECRET));

/** A value tagged so any leak is detectable in snapshot values. */
const secretString = fc
  .string({ maxLength: 20 })
  .map((s) => `${SECRET}${s}`);

const leadStatus: fc.Arbitrary<LeadStatus> = fc.constantFrom(
  'New',
  'Reviewed',
  'Contacted',
  'Qualified',
  'Converted',
  'Rejected',
);

const aiState: fc.Arbitrary<AIState> = fc.constantFrom(
  'none',
  'pending',
  'success',
  'unavailable',
);

/**
 * Recursively collect every primitive value reachable from `obj`, coerced
 * to string, so we can scan for leaked `SECRET::` markers regardless of
 * nesting.
 */
function collectValues(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const v of value) collectValues(v, out);
    return;
  }
  if (value instanceof Date) {
    out.push(value.toISOString());
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectValues(v, out);
    }
    return;
  }
  out.push(String(value));
}

describe('AI payload privacy (R13.7)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 38: Privasi panggilan AI
  propertyTest(it, 38, 'Privasi panggilan AI', () => {
    pbt.assert(
      pbt.property(
        // Public fields: legitimately projectable (or absent).
        fc.option(publicString, { nil: undefined }),
        fc.option(publicString, { nil: undefined }),
        fc.option(publicString, { nil: undefined }),
        fc.option(publicString, { nil: undefined }),
        fc.array(publicString, { maxLength: 6 }),
        // Optional connector snippet passed via opts.
        fc.option(publicString, { nil: undefined }),
        // Sensitive / internal attributes, all SECRET-tagged.
        secretString,
        secretString,
        secretString,
        fc.integer({ min: 0, max: 100 }),
        leadStatus,
        aiState,
        // Arbitrary EXTRA keys not present in the Lead contract.
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 8 }).filter((k) => !ALLOWED.has(k)),
          secretString,
          { maxKeys: 4 },
        ),
        (
          name,
          publicContact,
          profileUrl,
          location,
          matchedKeywords,
          postSnippet,
          secretId,
          secretInsight,
          secretDuplicateOf,
          secretScore,
          status,
          aiSt,
          extraKeys,
        ) => {
          // Assemble a full Lead row PLUS arbitrary extra attributes. The
          // builder must ignore everything outside the six-field whitelist.
          const lead = {
            id: `${SECRET}${secretId}`,
            teamId: `${SECRET}team-${secretId}`,
            ...(name !== undefined ? { name } : {}),
            ...(publicContact !== undefined ? { publicContact } : {}),
            ...(profileUrl !== undefined ? { profileUrl } : {}),
            ...(location !== undefined ? { location } : {}),
            matchedKeywords,
            status,
            score: secretScore,
            scoreState: 'scored' as const,
            isDuplicate: true,
            duplicateOf: secretDuplicateOf,
            discoveredAt: new Date('2024-01-01T00:00:00.000Z'),
            acquiredSource: `${SECRET}src`,
            acquiredAt: new Date('2024-01-02T00:00:00.000Z'),
            aiIntentScore: secretScore,
            aiInsight: secretInsight,
            aiState: aiSt,
            aiAnalyzedAt: new Date('2024-01-03T00:00:00.000Z'),
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            ...extraKeys,
          } as unknown as Lead;

          const opts = postSnippet !== undefined ? { postSnippet } : {};
          const snapshot = buildPublicLeadSnapshot(lead, opts);

          // 1) Key set must be a SUBSET of the six allowed keys.
          for (const key of Object.keys(snapshot)) {
            if (!ALLOWED.has(key)) return false;
          }

          // 2) No SECRET-tagged value may leak into any snapshot value.
          const values: string[] = [];
          collectValues(snapshot, values);
          if (values.some((v) => v.includes(SECRET))) return false;

          return true;
        },
      ),
      defaultPbtParams,
    );
  });
});
