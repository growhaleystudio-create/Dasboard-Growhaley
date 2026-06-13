/**
 * Property-based tests for DefaultProviderEndpointResolver.
 *
 * Properties tested (see design.md → Correctness Properties, R14):
 * - Property 27: Endpoint ditentukan dari setelan, bukan dari kunci API
 * - Property 28: Hanya endpoint terkonfigurasi yang menjadi tujuan, dan wajib HTTPS
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ok, type Result } from '@leads-generator/shared';
import type { ProviderSetting } from '@leads-generator/shared';

import { DefaultProviderEndpointResolver } from './provider-endpoint-resolver.js';
import type { ContentProviderSettingService } from './content-provider-setting-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A fake ContentProviderSettingService that satisfies only the shape the
 * resolver calls (`get(teamId)`), returning a configurable stored baseUrl.
 * Crucially, it never receives or considers an API key — mirroring the real
 * service whose endpoint is resolved exclusively from stored settings.
 */
function makeFakeSettingService(
  baseUrl: string,
  kind: ProviderSetting['kind'] = 'google_official',
): ContentProviderSettingService {
  const fake = {
    async get(teamId: string): Promise<Result<ProviderSetting>> {
      return ok({ teamId, kind, baseUrl });
    },
  };
  return fake as unknown as ContentProviderSettingService;
}

/** Valid https hosts that may appear in a stored content_provider_setting. */
const HOSTS = [
  'generativelanguage.googleapis.com',
  'api.thisilabs.com',
  'proxy.example.com',
  'api.openai.com',
] as const;

const httpsBaseUrlArb = fc.constantFrom(...HOSTS).map((host) => `https://${host}`);

/** Arbitrary URL path, always URL-safe so the target string always parses. */
const pathArb = fc
  .array(fc.string({ maxLength: 8 }).map((s) => encodeURIComponent(s)), { maxLength: 4 })
  .map((segments) => '/' + segments.join('/'));

/**
 * Arbitrary API key string, including ones with arbitrary prefixes such as
 * `isk-` and `sk-` plus completely random shapes. The resolver must never
 * depend on any of these.
 */
const apiKeyArb = fc.oneof(
  fc.string(),
  fc.string().map((s) => `isk-${s}`),
  fc.string().map((s) => `sk-${s}`),
  fc.constantFrom('isk-abc123', 'sk-live-xyz', 'plain-key', '', 'ISK-UPPER'),
);

// ---------------------------------------------------------------------------
// Property 27
// ---------------------------------------------------------------------------

describe('DefaultProviderEndpointResolver — Property 27', () => {
  // Feature: ai-content-carousel-generator, Property 27: Endpoint ditentukan dari setelan, bukan dari kunci API
  it('resolves the stored endpoint and never depends on API key shape/prefix', async () => {
    await fc.assert(
      fc.asyncProperty(
        httpsBaseUrlArb,
        fc.array(apiKeyArb, { minLength: 1, maxLength: 5 }),
        async (storedBaseUrl, apiKeys) => {
          const resolver = new DefaultProviderEndpointResolver(
            makeFakeSettingService(storedBaseUrl),
          );

          // The resolver signature is resolve(teamId) — it accepts NO API key,
          // which is the whole point. For each arbitrary API key (including
          // isk-/sk- prefixes), resolution is driven solely by the stored
          // setting, so the resolved endpoint is identical every time.
          const resolvedBaseUrls: string[] = [];
          for (const _apiKey of apiKeys) {
            const result = await resolver.resolve('team-1');
            expect(result.ok).toBe(true);
            if (result.ok) {
              resolvedBaseUrls.push(result.value.baseUrl);
            }
          }

          // Always equals the stored setting, regardless of any API key value.
          for (const resolved of resolvedBaseUrls) {
            expect(resolved).toBe(storedBaseUrl);
          }

          // And the resolved endpoint is invariant across every API key —
          // the key never enters resolution.
          expect(new Set(resolvedBaseUrls).size).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 28
// ---------------------------------------------------------------------------

describe('DefaultProviderEndpointResolver — Property 28', () => {
  // Feature: ai-content-carousel-generator, Property 28: Hanya endpoint terkonfigurasi yang menjadi tujuan, dan wajib HTTPS
  it('assertAllowed succeeds iff target host matches configured host AND scheme is HTTPS', async () => {
    const targetArb = fc.record({
      scheme: fc.constantFrom('https', 'http', 'ftp'),
      host: fc.constantFrom(...HOSTS),
      path: pathArb,
    });

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...HOSTS),
        targetArb,
        async (configuredHost, target) => {
          const baseUrl = `https://${configuredHost}`;
          const resolver = new DefaultProviderEndpointResolver(makeFakeSettingService(baseUrl));

          const resolved = await resolver.resolve('team-1');
          expect(resolved.ok).toBe(true);
          if (!resolved.ok) return;
          const endpoint = resolved.value;

          const targetUrl = `${target.scheme}://${target.host}${target.path}`;
          const result = endpoint.assertAllowed(targetUrl);

          const isHttps = target.scheme === 'https';
          // Host comparison must match the implementation, which compares
          // URL.host (includes port if present).
          const targetHost = new URL(targetUrl).host;
          const configuredUrlHost = new URL(baseUrl).host;
          const hostMatch = targetHost === configuredUrlHost;

          // Biconditional: success iff HTTPS AND matching host.
          expect(result.ok).toBe(isHttps && hostMatch);

          if (!result.ok) {
            expect(result.error.code).toBe('INTERNAL');
            if (result.error.code === 'INTERNAL') {
              if (!isHttps) {
                // Scheme is checked BEFORE host: any non-HTTPS target (even
                // with a mismatching host) yields insecure_transport.
                expect(result.error.message).toBe('insecure_transport');
              } else {
                // HTTPS but different host → endpoint_mismatch.
                expect(result.error.message).toBe('endpoint_mismatch');
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
