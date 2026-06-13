/**
 * Redis client factories for the backend.
 *
 * Two distinct clients are exposed because BullMQ and the session store
 * have incompatible reliability expectations:
 *
 * - **Queue client** ({@link createRedisClient}) is consumed by BullMQ.
 *   BullMQ's documentation requires `maxRetriesPerRequest: null` on the
 *   underlying ioredis instance because its blocking commands (e.g.
 *   `BRPOPLPUSH`) must wait indefinitely; ioredis's default of 20 retries
 *   would otherwise abort long-running blocking calls and corrupt queue
 *   semantics. See https://docs.bullmq.io/guide/connections (paraphrased
 *   for licensing compliance).
 * - **Session client** ({@link createRedisSessionClient}) keeps ioredis's
 *   default retry behaviour (`maxRetriesPerRequest = 20`). Sessions are
 *   short request/response operations where bounded retries are exactly
 *   the desired failure mode — a transient network blip should not stall
 *   an HTTP request indefinitely.
 *
 * Both factories accept an explicit Redis connection string so unit tests
 * can construct disposable clients without touching `process.env`.
 *
 * Design refs:
 * - Architecture → Pilihan Teknologi: Redis as session store + queue
 *   backend (BullMQ).
 */

import { Redis, type RedisOptions } from 'ioredis';

/**
 * Build a Redis client suitable for BullMQ producers/workers.
 *
 * - `maxRetriesPerRequest: null` — required by BullMQ for blocking ops.
 * - `enableReadyCheck: true` — wait for Redis to report `ready` before the
 *   first command so queue workers do not start consuming against an
 *   uninitialised replica.
 */
export function createRedisClient(connectionString: string): Redis {
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
  const client = new Redis(connectionString, options);
  client.on('error', (error) => {
    console.warn(`[redis:queue] ${error.message}`);
  });
  return client;
}

/**
 * Build a Redis client suitable for the session store.
 *
 * Leaves ioredis's defaults intact so transient command failures bubble up
 * to the request handler quickly instead of being retried indefinitely.
 */
export function createRedisSessionClient(connectionString: string): Redis {
  const client = new Redis(connectionString);
  client.on('error', (error) => {
    console.warn(`[redis:session] ${error.message}`);
  });
  return client;
}

/**
 * Gracefully shut down a Redis client. Uses `quit()` so any in-flight
 * commands are flushed before the connection closes; falls back to
 * `disconnect()` if `quit` rejects (e.g. when the server is already gone).
 */
export async function closeRedisClient(client: Redis): Promise<void> {
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
