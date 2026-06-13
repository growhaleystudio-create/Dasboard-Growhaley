/**
 * Effective-role resolution for the RBAC Guard.
 *
 * Per requirement R2.3 (and design.md → Alur Permintaan Berbasis Peran →
 * Catatan R2.3) the effective role MUST be read from the source of truth
 * on **every** authorized request — never from a session token frozen at
 * login. That guarantees a role change (Admin demotes a User from Member
 * to Viewer, or vice versa) takes effect on the User's very next
 * authorized request without forcing a re-login.
 *
 * A short-lived in-memory cache is permitted as an optimization, but only
 * if it offers an explicit `invalidate(userId, teamId)` hook so the
 * role-change endpoint (Task 5.3) can purge a stale entry the moment the
 * role mutates. The default TTL is intentionally tiny (5 seconds) so even
 * without an explicit invalidate, role changes feel near-immediate.
 *
 * Design references:
 * - design.md → Components and Interfaces → Auth/RBAC Guard & Tenant Guard
 * - design.md → Alur Permintaan Berbasis Peran → Catatan R2.3
 */

import type { Role } from '@leads-generator/shared';

import type { MembershipRepository } from './membership-repository.js';

/**
 * Contract for resolving a User's effective role within a Team for the
 * current request. Implementations MUST honour the per-request freshness
 * guarantee described in the module docstring (either by hitting the DB
 * each time, or by wrapping a fresh resolver in an
 * invalidation-aware cache with a short TTL).
 */
export interface EffectiveRoleResolver {
  /**
   * Return the effective {@link Role} for the (`userId`, `teamId`) pair,
   * or `null` if the User has no active membership in the Team.
   *
   * `null` is the canonical "not authorized" signal — callers (e.g. the
   * Fastify `authorizeAction` preHandler) translate it into a 403.
   */
  get(userId: string, teamId: string): Promise<Role | null>;
}

/**
 * Default {@link EffectiveRoleResolver} implementation.
 *
 * Hits the {@link MembershipRepository} on every call. No caching layer —
 * use {@link CachedEffectiveRoleResolver} when you need request-scale
 * batching but want to keep R2.3 semantics.
 *
 * Returns the membership's `role` only when `status === 'active'` so that
 * a `pending` membership does not yet authorize any action through the
 * RBAC Guard. (The R2.5 carve-out for Viewer reads on `pending`
 * memberships is a separate concern handled by the membership/session
 * layer prior to authorization.)
 */
export class DbEffectiveRoleResolver implements EffectiveRoleResolver {
  constructor(private readonly memberships: MembershipRepository) {}

  async get(userId: string, teamId: string): Promise<Role | null> {
    const membership = await this.memberships.findActive(teamId, userId);
    if (membership === null) return null;
    return membership.status === 'active' ? membership.role : null;
  }
}

/**
 * Composite map key used to cache `(userId, teamId)` lookups. We use the
 * NUL byte as a separator to make ambiguity between user/team ids
 * impossible (uuid strings cannot contain NUL).
 */
function cacheKey(userId: string, teamId: string): string {
  return `${userId}\u0000${teamId}`;
}

/**
 * Optional caching wrapper for an {@link EffectiveRoleResolver}.
 *
 * Caches each `(userId, teamId)` resolution for `ttlMs` milliseconds in
 * an in-memory `Map`. Two invariants make the cache safe under R2.3:
 *
 * 1. **Bounded TTL** (default 5 seconds). Even without explicit
 *    invalidation, a stale entry never lives longer than `ttlMs` so role
 *    changes take effect within seconds.
 * 2. **Explicit invalidation hooks**. The role-change endpoint
 *    (Task 5.3) MUST call {@link invalidate} for the affected
 *    `(userId, teamId)` so the next request observes the new role
 *    immediately. {@link invalidateAll} clears the entire cache and is
 *    intended for test/maintenance scenarios.
 *
 * The `now` factory is injectable so unit tests can drive cache
 * expiration deterministically.
 */
export class CachedEffectiveRoleResolver implements EffectiveRoleResolver {
  private cache = new Map<string, { role: Role | null; expiresAt: number }>();

  constructor(
    private readonly inner: EffectiveRoleResolver,
    private readonly ttlMs: number = 5_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async get(userId: string, teamId: string): Promise<Role | null> {
    const key = cacheKey(userId, teamId);
    const cached = this.cache.get(key);
    const currentTime = this.now();
    if (cached !== undefined && cached.expiresAt > currentTime) {
      return cached.role;
    }
    // Either missing or expired — re-fetch from the inner resolver.
    const role = await this.inner.get(userId, teamId);
    this.cache.set(key, { role, expiresAt: currentTime + this.ttlMs });
    return role;
  }

  /**
   * Drop the cached entry (if any) for the given (`userId`, `teamId`)
   * pair. The next {@link get} for that pair will hit the inner resolver
   * and observe the latest role.
   *
   * The role-change endpoint MUST call this whenever it mutates a
   * membership row so R2.3's "next request" guarantee is preserved.
   */
  invalidate(userId: string, teamId: string): void {
    this.cache.delete(cacheKey(userId, teamId));
  }

  /**
   * Clear every cached entry. Intended for test setups and operational
   * controls, not for the request hot path.
   */
  invalidateAll(): void {
    this.cache.clear();
  }
}
