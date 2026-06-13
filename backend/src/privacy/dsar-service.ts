/**
 * `DsarService` — the Data-Subject Access/Erasure (DSAR) Worker for verified
 * data-subject deletion requests (R11.3, R11.4).
 *
 * Design references:
 * - design.md → Privacy → "Hak subjek data" (R11.3, R11.4): a verified
 *   request triggers deletion of the subject's Personal_Data within ≤ 72h
 *   WITHOUT sending a completion confirmation to the requester; a failure
 *   preserves the data and raises a failure notification that is
 *   DISTINGUISHED from an authorization error.
 * - design.md → Privacy DSAR flowchart: verified? → enqueue ≤72h →
 *   delete Personal_Data? → yes: write `dsar_delete` audit, no confirmation
 *   (R11.3); no: keep data intact + failure notification (R11.4).
 * - design.md → Error Handling → "Privacy DSAR": gagal hapus → pertahankan
 *   data, notifikasi kegagalan (terpisah dari error otorisasi).
 *
 * Design decision — "menghapus seluruh Personal_Data Lead":
 * Interpreted as NULLing the public Personal_Data columns (`name`,
 * `public_contact`, `profile_url`, `location`) on every matching Lead via
 * {@link LeadRepository.clearPersonalData}, while RETAINING the Lead row.
 * This satisfies "hapus seluruh Personal_Data" (no Personal_Data remains)
 * yet keeps the row so provenance, the audit trail, and aggregate metrics
 * stay intact.
 *
 * Atomicity: all clears and their `dsar_delete` audit rows for one request
 * run inside ONE transaction. If any step throws, the transaction rolls
 * back so NO Personal_Data is partially erased (R11.4 "pertahankan seluruh
 * Personal_Data Lead tanpa perubahan").
 *
 * Error taxonomy (R11.4 requires the failure notification to be SEPARATE
 * from an authorization error):
 * - Unverified request → `err({ code: 'AUTHORIZATION' })`, no processing,
 *   no failure notification (it is an authorization rejection, not a
 *   processing failure).
 * - Processing failure (find/clear/audit throws) → roll back, fire
 *   {@link DsarServiceDeps.notifyFailure}, and return
 *   `err({ code: 'INTERNAL' })` — a DIFFERENT code from `AUTHORIZATION`.
 *
 * Testability: the constructor accepts an injectable {@link DsarServiceDeps}
 * bag (mirroring `LeadManager`/`recomputeForTeam`). Production callers pass
 * a `pool` and get the real `withTransaction` + repositories + audit log
 * wired up; tests inject `runInTx` plus factories backed by in-memory fakes.
 */

import type { Result } from '@leads-generator/shared';
import { err, ok } from '@leads-generator/shared';
import type { Pool } from 'pg';

import { withTransaction, type Tx } from '../db/transaction.js';
import {
  LeadRepository,
  type PersonalDataCriteria,
} from '../repository/lead-repository.js';

import { DbAuditLog, type AuditLog } from './audit-log.js';

/**
 * A data-subject deletion request handed to {@link DsarService.process}.
 *
 * `verified` reflects an UPSTREAM identity check: the caller must verify the
 * data subject's identity before invoking the worker. When `false`, the
 * worker rejects with an authorization error and performs no deletion.
 */
export interface DsarRequest {
  readonly teamId: string;
  /** Whether the data subject's identity was verified upstream (R11.3). */
  readonly verified: boolean;
  /** Identity criteria locating the subject's Personal_Data on Leads. */
  readonly subject: PersonalDataCriteria;
}

/** Outcome payload of a processed request: how many Leads were cleared. */
export interface DsarResult {
  readonly clearedCount: number;
}

/**
 * Minimal tenant-scoped Lead reader used to locate the subject's Leads.
 * Runs outside the transaction (a read), then the ids are cleared inside it.
 */
export type DsarLeadFinder = Pick<LeadRepository, 'findIdsByPersonalData'>;

/**
 * Minimal tx-bound Lead writer used to clear Personal_Data per Lead. The
 * return value is intentionally `void` — the DSAR Worker ignores whether a
 * row was updated (the id set came from {@link DsarLeadFinder}). The real
 * `LeadRepository.clearPersonalData` (which returns `boolean`) is assignable
 * to this shape because a `boolean`-returning method satisfies a `void`
 * contract.
 */
export interface DsarLeadClearer {
  clearPersonalData(teamId: string, leadId: string): Promise<void>;
}

/** Minimal Audit_Log surface: a `dsar_delete` row per cleared Lead. */
export type DsarAuditWriter = Pick<AuditLog, 'recordTx'>;

/**
 * Context passed to {@link DsarServiceDeps.notifyFailure}. `reason` is a
 * stable discriminator (NOT an authorization message) so downstream
 * delivery can route the distinct failure notification (R11.4).
 */
export interface DsarFailureInfo {
  readonly teamId: string;
  readonly reason: string;
}

/**
 * Collaborators for {@link DsarService}. The transaction runner, repository
 * factories, audit writer, and failure-notifier are injectable so the
 * orchestration is unit-testable without a real database. Defaults wire up
 * the real `withTransaction` + repositories + {@link DbAuditLog} from
 * `pool`.
 */
export interface DsarServiceDeps {
  /**
   * Pool used to build the default `runInTx`, `leads`, `txLeads`, and
   * `audit`. Required only when those are not all supplied.
   */
  pool?: Pool;

  /**
   * Runs a unit of work inside a transaction. Defaults to
   * `withTransaction(deps.pool, fn)`. Tests inject a fake that emulates
   * commit/rollback (discarding staged writes when `fn` rejects).
   */
  runInTx?: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

