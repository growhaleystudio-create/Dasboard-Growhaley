/**
 * Server-side session store for the Auth_Service (R1.5).
 *
 * Sessions live in Redis under keys of the form `session:{sessionId}` and
 * store a JSON-serialised {@link AuthSession}. Two layers of expiry work
 * together so the 30-minute idle timeout is enforced regardless of clock
 * skew between Redis and the application:
 *
 * 1. **Redis TTL** — every write uses `SET ... EX SESSION_IDLE_TIMEOUT_SECONDS`,
 *    so even if the application never touches a key Redis evicts it once
 *    the timeout passes. Each successful activity refreshes the TTL.
 * 2. **Application-level idle check** — `get`/`touch` re-read
 *    `lastActivityAt` and compare it to the current wall clock. If the
 *    delta is ≥ 30 minutes the key is deleted and `null` is returned.
 *    This guards against a (theoretical) Redis TTL drift and keeps the
 *    semantics deterministic for unit tests that don't simulate Redis EX
 *    precisely.
 *
 * Design refs:
 * - design.md → Components and Interfaces → Auth_Service
 * - design.md → Security → Autentikasi
 *
 * Requirements: R1.5 (idle session expiry after 30 minutes).
 */

import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { AuthSession } from '@leads-generator/shared';

/**
 * Idle timeout in seconds (30 minutes) — both the Redis EX value and the
 * application-level threshold beyond which a session is considered stale.
 */
export const SESSION_IDLE_TIMEOUT_SECONDS = 30 * 60;

/**
 * Persisted JSON shape. `createdAt` / `lastActivityAt` are stored as ISO
 * strings because Redis values are strings; we coerce them back into
 * `Date` instances on read.
 */
interface SerializedSession {
  userId: string;
  teamId: string;
  role: AuthSession['role'];
  createdAt: string;
  lastActivityAt: string;
}

/**
 * Abstract session store contract used by `validateSession` and the
 * Auth_Service login/logout flows. Implementations MUST honour the idle
 * timeout semantics described in the module docstring.
 */
export interface SessionStore {
  /**
   * Create a fresh session record and return the generated `sessionId`
   * alongside the materialised {@link AuthSession} (with `createdAt` /
   * `lastActivityAt` populated).
   */
  create(
    session: Omit<AuthSession, 'createdAt' | 'lastActivityAt'>,
  ): Promise<{ sessionId: string; session: AuthSession }>;

  /**
   * Read the session by id. Returns `null` if the session does not exist
   * OR the application-level idle threshold has been crossed (in which
   * case the underlying record is deleted as a side effect).
   */
  get(sessionId: string): Promise<AuthSession | null>;

  /**
   * Refresh `lastActivityAt` to "now" and extend the Redis TTL. Returns
   * the updated session, or `null` if the session is missing/expired.
   *
   * Used by `validateSession` so any authenticated request both checks
   * AND extends the user's idle window in one round-trip.
   */
  touch(sessionId: string): Promise<AuthSession | null>;

  /**
   * Forget the session record. Used on explicit logout (R1.4) and
   * whenever the application-level idle check finds a stale entry.
   */
  destroy(sessionId: string): Promise<void>;
}

/**
 * Subset of {@link Redis} surface we depend on. Restricting the type here
 * lets unit tests provide a minimal in-memory fake without faking the
 * entire ioredis API.
 */
export type SessionRedis = Pick<Redis, 'set' | 'get' | 'del'>;

/**
 * Build the canonical Redis key for a given `sessionId`.
 */
function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * Generate a 32-byte random session id encoded as a URL-safe base64
 * string. 32 bytes (256 bits) of entropy is enough to make session-id
 * guessing infeasible.
 */
