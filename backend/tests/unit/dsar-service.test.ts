/**
 * Unit tests for {@link DsarService} (Task 16.4, R11.3, R11.4).
 *
 * These example-based tests pin the DSAR Worker's behaviour:
 * - verified + matching ids → `clearPersonalData` per id, one `dsar_delete`
 *   audit row per id, `ok({ clearedCount })`, and NO requester confirmation
 *   surface on the Result (silent completion, R11.3),
 * - unverified → `AUTHORIZATION` error with no clear/audit/notify (R11.4),
 * - verified but a clear throws → transaction rolls back (staged clears
 *   discarded), the DISTINCT `notifyFailure` fires, and an `INTERNAL` error
 *   is returned — a code separate from `AUTHORIZATION` (R11.4),
 * - no matching ids → `ok({ clearedCount: 0 })` with no clear/audit.
 */

import { describe, it, expect, vi } from 'vitest';
import type { PoolClient } from 'pg';

import { DsarService } from '../../src/privacy/dsar-service.js';
import type {
  DsarServiceDeps,
  DsarLeadFinder,
} from '../../src/privacy/dsar-service.js';
import type { AuditEntry } from '../../src/privacy/audit-log.js';
import type { Tx } from '../../src/db/transaction.js';

const TEAM = '11111111-1111-1111-1111-111111111111';

/** A finder that always returns the given ids regardless of criteria. */
function finderReturning(ids: readonly string[]): DsarLeadFinder {
  return {
    async findIdsByPersonalData(): Promise<string[]> {
      return [...ids];
    },
  };
}

/**
 * A `runInTx` fake that emulates commit/rollback against a staging buffer:
 * the body runs with a fake `tx`; if it resolves the staged side effects are
 * "committed" (flushed to `committed`), if it rejects the staged effects are
 * discarded (rolled back) and the error re-thrown.
 */
function makeTxHarness() {
  const committed: { clears: string[]; audits: AuditEntry[] } = { clears: [], audits: [] };
  let staged: { clears: string[]; audits: AuditEntry[] } = { clears: [], audits: [] };

  const runInTx = async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
    staged = { clears: [], audits: [] };
    try {
      const result = await fn({} as PoolClient);
      // Commit: flush staged → committed.
      committed.clears.push(...staged.clears);
      committed.audits.push(...staged.audits);
      return result;
    } catch (e) {
      // Rollback: discard staged.
      staged = { clears: [], audits: [] };
      throw e;
    }
  };

  return { committed, stage: (): typeof staged => staged, runInTx };
}

