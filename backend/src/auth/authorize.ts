/**
 * Fastify-friendly `authorizeAction` preHandler factory.
 *
 * Wires the RBAC Guard in front of the Tenant Guard step on the request
 * pipeline (design.md → Alur Permintaan Berbasis Peran). Each preHandler
 * built by {@link authorizeAction} performs four steps in order:
 *
 *   1. Require an authenticated `request.session` previously attached by
 *      the auth plugin (Task 3.6). Missing → 401 `AUTH`.
 *   2. Resolve the User's *effective* role for the session's `teamId`
 *      from the source of truth via the injected
 *      {@link EffectiveRoleResolver}. Per R2.3 this lookup happens on
 *      every authorized request so role changes take effect on the next
 *      request without forcing a re-login.
 *   3. Apply the static `rbacGuard.can(role, action)` matrix lookup.
 *      Disallowed → 403 `AUTHORIZATION` with the canonical
 *      {@link AppError} shape `{ code: 'AUTHORIZATION', message: 'Forbidden' }`.
 *   4. On success, expose `request.teamId` and `request.effectiveRole` so
 *      the Tenant Guard step (and downstream domain services) can scope
 *      every query without re-deriving them.
 *
 * Design references:
 * - design.md → Alur Permintaan Berbasis Peran (RBAC → Tenant Guard order)
 * - design.md → Components and Interfaces → Auth/RBAC Guard & Tenant Guard
 * - Requirements: R2.3 (effective role read on every authorized request).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Action, AppError, AuthSession, Role } from '@leads-generator/shared';

import type { EffectiveRoleResolver } from './effective-role.js';
import { rbacGuard } from './rbac.js';

/**
 * Augment Fastify's `FastifyRequest` so downstream handlers see the
 * `session`, `teamId`, and `effectiveRole` properties this preHandler
 * populates. `session` is set by the auth plugin (Task 3.6); the other
 * two are set by {@link authorizeAction} after a successful authorization.
 *
 * Marked optional because not every route is behind `authorizeAction`
 * (e.g. login, public health checks).
 */
declare module 'fastify' {
  interface FastifyRequest {
    session?: AuthSession;
    teamId?: string;
    effectiveRole?: Role;
  }
}

/**
 * Dependencies injected into {@link authorizeAction}. Kept as a context
 * object so additional collaborators (audit logger, metrics, etc.) can be
 * added later without breaking the call site signature.
 */
export interface AuthorizeContext {
  /**
   * Resolver used to look up the effective role per request. Injecting
   * the resolver lets callers decide between the cache-free
   * `DbEffectiveRoleResolver` and the short-TTL
   * `CachedEffectiveRoleResolver` without changing this module.
   */
  resolver: EffectiveRoleResolver;
}

/**
 * Build a Fastify preHandler that authorizes the current request to
 * perform `action`.
 *
 * The returned handler resolves to `void` on success — Fastify treats
 * that as "continue". On failure it sends a 401/403 response with the
 * canonical {@link AppError} JSON shape and returns; Fastify will then
 * short-circuit the rest of the pipeline.
 */
export function authorizeAction(
  ctx: AuthorizeContext,
  action: Action,
): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function authorizePreHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const session = req.session;
    if (session === undefined) {
      const error: AppError = {
        code: 'AUTH',
        errorCode: 'AUTH_SESSION_MISSING',
        message: 'Authentication required',
      };
      await reply.code(401).send(error);
      return;
    }

    // R2.3: resolve the *effective* role from the source of truth on
    // every authorized request. We deliberately ignore `session.role`
    // here so a role change persisted while the session was alive takes
    // effect on the next request.
    const effectiveRole = await ctx.resolver.get(session.userId, session.teamId);
    if (effectiveRole === null) {
      const error: AppError = {
        code: 'AUTHORIZATION',
        errorCode: 'AUTH_FORBIDDEN',
        message: 'Forbidden',
      };
      await reply.code(403).send(error);
      return;
    }

    if (!rbacGuard.can(effectiveRole, action)) {
      const error: AppError = {
        code: 'AUTHORIZATION',
        errorCode: 'AUTH_FORBIDDEN',
        message: 'Forbidden',
      };
      await reply.code(403).send(error);
      return;
    }

    // Authorized — expose the resolved tenancy + role context for the
    // downstream Tenant Guard step and domain handlers.
    req.teamId = session.teamId;
    req.effectiveRole = effectiveRole;
  };
}
