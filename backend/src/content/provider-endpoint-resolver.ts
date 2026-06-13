/**
 * ProviderEndpointResolver — resolves the per-Team AI provider endpoint
 * exclusively from the stored ContentProviderSetting.
 *
 * Design references:
 * - design.md → Components and Interfaces → ProviderEndpointResolver (R14)
 * - design.md → Prinsip Desain Utama → "Endpoint sengaja": endpoint
 *   dikonfigurasi eksplisit, TIDAK PERNAH disimpulkan dari bentuk/awalan
 *   kunci API. Merancang keluar cabang `apiKey.startsWith('isk-')`.
 *
 * Requirements: 14.1, 14.3, 14.4, 14.5
 */

import { err, ok, type Result } from '@leads-generator/shared';

import type { ContentProviderSettingService } from './content-provider-setting-service.js';

// ---------------------------------------------------------------------------
// ResolvedEndpoint
// ---------------------------------------------------------------------------

/**
 * A resolved, validated endpoint configuration.
 *
 * `assertAllowed` validates that a concrete call target is consistent with
 * the configured endpoint (R14.3, R14.4, R14.5):
 * - scheme must be `https:` → else `insecure_transport`
 * - target host must equal configured host → else `endpoint_mismatch`
 */
export interface ResolvedEndpoint {
  /** Configured base URL (always starts with `https://`). */
  readonly baseUrl: string;

  /**
   * Returns `ok(undefined)` when `targetUrl`:
   *   - has scheme `https:`
   *   - has the same host as the configured `baseUrl`
   *
   * Returns:
   *   - `err({ code: 'INTERNAL', message: 'insecure_transport' })` when
   *     the scheme is not `https:`
   *   - `err({ code: 'INTERNAL', message: 'endpoint_mismatch' })` when
   *     the host differs from the configured host
   *
   * Requirements: 14.3, 14.4, 14.5
   */
  assertAllowed(targetUrl: string): Result<void>;
}

// ---------------------------------------------------------------------------
// ProviderEndpointResolver interface
// ---------------------------------------------------------------------------

/**
 * Resolves the AI provider endpoint for a Team.
 *
 * Implementations MUST read from stored settings only — never infer the
 * endpoint from API key shape or prefix (R14.1).
 */
export interface ProviderEndpointResolver {
  /**
   * Resolves the provider endpoint for the given Team from its stored
   * `ContentProviderSetting`. Always returns `ok` because `get` falls back
   * to the `google_official` default when no custom setting is configured.
   *
   * Requirements: 14.1
   */
  resolve(teamId: string): Promise<Result<ResolvedEndpoint>>;
}

// ---------------------------------------------------------------------------
// DefaultProviderEndpointResolver
// ---------------------------------------------------------------------------

/**
 * Default implementation of {@link ProviderEndpointResolver}.
 *
 * Reads the endpoint exclusively from `ContentProviderSettingService.get`,
 * which always returns a value (falling back to the Google official default).
 * There is NO branch that inspects the API key shape or prefix.
 *
 * Requirements: 14.1, 14.3, 14.4, 14.5
 */
export class DefaultProviderEndpointResolver implements ProviderEndpointResolver {
  constructor(private readonly settingService: ContentProviderSettingService) {}

  async resolve(teamId: string): Promise<Result<ResolvedEndpoint>> {
    // Always returns ok — falls back to google_official default (R14.1).
    const result = await this.settingService.get(teamId);

    if (!result.ok) {
      // ContentProviderSettingService.get always returns ok, but we handle
      // the error branch defensively.
      return result;
    }

    const { baseUrl } = result.value;

    // Parse the configured baseUrl to extract the host for future comparisons.
    let configuredUrl: URL;
    try {
      configuredUrl = new URL(baseUrl);
    } catch {
      return err({
        code: 'INTERNAL',
        message: `Invalid configured baseUrl: ${baseUrl}`,
      });
    }

    const configuredHost = configuredUrl.host;

    const resolvedEndpoint: ResolvedEndpoint = {
      baseUrl,

      assertAllowed(targetUrl: string): Result<void> {
        let parsed: URL;
        try {
          parsed = new URL(targetUrl);
        } catch {
          // Unparseable URL → treat as insecure / mismatch
          return err({ code: 'INTERNAL', message: 'insecure_transport' });
        }

        // Check scheme first (R14.5 — HTTPS mandatory)
        if (parsed.protocol !== 'https:') {
          return err({ code: 'INTERNAL', message: 'insecure_transport' });
        }

        // Check host matches configured host (R14.3, R14.4)
        if (parsed.host !== configuredHost) {
          return err({ code: 'INTERNAL', message: 'endpoint_mismatch' });
        }

        return ok(undefined);
      },
    };

    return ok(resolvedEndpoint);
  }
}