describe('DsarService.process', () => {
  it('verified + matching ids: clears each Lead, audits dsar_delete per id, silent ok', async () => {
    const ids = ['lead-a', 'lead-b', 'lead-c'];
    const harness = makeTxHarness();

    const clears: string[] = [];
    const audits: AuditEntry[] = [];

    const deps: DsarServiceDeps = {
      runInTx: harness.runInTx,
      leads: finderReturning(ids),
      txLeads: () => ({
        async clearPersonalData(teamId, leadId): Promise<void> {
          expect(teamId).toBe(TEAM);
          harness.stage().clears.push(leadId);
          clears.push(leadId);
        },
      }),
      audit: {
        async recordTx(_tx, entry): Promise<void> {
          harness.stage().audits.push(entry);
          audits.push(entry);
        },
      },
    };

    const service = new DsarService(deps);
    const result = await service.process({
      teamId: TEAM,
      verified: true,
      subject: { email: 'subject@example.com' },
    });

    expect(result).toEqual({ ok: true, value: { clearedCount: 3 } });

    // The Result carries no "notified"/confirmation field — silent (R11.3).
    if (result.ok) {
      expect(Object.keys(result.value)).toEqual(['clearedCount']);
    }

    // One clear + one dsar_delete audit per id, committed.
    expect(harness.committed.clears).toEqual(ids);
    expect(clears).toEqual(ids);
    expect(audits).toHaveLength(3);
    expect(audits.every((a) => a.action === 'dsar_delete')).toBe(true);
    expect(audits.every((a) => a.objectType === 'lead')).toBe(true);
    expect(audits.every((a) => a.actorId === 'system')).toBe(true);
    expect(audits.every((a) => a.teamId === TEAM)).toBe(true);
    expect(audits.map((a) => a.objectId)).toEqual(ids);
  });

  it('unverified: returns AUTHORIZATION error and performs no clear/audit/notify', async () => {
    const clearSpy = vi.fn();
    const auditSpy = vi.fn();
    const notifySpy = vi.fn(async () => {});
    const runInTxSpy = vi.fn(async <T>(fn: (tx: Tx) => Promise<T>) => fn({} as PoolClient));

    const deps: DsarServiceDeps = {
      runInTx: runInTxSpy,
      leads: finderReturning(['lead-a']),
      txLeads: () => ({ clearPersonalData: clearSpy }),
      audit: { recordTx: auditSpy },
      notifyFailure: notifySpy,
    };

    const service = new DsarService(deps);
    const result = await service.process({
      teamId: TEAM,
      verified: false,
      subject: { email: 'subject@example.com' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTHORIZATION');
    }
    expect(clearSpy).not.toHaveBeenCalled();
    expect(auditSpy).not.toHaveBeenCalled();
    expect(runInTxSpy).not.toHaveBeenCalled();
    // The authorization rejection must NOT emit the failure notification.
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('verified but a clear throws: rolls back, notifies failure, returns INTERNAL (distinct code)', async () => {
    const ids = ['lead-a', 'lead-b'];
    const harness = makeTxHarness();

    const auditSpy = vi.fn(async () => {});
    const notifyCalls: { teamId: string; reason: string }[] = [];

    const deps: DsarServiceDeps = {
      runInTx: harness.runInTx,
      leads: finderReturning(ids),
      txLeads: () => ({
        async clearPersonalData(_teamId, leadId): Promise<void> {
          // Stage the first clear, then blow up on the second.
          if (leadId === 'lead-b') {
            throw new Error('injected clear failure');
          }
          harness.stage().clears.push(leadId);
        },
      }),
      audit: {
        async recordTx(_tx, entry): Promise<void> {
          harness.stage().audits.push(entry);
          await auditSpy();
        },
      },
      notifyFailure: async (info) => {
        notifyCalls.push(info);
      },
    };

    const service = new DsarService(deps);
    const result = await service.process({
      teamId: TEAM,
      verified: true,
      subject: { profileUrl: 'https://example.com/u/subject' },
    });

    // Failure result with a code DISTINCT from AUTHORIZATION (R11.4).
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
      expect(result.error.code).not.toBe('AUTHORIZATION');
    }

    // Rolled back: no clears or audits were committed (data preserved).
    expect(harness.committed.clears).toEqual([]);
    expect(harness.committed.audits).toEqual([]);

    // The distinct failure notification fired exactly once with the team.
    expect(notifyCalls).toHaveLength(1);
    expect(notifyCalls[0]!.teamId).toBe(TEAM);
    expect(typeof notifyCalls[0]!.reason).toBe('string');
  });

  it('no matching ids: returns ok({ clearedCount: 0 }) with no clear/audit', async () => {
    const clearSpy = vi.fn();
    const auditSpy = vi.fn();
    const runInTxSpy = vi.fn(async <T>(fn: (tx: Tx) => Promise<T>) => fn({} as PoolClient));

    const deps: DsarServiceDeps = {
      runInTx: runInTxSpy,
      leads: finderReturning([]),
      txLeads: () => ({ clearPersonalData: clearSpy }),
      audit: { recordTx: auditSpy },
    };

    const service = new DsarService(deps);
    const result = await service.process({
      teamId: TEAM,
      verified: true,
      subject: { email: 'nobody@example.com' },
    });

    expect(result).toEqual({ ok: true, value: { clearedCount: 0 } });
    expect(clearSpy).not.toHaveBeenCalled();
    expect(auditSpy).not.toHaveBeenCalled();
    // No work to do → never opened a transaction.
    expect(runInTxSpy).not.toHaveBeenCalled();
  });
});
