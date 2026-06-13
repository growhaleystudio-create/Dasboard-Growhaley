/**
 * UrlSafetyGuard — SSRF protection for user-supplied URLs.
 *
 * Used by BackgroundImageClient (reference image) and any mockup-from-URL
 * ingestion path. Enforces:
 *   1. HTTPS-only scheme (reject http, file, data, gopher, ftp, …)
 *   2. DNS pre-resolution: block private/loopback/link-local/metadata IPs
 *   3. Configurable timeout via AbortController
 *   4. Redirect validation: every hop is re-checked (scheme + DNS)
 *   5. Content-type allowlist
 *   6. Body size limit
 *
 * Design: Components and Interfaces → UrlSafetyGuard
 * Design: Desain Keamanan dan Privasi → Proteksi SSRF
 * Requirements: 15.1
 */

import dns from 'node:dns';
import { err, ok } from '@leads-generator/shared';
import type { Result } from '@leads-generator/shared';
import type { AppError } from '@leads-generator/shared';

// ---------------------------------------------------------------------------
// Public types (match the design contract)
// ---------------------------------------------------------------------------

export interface FetchSafelyOptions {
  /** Maximum body size in bytes, e.g. 5 * 1024 * 1024 for 5 MB. */
  maxBytes: number;
  /** Allowed content-type prefixes, e.g. ['image/']. */
  allow: string[];
  /** Fetch timeout in milliseconds, e.g. 10_000. */
  timeoutMs: number;
}

export interface SafeFetchResult {
  bytes: Buffer;
  contentType: string;
}

export interface UrlSafetyGuard {
  fetchSafely(url: string, opts: FetchSafelyOptions): Promise<Result<SafeFetchResult>>;
}

// ---------------------------------------------------------------------------
// Private IP / restricted-range helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the IPv4 address string falls inside a blocked range:
 *  - 127.0.0.0/8   loopback
 *  - 10.0.0.0/8    RFC1918 private
 *  - 172.16.0.0/12 RFC1918 private
 *  - 192.168.0.0/16 RFC1918 private
 *  - 169.254.0.0/16 link-local / AWS metadata
 *  - 0.0.0.0/8     "this" network
 *  - 100.64.0.0/10 CGNAT
 */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    // Unparseable – treat as blocked to be safe
    return true;
  }
  const a = parts[0] as number;
  const b = parts[1] as number;
  if (a === 127) return true;                          // loopback
  if (a === 10) return true;                           // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true;   // RFC1918
  if (a === 192 && b === 168) return true;             // RFC1918
  if (a === 169 && b === 254) return true;             // link-local / metadata
  if (a === 0) return true;                            // "this" network
  if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
  return false;
}

/**
 * Returns true when the IPv6 address is a restricted address.
 * Only checks the most critical ones: ::1 (loopback), fc00::/7 (ULA), fe80::/10 (link-local).
 */
function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (lower === '::1') return true;                    // loopback
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
      lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0' || lower === '0:0:0:0:0:0:0:1') return true;
  return false;
}

