/**
 * Unit tests for {@link DbEffectiveRoleResolver} and
 * {@link CachedEffectiveRoleResolver} (Task 4.3 / R2.3).
 *
 * These tests verify the per-request freshness contract from design.md →
 * Alur Permintaan Berbasis Peran → Catatan R2.3:
 *
 * - The DB-backed resolver returns the role of an `active` membership and
 *   `null` for missing or `pending` memberships (the latter so a pending
 *   membership cannot grant any RBAC capability through the guard).
 * - The cached resolver hits the inner resolver at most once per TTL
 *   window, refreshes after the window elapses, and exposes an explicit
 *   `invalidate(userId, teamId)` hook so the role-change endpoint can
 *   force a re-fetch the moment the underlying role mutates.
 *
 * No real database — `MembershipRepository` is faked at the smallest
 * surface the resolver depends on (`findActive`).
 */

import { describe, it, expect } from 'vitest';
import type { Membership } from '@leads-generator/shared';

import {
  CachedEffectiveRoleResolver,
  DbEffectiveRoleResolver,
  type EffectiveRoleResolver,
} from '../../src/auth/effective-role.js';
import type { MembershipRepository } from '../../src/auth/membership-repository.js';

/**
 * Minimal stand-in for {@link MembershipRepository}. Only `findActive` is
 * implemented because that's the sole method the DB-backed resolver
 * touches.
 */
class FakeMembershipRepo {
  public calls = 0;
  constructor(private readonly result: Membership | null) {}
  async findActive(_teamId: string, _userId: string): Promise<Membership | null> {
    this.calls += 1;
    return this.result;
  }
}

/**
 * In-memory clock for the cached resolver. Exposes `now` as an arrow
 * function so it can be passed straight to the resolver constructor.
 */
class FakeClock {
  private current: number;
  constructor(start = 1_000_000) {
    this.current = start;
  }
  now = (): number => this.current;
  advance(ms: number): void {
    this.current += ms;
  }
}

/**
 * Tracking inner resolver used by cache tests. Each call records its
 * arguments so we can assert how many times the cache fell through.
 */
class TrackingResolver implements EffectiveRoleResolver {
  public readonly calls: Array<[string, string]> = [];
  constructor(private readonly impl: (userId: string, teamId: string) => Membership['role'] | null) {}
  async get(userId: string, teamId: string) {
    this.calls.push([userId, teamId]);
    return this.impl(userId, teamId);
  }
}

describe('DbEffectiveRoleResolver', () => {
  it('returns the role for an active membership', async () => {
    const repo = new FakeMembershipRepo({
      teamId: 'team-1',
      userId: 'user-1',
      role: 'member',
      status: 'active',
    });
    const resolver = new DbEffectiveRoleResolver(repo as unknown as MembershipRepository);

    const role = await resolver.get('user-1', 'team-1');

    expect(role).toBe('member');
    expect(repo.calls).toBe(1);
  });

  it('returns null when the membership is missing', async () => {
    const repo = new FakeMembershipRepo(null);
    const resolver = new DbEffectiveRoleResolver(repo as unknown as MembershipRepository);

    const role = await resolver.get('user-1', 'team-1');

    expect(role).toBeNull();
    expect(repo.calls).toBe(1);
  });

  it('returns null when the membership status is pending', async () => {
    const repo = new FakeMembershipRepo({
      teamId: 'team-1',
      userId: 'user-1',
      role: 'admin',
      status: 'pending',
    });
    const resolver = new DbEffectiveRoleResolver(repo as unknown as MembershipRepository);

    const role = await resolver.get('user-1', 'team-1');

    expect(role).toBeNull();
    expect(repo.calls).toBe(1);
  });
});

describe('CachedEffectiveRoleResolver', () => {
  it('hits the inner resolver only once within the TTL window', async () => {
    const inner = new TrackingResolver(() => 'member');
    const clock = new FakeClock();
    const cache = new CachedEffectiveRoleResolver(inner, 5_000, clock.now);

    const first = await cache.get('user-1', 'team-1');
    // Advance well within the 5s TTL — the cached value should be served.
    clock.advance(1_000);
    const second = await cache.get('user-1', 'team-1');
    clock.advance(3_000);
    const third = await cache.get('user-1', 'team-1');

    expect(first).toBe('member');
    expect(second).toBe('member');
    expect(third).toBe('member');
    expect(inner.calls).toHaveLength(1);
  });

  it('re-fetches after the TTL expires', async () => {
    let currentRole: 'admin' | 'member' = 'admin';
    const inner = new TrackingResolver(() => currentRole);
    const clock = new FakeClock();
    const cache = new CachedEffectiveRoleResolver(inner, 5_000, clock.now);

    const first = await cache.get('user-1', 'team-1');
    expect(first).toBe('admin');
    expect(inner.calls).toHaveLength(1);

    // Mutate the underlying role and step past the TTL window. The
    // cache must observe the new role on the next call.
    currentRole = 'member';
    clock.advance(5_001);
    const second = await cache.get('user-1', 'team-1');

    expect(second).toBe('member');
    expect(inner.calls).toHaveLength(2);
  });

  it('caches null results so missing memberships do not re-hit the inner resolver', async () => {
    const inner = new TrackingResolver(() => null);
    const clock = new FakeClock();
    const cache = new CachedEffectiveRoleResolver(inner, 5_000, clock.now);

    const first = await cache.get('user-1', 'team-1');
    const second = await cache.get('user-1', 'team-1');

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(inner.calls).toHaveLength(1);
  });

  it('invalidate() forces a re-fetch on the next get()', async () => {
    let currentRole: 'admin' | 'member' = 'admin';
    const inner = new TrackingResolver(() => currentRole);
    const clock = new FakeClock();
    const cache = new CachedEffectiveRoleResolver(inner, 60_000, clock.now);

    const first = await cache.get('user-1', 'team-1');
    expect(first).toBe('admin');
    expect(inner.calls).toHaveLength(1);

    // Simulate the role-change endpoint: mutate the underlying role
    // and explicitly invalidate the cached entry. The very next get()
    // MUST hit the inner resolver and observe the new role, even though
    // we are still well within the TTL window.
    currentRole = 'viewer';
    cache.invalidate('user-1', 'team-1');

    const second = await cache.get('user-1', 'team-1');

    expect(second).toBe('viewer');
    expect(inner.calls).toHaveLength(2);
  });

  it('invalidate() only purges the targeted (userId, teamId) pair', async () => {
    const inner = new TrackingResolver((userId) =>
      userId === 'user-1' ? 'admin' : 'member',
    );
    const clock = new FakeClock();
    const cache = new CachedEffectiveRoleResolver(inner, 60_000, clock.now);

    await cache.get('user-1', 'team-1');
    await cache.get('user-2', 'team-1');
    expect(inner.calls).toHaveLength(2);

    cache.invalidate('user-1', 'team-1');

    // user-1 must re-fetch; user-2 must still be cached.
    await cache.get('user-1', 'team-1');
    await cache.get('user-2', 'team-1');
    expect(inner.calls).toHaveLength(3);
  });

  it('invalidateAll() clears every entry', async () => {
    const inner = new TrackingResolver(() => 'member');
    const cache = new CachedEffectiveRoleResolver(inner, 60_000);

    await cache.get('user-1', 'team-1');
    await cache.get('user-2', 'team-1');
    expect(inner.calls).toHaveLength(2);

    cache.invalidateAll();

    await cache.get('user-1', 'team-1');
    await cache.get('user-2', 'team-1');
    expect(inner.calls).toHaveLength(4);
  });
});
