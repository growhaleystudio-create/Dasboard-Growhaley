import { describe, it, expect, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';

import { withTransaction } from '../../src/db/transaction.js';

/**
 * Build a mock {@link PoolClient} whose `query` resolves to an empty result
 * by default. Individual tests can override the mock implementation per
 * call to simulate failures of `BEGIN`, `COMMIT`, or `ROLLBACK`.
 */
function makeMockClient(): {
  client: PoolClient;
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const release = vi.fn();
  // Cast through unknown because we only stub the surface that
  // `withTransaction` actually touches.
  const client = { query, release } as unknown as PoolClient;
  return { client, query, release };
}

function makeMockPool(client: PoolClient): Pool {
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
  return pool;
}

describe('withTransaction', () => {
  it('commits and returns the value when the callback resolves', async () => {
    const { client, query, release } = makeMockClient();
    const pool = makeMockPool(client);

    const result = await withTransaction(pool, async (tx) => {
      // Sanity check: the client passed in is the one from the pool.
      expect(tx).toBe(client);
      await tx.query('SELECT 1');
      return 'ok' as const;
    });

    expect(result).toBe('ok');
    // BEGIN, the user's SELECT, and COMMIT — in that order.
    expect(query.mock.calls.map((c) => c[0])).toEqual(['BEGIN', 'SELECT 1', 'COMMIT']);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and re-throws when the callback rejects', async () => {
    const { client, query, release } = makeMockClient();
    const pool = makeMockPool(client);

    const boom = new Error('boom');

    await expect(
      withTransaction(pool, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(query.mock.calls.map((c) => c[0])).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases the client even when ROLLBACK itself fails', async () => {
    const { client, query, release } = makeMockClient();
    const pool = makeMockPool(client);

    const original = new Error('original failure');
    const rollbackErr = new Error('rollback failure');

    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN') return { rows: [], rowCount: 0 };
      if (sql === 'ROLLBACK') throw rollbackErr;
      return { rows: [], rowCount: 0 };
    });

    await expect(
      withTransaction(pool, async () => {
        throw original;
      }),
    ).rejects.toBe(original);

    expect(query.mock.calls.map((c) => c[0])).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('propagates COMMIT failures without silently swallowing them', async () => {
    const { client, query, release } = makeMockClient();
    const pool = makeMockPool(client);

    const commitErr = new Error('commit failed');
    query.mockImplementation(async (sql: string) => {
      if (sql === 'COMMIT') throw commitErr;
      return { rows: [], rowCount: 0 };
    });

    await expect(
      withTransaction(pool, async () => {
        return 42;
      }),
    ).rejects.toBe(commitErr);

    // COMMIT failed → catch branch runs ROLLBACK, then release.
    expect(query.mock.calls.map((c) => c[0])).toEqual(['BEGIN', 'COMMIT', 'ROLLBACK']);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
