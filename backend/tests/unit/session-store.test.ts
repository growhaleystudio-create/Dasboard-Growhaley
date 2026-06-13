/**
 * Unit tests for the {@link RedisSessionStore} (Task 3.1 / R1.5).
 *
 * The tests intentionally do NOT depend on a real Redis instance. We
 * stub only the three commands the implementation calls — `set`, `get`,
 * `del` — using a small Map-backed fake. The store's contract is defined
 * by application-level idle checks (now − lastActivityAt ≥ 30 minutes)
 * rather than by Redis EX precision, so we don't simulate Redis-side TTL
 * eviction; we drive a controllable clock through the constructor's `now`
 * factory instead.
 *
 * Design refs:
 * - design.md → Components and Interfaces → Auth_Service
 * - design.md → Security → Autentikasi
 *
 * Requirements: R1.5 (session expires after 30 minutes of inactivity).
 */

import { describe, it, expect } from 'vitest';

import {
  RedisSessionStore,
  SESSION_IDLE_TIMEOUT_SECONDS,
  type SessionRedis,
} from '../../src/auth/session-store.js';

/**
 * Minimal in-memory stand-in for the subset of the ioredis API the store
 * uses. We track which keys carry an EX (expiry) flag so the test can
 * assert the production code always writes with TTLs, but we don't fire
 * timers — application-level idle checks are what we exercise.
 */
class FakeRedis implements SessionRedis {
  public readonly store = new Map<string, string>();
  public readonly keysWithExpiry = new Set<string>();

  /**
   * Mirrors the `set(key, value, 'EX', seconds)` overload used by
   * {@link RedisSessionStore}. The signature is intentionally narrow —
   * other ioredis SET overloads are not implemented because the store
   * never calls them.
   */
  async set(
    key: string,
    value: string,
    mode: 'EX',
    seconds: number,
  ): Promise<'OK'> {
    if (mode !== 'EX') {
      throw new Error(`unexpected SET mode: ${String(mode)}`);
    }
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error(`invalid EX seconds: ${seconds}`);
    }
    this.store.set(key, value);
    this.keysWithExpiry.add(key);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const value = this.store.get(key);
    return value === undefined ? null : value;
  }

  async del(key: string): Promise<number> {
    const existed = this.store.delete(key);
    this.keysWithExpiry.delete(key);
    return existed ? 1 : 0;
  }
}

/**
 * Controllable wall clock. `advance(ms)` moves the clock forward so we
 * can exercise the 30-minute idle threshold deterministically.
 */
class FakeClock {
  private current: Date;
  constructor(start: Date) {
    this.current = start;
  }
  now = (): Date => new Date(this.current.getTime());
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
  set(date: Date): void {
    this.current = date;
  }
}

const sessionInput = {
  userId: 'user-1',
  teamId: 'team-1',
  role: 'member' as const,
};

describe('RedisSessionStore', () => {
  it('create() stores a session with createdAt/lastActivityAt and a TTL', async () => {
    const redis = new FakeRedis();
    const clock = new FakeClock(new Date('2024-01-01T00:00:00.000Z'));
    const store = new RedisSessionStore(redis, clock.now);

    const { sessionId, session } = await store.create(sessionInput);

    expect(sessionId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sessionId.length).toBeGreaterThan(20);
    expect(session.userId).toBe('user-1');
    expect(session.teamId).toBe('team-1');
    expect(session.role).toBe('member');
    expect(session.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(session.lastActivityAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');

    const key = `session:${sessionId}`;
    expect(redis.store.has(key)).toBe(true);
    expect(redis.keysWithExpiry.has(key)).toBe(true);
  });

  it('get() returns null after destroy() removes the key', async () => {
    const redis = new FakeRedis();
    const clock = new FakeClock(new Date('2024-01-01T00:00:00.000Z'));
    const store = new RedisSessionStore(redis, clock.now);

    const { sessionId } = await store.create(sessionInput);
    expect(await store.get(sessionId)).not.toBeNull();

    await store.destroy(sessionId);

    expect(await store.get(sessionId)).toBeNull();
    expect(redis.store.has(`session:${sessionId}`)).toBe(false);
  });

  it('touch() updates lastActivityAt and returns the refreshed session', async () => {
    const redis = new FakeRedis();
    const clock = new FakeClock(new Date('2024-01-01T00:00:00.000Z'));
    const store = new RedisSessionStore(redis, clock.now);

    const { sessionId, session: created } = await store.create(sessionInput);

    // Advance 5 minutes (well within the idle window) and touch.
    clock.advance(5 * 60 * 1000);
    const refreshed = await store.touch(sessionId);

    expect(refreshed).not.toBeNull();
    expect(refreshed?.createdAt.toISOString()).toBe(created.createdAt.toISOString());
    expect(refreshed?.lastActivityAt.toISOString()).toBe('2024-01-01T00:05:00.000Z');

    // A subsequent `get` should observe the refreshed activity timestamp.
    const reread = await store.get(sessionId);
    expect(reread?.lastActivityAt.toISOString()).toBe('2024-01-01T00:05:00.000Z');
  });

  it('get() and touch() return null when the underlying key is missing', async () => {
    const redis = new FakeRedis();
    const store = new RedisSessionStore(redis);

    expect(await store.get('does-not-exist')).toBeNull();
    expect(await store.touch('does-not-exist')).toBeNull();
  });

  it('get() returns null when the session is older than 30 minutes (idle expired)', async () => {
    const redis = new FakeRedis();
    const clock = new FakeClock(new Date('2024-01-01T00:00:00.000Z'));
    const store = new RedisSessionStore(redis, clock.now);

    const { sessionId } = await store.create(sessionInput);

    // Move 31 minutes forward — past the SESSION_IDLE_TIMEOUT_SECONDS
    // threshold without ever calling touch(). The application-level idle
    // check should now treat the session as expired and clean up the key.
    clock.advance((SESSION_IDLE_TIMEOUT_SECONDS + 60) * 1000);

    expect(await store.get(sessionId)).toBeNull();
    expect(redis.store.has(`session:${sessionId}`)).toBe(false);

    // touch() on the (now removed) key likewise reports expired.
    expect(await store.touch(sessionId)).toBeNull();
  });
});
