/**
 * BullMQ queue connection helper.
 *
 * BullMQ's `Queue`, `Worker`, and `QueueEvents` constructors all accept an
 * `ioredis` instance via the `connection` option. Sharing a single
 * appropriately-configured instance (see `createRedisClient` in
 * `../redis/client.ts`) avoids holding more sockets than necessary while
 * still satisfying BullMQ's `maxRetriesPerRequest: null` requirement for
 * blocking reads. Reference: https://docs.bullmq.io/guide/connections
 * (paraphrased for licensing compliance).
 *
 * This module is intentionally thin — it does not construct `Queue` or
 * `Worker` instances. Higher layers (workers under R5, R7.10, R11, R13)
 * will pass {@link getQueueConnection}'s return value into BullMQ when they
 * are introduced.
 */

import type { Redis } from 'ioredis';

import { loadEnv } from '../config/env.js';
import { createRedisClient } from '../redis/client.js';

let queueConnection: Redis | null = null;

/**
 * Resolve the singleton Redis connection used by BullMQ producers and
 * workers. Lazy so that environments without queue work (e.g. unit tests)
 * never open a Redis socket.
 */
export function getQueueConnection(): Redis {
  if (!queueConnection) {
    const env = loadEnv();
    queueConnection = createRedisClient(env.REDIS_URL);
  }
  return queueConnection;
}

/**
 * Reset the cached queue connection. Intended for graceful shutdown paths
 * and integration tests; production code should let the process exit close
 * the socket.
 */
export function resetQueueConnection(): void {
  queueConnection = null;
}
