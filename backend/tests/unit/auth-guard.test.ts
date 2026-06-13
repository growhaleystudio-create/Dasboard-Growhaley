/**
 * Unit tests for the `requireRole` preHandler in `auth-guard.ts`
 * (Task 19.1 / Requirements R12.1–R12.6).
 *
 * Verifies that `requireRole`:
 *   1. Consults `EffectiveRoleResolver` per-request (never the frozen
 *      `session.role`) so role changes take effect immediately (R2.3).
 *   2. Wires `content.manage` → Admin only; `content.generate` → Admin +
 *      Member; Viewer → denied for both (R12.1–R12.4).
 *   3. Returns 403 when `effectiveRoleResolver` returns null (user no
 *      longer a team member) (R12.5, R12.6).
 *   4. A denied request does not propagate to the route handler, so no
 *      data mutation can occur.
 *
 * The Fastify app is bootstrapped inline per test — no real DB or Redis
 * is required. The session is populated directly on `request.session`
 * (simulating `requireAuth` already having run) using the `onRequest`
 * hook, and `effectiveRoleResolver` is a simple stub.
 */

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, it, expect, vi } from 'vitest';
import type { AuthSession, Role } from '@leads-generator/shared';

import authGuard from '../../src/api/plugins/auth-guard.js';
import { errorHandler } from '../../src/api/error-handler.js';
import type { EffectiveRoleResolver } from '../../src/auth/effective-role.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal AuthSession for tests. */
function makeSession(role: Role = 'member'): AuthSession {
  return {
    userId: 'user-1',
    teamId: 'team-1',
    role,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    lastActivityAt: new Date('2024-01-01T00:00:00Z'),
  };
}

/**
 * Build a tiny Fastify app with `auth-guard` registered.
 *
 * `effectiveRole` is what the stub resolver will return. Pass `null` to
 * simulate the user no longer being a member of the team.
 *
 * The single GET `/test` route is guarded by `requireRole(action)`.
 * The route handler increments `handlerCalledCount` so tests can assert
 * it was (or was not) reached.
 */
async function buildApp(
  session: AuthSession,
  effectiveRole: Role | null,
  action: Parameters<import('../../src/api/plugins/auth-guard.js').default>[1]['requireRole'] extends (a: infer A) => unknown ? A : never,
) {
  const app = Fastify();

  // Register the domain error handler so AUTHORIZATION errors map to 403.
  app.setErrorHandler(errorHandler);

  await app.register(cookie);

  // Stub resolver — returns the pre-defined effectiveRole without hitting DB.
  const resolver: EffectiveRoleResolver = {
    get: vi.fn().mockResolvedValue(effectiveRole),
  };

  // Sessions stub (requireAuth is NOT called in these tests — we inject
  // the session manually via onRequest so we can isolate requireRole).
  const sessionStub = {
    touch: vi.fn().mockResolvedValue(session),
  } as any;

  await app.register(authGuard, {
    sessions: sessionStub,
    effectiveRoleResolver: resolver,
  });

  // Inject the session directly (mimicking requireAuth having already run).
  app.addHook('onRequest', async (request) => {
    request.session = session;
  });

  let handlerCalledCount = 0;

  app.get(
    '/test',
    { preHandler: [app.requireRole(action as any)] },
    async () => {
      handlerCalledCount++;
      return { ok: true };
    },
  );

  await app.ready();

  return { app, resolver, handlerCalledCount: () => handlerCalledCount };
}

// ---------------------------------------------------------------------------
// content.manage: Admin → allow, Member → deny, Viewer → deny
// ---------------------------------------------------------------------------

