/**
 * Shared types and helpers for the tenant-scoped repository layer.
 *
 * Design references:
 * - design.md → Components and Interfaces → Auth/RBAC Guard & Tenant Guard
 *   ("Tenant Guard: setiap query repository WAJIB menerima teamId; tidak ada
 *   akses lintas-team (R2.8)")
 * - design.md → Security → Isolasi tenant (R2.8): repositories never expose
 *   methods that omit `team_id`.
 *
 * Repositories run against either the process-wide `pg.Pool` or a
 * transactional `PoolClient` acquired by `withTransaction`. {@link DbExecutor}
 * is the common surface they need (`query`).
 */

import type { Pool, PoolClient, QueryResultRow } from 'pg';

/**
 * Either a connection pool or a checked-out client inside a transaction.
 *
 * Repositories accept this union so the same instance can be used both in
 * one-shot reads against the pool and inside `withTransaction(tx => …)`.
 */
export type DbExecutor = Pool | PoolClient;

/**
 * Run a parameterized query and return its rows. Strictly typed: callers
 * must specify the row shape so downstream mappers stay type-checked.
 *
 * Always parameterize values with `$1`, `$2`, … — never interpolate.
 */
export async function query<T extends QueryResultRow>(
  db: DbExecutor,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await db.query<T>(sql, params as unknown[] | undefined);
  return result.rows;
}
