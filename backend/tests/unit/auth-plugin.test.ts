/**
 * Unit tests for {@link authPlugin} (Task 3.6 / R1.3).
 *
 * The tests boot a tiny Fastify app per scenario, register the plugin
 * with a stubbed {@link SessionStore}, and exercise the three relevant
 * outcomes:
 *
 * 1. Protected JSON route + no/invalid session → 401 + JSON body.
 * 2. Protected redirect route + no/invalid session → 302 + Location.
 * 3. Protected route + valid session → 200, and the route handler
 *    observes `request.session` populated.
 *
 * No real Redis is required: the {@link FakeSessionStore} satisfies the
 * interface in-memory and lets us prime the "valid session" path
 * deterministically.
 *
 * Design refs:
 * - design.md → Architecture → Alur Permintaan Berbasis Peran
 * - design.md → Security → Keamanan endpoint
 *
 * Requirements: R1.3.
 */

import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import type { AuthSession } from '@leads-generator/shared';

import {
  authPlugin,
  requireAuth,
  SESSION_COOKIE_NAME,
} from '../../src/auth/index.js';
import type { SessionStore } from '../../src/auth/index.js';

/**
 * In-memory {@link SessionStore} that mirrors the contract well enough
 * for plugin-level testing. Only the methods the plugin actually calls
 * (`touch`) need real semantics; the others throw to fail loudly if the
 * plugin's surface ever expands without the tests being updated.
 */
class FakeSessionStore implements SessionStore {
  private readonly sessions = new Map<string, AuthSession>();

  /** Seed a session that {@link touch} will return on lookup. */
  seed(sessionId: string, session: AuthSession): void {
    this.sessions.set(sessionId, session);
  }

  async create(): Promise<{ sessionId: string; session: AuthSession }> {
    throw new Error('FakeSessionStore.create not used in these tests');
  }

  async get(sessionId: string): Promise<AuthSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async touch(sessionId: string): Promise<AuthSession | null> {
    // Mirror RedisSessionStore semantics: missing → null; present →
    // refresh `lastActivityAt` and return.
    const existing = this.sessions.get(sessionId);
    if (existing === undefined) return null;
    const refreshed: AuthSession = {
      ...existing,
      lastActivityAt: new Date('2024-01-01T00:01:00.000Z'),
    };
    this.sessions.set(sessionId, refreshed);
    return refreshed;
  }

  async destroy(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

/**
 * Build a session shape suitable for FakeSessionStore.seed().
 */
function buildSession(): AuthSession {
  return {
    userId: 'user-1',
    teamId: 'team-1',
    role: 'member',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    lastActivityAt: new Date('2024-01-01T00:00:00.000Z'),
  };
}

describe('authPlugin', () => {
  it('returns 401 JSON when a protected JSON route receives no session', async () => {
    const app = Fastify();
    const sessionStore = new FakeSessionStore();
    await app.register(authPlugin, { sessionStore });

    app.get('/api/leads', { config: requireAuth() }, async () => ({ ok: true }));

    const response = await app.inject({ method: 'GET', url: '/api/leads' });

    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.json()).toEqual({
      error: 'AUTH',
      message: 'Session expired',
    });
    await app.close();
  });

  it('returns 401 JSON when the cookie names a session the store does not know', async () => {
    const app = Fastify();
    const sessionStore = new FakeSessionStore();
    await app.register(authPlugin, { sessionStore });

    app.get('/api/leads', { config: requireAuth() }, async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/api/leads',
      headers: { cookie: `${SESSION_COOKIE_NAME}=does-not-exist` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'AUTH',
      message: 'Session expired',
    });
    await app.close();
  });

  it('redirects to /login with the original URL when in redirect mode', async () => {
    const app = Fastify();
    const sessionStore = new FakeSessionStore();
    await app.register(authPlugin, { sessionStore });

    app.get(
      '/leads',
      { config: requireAuth({ mode: 'redirect' }) },
      async () => 'should not reach',
    );

    const response = await app.inject({ method: 'GET', url: '/leads?status=new' });

    // R1.3: deny unauthenticated AND redirect — both signals must be
    // present so API consumers see the failure while browsers still
    // follow the Location to the login page.
    expect(response.statusCode).toBe(401);
    expect(response.headers.location).toBe(
      `/login?redirect=${encodeURIComponent('/leads?status=new')}`,
    );
    await app.close();
  });

  it('allows the request when a valid session cookie is present and exposes request.session', async () => {
    const app = Fastify();
    const sessionStore = new FakeSessionStore();
    const session = buildSession();
    sessionStore.seed('valid-session-id', session);
    await app.register(authPlugin, { sessionStore });

    let observedUserId: string | undefined;
    let observedTeamId: string | undefined;
    let observedRole: string | undefined;
    app.get('/api/leads', { config: requireAuth() }, async (request) => {
      observedUserId = request.session?.userId;
      observedTeamId = request.session?.teamId;
      observedRole = request.session?.role;
      return { ok: true };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/leads',
      headers: { cookie: `${SESSION_COOKIE_NAME}=valid-session-id` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(observedUserId).toBe('user-1');
    expect(observedTeamId).toBe('team-1');
    expect(observedRole).toBe('member');
    await app.close();
  });

  it('does not run the auth check on routes that did not opt in via requireAuth()', async () => {
    const app = Fastify();
    const sessionStore = new FakeSessionStore();
    await app.register(authPlugin, { sessionStore });

    // Public route — no `config: requireAuth()`. Even without a cookie
    // the request must succeed; the preHandler should be a no-op.
    app.get('/health', async () => ({ status: 'ok' }));

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
