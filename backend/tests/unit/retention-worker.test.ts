/**
 * Unit tests for the {@link RetentionWorker} (Task 16.5, R11.7).
 *
 * These lock in the worker's orchestration contract with in-memory fakes
 * (no database):
 * - For each Team, only Leads whose storage age exceeds the Team's
 *   `data_retention_days` are cleared.
 * - Each cleared Lead's Personal_Data clear and its `retention_delete`
 *   audit row run inside the *same* per-Team transaction.
 * - `clearedCount` reports the total across Teams.
 * - Teams with no expired Leads open no transaction.
 *
 * Design references: design.md → Retention_Worker; Privacy → "Retensi
 * otomatis" (R11.7) and "Audit menyeluruh" (R11.8).
 */

import { describe, it, expect, vi } from 'vitest';

import type { Tx } from '../../src/db/transaction.js';
import type { AuditEntry } from '../../src/privacy/audit-log.js';
import { RetentionWorker, type RetentionWorkerDeps } from '../../src/privacy/retention-worker.js';
import type { RetentionCandidate } from '../../src/privacy/retention.js';

const MS_PER_DAY = 86_400_000;
const NOW = new Date('2024-06-01T00:00:00Z');

/** Opaque tx token — the fakes only assert it is threaded through. */
const FAKE_TX = { id: 'tx' } as unknown as Tx;

interface ClearCall {
  readonly tx: Tx;
  readonly teamId: string;
  readonly leadId: string;
}

interface AuditCall {
  readonly tx: Tx;
  readonly entry: AuditEntry;
}

/**
 * Assemble a worker over fakes. `candidatesByTeam` maps teamId → its
 * retention candidates; `teams` carries each Team's retention window. The
 * fake `runInTx` runs the body immediately with {@link FAKE_TX} and records
 * how many transactions were opened.
 */
function makeWorker(
  teams: { teamId: string; retentionDays: number }[],
  candidatesByTeam: Record<string, RetentionCandidate[]>,
) {
  const clears: ClearCall[] = [];
  const audits: AuditCall[] = [];
  let txCount = 0;

  const deps: RetentionWorkerDeps = {
    now: () => NOW,
    loadTeams: async () => teams,
    loadCandidates: async (teamId) => candidatesByTeam[teamId] ?? [],
    runInTx: async (fn) => {
      txCount += 1;
      return fn(FAKE_TX);
    },
    clear: async (tx, teamId, leadId) => {
      clears.push({ tx, teamId, leadId });
    },
    audit: {
      recordTx: async (tx, entry) => {
        audits.push({ tx, entry });
      },
    },
  };

  return { worker: new RetentionWorker(deps), clears, audits, txCount: () => txCount };
}

/** Candidate acquired `days` ago relative to {@link NOW}. */
function acquiredDaysAgo(leadId: string, days: number): RetentionCandidate {
  return { leadId, acquiredAt: new Date(NOW.getTime() - days * MS_PER_DAY) };
}

describe('RetentionWorker.sweep', () => {
  it('clears only expired Leads across two Teams and audits each (R11.7, R11.8)', async () => {
    const teams = [
      { teamId: 'team-a', retentionDays: 30 },
      { teamId: 'team-b', retentionDays: 90 },
    ];
    const candidatesByTeam: Record<string, RetentionCandidate[]> = {
      'team-a': [
        acquiredDaysAgo('a-expired-1', 40), // > 30 → expired
        acquiredDaysAgo('a-fresh', 10), // < 30 → retained
        acquiredDaysAgo('a-expired-2', 31), // > 30 → expired
      ],
      'team-b': [
        acquiredDaysAgo('b-fresh', 89), // < 90 → retained
        acquiredDaysAgo('b-expired', 120), // > 90 → expired
      ],
    };

    const { worker, clears, audits, txCount } = makeWorker(teams, candidatesByTeam);
    const result = await worker.sweep();

    // Exactly the three expired Leads were cleared.
    expect(result.clearedCount).toBe(3);
    const clearedIds = clears.map((c) => c.leadId).sort();
    expect(clearedIds).toEqual(['a-expired-1', 'a-expired-2', 'b-expired']);

    // One audit entry per cleared Lead, all `retention_delete` by 'system'.
    expect(audits).toHaveLength(3);
    for (const { entry } of audits) {
      expect(entry.action).toBe('retention_delete');
      expect(entry.actorId).toBe('system');
      expect(entry.objectType).toBe('lead');
    }

    // Audit teamId/objectId match the cleared Lead.
    const auditByLead = new Map(audits.map((a) => [a.entry.objectId, a.entry]));
    expect(auditByLead.get('a-expired-1')?.teamId).toBe('team-a');
    expect(auditByLead.get('b-expired')?.teamId).toBe('team-b');

    // One transaction per Team that had expired Leads (both did here).
    expect(txCount()).toBe(2);
  });

  it('threads the clear and its audit through the same transaction per Lead', async () => {
    const teams = [{ teamId: 'team-a', retentionDays: 30 }];
    const candidatesByTeam: Record<string, RetentionCandidate[]> = {
      'team-a': [acquiredDaysAgo('a-expired', 40)],
    };

    const { worker, clears, audits } = makeWorker(teams, candidatesByTeam);
    await worker.sweep();

    expect(clears).toHaveLength(1);
    expect(audits).toHaveLength(1);
    // Same tx token used for the data clear and the audit write.
    expect(clears[0]!.tx).toBe(audits[0]!.tx);
    expect(clears[0]!.tx).toBe(FAKE_TX);
  });

  it('opens no transaction for a Team with no expired Leads', async () => {
    const teams = [{ teamId: 'team-a', retentionDays: 365 }];
    const candidatesByTeam: Record<string, RetentionCandidate[]> = {
      'team-a': [acquiredDaysAgo('a-fresh', 10)],
    };

    const { worker, clears, audits, txCount } = makeWorker(teams, candidatesByTeam);
    const result = await worker.sweep();

    expect(result.clearedCount).toBe(0);
    expect(clears).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(txCount()).toBe(0);
  });

  it('returns clearedCount 0 when there are no Teams', async () => {
    const { worker, txCount } = makeWorker([], {});
    const result = await worker.sweep();
    expect(result.clearedCount).toBe(0);
    expect(txCount()).toBe(0);
  });

  it('defaults the transaction runner to withTransaction(pool) when runInTx is absent', () => {
    // Constructing without pool or runInTx is allowed; the guard only trips
    // when a transaction is actually needed.
    const audit = { recordTx: vi.fn() };
    const worker = new RetentionWorker({
      loadTeams: async () => [{ teamId: 't', retentionDays: 1 }],
      loadCandidates: async () => [acquiredDaysAgo('x', 100)],
      clear: vi.fn(),
      audit,
      now: () => NOW,
    });
    // No pool and no runInTx → sweep must surface a clear configuration error
    // rather than silently skipping the clear.
    return expect(worker.sweep()).rejects.toThrow(/pool.*runInTx|runInTx.*pool/);
  });
});