describe('requireRole — content.manage (R12.1, R12.2)', () => {
  it('Admin can content.manage', async () => {
    const session = makeSession('admin');
    const { app, resolver, handlerCalledCount } = await buildApp(
      session,
      'admin',
      'content.manage',
    );

    const res = await app.inject({ method: 'GET', url: '/test' });

    expect(res.statusCode).toBe(200);
    expect(handlerCalledCount()).toBe(1);
    // Resolver was consulted — NOT session.role
    expect((resolver.get as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect((resolver.get as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
      'user-1',
      'team-1',
    ]);
    await app.close();
  });

  it('Member cannot content.manage → 403', async () => {
    const session = makeSession('member');
    const { app, handlerCalledCount } = await buildApp(
      session,
      'member',
      'content.manage',
    );

    const res = await app.inject({ method: 'GET', url: '/test' });

    expect(res.statusCode).toBe(403);
    expect(handlerCalledCount()).toBe(0); // handler must NOT be reached
    await app.close();
  });

  it('Viewer cannot content.manage → 403', async () => {
    const session = makeSession('viewer');
    const { app, handlerCalledCount } = await buildApp(
      session,
      'viewer',
      'content.manage',
    );

    const res = await app.inject({ method: 'GET', url: '/test' });

    expect(res.statusCode).toBe(403);
    expect(handlerCalledCount()).toBe(0);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// content.generate: Admin → allow, Member → allow, Viewer → deny
// ---------------------------------------------------------------------------

describe('requireRole — content.generate (R12.3, R12.4)', () => {
  it('Admin can content.generate', async () => {
    const session = makeSession('admin');
    const { app, handlerCalledCount } = await buildApp(
      session,
      'admin',
      'content.generate',
    );

    const res = await app.inject({ method: 'GET', url: '/test' });

    expect(res.statusCode).toBe(200);
    expect(handlerCalledCount()).toBe(1);
    await app.close();
  });

  it('Member can content.generate', async () => {
    const session = makeSession('member');
    const { app, handlerCalledCount } = await buildApp(
      session,
      'member',
      'content.generate',
    );

    const res = await app.inject({ method: 'GET', url: '/test' });

    expect(res.statusCode).toBe(200);
    expect(handlerCalledCount()).toBe(1);
    await app.close();
  });

  it('Viewer cannot content.generate → 403', async () => {
    const session = makeSession('viewer');
    const { app, handlerCalledCount } = await buildApp(
      session,
      'viewer',
      'content.generate',
    );

    const res = await app.inject({ method: 'GET', url: '/test' });

    expect(res.statusCode).toBe(403);
    expect(handlerCalledCount()).toBe(0);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Cross-action ownership isolation: manage cannot unlock generate and vice-versa
// (R12.5, R12.6: "kepemilikan satu aksi tidak pernah mengizinkan aksi lain")
// ---------------------------------------------------------------------------

describe('requireRole — cross-action isolation (R12.5, R12.6)', () => {
  it(
    'A session whose effective role is Viewer (content.generate denied) ' +
      'does not grant content.manage simply because it is the same session',
    async () => {
      // Viewer is denied BOTH actions — confirm both independently.
      const session = makeSession('viewer');

      const { app: appManage, handlerCalledCount: manageCalled } = await buildApp(
        session,
        'viewer',
        'content.manage',
      );
      const resManage = await appManage.inject({ method: 'GET', url: '/test' });
      expect(resManage.statusCode).toBe(403);
      expect(manageCalled()).toBe(0);
      await appManage.close();

      const { app: appGenerate, handlerCalledCount: generateCalled } = await buildApp(
        session,
        'viewer',
        'content.generate',
      );
      const resGenerate = await appGenerate.inject({ method: 'GET', url: '/test' });
      expect(resGenerate.statusCode).toBe(403);
      expect(generateCalled()).toBe(0);
      await appGenerate.close();
    },
  );

  it(
    'Member is granted content.generate but NOT content.manage ' +
      '(ownership of generate does not unlock manage)',
    async () => {
      const session = makeSession('member');

      // generate → allowed
      const { app: appGenerate, handlerCalledCount: generateCalled } = await buildApp(
        session,
        'member',
        'content.generate',
      );
      const resGenerate = await appGenerate.inject({ method: 'GET', url: '/test' });
      expect(resGenerate.statusCode).toBe(200);
      expect(generateCalled()).toBe(1);
      await appGenerate.close();

      // manage → denied for same effective role
      const { app: appManage, handlerCalledCount: manageCalled } = await buildApp(
        session,
        'member',
        'content.manage',
      );
      const resManage = await appManage.inject({ method: 'GET', url: '/test' });
      expect(resManage.statusCode).toBe(403);
      expect(manageCalled()).toBe(0);
      await appManage.close();
    },
  );
});

// ---------------------------------------------------------------------------
// Effective role null → 403 (user removed from team) (R12.6)
// ---------------------------------------------------------------------------

describe('requireRole — effective role null → 403 (R12.6)', () => {
  it('returns 403 when resolver returns null (user no longer a member)', async () => {
    // Session has a frozen role that would normally be allowed; resolver
    // returns null to simulate the user having been removed from the team.
    const session = makeSession('admin');
    const { app, handlerCalledCount } = await buildApp(session, null, 'content.manage');

    const res = await app.inject({ method: 'GET', url: '/test' });

    expect(res.statusCode).toBe(403);
    expect(handlerCalledCount()).toBe(0);
    await app.close();
  });

  it('resolver is always consulted, never falling back to session.role', async () => {
    // Session says "admin" but resolver returns "viewer" (role was downgraded).
    // The effective viewer role must be used, so content.manage → 403.
    const session = makeSession('admin'); // frozen role would allow
    const { app, resolver, handlerCalledCount } = await buildApp(
      session,
      'viewer', // effective (current) role
      'content.manage',
    );

    const res = await app.inject({ method: 'GET', url: '/test' });

    expect(res.statusCode).toBe(403);
    expect(handlerCalledCount()).toBe(0);
    // Resolver was consulted once, with the correct (userId, teamId).
    expect((resolver.get as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    await app.close();
  });
});
