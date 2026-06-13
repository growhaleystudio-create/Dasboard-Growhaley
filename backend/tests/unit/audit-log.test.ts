/**
 * Locks in the SQL shape and parameter mapping of `DbAuditLog` (Task 16.1,
 * R11.8). The Audit_Log must write exactly one parameterized INSERT into
 * `audit_log` with [teamId, actorId, action, objectType, objectId,
 * metadataJson], let the DB stamp `at`, and accept the literal `'system'`
 * actor. `recordTx` must run on the supplied transaction, not on the
 * construction-time executor.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';

import { DbAuditLog, type AuditEntry } from '../../src/privacy/audit-log.js';
import type { Tx } from '../../src/db/transaction.js';

/** Build a mock executor whose `.query` we can inspect. */
function makeMockExecutor() {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return { db: { query } as unknown as Pool, query };
}

const baseEntry: AuditEntry = {
  teamId: '11111111-1111-1111-1111-111111111111',
  actorId: '22222222-2222-2222-2222-222222222222',
  action: 'delete',
  objectType: 'lead',
  objectId: '33333333-3333-3333-3333-333333333333',
};

describe('DbAuditLog.record', () => {
  it('issues a single parameterized INSERT into audit_log with the mapped params', async () => {
    const { db, query } = makeMockExecutor();
    const log = new DbAuditLog(db);

    await log.record({ ...baseEntry, metadata: { reason: 'dsar' } });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(typeof sql).toBe('string');
    expect((sql as string).toLowerCase()).toContain('insert into audit_log');
    // `at` is stamped by the DB default, never passed by the caller.
    expect((sql as string).toLowerCase()).not.toContain(' at ');

    expect(params).toEqual([
      baseEntry.teamId,
      baseEntry.actorId,
      baseEntry.action,
      baseEntry.objectType,
      baseEntry.objectId,
      JSON.stringify({ reason: 'dsar' }),
    ]);
  });

  it("accepts the literal 'system' actor", async () => {
    const { db, query } = makeMockExecutor();
    const log = new DbAuditLog(db);

    await log.record({ ...baseEntry, actorId: 'system', action: 'retention_delete' });

    const [, params] = query.mock.calls[0]!;
    expect((params as unknown[])[1]).toBe('system');
    expect((params as unknown[])[2]).toBe('retention_delete');
  });

  it('passes null for metadata when it is undefined', async () => {
    const { db, query } = makeMockExecutor();
    const log = new DbAuditLog(db);

    await log.record(baseEntry);

    const [, params] = query.mock.calls[0]!;
    expect((params as unknown[])[5]).toBeNull();
  });

  it('serializes a metadata object to a JSON string', async () => {
    const { db, query } = makeMockExecutor();
    const log = new DbAuditLog(db);

    const metadata = { trigger: 'scan', outcome: 'ok' };
    await log.record({ ...baseEntry, action: 'ai_call', metadata });

    const [, params] = query.mock.calls[0]!;
    expect((params as unknown[])[5]).toBe(JSON.stringify(metadata));
  });
});

describe('DbAuditLog.recordTx', () => {
  it('issues the INSERT on the provided tx, not on the constructed executor', async () => {
    const { db, query: dbQuery } = makeMockExecutor();
    const txQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const tx = { query: txQuery } as unknown as Tx;
    const log = new DbAuditLog(db);

    await log.recordTx(tx, { ...baseEntry, metadata: { reason: 'export' } });

    // The audited write must land on the transaction's client.
    expect(txQuery).toHaveBeenCalledTimes(1);
    expect(dbQuery).not.toHaveBeenCalled();

    const [sql, params] = txQuery.mock.calls[0]!;
    expect((sql as string).toLowerCase()).toContain('insert into audit_log');
    expect(params).toEqual([
      baseEntry.teamId,
      baseEntry.actorId,
      baseEntry.action,
      baseEntry.objectType,
      baseEntry.objectId,
      JSON.stringify({ reason: 'export' }),
    ]);
  });
});
