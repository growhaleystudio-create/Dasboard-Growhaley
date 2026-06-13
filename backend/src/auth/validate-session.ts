/**
 * `validateSession` — the canonical "is this caller still logged in?"
 * helper used by the request pipeline and the RBAC Guard.
 *
 * On every authenticated request the application calls
 * {@link validateSession} which BOTH:
 *
 * 1. checks the session still exists and has not crossed the 30-minute
 *    idle threshold (R1.5), and
 * 2. refreshes `lastActivityAt` to "now" so a stream of activity keeps
 *    the session alive.
 *
 * Both effects happen inside a single `SessionStore.touch` call so the
 * read and the refresh share one round-trip to Redis.
 *
 * Design refs:
 * - design.md → Components and Interfaces → Auth_Service
 * - design.md → Security → Autentikasi
 *
 * Requirements: R1.5 (idle timeout 30 menit; perbarui aktivitas pada
 * permintaan valid).
 */

import { ok, err, type Result, type AuthSession } from '@leads-generator/shared';

import type { SessionStore } from './session-store.js';

/**
 * Validate a session id against the store, refreshing its idle window on
 * success. Returns an `AUTH` error when the session is missing or has
 * expired so callers can translate that into a 401 + redirect to login.
 */
export async function validateSession(
  store: SessionStore,
  sessionId: string,
): Promise<Result<AuthSession>> {
  const session = await store.touch(sessionId);
  if (session === null) {
    return err({ code: 'AUTH', message: 'Session expired or not found' });
  }
  return ok(session);
}
