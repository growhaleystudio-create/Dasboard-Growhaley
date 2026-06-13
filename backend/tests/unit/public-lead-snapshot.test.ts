/**
 * Unit tests for {@link buildPublicLeadSnapshot} (Task 17.9, R13.7).
 *
 * These cover concrete examples and edge cases: the allow-list projection,
 * omission of blank/absent optionals, `matchedKeywords` always being an
 * array, the `postSnippet`-from-options rule, and the core privacy
 * guarantee that disallowed Lead attributes never leak into the snapshot.
 */
import { describe, it, expect } from 'vitest';
import type { Lead } from '@leads-generator/shared';

import {
  PUBLIC_SNAPSHOT_FIELDS,
  buildPublicLeadSnapshot,
} from '../../src/ai/public-lead-snapshot.js';

/** A fully-populated stored Lead used to prove disallowed fields are dropped. */
function fullLead(): Lead {
  return {
    id: 'lead-123',
    teamId: 'team-secret',
    name: 'Jane Public',
    publicContact: 'jane@example.com',
    profileUrl: 'https://example.com/jane',
    location: 'Jakarta',
    matchedKeywords: ['logo design', 'branding'],
    status: 'Qualified',
    score: 87,
    scoreState: 'scored',
    isDuplicate: false,
    duplicateOf: 'lead-000',
    discoveredAt: new Date('2024-01-01T00:00:00.000Z'),
    acquiredSource: 'google',
    acquiredAt: new Date('2024-01-02T00:00:00.000Z'),
    aiIntentScore: 73,
    aiInsight: 'internal narrative that must not leak',
    aiState: 'success',
    aiAnalyzedAt: new Date('2024-01-03T00:00:00.000Z'),
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };
}

describe('buildPublicLeadSnapshot (R13.7)', () => {
  it('copies the public fields and drops every disallowed Lead attribute', () => {
    const snapshot = buildPublicLeadSnapshot(fullLead());

    expect(snapshot).toEqual({
      name: 'Jane Public',
      publicContact: 'jane@example.com',
      profileUrl: 'https://example.com/jane',
      location: 'Jakarta',
      matchedKeywords: ['logo design', 'branding'],
    });

    // No key outside the six-field whitelist is present.
    for (const key of Object.keys(snapshot)) {
      expect(PUBLIC_SNAPSHOT_FIELDS).toContain(key);
    }

    // Disallowed identifiers / state never appear as snapshot keys.
    const snapshotKeys = Object.keys(snapshot);
    for (const forbidden of [
      'id',
      'teamId',
      'status',
      'score',
      'scoreState',
      'isDuplicate',
      'duplicateOf',
      'aiIntentScore',
      'aiInsight',
      'aiState',
      'discoveredAt',
      'acquiredAt',
      'aiAnalyzedAt',
      'createdAt',
    ]) {
      expect(snapshotKeys).not.toContain(forbidden);
    }
  });

  it('always returns matchedKeywords as a fresh array (defensive copy)', () => {
    const lead = fullLead();
    const snapshot = buildPublicLeadSnapshot(lead);

    expect(Array.isArray(snapshot.matchedKeywords)).toBe(true);
    expect(snapshot.matchedKeywords).not.toBe(lead.matchedKeywords);

    // Mutating the source array does not affect the snapshot.
    lead.matchedKeywords.push('mutated');
    expect(snapshot.matchedKeywords).toEqual(['logo design', 'branding']);
  });

  it('omits absent and blank optional string fields', () => {
    const snapshot = buildPublicLeadSnapshot({
      name: '   ',
      publicContact: '',
      matchedKeywords: [],
    });

    expect(snapshot).toEqual({ matchedKeywords: [] });
    expect('name' in snapshot).toBe(false);
    expect('publicContact' in snapshot).toBe(false);
    expect('profileUrl' in snapshot).toBe(false);
    expect('location' in snapshot).toBe(false);
    expect('postSnippet' in snapshot).toBe(false);
  });

  it('includes a legitimate postSnippet supplied from the connector', () => {
    const snapshot = buildPublicLeadSnapshot(
      { matchedKeywords: ['design'] },
      { postSnippet: 'Looking for a designer to refresh our brand.' },
    );

    expect(snapshot.postSnippet).toBe(
      'Looking for a designer to refresh our brand.',
    );
  });

  it('omits postSnippet when blank or not supplied', () => {
    expect(
      'postSnippet' in buildPublicLeadSnapshot({ matchedKeywords: [] }),
    ).toBe(false);
    expect(
      'postSnippet' in
        buildPublicLeadSnapshot({ matchedKeywords: [] }, { postSnippet: '  ' }),
    ).toBe(false);
  });

  it('never derives postSnippet from Lead attributes (only from options)', () => {
    // Even though the Lead carries an aiInsight, no snippet is produced
    // unless the caller explicitly supplies one from a Source_Connector.
    const snapshot = buildPublicLeadSnapshot(fullLead());
    expect('postSnippet' in snapshot).toBe(false);
  });
});
