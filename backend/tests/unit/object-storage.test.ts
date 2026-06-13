/**
 * Unit tests for SupabaseObjectStorage.
 *
 * Validates:
 * - Requirements 1.5, 5.9, 5.11 (no base64, upload returns URL)
 * - Requirements 16.4, 16.5 (per-team namespace, cross-team NOT_FOUND)
 *
 * All HTTP calls are intercepted by replacing the global `fetch` so no real
 * network traffic occurs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseObjectStorage } from '../../src/content/object-storage.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://abc123.supabase.co';
const SERVICE_ROLE_KEY = 'test-service-role-key';
const BUCKET = 'content-assets';

function makeStorage(overrides?: { serviceRoleKey?: string }) {
  return new SupabaseObjectStorage({
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: overrides?.serviceRoleKey ?? SERVICE_ROLE_KEY,
    bucketName: BUCKET,
  });
}

function mockFetch(status: number, body = '') {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// upload — success cases
// ---------------------------------------------------------------------------

describe('SupabaseObjectStorage.upload — success', () => {
  it('returns a public URL without base64 when upload succeeds', async () => {
    mockFetch(200);
    const storage = makeStorage();
    const bytes = Buffer.from('fake-png-bytes');

    const result = await storage.upload('team-1', 'slide-0.png', bytes, 'image/png');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');

    // Must be a plain HTTPS URL — never a data-URI
    expect(result.value).toMatch(/^https:\/\//);
    expect(result.value).not.toContain('data:');
    expect(result.value).not.toContain('base64');

    // URL must be namespaced under teamId
    expect(result.value).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/team-1/slide-0.png`,
    );
  });

  it('uses PUT method with correct headers', async () => {
    const fetchMock = mockFetch(200);
    const storage = makeStorage();
    await storage.upload('team-1', 'slide-0.png', Buffer.from('x'), 'image/png');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/team-1/slide-0.png`,
    );
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${SERVICE_ROLE_KEY}`,
    );
    expect((init.headers as Record<string, string>)['x-upsert']).toBe('true');
    expect(init.method).toBe('PUT');
  });

  it('namespaces the object key with teamId prefix (R16.5)', async () => {
    mockFetch(200);
    const storage = makeStorage();
    const result = await storage.upload('team-abc', 'assets/logo.png', Buffer.from('x'), 'image/png');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toContain('/team-abc/assets/logo.png');
  });
});

// ---------------------------------------------------------------------------
// upload — failure cases: NEVER base64 or hardcoded URL
// ---------------------------------------------------------------------------

describe('SupabaseObjectStorage.upload — fail-closed (no fallback)', () => {
  it('returns err when serviceRoleKey is missing — never base64', async () => {
    // No fetch mock needed: should short-circuit before network call
    const storage = makeStorage({ serviceRoleKey: '' });
    const bytes = Buffer.from('fake-png-bytes');

    const result = await storage.upload('team-1', 'slide-0.png', bytes, 'image/png');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');

    expect(result.error.code).toBe('INTERNAL');
    // Must never fall back to base64
    expect(JSON.stringify(result)).not.toContain('base64');
    expect(JSON.stringify(result)).not.toContain('data:');
  });

  it('returns err on HTTP 500 — never base64 or hardcoded URL', async () => {
    mockFetch(500, 'Internal Server Error');
    const storage = makeStorage();

    const result = await storage.upload('team-1', 'slide-0.png', Buffer.from('x'), 'image/png');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');

    expect(result.error.code).toBe('INTERNAL');
    expect(JSON.stringify(result)).not.toContain('base64');
    expect(JSON.stringify(result)).not.toContain('data:');
    // Must not contain any hardcoded project ID fallback
    expect(JSON.stringify(result)).not.toContain('ioqazptafolroxwgkera');
  });

  it('returns err on HTTP 403 — never base64', async () => {
    mockFetch(403, 'Forbidden');
    const storage = makeStorage();

    const result = await storage.upload('team-2', 'img.png', Buffer.from('y'), 'image/png');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('INTERNAL');
  });

  it('returns err when network throws — never base64', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
    const storage = makeStorage();

    const result = await storage.upload('team-1', 'slide-0.png', Buffer.from('x'), 'image/png');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('INTERNAL');
    expect(JSON.stringify(result)).not.toContain('base64');
  });
});

// ---------------------------------------------------------------------------
// resolveForTeam — same-team access
// ---------------------------------------------------------------------------

describe('SupabaseObjectStorage.resolveForTeam — same-team', () => {
  it('returns ok(objectUrl) when teamId matches the URL namespace', async () => {
    const storage = makeStorage();
    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/team-1/slide-0.png`;

    const result = await storage.resolveForTeam('team-1', url);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toBe(url);
  });

  it('returns ok for nested paths within the same team', async () => {
    const storage = makeStorage();
    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/team-abc/2024/01/slide-3.png`;

    const result = await storage.resolveForTeam('team-abc', url);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toBe(url);
  });
});

// ---------------------------------------------------------------------------
// resolveForTeam — cross-team / malformed → uniform NOT_FOUND
// ---------------------------------------------------------------------------

describe('SupabaseObjectStorage.resolveForTeam — cross-team / malformed', () => {
  it('returns NOT_FOUND when teamId in URL differs from requested teamId (R16.4)', async () => {
    const storage = makeStorage();
    const urlForOtherTeam = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/team-other/slide-0.png`;

    const result = await storage.resolveForTeam('team-1', urlForOtherTeam);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('NOT_FOUND');
    // Must not leak the other team's identity
    expect(result.error.message).toBe('Resource not found');
  });

  it('returns NOT_FOUND for malformed URL', async () => {
    const storage = makeStorage();

    const result = await storage.resolveForTeam('team-1', 'not-a-valid-url');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND for URL with wrong Supabase host', async () => {
    const storage = makeStorage();
    const urlWrongHost = `https://different-project.supabase.co/storage/v1/object/public/${BUCKET}/team-1/slide-0.png`;

    const result = await storage.resolveForTeam('team-1', urlWrongHost);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND for URL that lacks the /object/public prefix', async () => {
    const storage = makeStorage();
    const badPath = `${SUPABASE_URL}/storage/v1/object/team-1/slide-0.png`; // missing 'public'

    const result = await storage.resolveForTeam('team-1', badPath);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND for empty objectUrl', async () => {
    const storage = makeStorage();

    const result = await storage.resolveForTeam('team-1', '');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('NOT_FOUND');
  });
});