function generateSessionId(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Serialise an {@link AuthSession} for storage in Redis.
 */
function serialize(session: AuthSession): string {
  const payload: SerializedSession = {
    userId: session.userId,
    teamId: session.teamId,
    role: session.role,
    createdAt: session.createdAt.toISOString(),
    lastActivityAt: session.lastActivityAt.toISOString(),
  };
  return JSON.stringify(payload);
}

/**
 * Parse a Redis-stored JSON blob back into an {@link AuthSession}.
 *
 * Throws on malformed payloads — callers (`get`/`touch`) treat that as
 * "session missing" and clean up the key.
 */
function deserialize(raw: string): AuthSession {
  const parsed = JSON.parse(raw) as SerializedSession;
  return {
    userId: parsed.userId,
    teamId: parsed.teamId,
    role: parsed.role,
    createdAt: new Date(parsed.createdAt),
    lastActivityAt: new Date(parsed.lastActivityAt),
  };
}

/**
 * `true` when a session's `lastActivityAt` is at least
 * `SESSION_IDLE_TIMEOUT_SECONDS` in the past relative to `now`.
 */
function isIdleExpired(session: AuthSession, now: Date): boolean {
  const idleMs = now.getTime() - session.lastActivityAt.getTime();
  return idleMs >= SESSION_IDLE_TIMEOUT_SECONDS * 1000;
}

/**
 * Redis-backed implementation of {@link SessionStore}.
 *
 * Constructed with an injected Redis client so production code passes in
 * a real ioredis instance (see `createRedisSessionClient`) and tests can
 * inject a lightweight fake.
 *
 * The optional `now` factory exists so tests can drive the clock
 * deterministically; it defaults to `Date.now`-based wall time.
 */
export class RedisSessionStore implements SessionStore {
  private readonly redis: SessionRedis;
  private readonly now: () => Date;

  constructor(redis: SessionRedis, now: () => Date = () => new Date()) {
    this.redis = redis;
    this.now = now;
  }

  async create(
    session: Omit<AuthSession, 'createdAt' | 'lastActivityAt'>,
  ): Promise<{ sessionId: string; session: AuthSession }> {
    const sessionId = generateSessionId();
    const now = this.now();
    const fullSession: AuthSession = {
      ...session,
      createdAt: now,
      lastActivityAt: now,
    };
    await this.redis.set(
      sessionKey(sessionId),
      serialize(fullSession),
      'EX',
      SESSION_IDLE_TIMEOUT_SECONDS,
    );
    return { sessionId, session: fullSession };
  }

  async get(sessionId: string): Promise<AuthSession | null> {
    const raw = await this.redis.get(sessionKey(sessionId));
    if (raw === null) {
      return null;
    }
    let session: AuthSession;
    try {
      session = deserialize(raw);
    } catch {
      // Malformed payload — treat as missing and clean up.
      await this.redis.del(sessionKey(sessionId));
      return null;
    }
    if (isIdleExpired(session, this.now())) {
      await this.redis.del(sessionKey(sessionId));
      return null;
    }
    return session;
  }

  async touch(sessionId: string): Promise<AuthSession | null> {
    const existing = await this.get(sessionId);
    if (existing === null) {
      return null;
    }
    const refreshed: AuthSession = {
      ...existing,
      lastActivityAt: this.now(),
    };
    await this.redis.set(
      sessionKey(sessionId),
      serialize(refreshed),
      'EX',
      SESSION_IDLE_TIMEOUT_SECONDS,
    );
    return refreshed;
  }

  async destroy(sessionId: string): Promise<void> {
    await this.redis.del(sessionKey(sessionId));
  }
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, MemoryEntry>();
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  async create(
    session: Omit<AuthSession, 'createdAt' | 'lastActivityAt'>,
  ): Promise<{ sessionId: string; session: AuthSession }> {
    const sessionId = generateSessionId();
    const now = this.now();
    const fullSession: AuthSession = {
      ...session,
      createdAt: now,
      lastActivityAt: now,
    };
    this.sessions.set(sessionId, {
      value: serialize(fullSession),
      expiresAt: now.getTime() + SESSION_IDLE_TIMEOUT_SECONDS * 1000,
    });
    return { sessionId, session: fullSession };
  }

  async get(sessionId: string): Promise<AuthSession | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    const now = this.now();
    if (entry.expiresAt <= now.getTime()) {
      this.sessions.delete(sessionId);
      return null;
    }

    let session: AuthSession;
    try {
      session = deserialize(entry.value);
    } catch {
      this.sessions.delete(sessionId);
      return null;
    }
    if (isIdleExpired(session, now)) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  async touch(sessionId: string): Promise<AuthSession | null> {
    const existing = await this.get(sessionId);
    if (!existing) return null;
    const refreshed: AuthSession = {
      ...existing,
      lastActivityAt: this.now(),
    };
    this.sessions.set(sessionId, {
      value: serialize(refreshed),
      expiresAt: refreshed.lastActivityAt.getTime() + SESSION_IDLE_TIMEOUT_SECONDS * 1000,
    });
    return refreshed;
  }

  async destroy(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}
