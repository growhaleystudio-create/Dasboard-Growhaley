/**
 * Unit tests for {@link ExampleGoogleSearchConnector} (Task 7.4, R11.9).
 *
 * Verifies:
 * - `fetch` returns deterministic synthetic prospects, one per
 *   provided keyword, using the documented placeholder format
 *   (`<keyword>-prospect`, `contact-<keyword>@example.com`,
 *   `https://example.com/<keyword>`, location `Jakarta`).
 * - `fetch` honors a pre-aborted {@link AbortSignal} by throwing
 *   `Error('aborted')` instead of producing data (R5.1).
 * - `normalize` (which delegates to {@link normalizeRawProspect})
 *   strips fields listed in `UsagePolicy.disallowFields` (R11.9). To
 *   exercise this independently of the connector's shipped policy
 *   (`disallowFields: []`), we build a temporary instance with
 *   `disallowFields: ['publicContact']` overridden on `usagePolicy`.
 */
import { describe, expect, it } from 'vitest';
import type { RawProspect } from '@leads-generator/shared';

import { ExampleGoogleSearchConnector } from '../../src/connector/example-google-search.js';
import type { ScanQuery, Source_Connector } from '../../src/connector/source-connector.js';

/**
 * Build a fresh connector instance for each test so mutations to
 * `usagePolicy` cannot leak between cases.
 */
function makeConnector(): ExampleGoogleSearchConnector {
  return new ExampleGoogleSearchConnector();
}

describe('ExampleGoogleSearchConnector', () => {
  it('exposes the documented sourceId, displayName, and default usagePolicy', () => {
    const connector = makeConnector();

    expect(connector.sourceId).toBe('google');
    expect(connector.displayName).toBe('Google Search (example)');
    expect(connector.usagePolicy).toEqual({
      allowedRetentionDays: 90,
      disallowFields: [],
    });
  });

  it('checkAvailability stub reports `available`', async () => {
    const connector = makeConnector();
    await expect(connector.checkAvailability()).resolves.toBe('available');
  });

  describe('fetch', () => {
    it('returns one synthetic RawProspect per keyword (up to 3)', async () => {
      const connector = makeConnector();
      const query: ScanQuery = {
        keywords: ['design', 'logo', 'brand'],
      };
      const controller = new AbortController();

      const prospects = await connector.fetch(query, controller.signal);

      expect(prospects).toHaveLength(3);
      expect(prospects[0]).toEqual<RawProspect>({
        name: 'design-prospect',
        publicContact: 'contact-design@example.com',
        profileUrl: 'https://example.com/design',
        location: 'Jakarta',
        matchedKeyword: 'design',
        acquiredAt: new Date(0),
      });
      expect(prospects[1]?.matchedKeyword).toBe('logo');
      expect(prospects[1]?.publicContact).toBe('contact-logo@example.com');
      expect(prospects[2]?.profileUrl).toBe('https://example.com/brand');
    });

    it('caps output at 3 keywords even when more are provided', async () => {
      const connector = makeConnector();
      const query: ScanQuery = {
        keywords: ['k1', 'k2', 'k3', 'k4', 'k5'],
      };
      const controller = new AbortController();

      const prospects = await connector.fetch(query, controller.signal);

      expect(prospects.map((p) => p.matchedKeyword)).toEqual(['k1', 'k2', 'k3']);
    });

    it('throws Error("aborted") when the signal is already aborted', async () => {
      const connector = makeConnector();
      const controller = new AbortController();
      controller.abort();

      await expect(
        connector.fetch({ keywords: ['design'] }, controller.signal),
      ).rejects.toThrow('aborted');
    });
  });

  describe('normalize', () => {
    it('produces a NormalizedLead containing the four public fields', () => {
      const connector = makeConnector();
      const raw: RawProspect = {
        name: 'design-prospect',
        publicContact: 'contact-design@example.com',
        profileUrl: 'https://example.com/design',
        location: 'Jakarta',
        matchedKeyword: 'design',
        acquiredAt: new Date(0),
      };

      const lead = connector.normalize(raw, 'team-1');

      expect(lead).toEqual({
        teamId: 'team-1',
        name: 'design-prospect',
        publicContact: 'contact-design@example.com',
        profileUrl: 'https://example.com/design',
        location: 'Jakarta',
        sources: ['google'],
        matchedKeywords: ['design'],
        discoveredAt: new Date(0),
      });
    });

    it("strips fields listed in usagePolicy.disallowFields (R11.9)", () => {
      // Build a custom connector instance whose usagePolicy disallows
      // `publicContact`. We create a thin wrapper rather than mutating
      // the shipped instance so the production singleton stays
      // unaffected.
      class StrictConnector extends ExampleGoogleSearchConnector {
        public override readonly usagePolicy = {
          allowedRetentionDays: 90,
          disallowFields: ['publicContact'],
        };
      }
      const strict: Source_Connector = new StrictConnector();

      const raw: RawProspect = {
        name: 'design-prospect',
        publicContact: 'contact-design@example.com',
        profileUrl: 'https://example.com/design',
        location: 'Jakarta',
        matchedKeyword: 'design',
        acquiredAt: new Date(0),
      };

      const lead = strict.normalize(raw, 'team-1');

      // The disallowed field must not appear at all (not even as
      // `undefined`) on the resulting NormalizedLead.
      expect(lead).not.toHaveProperty('publicContact');
      expect(lead.name).toBe('design-prospect');
      expect(lead.profileUrl).toBe('https://example.com/design');
      expect(lead.location).toBe('Jakarta');
      expect(lead.sources).toEqual(['google']);
      expect(lead.matchedKeywords).toEqual(['design']);
    });
  });
});
