/**
 * PostgreSQL connection pool factory and process-wide singleton.
 *
 * Design references:
 * - Architecture → Pilihan Teknologi & Alasan: PostgreSQL as the primary
 *   relational store with ACID transactions backing the scoring engine.
 * - Error Handling → Pola Transaksi & Kompensasi: callers wrap multi-step
 *   work via `withTransaction(tx => …)` (see `./transaction.ts`).
 *
 * The factory accepts an explicit connection string so unit tests can build
 * disposable pools without touching `process.env`. {@link getPool} resolves
 * the connection string lazily via {@link loadEnv} the first time it's
 * called and caches the resulting pool.
 */

import pg from 'pg';
import type { PoolConfig, Pool } from 'pg';
const PgPool = pg.Pool;

import { loadEnv } from '../config/env.js';

/**
 * Sensible defaults for the API/worker pool. Values are intentionally
 * conservative — `statement_timeout` guards against runaway queries that
 * would otherwise tie up a connection indefinitely.
 */
const DEFAULT_POOL_OPTIONS: Omit<PoolConfig, 'connectionString'> = {
  max: 10,
  idleTimeoutMillis: 30_000,
  // Postgres-side hard cap on any single statement. 30s matches the longest
  // synchronous flow (connector activation, R3.4) so background-friendly
  // queries are not affected.
  statement_timeout: 30_000,
};

/**
 * Build a fresh `pg.Pool` for the given connection string.
 *
 * Each call returns an independent pool; callers are responsible for
 * closing it via {@link closePool} (or `pool.end()`).
 */
export function createPgPool(connectionString: string): Pool {
  return new PgPool({
    connectionString,
    ...DEFAULT_POOL_OPTIONS,
  });
}

let singleton: Pool | null = null;

/**
 * Return the process-wide singleton pool, creating it on first access from
 * the validated environment configuration. Tests that need to inject a
 * different pool should depend on {@link createPgPool} directly rather than
 * mutating this singleton.
 */
export function getPool(): Pool {
  if (!singleton) {
    const env = loadEnv();
    singleton = createPgPool(env.DATABASE_URL);
  }
  return singleton;
}

/**
 * Gracefully close the singleton pool (if any) or a pool the caller wishes
 * to dispose of explicitly. Safe to call multiple times — when no pool is
 * active the call resolves immediately.
 */
export async function closePool(pool?: Pool): Promise<void> {
  const target = pool ?? singleton;
  if (!target) {
    return;
  }
  await target.end();
  if (target === singleton) {
    singleton = null;
  }
}
