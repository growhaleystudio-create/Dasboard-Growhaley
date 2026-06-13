/**
 * Transactional helper for PostgreSQL.
 *
 * Wraps a unit of work in `BEGIN` / `COMMIT` / `ROLLBACK` against a single
 * pooled client. The helper is the canonical way to satisfy the
 * "all-or-nothing" guarantee called out in the design:
 *
 * - **Error Handling → Pola Transaksi & Kompensasi**
 * - **Desain Scoring_Model → Penanganan unscored & Transaksionalitas (R7.9)**
 *
 * Guarantees provided by {@link withTransaction}:
 * 1. The supplied `fn` always runs against a single dedicated client; that
 *    client is the only argument it receives so it cannot accidentally use
 *    the pool directly and bypass the transaction.
 * 2. If `fn` resolves, `COMMIT` is issued and its return value is forwarded
 *    to the caller. A failing `COMMIT` propagates as the thrown error — it
 *    is never silently swallowed.
 * 3. If `fn` rejects (or `COMMIT` itself fails), `ROLLBACK` is attempted
 *    once. A failure of the rollback is intentionally suppressed so the
 *    original error reaches the caller; the pool will reset the connection
 *    on release.
 * 4. The client is always returned to the pool via `release()` regardless
 *    of outcome.
 *
 * Callers should treat thrown errors as the failure signal. Wrap the call
 * in domain-specific error mapping when a `Result<T>` style is desired.
 */

import type { Pool, PoolClient } from 'pg';

/** Alias used by callers to make transactional intent obvious in signatures. */
export type Tx = PoolClient;

/**
 * Run `fn` inside a single PostgreSQL transaction acquired from `pool`.
 *
 * @example
 * ```ts
 * const lead = await withTransaction(pool, async (tx) => {
 *   await tx.query('INSERT INTO lead ...');
 *   await tx.query('INSERT INTO score_contribution ...');
 *   return loadLead(tx, id);
 * });
 * ```
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Intentionally swallowed: the original error is what callers care
      // about, and the pool will discard the broken connection on release.
    }
    throw err;
  } finally {
    client.release();
  }
}
