/**
 * `LeadManager` — domain service for Lead status transitions and follow-up
 * management (R8). This file implements ONLY `changeStatus` (Task 13.1);
 * `addNote` and `deleteLead` are added by Task 13.3.
 *
 * Design references:
 * - design.md → Lead_Manager & Activity_Log: `changeStatus(actor, leadId,
 *   to)` persists the new status and records an Activity (R8.2).
 * - requirements.md R8.1: there are exactly six Lead_Status values and no
 *   others (`New`, `Reviewed`, `Contacted`, `Qualified`, `Converted`,
 *   `Rejected`). The const {@link LEAD_STATUSES} is the single source of
 *   truth; `changeStatus` defensively guards against any value outside it.
 * - requirements.md R8.2: only persist + log an Activity when the target
 *   status DIFFERS from the current one. A no-op (`to === current`) returns
 *   the unchanged Lead and writes NO Activity.
 *
 * Atomicity: the status UPDATE and the Activity INSERT run inside ONE
 * transaction so they commit together or not at all.
 *
 * Testability: the constructor accepts an injectable {@link LeadManagerDeps}
 * bag (mirroring the recompute orchestrator). Production callers pass a
 * `pool` and get the real `withTransaction` + repositories wired up; tests
 * inject `runInTx` plus repo factories backed by in-memory fakes.
 */

import type { AuthSession, Lead, LeadStatus, Result } from '@leads-generator/shared';
import { err, LEAD_STATUSES, ok } from '@leads-generator/shared';
import type { Pool } from 'pg';

import { withTransaction, type Tx } from '../db/transaction.js';
import { DbAuditLog } from '../privacy/audit-log.js';
import { LeadRepository } from '../repository/lead-repository.js';

import { ActivityRepository } from './activity-repository.js';
import { NoteRepository } from './note-repository.js';

/**
 * Minimal Lead read/write surface the manager needs across its operations:
 * `findById` (team-scoped lookup shared by all three), `updateStatus`
 * (R8.2), and `delete` (R8.7 permanent delete).
 */
export type LeadStatusStore = Pick<LeadRepository, 'findById' | 'updateStatus' | 'delete'>;

/**
 * Minimal Activity write surface the manager needs: `recordStatusChange`
 * (R8.2) and `recordNoteAdded` (R8.3).
 */
export type ActivityWriter = Pick<
  ActivityRepository,
  'recordStatusChange' | 'recordNoteAdded'
>;

/** Minimal note-write surface `addNote` needs (R8.3). */
export type NoteWriter = Pick<NoteRepository, 'insert'>;

/** Minimal Audit_Log surface `deleteLead` needs (R8.7). */
export type AuditWriter = Pick<DbAuditLog, 'recordTx'>;

/** Inclusive lower bound for a follow-up note body (R8.3, R8.4). */
export const NOTE_MIN_LENGTH = 1;

/** Inclusive upper bound for a follow-up note body (R8.3, R8.4). */
export const NOTE_MAX_LENGTH = 2000;

/**
 * Follow-up note domain shape returned by {@link LeadManager.addNote}
 * (design.md → Lead_Manager: `addNote(...): Result<Note>`). Maps the
 * persisted `lead_note` row to camelCase with a coerced `Date`.
 */
export interface Note {
  id: string;
  leadId: string;
  body: string;
  authorId: string;
  createdAt: Date;
}

/** Coerce a `pg` timestamp (Date or string) to a `Date`. */
function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Collaborators for {@link LeadManager}.
 *
 * The transaction runner and the tx-bound repository factories are
 * injectable so the orchestration can be unit/property-tested without a
 * real database. The defaults wire up the real `withTransaction` +
 * repositories using `pool`.
 */
export interface LeadManagerDeps {
  /**
   * Pool used to build the default `runInTx` and repositories. Required
   * only when `runInTx` / the repo factories are not supplied.
   */
  pool?: Pool;

  /**
   * Runs a unit of work inside a transaction. Defaults to
   * `withTransaction(deps.pool, fn)`. Tests inject a fake that emulates
   * commit/rollback.
   */
  runInTx?: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

  /**
   * Factory for a transaction-bound Lead store. Defaults to
   * `new LeadRepository(tx)`.
   */
  leads?: (tx: Tx) => LeadStatusStore;

