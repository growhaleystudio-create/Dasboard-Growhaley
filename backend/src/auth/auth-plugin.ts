/**
 * Fastify plugin that enforces R1.3: deny every request to a Lead-management
 * page that doesn't carry an authenticated session, and redirect the User
 * to the login page (browser flows) or return 401 JSON (API flows).
 *
 * Design refs:
 * - design.md → Architecture → Alur Permintaan Berbasis Peran
 *   (the very first guard in the pipeline)
 * - design.md → Security → Keamanan endpoint
 *
 * Requirements: R1.3 (batasi akses ke halaman pengelolaan Lead saat
 * sesi belum terautentikasi dan arahkan ke halaman login).
 *
 * Design choices worth calling out:
 *
 * 1. **No singleton imports.** The {@link SessionStore} is supplied via
 *    the plugin options so production passes a `RedisSessionStore`, tests
 *    pass a fake, and a future migration could swap the store entirely
 *    without touching this file.
 *
 * 2. **Opt-in protection.** Routes mark themselves as protected via
 *    `requireAuth({ mode })`. Routes that omit the marker (e.g. `/login`,
 *    `/health`) skip the preHandler entirely. This avoids the perennial
 *    "we forgot to whitelist X" footgun of opt-out auth middleware.
 *
 * 3. **Per-route response shape.** Browser-facing pages need a redirect
 *    (HTTP 302/303 to `/login`) so the User actually sees the login
 *    form; API endpoints need a JSON 401 so the SPA can handle it. The
 *    `protectionMode` route config picks between the two. Default is
 *    `'json'` — JSON is the safer fallback because a redirect to a JSON
 *    consumer just confuses things.
 *
 * 4. **Redirect carries `?redirect=`.** The original URL is captured so
 *    the login page can bounce the User back after success. We use
 *    `encodeURIComponent` because `request.url` may contain query
 *    strings and Unicode.
 *
 * 5. **`request.session` decorator.** Set to the validated
 *    {@link AuthSession} on success; otherwise left `undefined` so
 *    downstream handlers can rely on `if (request.session)` checks. The
 *    Fastify augmentation lives at the bottom of this file.
 */

import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthSession } from '@leads-generator/shared';

import { parseSessionCookie } from './session-cookie.js';
import type { SessionStore } from './session-store.js';
import { validateSession } from './validate-session.js';

/**
 * Marker stored under `routeOptions.config[PROTECTION_CONFIG_KEY]` to
 * signal that a route requires an authenticated session. Using a Symbol
 * avoids collisions with arbitrary user-supplied keys on the route
 * config object.
 */
const PROTECTION_CONFIG_KEY = Symbol.for('lg.auth.protection');

/**
 * How the plugin should respond to an unauthenticated request:
 *
 * - `'json'` — reply with HTTP 401 and a JSON body. Used by API routes.
 * - `'redirect'` — reply with HTTP 302 and a `Location: /login?redirect=…`.
 *   Used by browser-facing HTML pages.
 */
export type ProtectionMode = 'json' | 'redirect';

/**
 * Internal shape of the route-level marker. The Symbol key keeps it
 * private to this module; the value is the protection mode for the
 * route.
 */
interface ProtectionMarker {
  [PROTECTION_CONFIG_KEY]: { mode: ProtectionMode };
}

/**
 * Options accepted by {@link requireAuth}.
 */
export interface RequireAuthOptions {
  /** Defaults to `'json'`. */
  mode?: ProtectionMode;
}

/**
 * Build a Fastify route-config marker that opts the route into the
 * authentication preHandler. Spread the result into `route.config` (or
 * the shorthand route definition's `config:` field):
 *
 * ```ts
 * fastify.get('/api/leads', { config: requireAuth() }, async () => …);
 * fastify.get('/leads', { config: requireAuth({ mode: 'redirect' }) }, …);
 * ```
 *
 * Returns a plain object with a Symbol key — Fastify merges any
 * additional properties on `config` without complaint.
 */
export function requireAuth(options: RequireAuthOptions = {}): ProtectionMarker {
  return {
    [PROTECTION_CONFIG_KEY]: {
      mode: options.mode ?? 'json',
    },
  };
}

/**
 * Read the protection marker (if any) off a Fastify request's resolved
 * route config. Returns `null` for routes that did not opt in via
 * {@link requireAuth}.
 */
