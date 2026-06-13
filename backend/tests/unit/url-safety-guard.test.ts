/**
 * Unit tests for UrlSafetyGuardImpl.
 *
 * Validates SSRF protection (Requirements 15.1):
 *  - http:// rejected
 *  - data: URI rejected
 *  - file: URI rejected
 *  - gopher: URI rejected
 *  - Private IP blocked (mock dns.lookup returning 192.168.1.1)
 *  - Loopback IP blocked (127.0.0.1 and ::1)
 *  - Link-local / metadata IP blocked (169.254.169.254)
 *  - RFC1918 ranges blocked (10.x, 172.16-31.x, 192.168.x)
 *  - Valid https image accepted (mock fetch)
 *  - Content-type mismatch rejected
 *  - Size limit exceeded rejected
 *  - Redirect re-validates scheme and DNS
 *  - Too many redirects rejected
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dns from 'node:dns';

import { UrlSafetyGuardImpl } from '../../src/content/url-safety-guard.js';
import type { FetchSafelyOptions } from '../../src/content/url-safety-guard.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_OPTS: FetchSafelyOptions = {
  maxBytes: 5 * 1024 * 1024,
  allow: ['image/'],
  timeoutMs: 10_000,
};

function guard() {
  return new UrlSafetyGuardImpl();
}

/**
 * Creates a minimal mock fetch Response for a successful image fetch.
 */
function makeImageResponse(contentType = 'image/png', bodyBytes = Buffer.from('fake-png')) {
  const encoder = new TextEncoder();
  const data = encoder.encode('');
  // Build a ReadableStream from the provided bodyBytes
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bodyBytes));
      controller.close();
    },
  });

  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    body: stream,
  } as unknown as Response;
}

/**
 * Stubs dns.promises.lookup to return the given IP address and family.
 */
function stubDns(address: string, family: 4 | 6 = 4) {
  vi.spyOn(dns.promises, 'lookup').mockResolvedValue(
    [{ address, family }] as unknown as dns.LookupAddress & dns.LookupAddress[],
  );
}

/**
 * Stubs global fetch with a simple non-redirect 200 response.
 */
function stubFetchSuccess(contentType = 'image/png', bodyBytes = Buffer.from('fake-png')) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeImageResponse(contentType, bodyBytes)));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Scheme validation
// ---------------------------------------------------------------------------

describe('UrlSafetyGuardImpl — scheme validation', () => {
  it('rejects http:// with VALIDATION error', async () => {
    const result = await guard().fetchSafely('http://example.com/image.png', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain("'http:'");
  });

  it('rejects data: URI with VALIDATION error', async () => {
    const result = await guard().fetchSafely('data:image/png;base64,abc', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain("'data:'");
  });

  it('rejects file: URI with VALIDATION error', async () => {
    const result = await guard().fetchSafely('file:///etc/passwd', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain("'file:'");
  });

  it('rejects gopher: URI with VALIDATION error', async () => {
    const result = await guard().fetchSafely('gopher://example.com/1', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain("'gopher:'");
  });

  it('rejects ftp: URI with VALIDATION error', async () => {
    const result = await guard().fetchSafely('ftp://files.example.com/image.png', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
  });

  it('rejects invalid URL string', async () => {
    const result = await guard().fetchSafely('not-a-url', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
  });
});

// ---------------------------------------------------------------------------
// DNS / private IP blocking
// ---------------------------------------------------------------------------

describe('UrlSafetyGuardImpl — private IP blocking', () => {
  it('blocks RFC1918 address 192.168.1.1', async () => {
    stubDns('192.168.1.1', 4);

    const result = await guard().fetchSafely('https://internal.example.com/img.png', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain('private/restricted');
  });

  it('blocks loopback address 127.0.0.1', async () => {
    stubDns('127.0.0.1', 4);

    const result = await guard().fetchSafely('https://localhost/img.png', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain('private/restricted');
  });

  it('blocks link-local / AWS metadata 169.254.169.254', async () => {
    stubDns('169.254.169.254', 4);

    const result = await guard().fetchSafely('https://metadata.example.com/img.png', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain('private/restricted');
  });

  it('blocks RFC1918 address 10.0.0.1', async () => {
    stubDns('10.0.0.1', 4);

    const result = await guard().fetchSafely('https://private.example.com/img.png', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
  });

  it('blocks RFC1918 address 172.16.0.5 (172.16-31.x.x range)', async () => {
    stubDns('172.16.0.5', 4);

    const result = await guard().fetchSafely('https://corp.example.com/img.png', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
  });

  it('blocks IPv6 loopback ::1', async () => {
    stubDns('::1', 6);

    const result = await guard().fetchSafely('https://ipv6.example.com/img.png', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain('private/restricted');
  });

  it('blocks RFC1918 address 192.168.0.100', async () => {
    stubDns('192.168.0.100', 4);

    const result = await guard().fetchSafely('https://home.example.com/img.png', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
  });

  it('returns VALIDATION error when DNS lookup fails to resolve', async () => {
    vi.spyOn(dns.promises, 'lookup').mockRejectedValue(new Error('ENOTFOUND'));

    const result = await guard().fetchSafely('https://nonexistent.invalid/img.png', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
  });
});

// ---------------------------------------------------------------------------
// Successful fetch (public IP + correct content-type)
// ---------------------------------------------------------------------------

describe('UrlSafetyGuardImpl — successful fetch', () => {
  it('returns ok with bytes and contentType for valid https image', async () => {
    stubDns('93.184.216.34', 4); // example.com public IP
    const imageData = Buffer.from('fake-png-content');
    stubFetchSuccess('image/png', imageData);

    const result = await guard().fetchSafely('https://example.com/image.png', DEFAULT_OPTS);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.contentType).toBe('image/png');
    expect(result.value.bytes.equals(imageData)).toBe(true);
  });

  it('strips charset from content-type before matching', async () => {
    stubDns('93.184.216.34', 4);
    stubFetchSuccess('image/jpeg; charset=utf-8', Buffer.from('fake-jpg'));

    const result = await guard().fetchSafely('https://example.com/photo.jpg', {
      ...DEFAULT_OPTS,
      allow: ['image/'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.contentType).toBe('image/jpeg');
  });

  it('accepts image/webp when allow includes image/', async () => {
    stubDns('93.184.216.34', 4);
    stubFetchSuccess('image/webp', Buffer.from('fake-webp'));

    const result = await guard().fetchSafely('https://example.com/image.webp', DEFAULT_OPTS);

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Content-type mismatch
// ---------------------------------------------------------------------------

describe('UrlSafetyGuardImpl — content-type enforcement', () => {
  it('rejects response with content-type text/html', async () => {
    stubDns('93.184.216.34', 4);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(Buffer.from('<html/>')));
            controller.close();
          },
        }),
      }),
    );

    const result = await guard().fetchSafely('https://example.com/page.html', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain('text/html');
  });

  it('rejects response with application/json content-type', async () => {
    stubDns('93.184.216.34', 4);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(Buffer.from('{}')));
            controller.close();
          },
        }),
      }),
    );

    const result = await guard().fetchSafely('https://example.com/data.json', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
  });
});

// ---------------------------------------------------------------------------
// Size limit
// ---------------------------------------------------------------------------

describe('UrlSafetyGuardImpl — size limit', () => {
  it('rejects response body exceeding maxBytes', async () => {
    stubDns('93.184.216.34', 4);
    // Send 100 bytes, but maxBytes=50
    const bigBody = Buffer.alloc(100, 0xff);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(bigBody));
            controller.close();
          },
        }),
      }),
    );

    const result = await guard().fetchSafely('https://example.com/big.png', {
      ...DEFAULT_OPTS,
      maxBytes: 50,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain('maximum allowed size');
  });

  it('accepts response body exactly at maxBytes', async () => {
    stubDns('93.184.216.34', 4);
    const exactBody = Buffer.alloc(50, 0xaa);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(exactBody));
            controller.close();
          },
        }),
      }),
    );

    const result = await guard().fetchSafely('https://example.com/exact.png', {
      ...DEFAULT_OPTS,
      maxBytes: 50,
    });

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Redirect handling
// ---------------------------------------------------------------------------