  /**
   * Factory for a transaction-bound Activity writer. Defaults to
   * `new ActivityRepository(tx)`.
   */
  activities?: (tx: Tx) => ActivityWriter;

  /**
   * Factory for a transaction-bound note writer. Defaults to
   * `new NoteRepository(tx)`. Used by {@link LeadManager.addNote} (R8.3).
   */
  notes?: (tx: Tx) => NoteWriter;

  /**
   * Factory for an Audit_Log writer. Defaults to `new DbAuditLog(tx)`. The
   * audit row is written via `recordTx(tx, …)` so it commits atomically
   * with the Lead delete (R8.7). Used by {@link LeadManager.deleteLead}.
   */
  audit?: (tx: Tx) => AuditWriter;

  /** Clock used to stamp Activity rows. Defaults to `() => new Date()`. */
  now?: () => Date;
}

/** Runtime membership check for the six-and-only-six Lead_Status (R8.1). */
function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Manages Lead status transitions and the Activity_Log entries they
 * produce (R8).
 */
export class LeadManager {
  constructor(private readonly deps: LeadManagerDeps = {}) {}

  /**
   * Resolve the transaction runner, falling back to the real
   * {@link withTransaction} bound to `deps.pool`.
   */
  private resolveRunInTx(): <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> {
    if (this.deps.runInTx !== undefined) return this.deps.runInTx;
    const pool = this.deps.pool;
    if (pool === undefined) {
      throw new Error('LeadManager requires either `pool` or `runInTx` in its deps');
    }
    return (fn) => withTransaction(pool, fn);
  }

  /**
   * Change a Lead's status (R8.2).
   *
   * Behaviour:
   * - Defensively rejects a `to` value outside {@link LEAD_STATUSES} with a
   *   `VALIDATION` error (the type already constrains it, but a malformed
   *   call from untyped boundaries is guarded — R8.1).
   * - Looks up the Lead scoped to `actor.teamId`; a missing Lead (unknown
   *   id or another Team) yields `NOT_FOUND` (R2.8).
   * - When `to === current.status` this is a no-op: the unchanged Lead is
   *   returned and NO Activity is recorded (R8.2 "status tujuan yang
   *   berbeda").
   * - Otherwise the new status is persisted and exactly one
   *   `status_change` Activity is recorded with `{ fromStatus, toStatus,
   *   actorId, at }` — both writes inside one transaction so they are
   *   atomic.
   */
  async changeStatus(
    actor: AuthSession,
    leadId: string,
    to: LeadStatus,
  ): Promise<Result<Lead>> {
    // Defensive R8.1 guard against values smuggled past the type system.
    if (!isLeadStatus(to)) {
      return err({
        code: 'VALIDATION',
        messages: [`Status tujuan tidak valid: ${String(to)}`],
      });
    }

    const runInTx = this.resolveRunInTx();
    const makeLeads = this.deps.leads ?? ((tx: Tx): LeadStatusStore => new LeadRepository(tx));
    const makeActivities =
      this.deps.activities ?? ((tx: Tx): ActivityWriter => new ActivityRepository(tx));
    const now = this.deps.now ?? ((): Date => new Date());

    return runInTx(async (tx) => {
      const leads = makeLeads(tx);
      const current = await leads.findById(actor.teamId, leadId);
      if (current === null) {
        return err({ code: 'NOT_FOUND', message: `Lead tidak ditemukan: ${leadId}` });
      }

      // No-op when the target equals the current status: keep the Lead and
      // do NOT write an Activity (R8.2).
      if (current.status === to) {
        return ok(current);
      }

      const updated = await leads.updateStatus(actor.teamId, leadId, to);
      if (updated === null) {
        // Concurrency safety net: the Lead vanished between read and write.
        return err({ code: 'NOT_FOUND', message: `Lead tidak ditemukan: ${leadId}` });
      }

      const activities = makeActivities(tx);
      await activities.recordStatusChange(
        leadId,
        actor.userId,
        current.status,
        to,
        now(),
      );

      return ok(updated);
    });
  }

