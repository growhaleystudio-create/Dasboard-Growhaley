/**
 * Session cookie utilities for the Auth_Service (R1.3, R1.5).
 *
 * The browser carries the session id between requests in an HttpOnly
 * cookie named `lg_session`. This module is the single source of truth
 * for:
 *
 * - the canonical cookie name ({@link SESSION_COOKIE_NAME}),
 * - parsing an inbound `Cookie` header to extract the session id
 *   ({@link parseSessionCookie}), and
 * - building a `Set-Cookie` header value with the right security flags
 *   for the current environment ({@link buildSessionCookie}).
 *
 * Security rationale (each flag mapped to a concrete threat):
 *
 * - `HttpOnly` — JavaScript on the page can't read the cookie, blocking
 *   trivial XSS-driven session theft.
 * - `Secure` (in production) — browsers refuse to send the cookie over
 *   plain HTTP, defending against passive network sniffers. Disabled in
 *   non-production so localhost development without TLS still works.
 * - `SameSite=Lax` — the cookie isn't sent on cross-site sub-requests,
 *   which mitigates CSRF on state-changing endpoints.
 * - `Path=/` — scope the cookie to the whole application; the same id is
 *   valid on `/api/leads`, `/api/scan`, etc.
 * - `Max-Age=SESSION_IDLE_TIMEOUT_SECONDS` — aligns the browser-side
 *   lifetime with the server's idle window so a refresh after a long
 *   pause won't ship a guaranteed-stale cookie.
 *
 * Design refs:
 * - design.md → Components and Interfaces → Auth_Service
 * - design.md → Security → Keamanan endpoint
 *
 * Requirements: R1.3 (proteksi rute via sesi terautentikasi), R1.5 (idle
 * timeout 30 menit selaras dengan Max-Age cookie).
 */

import { SESSION_IDLE_TIMEOUT_SECONDS } from './session-store.js';

/**
 * Canonical name of the session cookie. Exposed as a constant so the
 * server, the Fastify plugin, and any future test fixtures all agree on
 * the exact spelling. The `lg_` prefix is short for "leads generator"
 * and avoids colliding with cookies set by adjacent products on the
 * same eTLD+1 during local development.
 */
export const SESSION_COOKIE_NAME = 'lg_session';

/**
 * Options accepted by {@link buildSessionCookie}.
 */
export interface BuildSessionCookieOptions {
  /**
   * When true, append the `Secure` flag so the browser only sends the
   * cookie back over HTTPS. Production deployments MUST pass `true`;
   * development/test default to `false` so localhost (HTTP) works.
   */
  production?: boolean;

  /**
   * Max-Age in seconds. Defaults to {@link SESSION_IDLE_TIMEOUT_SECONDS}
   * (30 minutes), matching the server-side idle window.
   */
  maxAgeSeconds?: number;
}

/**
 * Extract the `lg_session` value from a request `Cookie` header.
 *
 * Returns `null` when the header is missing, malformed, or does not
 * contain our cookie. The parser is intentionally minimal — we only
 * accept `name=value` pairs separated by `; ` and don't try to re-parse
 * any cookie attributes (the browser would never send those anyway on a
 * `Cookie` request header). Surrounding whitespace on each pair is
 * trimmed so headers that use `;` without space still work.
 *
 * The value is URL-decoded so it round-trips with the encoding we apply
 * in {@link buildSessionCookie}.
 */
export function parseSessionCookie(cookieHeader: string | undefined | null): string | null {
  if (cookieHeader === undefined || cookieHeader === null || cookieHeader.length === 0) {
    return null;
  }
  // RFC 6265 separator is `;`; we trim whitespace around each pair to
  // tolerate the more common "; " convention.
  const pairs = cookieHeader.split(';');
  for (const rawPair of pairs) {
    const pair = rawPair.trim();
    if (pair.length === 0) continue;
    const eqIdx = pair.indexOf('=');
    // A name with no `=` (`Cookie: foo`) or a leading `=` is malformed —
    // skip it instead of reading a half-baked entry.
    if (eqIdx <= 0) continue;
    const name = pair.slice(0, eqIdx);
    if (name !== SESSION_COOKIE_NAME) continue;
    const value = pair.slice(eqIdx + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      // Malformed percent-encoding — treat as missing rather than throw.
      return null;
    }
  }
  return null;
}

/**
 * Build a `Set-Cookie` header value carrying the supplied session id.
 *
 * Always emits `HttpOnly`, `SameSite=Lax`, `Path=/`, and
 * `Max-Age=<maxAgeSeconds>`. Adds `Secure` only when `production` is
 * true. The returned string is suitable for `reply.header('Set-Cookie',
 * value)` in Fastify or any other framework that accepts a raw header.
 */
export function buildSessionCookie(
  sessionId: string,
  options: BuildSessionCookieOptions = {},
): string {
  const maxAgeSeconds = options.maxAgeSeconds ?? SESSION_IDLE_TIMEOUT_SECONDS;
  // `encodeURIComponent` keeps the cookie value within the small set of
  // characters allowed in a cookie value per RFC 6265 §4.1.1.
  const encodedValue = encodeURIComponent(sessionId);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodedValue}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (options.production === true) {
    parts.push('Secure');
  }
  return parts.join('; ');
}