/** Resolves hostname and rejects if any resolved address is private/loopback/restricted. */
async function assertSafeHost(hostname: string): Promise<Result<void>> {
  let addresses: dns.LookupAddress[];
  try {
    // Resolve both IPv4 and IPv6
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch {
    return err<AppError>({
      code: 'VALIDATION',
      messages: [`URL hostname '${hostname}' could not be resolved`],
    });
  }

  for (const { address, family } of addresses) {
    if (family === 4 && isPrivateIpv4(address)) {
      return err<AppError>({
        code: 'VALIDATION',
        messages: ['URL resolves to a private/restricted IP address'],
      });
    }
    if (family === 6 && isPrivateIpv6(address)) {
      return err<AppError>({
        code: 'VALIDATION',
        messages: ['URL resolves to a private/restricted IP address'],
      });
    }
  }

  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Scheme validation
// ---------------------------------------------------------------------------

const BLOCKED_SCHEMES = new Set(['http:', 'file:', 'data:', 'gopher:', 'ftp:', 'blob:']);

function parseAndValidateScheme(rawUrl: string): Result<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return err<AppError>({ code: 'VALIDATION', messages: ['Invalid URL'] });
  }

  if (parsed.protocol !== 'https:') {
    const reason = BLOCKED_SCHEMES.has(parsed.protocol)
      ? `URL scheme '${parsed.protocol}' is not allowed; only https is permitted`
      : `URL scheme '${parsed.protocol}' is not allowed; only https is permitted`;
    return err<AppError>({ code: 'VALIDATION', messages: [reason] });
  }

  return ok(parsed);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class UrlSafetyGuardImpl implements UrlSafetyGuard {
  async fetchSafely(rawUrl: string, opts: FetchSafelyOptions): Promise<Result<SafeFetchResult>> {
    // Step 1: Parse and validate scheme
    const parseResult = parseAndValidateScheme(rawUrl);
    if (!parseResult.ok) return parseResult;
    const initialParsed = parseResult.value;

    // Step 2: DNS pre-resolution on the initial hostname
    const dnsResult = await assertSafeHost(initialParsed.hostname);
    if (!dnsResult.ok) return dnsResult;

    // Step 3: Fetch with timeout, following redirects manually so we can
    //         re-validate each hop.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

    let response: Response;
    try {
      // We use `redirect: 'manual'` so we can inspect and validate each hop.
      response = await fetch(rawUrl, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'manual',
      });
    } catch (cause) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        return err<AppError>({
          code: 'INTERNAL',
          message: `Fetch timed out after ${opts.timeoutMs}ms`,
        });
      }
      const msg = cause instanceof Error ? cause.message : String(cause);
      return err<AppError>({ code: 'INTERNAL', message: `Fetch error: ${msg}` });
    } finally {
      clearTimeout(timer);
    }

    // Step 4: Handle redirects — validate each hop before following
    let currentResponse = response;
    let hops = 0;
    const MAX_HOPS = 5;

    while (
      currentResponse.status >= 300 &&
      currentResponse.status < 400 &&
      hops < MAX_HOPS
    ) {
      const location = currentResponse.headers.get('location');
      if (!location) {
        return err<AppError>({
          code: 'VALIDATION',
          messages: ['Redirect response missing Location header'],
        });
      }

      // Resolve relative redirects against the current URL
      let redirectUrl: string;
      try {
        redirectUrl = new URL(location, rawUrl).toString();
      } catch {
        return err<AppError>({
          code: 'VALIDATION',
          messages: ['Redirect location is not a valid URL'],
        });
      }

      // Re-validate scheme of redirect destination
      const redirectParseResult = parseAndValidateScheme(redirectUrl);
      if (!redirectParseResult.ok) return redirectParseResult;

      // Re-validate DNS of redirect destination
      const redirectDnsResult = await assertSafeHost(redirectParseResult.value.hostname);
      if (!redirectDnsResult.ok) return redirectDnsResult;

      // Follow the redirect
      const redirectController = new AbortController();
      const redirectTimer = setTimeout(() => redirectController.abort(), opts.timeoutMs);
      try {
        currentResponse = await fetch(redirectUrl, {
          method: 'GET',
          signal: redirectController.signal,
          redirect: 'manual',
        });
      } catch (cause) {
        clearTimeout(redirectTimer);
        if (redirectController.signal.aborted) {
          return err<AppError>({
            code: 'INTERNAL',
            message: `Fetch timed out after ${opts.timeoutMs}ms during redirect`,
          });
        }
        const msg = cause instanceof Error ? cause.message : String(cause);
        return err<AppError>({ code: 'INTERNAL', message: `Fetch error on redirect: ${msg}` });
      } finally {
        clearTimeout(redirectTimer);
      }

      rawUrl = redirectUrl;
      hops++;
    }

    if (hops >= MAX_HOPS) {
      return err<AppError>({
        code: 'VALIDATION',
        messages: ['Too many redirects'],
      });
    }

    // Step 5: Check content-type
    const contentType = currentResponse.headers.get('content-type') ?? '';
    const normalizedCt = contentType.split(';')[0]?.trim() ?? '';
    const allowed = opts.allow.some((prefix) => normalizedCt.startsWith(prefix));
    if (!allowed) {
      return err<AppError>({
        code: 'VALIDATION',
        messages: [
          `Content-Type '${normalizedCt}' is not allowed; expected one of: ${opts.allow.join(', ')}`,
        ],
      });
    }

    // Step 6: Read body with size limit
    const reader = currentResponse.body?.getReader();
    if (!reader) {
      return err<AppError>({ code: 'INTERNAL', message: 'Response body is not readable' });
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.length;
          if (totalBytes > opts.maxBytes) {
            reader.cancel().catch(() => undefined);
            return err<AppError>({
              code: 'VALIDATION',
              messages: [
                `Response body exceeds maximum allowed size of ${opts.maxBytes} bytes`,
              ],
            });
          }
          chunks.push(value);
        }
      }
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      return err<AppError>({ code: 'INTERNAL', message: `Error reading response body: ${msg}` });
    }

    const bytes = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return ok({ bytes, contentType: normalizedCt });
  }
}
