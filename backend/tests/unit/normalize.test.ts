/**
 * Unit coverage for the default RawProspect → NormalizedLead transformer
 * used by every Source_Connector. Pins the privacy guarantees from
 * design.md → Privacy & Kepatuhan:
 *
 * - Public-field whitelist (R11.1): non-whitelisted keys are stripped.
 * - UsagePolicy enforcement (R11.9): `disallowFields` further narrows the
 *   whitelist on a per-Source basis.
 * - No `status`: NormalizedLead has no `status` field. The Lead's initial
 *   `status = 'New'` is set by Scan_Engine when persisting (R8.1), not by
 *   the normalizer.
 * - Determinism: `discoveredAt` is sourced from `raw.acquiredAt` so the
 *   function is pure (no `new Date()` inside).
 */
import { describe, it, expect } from 'vitest';
import type { RawProspect } from '@leads-generator/shared';

import {
  normalizeRawProspect,
  PUBLIC_FIELDS,
} from '../../src/connector/normalize.js';

/**
 * Build a RawProspect with sensible defaults and let tests override the
 * fields they care about.
 */
function makeRaw(overrides: Partial<RawProspect> = {}): RawProspect {
  return {
    name: 'Acme Co',
    publicContact: 'contact@acme.test',
    profileUrl: 'https://acme.test',
    location: 'Jakarta',
    matchedKeyword: 'design',
    acquiredAt: new Date('2024-03-04T05:06:07.000Z'),
    ...overrides,
  };
}

describe('normalizeRawProspect', () => {
  it('keeps only the four public fields and drops anything else', () => {
    // Inject a stray field that the connector might leak from the raw
    // upstream payload. `RawProspect` is a structural type, so casting
    // through `unknown` is the standard way to model "an extra key that
    // sneaked in at runtime".
    const raw = {
      ...makeRaw(),
      internalNote: 'do-not-store',
      externalId: 'fiverr-123',
    } as unknown as RawProspect;

    const lead = normalizeRawProspect(raw, {
      teamId: 'team-1',
      sourceId: 'fiverr',
    });

    expect(lead.name).toBe('Acme Co');
    expect(lead.publicContact).toBe('contact@acme.test');
    expect(lead.profileUrl).toBe('https://acme.test');
    expect(lead.location).toBe('Jakarta');

    // Stray fields must not appear on the normalized lead.
    expect(lead).not.toHaveProperty('internalNote');
    expect(lead).not.toHaveProperty('externalId');
    expect(lead).not.toHaveProperty('postSnippet');
  });

  it('omits public fields disallowed by UsagePolicy', () => {
    const lead = normalizeRawProspect(makeRaw(), {
      teamId: 'team-1',
      sourceId: 'threads',
      usagePolicy: { disallowFields: ['publicContact'] },
    });

    expect(lead.name).toBe('Acme Co');
    expect(lead.profileUrl).toBe('https://acme.test');
    expect(lead.location).toBe('Jakarta');
    // R11.9: forbidden field must not appear at all (not even as
    // `undefined`).
    expect(lead).not.toHaveProperty('publicContact');
  });

  it('does not set a status field on the normalized lead', () => {
    // NormalizedLead intentionally has no `status`. The Scan_Engine sets
    // `status = 'New'` when persisting via Deduplication_Service (R8.1).
    const lead = normalizeRawProspect(makeRaw(), {
      teamId: 'team-1',
      sourceId: 'fiverr',
    });

    expect(lead).not.toHaveProperty('status');
  });

  it('uses raw.acquiredAt for discoveredAt to stay deterministic', () => {
    const acquiredAt = new Date('2025-06-07T08:09:10.000Z');
    const lead = normalizeRawProspect(makeRaw({ acquiredAt }), {
      teamId: 'team-1',
      sourceId: 'fiverr',
    });

    // Same reference, not just equal value: the helper must not allocate
    // a fresh Date.
    expect(lead.discoveredAt).toBe(acquiredAt);
  });

  it('records sourceId and matchedKeyword from the raw record', () => {
    const lead = normalizeRawProspect(makeRaw({ matchedKeyword: 'ui' }), {
      teamId: 'team-42',
      sourceId: 'google',
    });

    expect(lead.teamId).toBe('team-42');
    expect(lead.sources).toEqual(['google']);
    expect(lead.matchedKeywords).toEqual(['ui']);
  });

  it('strips blank public fields so dedup keys are not polluted', () => {
    const lead = normalizeRawProspect(
      makeRaw({ name: '   ', location: '' }),
      { teamId: 'team-1', sourceId: 'fiverr' },
    );

    // Whitelisted keys with blank values are dropped entirely (R6.3
    // identityKey requires meaningful values).
    expect(lead).not.toHaveProperty('name');
    expect(lead).not.toHaveProperty('location');
    expect(lead.publicContact).toBe('contact@acme.test');
    expect(lead.profileUrl).toBe('https://acme.test');
  });

  it('exposes exactly the four documented public fields', () => {
    // Sentinel for the whitelist itself: if this changes, the privacy
    // story (R11.1) must be re-reviewed.
    expect([...PUBLIC_FIELDS]).toEqual([
      'name',
      'publicContact',
      'profileUrl',
      'location',
    ]);
  });
});