  /**
   * Add a follow-up note to a Lead (R8.3, R8.4).
   *
   * Behaviour:
   * - Validates the raw `body.length` is within [{@link NOTE_MIN_LENGTH},
   *   {@link NOTE_MAX_LENGTH}]. An empty body or one exceeding 2000 chars
   *   yields a `VALIDATION` error whose message states the length bound,
   *   and NOTHING is written — existing notes are preserved unchanged
   *   (R8.4). Length is measured on the raw string (no trimming) to match
   *   the DB `CHECK (length(body) BETWEEN 1 AND 2000)`.
   * - Looks up the Lead scoped to `actor.teamId`; a missing Lead (unknown
   *   id or another Team) yields `NOT_FOUND` (R2.8).
   * - Persists the note (author = `actor.userId`, time stamped by the DB)
   *   and records exactly one `note_added` Activity — both writes inside
   *   one transaction so they are atomic. Returns the persisted
   *   {@link Note}.
   */
  async addNote(
    actor: AuthSession,
    leadId: string,
    body: string,
  ): Promise<Result<Note>> {
    // R8.4: reject out-of-range bodies BEFORE opening a transaction so no
    // write — and therefore no change to existing notes — ever occurs.
    if (body.length < NOTE_MIN_LENGTH || body.length > NOTE_MAX_LENGTH) {
      return err({
        code: 'VALIDATION',
        messages: [
          `Catatan harus berisi ${NOTE_MIN_LENGTH} sampai ${NOTE_MAX_LENGTH} karakter`,
        ],
      });
    }

    const runInTx = this.resolveRunInTx();
    const makeLeads = this.deps.leads ?? ((tx: Tx): LeadStatusStore => new LeadRepository(tx));
    const makeNotes = this.deps.notes ?? ((tx: Tx): NoteWriter => new NoteRepository(tx));
    const makeActivities =
      this.deps.activities ?? ((tx: Tx): ActivityWriter => new ActivityRepository(tx));
    const now = this.deps.now ?? ((): Date => new Date());

    return runInTx(async (tx) => {
      const leads = makeLeads(tx);
      const lead = await leads.findById(actor.teamId, leadId);
      if (lead === null) {
        return err({ code: 'NOT_FOUND', message: `Lead tidak ditemukan: ${leadId}` });
      }

      const notes = makeNotes(tx);
      const row = await notes.insert(leadId, actor.userId, body);

      const activities = makeActivities(tx);
      await activities.recordNoteAdded(leadId, actor.userId, now());

      return ok({
        id: row.id,
        leadId: row.lead_id,
        body: row.body,
        authorId: row.author_id,
        createdAt: toDate(row.created_at),
      });
    });
  }

  /**
   * Delete a Lead, requiring explicit confirmation (R8.5–R8.7).
   *
   * Behaviour:
   * - When `confirmed !== true` the deletion is NOT performed: the Lead and
   *   all of its attributes are left untouched and the result is
   *   `ok({ deleted: false })` (R8.5, R8.6). No transaction is opened.
   * - When `confirmed === true`: inside one transaction the Lead is looked
   *   up scoped to `actor.teamId` (a missing Lead yields `NOT_FOUND`,
   *   R2.8), then permanently deleted and an Audit_Log `delete` entry is
   *   written via `recordTx` so the deletion and its audit row commit
   *   together (R8.7). Returns `ok({ deleted: true })`.
   */
  async deleteLead(
    actor: AuthSession,
    leadId: string,
    confirmed: boolean,
  ): Promise<Result<{ deleted: boolean }>> {
    // R8.5 / R8.6: without explicit confirmation, preserve the Lead and do
    // not touch the database at all.
    if (confirmed !== true) {
      return ok({ deleted: false });
    }

    const runInTx = this.resolveRunInTx();
    const makeLeads = this.deps.leads ?? ((tx: Tx): LeadStatusStore => new LeadRepository(tx));
    const makeAudit = this.deps.audit ?? ((tx: Tx): AuditWriter => new DbAuditLog(tx));

    return runInTx(async (tx) => {
      const leads = makeLeads(tx);
      const lead = await leads.findById(actor.teamId, leadId);
      if (lead === null) {
        return err({ code: 'NOT_FOUND', message: `Lead tidak ditemukan: ${leadId}` });
      }

      await leads.delete(actor.teamId, leadId);

      const audit = makeAudit(tx);
      await audit.recordTx(tx, {
        teamId: actor.teamId,
        actorId: actor.userId,
        action: 'delete',
        objectType: 'lead',
        objectId: leadId,
      });

      return ok({ deleted: true });
    });
  }
}
