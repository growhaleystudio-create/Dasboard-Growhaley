/**
 * Property-based tests for SupabaseObjectStorage.
 *
 * Feature: ai-content-carousel-generator
 *
 * Property 3  (task 4.2) — Tidak ada blob base64 pada basis data
 *   Validates: Requirements 1.5, 5.9
 *
 * Property 31 (task 4.3) — Isolasi multi-tenant artefak dan not-found seragam
 *   Validates: Requirements 1.6, 2.5, 8.5, 16.1, 16.2, 16.3, 16.4, 16.5
 *
 * All HTTP traffic is intercepted by stubbing the global `fetch`, so no real
 * network calls occur. `resolveForTeam` is a pure structural guard (it has no
 * storage backend), so the "artifact does not exist" case of Property 31 is
 * represented by a syntactically-valid URL that does not resolve under the
 * requesting Team's namespace — which is exactly the uniform NOT_FOUND path.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import { SupabaseObjectStorage } from './object-storage.js';

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://abc123.supabase.co';
const SERVICE_ROLE_KEY = 'test-service-role-key';
const BUCKET = 'content-assets';

function makeStorage(): SupabaseObjectStorage {
  return new SupabaseObjectStorage({
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    bucketName: BUCKET,
  });
}

/** Stub `fetch` so every upload succeeds (HTTP 200, empty body). */
function stubFetchOk(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' }),
  );
}

/** Stub `fetch` so every upload fails with HTTP 500. */
function stubFetch500(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '' }),
  );
}

/** Stub `fetch` so it rejects (network throw). */
function stubFetchThrows(): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
}

// Slug-like identifiers (team ids) and object keys constrained to characters
// that real callers use — never contain ':' or ';' so the input itself can
// never smuggle a `data:`/`;base64,` marker into the assertion.
const SLUG_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'.split('');
const KEY_CHARS = [...SLUG_CHARS, '.', '/'];

const teamIdArb = fc
  .array(fc.constantFrom(...SLUG_CHARS), { minLength: 1, maxLength: 24 })
  .map((chars) => chars.join(''));

const keyArb = fc
  .array(fc.constantFrom(...KEY_CHARS), { minLength: 1, maxLength: 40 })
  .map((chars) => chars.join(''));

const bytesArb = fc.uint8Array({ maxLength: 64 }).map((arr) => Buffer.from(arr));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Property 3 — Tidak ada blob base64 pada basis data
// ---------------------------------------------------------------------------

describe('SupabaseObjectStorage — Property 3: no base64 blob persisted', () => {
  // Feature: ai-content-carousel-generator, Property 3: Tidak ada blob base64 pada basis data
  it('successful upload returns an Object_Storage URL reference, never a base64 data-URI', async () => {
    await fc.assert(
      fc.asyncProperty(teamIdArb, keyArb, bytesArb, async (teamId, key, bytes) => {
        stubFetchOk();
        const storage = makeStorage();

        const result = await storage.upload(teamId, key, bytes, 'image/png');

        // The persisted value is a URL reference …
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(typeof result.value).toBe('string');
        expect(result.value.startsWith('https://')).toBe(true);
        // … and NEVER a base64 data-URI nor raw file content.
        expect(result.value.startsWith('data:')).toBe(false);
        expect(result.value.includes(';base64,')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ai-content-carousel-generator, Property 3: Tidak ada blob base64 pada basis data
  it('failed upload returns err(INTERNAL) and never falls back to a base64 data-URI', async () => {
    await fc.assert(
      fc.asyncProperty(
        teamIdArb,
        keyArb,
        bytesArb,
        fc.boolean(),
        async (teamId, key, bytes, networkThrows) => {
          // Either the server rejects the upload (HTTP 500) or the network throws.
          if (networkThrows) stubFetchThrows();
          else stubFetch500();
          const storage = makeStorage();

          const result = await storage.upload(teamId, key, bytes, 'image/png');

          // Fail-closed: an error, not a value — and definitely not base64.
          expect(result.ok).toBe(false);
          if (result.ok) return;
          expect(result.error.code).toBe('INTERNAL');

          // The designed-out base64 fallback must be truly gone: nothing in the
          // returned Result may be (or contain) a base64 data-URI.
          const serialised = JSON.stringify(result);
          expect(serialised.includes('data:')).toBe(false);
          expect(serialised.includes(';base64,')).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 31 — Isolasi multi-tenant artefak dan not-found seragam
// ---------------------------------------------------------------------------

describe('SupabaseObjectStorage — Property 31: multi-tenant isolation, uniform not-found', () => {
  // Feature: ai-content-carousel-generator, Property 31: Isolasi multi-tenant artefak dan not-found seragam
  it('cross-team access is indistinguishable from a request for a non-existent artifact', async () => {
    await fc.assert(
      fc.asyncProperty(
        teamIdArb,
        teamIdArb,
        teamIdArb,
        keyArb,
        keyArb,
        async (teamA, teamB, ghostTeam, keyA, ghostKey) => {
          // Distinct tenants: teamA owns the artifact, teamB is the requester,
          // ghostTeam stands in for an artifact that does not exist for teamB.
          fc.pre(teamA !== teamB);
          fc.pre(ghostTeam !== teamB);

          stubFetchOk();
          const storage = makeStorage();

          // teamA uploads an artifact and receives its URL.
          const uploaded = await storage.upload(teamA, keyA, Buffer.from([1, 2, 3]), 'image/png');
          expect(uploaded.ok).toBe(true);
          if (!uploaded.ok) return;
          const urlOfTeamA = uploaded.value;

          // A syntactically-valid URL for an artifact that does not exist
          // (foreign namespace, never uploaded).
          const nonExistentUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ghostTeam}/${ghostKey}`;

          const crossTeam = await storage.resolveForTeam(teamB, urlOfTeamA);
          const notFound = await storage.resolveForTeam(teamB, nonExistentUrl);
          const ownerAccess = await storage.resolveForTeam(teamA, urlOfTeamA);

          // Cross-team read returns a uniform NOT_FOUND …
          expect(crossTeam.ok).toBe(false);
          if (crossTeam.ok) return;
          expect(crossTeam.error.code).toBe('NOT_FOUND');
          expect(crossTeam.error).toEqual({ code: 'NOT_FOUND', message: 'Resource not found' });

          // … identical to the response for an artifact that does not exist.
          expect(notFound.ok).toBe(false);
          if (notFound.ok) return;
          expect(notFound.error).toEqual(crossTeam.error);

          // Never an access-denied / authorization error (no existence leak).
          expect(crossTeam.error.code).not.toBe('AUTHORIZATION');
          expect(notFound.error.code).not.toBe('AUTHORIZATION');

          // The owning Team can still read its own artifact.
          expect(ownerAccess.ok).toBe(true);
          if (!ownerAccess.ok) return;
          expect(ownerAccess.value).toBe(urlOfTeamA);
        },
      ),
      { numRuns: 100 },
    );
  });
});