describe('UrlSafetyGuardImpl — redirect validation', () => {
  it('rejects redirect to http:// (scheme downgrade)', async () => {
    // First DNS lookup for the initial host succeeds (public IP)
    vi.spyOn(dns.promises, 'lookup').mockResolvedValue(
      [{ address: '93.184.216.34', family: 4 }] as unknown as dns.LookupAddress & dns.LookupAddress[],
    );

    // First fetch returns a redirect to http://
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 301,
        headers: new Headers({ location: 'http://insecure.example.com/img.png' }),
        body: null,
      }),
    );

    const result = await guard().fetchSafely('https://example.com/redirect', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain("'http:'");
  });

  it('rejects redirect to private IP', async () => {
    // Initial DNS: public IP
    const lookupSpy = vi.spyOn(dns.promises, 'lookup')
      .mockResolvedValueOnce(
        [{ address: '93.184.216.34', family: 4 }] as unknown as dns.LookupAddress & dns.LookupAddress[],
      )
      // Redirect DNS: private IP
      .mockResolvedValueOnce(
        [{ address: '192.168.1.1', family: 4 }] as unknown as dns.LookupAddress & dns.LookupAddress[],
      );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: new Headers({ location: 'https://private-host.example.com/img.png' }),
        body: null,
      }),
    );

    const result = await guard().fetchSafely('https://public.example.com/redirect', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain('private/restricted');
    // DNS should have been called twice
    expect(lookupSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects when there are too many redirect hops', async () => {
    // Always return public IP from DNS
    vi.spyOn(dns.promises, 'lookup').mockResolvedValue(
      [{ address: '93.184.216.34', family: 4 }] as unknown as dns.LookupAddress & dns.LookupAddress[],
    );

    // All fetches return a redirect
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 301,
        headers: new Headers({ location: 'https://example.com/next' }),
        body: null,
      }),
    );

    const result = await guard().fetchSafely('https://example.com/start', DEFAULT_OPTS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { messages: string[] }).messages[0]).toContain('Too many redirects');
  });

  it('follows a valid redirect and returns image bytes', async () => {
    const imageData = Buffer.from('redirected-image');

    vi.spyOn(dns.promises, 'lookup').mockResolvedValue(
      [{ address: '93.184.216.34', family: 4 }] as unknown as dns.LookupAddress & dns.LookupAddress[],
    );

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(imageData));
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 301,
          headers: new Headers({ location: 'https://cdn.example.com/final.png' }),
          body: null,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'image/png' }),
          body: stream,
        }),
    );

    const result = await guard().fetchSafely('https://example.com/image', DEFAULT_OPTS);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.bytes.equals(imageData)).toBe(true);
    expect(result.value.contentType).toBe('image/png');
  });
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe('UrlSafetyGuardImpl — timeout', () => {
  it('returns INTERNAL error when fetch is aborted due to timeout', async () => {
    stubDns('93.184.216.34', 4);

    // Simulate a fetch that rejects with AbortError
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          // Listen for abort signal
          (init.signal as AbortSignal)?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }),
    );

    const result = await guard().fetchSafely('https://slow.example.com/img.png', {
      ...DEFAULT_OPTS,
      timeoutMs: 1,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('INTERNAL');
    expect((result.error as { message: string }).message).toContain('timed out');
  });
});
