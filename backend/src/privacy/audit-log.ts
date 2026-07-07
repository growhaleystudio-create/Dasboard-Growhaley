/**
 * Audit_Log — the chronological record of User and System actions against
 * data (R11.8). Every create/update/delete/export plus the
 * retention/DSAR deletions write exactly one row here, capturing the actor
 * and the time so the audit trail is complete and tamper-evident.
 *
 * Design references:
 * - design.md → Privacy_Service, Audit_Log, Retention_Worker, DSAR Worker
 *   (R11): the `Audit_Log.record` contract.
 * - design.md → Privacy → "Audit menyeluruh" (R11.8): "setiap
 *   create/update/delete/export/retention/DSAR Personal_Data ditulis ke
 *   `audit_log` beserta pelaku dan waktu".
 * - Data Models → Skema PostgreSQL: the `audit_log` table
 *   (team_id, actor_id, action, object_type, object_id, metadata, at).
 *
 * The `at` timestamp is supplied by the database (`DEFAULT now()`), so the
 * insert never trusts a caller-provided clock. All statements are fully
 * parameterized; no value is ever interpolated.
 */

import type { Tx } from '../db/transaction.js';
import type { DbExecutor } from '../repository/types.js';

/**
 * The closed set of audited actions. Mirrors the `CHECK` constraint on
 * `audit_log.action`. `'ai_call'` is included so AI_Analyzer_Service (R13.8)
 * can reuse the same writer. `'content_generate'` and `'content_manage'` are
 * added for the AI Content Carousel Generator feature (R14.2, R14.6, R15.5).
 */
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'retention_delete'
  | 'dsar_delete'
  | 'ai_call'
  | 'content_generate'
  | 'content_manage'
  | 'survey_analysis'
  | 'survey_export';

/**
 * A single audit entry to be appended to `audit_log`.
 *
 * `actorId` is either the acting User's uuid or the literal string
 * `'system'` for actions performed without a User (retention sweeps, etc.).
 * `metadata` is optional structured context (e.g. for `ai_call`:
 * `{ trigger, outcome, reason }`); when omitted, the row's `metadata`
 * column is stored as SQL `NULL`.
 */
export interface AuditEntry {
  readonly teamId: string;
  readonly actorId: string; // uuid of a User, or the literal 'system'
  readonly action: AuditAction;
  readonly objectType: string;
  readonly objectId: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Writer for the Audit_Log. Two entry points are provided so callers can
 * either log a standalone action or thread the write into a larger
 * transaction.
 */
export interface AuditLog {
  /** Append an audit entry using the configured executor (pool or client). */
  record(entry: AuditEntry): Promise<void>;
  /**
   * Append an audit entry within an existing transaction so the audit row
   * commits atomically with the audited change. Use this whenever the
   * audited mutation runs inside `withTransaction` — it guarantees the audit
   * trail and the data change either both land or both roll back.
   */
  recordTx(tx: Tx, entry: AuditEntry): Promise<void>;
}

/** SQL shared by {@link DbAuditLog.record} and {@link DbAuditLog.recordTx}. */
const INSERT_SQL = `INSERT INTO audit_log (
    team_id, actor_id, action, object_type, object_id, metadata
  ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`;

/**
 * Build the positional parameter list for {@link INSERT_SQL}.
 *
 * `metadata` is serialized to a JSON string for the `$6::jsonb` cast, or
 * passed as `null` when absent so the column stores SQL `NULL` rather than
 * the string `"null"`.
 */
function toParams(entry: AuditEntry): readonly unknown[] {
  const metadata = entry.metadata === undefined ? null : JSON.stringify(entry.metadata);
  return [entry.teamId, entry.actorId, entry.action, entry.objectType, entry.objectId, metadata];
}

/**
 * PostgreSQL-backed {@link AuditLog}. The constructor's executor is used by
 * {@link record}; {@link recordTx} ignores it in favor of the supplied
 * transaction so the audit row participates in the caller's atomic unit.
 */
export class DbAuditLog implements AuditLog {
  constructor(private readonly db: DbExecutor) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.query(INSERT_SQL, toParams(entry) as unknown[]);
  }

  async recordTx(tx: Tx, entry: AuditEntry): Promise<void> {
    await tx.query(INSERT_SQL, toParams(entry) as unknown[]);
  }
}