  /** Tenant-scoped Lead finder. Defaults to `new LeadRepository(pool)`. */
  leads?: DsarLeadFinder;

  /**
   * Factory for a transaction-bound Lead clearer. Defaults to
   * `new LeadRepository(tx)`.
   */
  txLeads?: (tx: Tx) => DsarLeadClearer;

  /** Audit_Log writer (`recordTx`). Defaults to `new DbAuditLog(pool)`. */
  audit?: DsarAuditWriter;

  /**
   * Distinct failure-notification hook invoked when processing fails after
   * the request was verified (R11.4). This is SEPARATE from the
   * authorization rejection path. Optional: when absent, the worker still
   * returns the `INTERNAL` error but emits no notification.
   */
  notifyFailure?: (info: DsarFailureInfo) => Promise<void>;
}

/** The `actorId` recorded for DSAR deletions performed without a User. */
const SYSTEM_ACTOR = 'system';

/** Stable reason discriminator for the distinct failure notification. */
const FAILURE_REASON = 'dsar_processing_failed';

/**
 * DSAR Worker: processes verified data-subject deletion requests (R11.3,
 * R11.4).
 */
export class DsarService {
  constructor(private readonly deps: DsarServiceDeps = {}) {}

  /**
   * Resolve the transaction runner, falling back to the real
   * {@link withTransaction} bound to `deps.pool`.
   */
  private resolveRunInTx(): <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> {
    if (this.deps.runInTx !== undefined) return this.deps.runInTx;
    const pool = this.deps.pool;
    if (pool === undefined) {
      throw new Error('DsarService requires either `pool` or `runInTx` in its deps');
    }
    return (fn) => withTransaction(pool, fn);
  }

  /** Resolve the (pool-bound) Lead finder. */
  private resolveLeads(): DsarLeadFinder {
    if (this.deps.leads !== undefined) return this.deps.leads;
    const pool = this.deps.pool;
    if (pool === undefined) {
      throw new Error('DsarService requires either `pool` or `leads` in its deps');
    }
    return new LeadRepository(pool);
  }

  /** Resolve the Audit_Log writer. */
  private resolveAudit(): DsarAuditWriter {
    if (this.deps.audit !== undefined) return this.deps.audit;
    const pool = this.deps.pool;
    if (pool === undefined) {
      throw new Error('DsarService requires either `pool` or `audit` in its deps');
    }
    return new DbAuditLog(pool);
  }

  /**
   * Process a verified data-subject deletion request.
   *
   * - Unverified (`req.verified === false`) → `AUTHORIZATION` error; no
   *   Leads are touched and NO failure notification is emitted (R11.4: the
   *   failure notification is separate from authorization errors).
   * - No matching Leads → silent success `ok({ clearedCount: 0 })` (nothing
   *   to erase; still no confirmation to the requester, R11.3).
   * - Otherwise: within ONE transaction, clear every matching Lead's
   *   Personal_Data and write one `dsar_delete` audit row per Lead, then
   *   return `ok({ clearedCount })` SILENTLY — the `Result` carries no
   *   "notified"/confirmation surface (R11.3).
   * - On any thrown error during processing: the transaction rolls back so
   *   Personal_Data is preserved intact, the distinct
   *   {@link DsarServiceDeps.notifyFailure} hook fires, and an `INTERNAL`
   *   error is returned — a code DISTINCT from `AUTHORIZATION` (R11.4).
   */
  async process(req: DsarRequest): Promise<Result<DsarResult>> {
    // Identity not verified upstream → authorization rejection. This is NOT
    // a processing failure, so no failure notification is emitted (R11.4).
    if (!req.verified) {
      return err({
        code: 'AUTHORIZATION',
        message: 'Permintaan subjek data belum terverifikasi',
      });
    }

    const runInTx = this.resolveRunInTx();
    const leads = this.resolveLeads();
    const audit = this.resolveAudit();
    const makeTxLeads =
      this.deps.txLeads ??
      ((tx: Tx): DsarLeadClearer => {
        const repo = new LeadRepository(tx);
        return {
          async clearPersonalData(teamId: string, leadId: string): Promise<void> {
            await repo.clearPersonalData(teamId, leadId);
          },
        };
      });

    try {
      const ids = await leads.findIdsByPersonalData(req.teamId, req.subject);

      // Nothing matches → silent success, no work, no confirmation (R11.3).
      if (ids.length === 0) {
        return ok({ clearedCount: 0 });
      }

      await runInTx(async (tx) => {
        const txLeads = makeTxLeads(tx);
        for (const id of ids) {
          await txLeads.clearPersonalData(req.teamId, id);
          await audit.recordTx(tx, {
            teamId: req.teamId,
            actorId: SYSTEM_ACTOR,
            action: 'dsar_delete',
            objectType: 'lead',
            objectId: id,
          });
        }
      });

      // Completed silently: no confirmation to the requester (R11.3).
      return ok({ clearedCount: ids.length });
    } catch {
      // Processing failed → the transaction rolled back, so Personal_Data
      // is preserved intact (R11.4). Fire the DISTINCT failure notification
      // (separate from the authorization path). A notifier that itself
      // throws must not mask the INTERNAL result.
      try {
        await this.deps.notifyFailure?.({ teamId: req.teamId, reason: FAILURE_REASON });
      } catch {
        // Swallow notifier errors: the failure result below is what the
        // caller acts on; delivery is best-effort here.
      }
      return err({
        code: 'INTERNAL',
        message: 'Penghapusan data subjek gagal',
      });
    }
  }
}
