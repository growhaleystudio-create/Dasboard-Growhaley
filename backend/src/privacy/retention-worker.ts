/**
 * Retention_Worker — automatic deletion of expired Personal_Data (R11.7).
 *
 * Design references:
 * - design.md → Privacy_Service, Audit_Log, Retention_Worker (R11):
 *   `interface Retention_Worker { sweep(): Promise<void>; } // R11.7 hapus
 *   <=24 jam setelah retensi terlampaui`.
 * - design.md → Privacy → "Retensi otomatis" (R11.7): the worker sweeps
 *   Leads exceeding `data_retention_days` and deletes within ≤ 24h, writing
 *   to the Audit_Log.
 * - design.md → Privacy → "Audit menyeluruh" (R11.8): every retention
 *   deletion is recorded in `audit_log` with the actor and time.
 * - requirements.md R11.7.
 *
 * Cadence vs. correctness
 * -----------------------
 * R11.7's "≤ 24 jam setelah Data_Retention_Period terlampaui" is a
 * *scheduling* guarantee: as long as `sweep()` runs at least once per 24h,
 * any Lead is cleared within 24h of crossing its window. The scheduling is
 * the Job_Scheduler's concern; this worker's job is to clear *exactly* the
 * Leads that have crossed the window at the moment it runs. That "exactly
 * the expired set" decision is delegated to the pure {@link selectExpired}
 * so it can be property-tested in isolation (Property 31).
 *
 * Deletion semantics — clear, don't drop the row
 * ----------------------------------------------
 * "menghapus Personal_Data" is implemented by clearing the public
 * Personal_Data columns (`name`, `public_contact`, `profile_url`,
 * `location`) via {@link RetentionWorkerDeps.clear} (LeadRepository
 * `clearPersonalData`), retaining the row for metrics/provenance. This is
 * the same approach DSAR deletion uses, so the two privacy paths stay
 * consistent and a cleared row still contributes to aggregate counts.
 *
 * Atomicity
 * ---------
 * Each Team is swept in its own transaction: every cleared Lead's data
 * change and its `retention_delete` audit row commit together (or roll back
 * together). One Team's failure therefore never leaves a half-cleared,
 * un-audited state for that Team; per-Team isolation keeps a single bad
 * Team from poisoning the whole sweep's already-committed work.
 */

import type { Pool } from 'pg';

import type { Tx } from '../db/transaction.js';
import { withTransaction } from '../db/transaction.js';
import type { AuditEntry } from './audit-log.js';
import { selectExpired, type RetentionCandidate } from './retention.js';

/**
 * Minimal Audit_Log surface the worker needs: a transaction-bound writer so
 * the audit row commits atomically with the data clear.
 */
export interface RetentionAuditWriter {
  recordTx(tx: Tx, entry: AuditEntry): Promise<void>;
}

/**
 * Collaborators for {@link RetentionWorker}. Everything the worker touches
 * is injected so it can be unit-tested with in-memory fakes and run against
 * real Postgres in production.
 */
export interface RetentionWorkerDeps {
  /**
   * Connection pool used by the default transaction runner. Optional when a
   * custom {@link runInTx} is supplied (e.g. in tests); required otherwise.
   */
  readonly pool?: Pool;
  /**
   * Run `fn` inside a transaction. Defaults to {@link withTransaction} bound
   * to {@link pool}. Injectable so tests can drive the per-Team transaction
   * boundary without a database.
   */
  readonly runInTx?: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  /** Load `(teamId, retentionDays)` for every Team to be swept. */
  readonly loadTeams: () => Promise<{ teamId: string; retentionDays: number }[]>;
  /**
   * Load retention candidates `(leadId, acquiredAt)` for a Team — Leads with
   * a non-null `acquired_at` that still carry Personal_Data.
   */
  readonly loadCandidates: (teamId: string) => Promise<RetentionCandidate[]>;
  /**
   * Clear a Lead's Personal_Data on the supplied transaction (the
   * tx-bound LeadRepository `clearPersonalData`).
   */
  readonly clear: (tx: Tx, teamId: string, leadId: string) => Promise<void>;
  /** Audit_Log writer used to record one `retention_delete` per cleared Lead. */
  readonly audit: RetentionAuditWriter;
  /** Clock seam; defaults to `() => new Date()`. */
  readonly now?: () => Date;
}

/** Outcome of a sweep: how many Leads had their Personal_Data cleared. */
export interface RetentionSweepResult {
  readonly clearedCount: number;
}

/**
 * Sweeps Teams and clears the Personal_Data of Leads whose storage age has
 * exceeded their Team's `data_retention_days` (R11.7).
 */
export class RetentionWorker {
  constructor(private readonly deps: RetentionWorkerDeps) {}

  /** Resolve the transaction runner: the injected one, else `withTransaction(pool)`. */
  private runInTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (this.deps.runInTx) return this.deps.runInTx(fn);
    if (!this.deps.pool) {
      throw new Error('RetentionWorker requires either `pool` or `runInTx` in its deps.');
    }
    return withTransaction(this.deps.pool, fn);
  }

  /**
   * Sweep every Team: select the Leads whose retention window has been
   * exceeded and, in a transaction per Team, clear each one's Personal_Data
   * and write a `retention_delete` audit entry. Returns the total number of
   * Leads cleared across all Teams.
   */
  async sweep(): Promise<RetentionSweepResult> {
    const now = this.deps.now ?? (() => new Date());
    const teams = await this.deps.loadTeams();

    let clearedCount = 0;

    for (const team of teams) {
      const candidates = await this.deps.loadCandidates(team.teamId);
      const expiredIds = selectExpired(candidates, team.retentionDays, now());
      if (expiredIds.length === 0) continue;

      await this.runInTx(async (tx) => {
        for (const leadId of expiredIds) {
          await this.deps.clear(tx, team.teamId, leadId);
          await this.deps.audit.recordTx(tx, {
            teamId: team.teamId,
            actorId: 'system',
            action: 'retention_delete',
            objectType: 'lead',
            objectId: leadId,
          });
        }
      });

      clearedCount += expiredIds.length;
    }

    return { clearedCount };
  }
}