function readProtection(request: FastifyRequest): { mode: ProtectionMode } | null {
  // `routeOptions.config` is the recommended access path in Fastify v4
  // (see types/request.d.ts). The Fastify-side type doesn't include an
  // index signature so we route through `unknown` before reading our
  // Symbol-keyed marker — the alternative would be polluting the public
  // `FastifyContextConfig` augmentation with our private key.
  const rawConfig: unknown = request.routeOptions?.config;
  if (rawConfig === undefined || rawConfig === null) return null;
  const marker = (rawConfig as Record<symbol, unknown>)[PROTECTION_CONFIG_KEY];
  if (marker === undefined) return null;
  return marker as { mode: ProtectionMode };
}

/**
 * Plugin options for {@link authPlugin}.
 */
export interface AuthPluginOptions {
  /**
   * Session store used to validate the cookie on each protected
   * request. Injected so production code can supply
   * {@link RedisSessionStore} and tests can supply a fake.
   */
  sessionStore: SessionStore;
}

/**
 * Implementation of the auth plugin. Wrapped with `fastify-plugin` at
 * the bottom of the file so the `request.session` decorator escapes
 * the inner encapsulation context and is visible to every route in the
 * application (or, more precisely, every route registered after this
 * plugin in the same scope).
 */
const authPluginImpl: FastifyPluginAsync<AuthPluginOptions> = async (fastify, opts) => {
  const { sessionStore } = opts;

  // Decorate at registration time so accessing `request.session` on a
  // route that doesn't trigger the preHandler doesn't throw a
  // "FST_ERR_DEC_UNDECLARED" error. `undefined` is a valid initial
  // value because the type is `AuthSession | undefined`.
  if (!fastify.hasRequestDecorator('session')) {
    fastify.decorateRequest('session', undefined);
  }

  fastify.addHook('preHandler', async (request, reply) => {
    const protection = readProtection(request);
    if (protection === null) {
      // Route is public — leave `request.session` as-is and continue.
      return;
    }

    const sessionId = parseSessionCookie(request.headers.cookie);
    if (sessionId === null) {
      return denyUnauthenticated(request, reply, protection.mode);
    }

    const result = await validateSession(sessionStore, sessionId);
    if (!result.ok) {
      return denyUnauthenticated(request, reply, protection.mode);
    }

    // Success — expose the session for downstream handlers (RBAC Guard,
    // tenant-scoped repositories, audit logging).
    request.session = result.value;
  });
};

/**
 * Reply with the appropriate "you need to log in" response based on
 * the route's `protectionMode`.
 *
 * Why we return 401 even on the redirect path: R1.3 says the System
 * SHALL **deny** unauthenticated requests. A bare 302 looks identical
 * to a normal navigation and would silently swallow the failure for
 * API clients that follow redirects automatically. Returning 401 keeps
 * the failure observable while still steering browsers to the login
 * page via the `Location` header. Per Fastify's `reply.redirect` API
 * we pass the URL first and the status code second.
 */
function denyUnauthenticated(
  request: FastifyRequest,
  reply: FastifyReply,
  mode: ProtectionMode,
): FastifyReply {
  if (mode === 'redirect') {
    const redirectTarget = `/login?redirect=${encodeURIComponent(request.url)}`;
    return reply.redirect(redirectTarget, 401);
  }
  return reply.code(401).send({ error: 'AUTH', message: 'Session expired' });
}

/**
 * Plugin export wrapped with fastify-plugin so the `request.session`
 * decorator is available outside the plugin's encapsulation context.
 *
 * `name` and `fastify` ranges are declared explicitly so name-based
 * dependency declarations elsewhere (e.g. an RBAC guard plugin that
 * lists `'leads-generator-auth'` in its `dependencies`) keep working
 * even if this file is moved.
 */
export const authPlugin = fp(authPluginImpl, {
  name: 'leads-generator-auth',
  fastify: '5.x',
});

// ---------------------------------------------------------------------------
// FastifyRequest augmentation
// ---------------------------------------------------------------------------
//
// Adds `session?: AuthSession` to `FastifyRequest` so consumers get type
// completion on `request.session.userId` etc. The augmentation is module
// scoped — importing this file (or anything that re-exports from it,
// like `./index.ts`) is enough to pull it into a TypeScript project.

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Authenticated session attached by {@link authPlugin}. `undefined`
     * for public routes; set to a validated {@link AuthSession} after a
     * protected route's preHandler runs successfully.
     */
    session?: AuthSession;
  }
}
