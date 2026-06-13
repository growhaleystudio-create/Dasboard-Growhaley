/**
 * Unit tests for DefaultProviderEndpointResolver and
 * ResolvedEndpoint.assertAllowed.
 *
 * Validates:
 * - Requirements 14.1: endpoint resolved from stored setting only, never
 *   from API key prefix/shape
 * - Requirements 14.3: assertAllowed — host must match configured host
 * - Requirements 14.4: assertAllowed — endpoint_mismatch when host differs
 * - Requirements 14.5: assertAllowed — insecure_transport when scheme != https
 */

import { describe, it, expect, vi } from 'vitest';

import type { ProviderSetting } from '@leads-generator/shared';
import type { ContentProviderSettingService } from '../../src/content/content-provider-setting-service.js';
import { DefaultProviderEndpointResolver } from '../../src/content/provider-endpoint-resolver.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal stub of ContentProviderSettingService whose `get` method
 * returns the given ProviderSetting wrapped in ok().
 *
 * NOTE: The resolver reads ONLY from `get`; there is no branch that inspects
 * an API key, matching the design requirement that endpoint is determined
 * solely from the stored setting (R14.1).
 */
function makeSettingService(setting: ProviderSetting): ContentProviderSettingService {
  return {
    get: vi.fn().mockResolvedValue({ ok: true, value: setting }),
    set: vi.fn(),
  } as unknown as ContentProviderSettingService;
}

const TEAM_ID = 'team-123';

// ---------------------------------------------------------------------------
// resolve()
// ---------------------------------------------------------------------------

describe('DefaultProviderEndpointResolver.resolve', () => {
  it('returns ok with the configured baseUrl from the stored setting (R14.1)', async () => {
    const setting: ProviderSetting = {
      teamId: TEAM_ID,
      kind: 'google_official',
      baseUrl: 'https://generativelanguage.googleapis.com',
    };

    const resolver = new DefaultProviderEndpointResolver(makeSettingService(setting));
    const result = await resolver.resolve(TEAM_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.baseUrl).toBe('https://generativelanguage.googleapis.com');
  });

  it('uses stored setting for a third-party proxy without inspecting any API key (R14.1)', async () => {
    const setting: ProviderSetting = {
      teamId: TEAM_ID,
      kind: 'third_party_proxy',
      baseUrl: 'https://proxy.example.com',
    };

    const resolver = new DefaultProviderEndpointResolver(makeSettingService(setting));
    const result = await resolver.resolve(TEAM_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.baseUrl).toBe('https://proxy.example.com');
  });

  it('calls settingService.get with the correct teamId (R14.1)', async () => {
    const setting: ProviderSetting = {
      teamId: TEAM_ID,
      kind: 'google_official',
      baseUrl: 'https://generativelanguage.googleapis.com',
    };
    const svc = makeSettingService(setting);
    const resolver = new DefaultProviderEndpointResolver(svc);

    await resolver.resolve(TEAM_ID);

    expect(svc.get).toHaveBeenCalledWith(TEAM_ID);
  });
});

// ---------------------------------------------------------------------------
// assertAllowed — correct host + HTTPS → ok (R14.3)
// ---------------------------------------------------------------------------

describe('ResolvedEndpoint.assertAllowed — matching host and HTTPS', () => {
  it('returns ok(void) when target host equals configured host and scheme is https (R14.3)', async () => {
    const setting: ProviderSetting = {
      teamId: TEAM_ID,
      kind: 'google_official',
      baseUrl: 'https://generativelanguage.googleapis.com',
    };

    const resolver = new DefaultProviderEndpointResolver(makeSettingService(setting));
    const resolveResult = await resolver.resolve(TEAM_ID);
    if (!resolveResult.ok) throw new Error('expected ok');

    const assertResult = resolveResult.value.assertAllowed(
      'https://generativelanguage.googleapis.com/v1beta/models',
    );

    expect(assertResult.ok).toBe(true);
  });

  it('returns ok(void) for a third-party proxy when host matches (R14.3)', async () => {
    const setting: ProviderSetting = {
      teamId: TEAM_ID,
      kind: 'third_party_proxy',
      baseUrl: 'https://proxy.example.com',
    };

    const resolver = new DefaultProviderEndpointResolver(makeSettingService(setting));
    const resolveResult = await resolver.resolve(TEAM_ID);
    if (!resolveResult.ok) throw new Error('expected ok');

    const assertResult = resolveResult.value.assertAllowed(
      'https://proxy.example.com/api/generate',
    );

    expect(assertResult.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// assertAllowed — different host → endpoint_mismatch (R14.4)
// ---------------------------------------------------------------------------

describe('ResolvedEndpoint.assertAllowed — different host', () => {
  it('returns err endpoint_mismatch when target host differs from configured host (R14.4)', async () => {
    const setting: ProviderSetting = {
      teamId: TEAM_ID,
      kind: 'google_official',
      baseUrl: 'https://generativelanguage.googleapis.com',
    };

    const resolver = new DefaultProviderEndpointResolver(makeSettingService(setting));
    const resolveResult = await resolver.resolve(TEAM_ID);
    if (!resolveResult.ok) throw new Error('expected ok');

    const assertResult = resolveResult.value.assertAllowed(
      'https://evil.example.com/v1beta/models',
    );

    expect(assertResult.ok).toBe(false);
    if (assertResult.ok) throw new Error('expected err');
    expect(assertResult.error).toMatchObject({ code: 'INTERNAL', message: 'endpoint_mismatch' });
  });

  it('returns err endpoint_mismatch even when paths differ but scheme is fine (R14.4)', async () => {
    const setting: ProviderSetting = {
      teamId: TEAM_ID,
      kind: 'third_party_proxy',
      baseUrl: 'https://proxy.example.com',
    };

    const resolver = new DefaultProviderEndpointResolver(makeSettingService(setting));
    const resolveResult = await resolver.resolve(TEAM_ID);
    if (!resolveResult.ok) throw new Error('expected ok');

    const assertResult = resolveResult.value.assertAllowed(
      'https://other-proxy.example.com/api/generate',
    );

    expect(assertResult.ok).toBe(false);
    if (assertResult.ok) throw new Error('expected err');
    expect(assertResult.error).toMatchObject({ code: 'INTERNAL', message: 'endpoint_mismatch' });
  });
});

// ---------------------------------------------------------------------------
// assertAllowed — http:// target → insecure_transport (R14.5)
// ---------------------------------------------------------------------------

describe('ResolvedEndpoint.assertAllowed — non-HTTPS scheme', () => {
  it('returns err insecure_transport when target uses http:// (R14.5)', async () => {
    const setting: ProviderSetting = {
      teamId: TEAM_ID,
      kind: 'google_official',
      baseUrl: 'https://generativelanguage.googleapis.com',
    };

    const resolver = new DefaultProviderEndpointResolver(makeSettingService(setting));
    const resolveResult = await resolver.resolve(TEAM_ID);
    if (!resolveResult.ok) throw new Error('expected ok');

    const assertResult = resolveResult.value.assertAllowed(
      'http://generativelanguage.googleapis.com/v1beta/models',
    );

    expect(assertResult.ok).toBe(false);
    if (assertResult.ok) throw new Error('expected err');
    expect(assertResult.error).toMatchObject({ code: 'INTERNAL', message: 'insecure_transport' });
  });

  it('returns err insecure_transport when target uses http:// even for matching host (R14.5)', async () => {
    const setting: ProviderSetting = {
      teamId: TEAM_ID,
      kind: 'third_party_proxy',
      baseUrl: 'https://proxy.example.com',
    };

    const resolver = new DefaultProviderEndpointResolver(makeSettingService(setting));
    const resolveResult = await resolver.resolve(TEAM_ID);
    if (!resolveResult.ok) throw new Error('expected ok');

    const assertResult = resolveResult.value.assertAllowed('http://proxy.example.com/api/generate');

    expect(assertResult.ok).toBe(false);
    if (assertResult.ok) throw new Error('expected err');
    expect(assertResult.error).toMatchObject({ code: 'INTERNAL', message: 'insecure_transport' });
  });
});

// ---------------------------------------------------------------------------
// assertAllowed — http:// baseUrl in setting → insecure_transport (R14.5)
// ---------------------------------------------------------------------------

describe('ResolvedEndpoint.assertAllowed — http:// stored in setting (R14.5)', () => {
  it('returns err insecure_transport when the stored setting itself has http:// as baseUrl', async () => {
    // This simulates a corrupted/manually-inserted DB row where the
    // constraint was bypassed. The check constraint on the DB column normally
    // prevents this, but the application layer should still handle it.
    const setting: ProviderSetting = {
      teamId: TEAM_ID,
      kind: 'third_party_proxy',
      // Intentionally invalid (http, not https) — simulates constraint bypass
      baseUrl: 'http://insecure.example.com',
    };

    const resolver = new DefaultProviderEndpointResolver(makeSettingService(setting));
    const resolveResult = await resolver.resolve(TEAM_ID);

    // resolve() itself succeeds — it reads the URL without enforcing HTTPS at
    // resolve time; enforcement happens in assertAllowed per design contract.
    if (!resolveResult.ok) throw new Error('expected ok from resolve');

    // When the target matches the (insecure) configured host but uses http://,
    // assertAllowed must still return insecure_transport.
    const assertResult = resolveResult.value.assertAllowed(
      'http://insecure.example.com/api/generate',
    );

    expect(assertResult.ok).toBe(false);
    if (assertResult.ok) throw new Error('expected err');
    expect(assertResult.error).toMatchObject({ code: 'INTERNAL', message: 'insecure_transport' });
  });
});
