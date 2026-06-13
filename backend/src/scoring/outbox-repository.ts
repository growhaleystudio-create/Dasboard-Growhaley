/**
 * Minimal repository for the `outbox` table (Outbox Pattern, R7.9, R12.4).
 *
 * Notification messages are persisted inside the same domain transaction
 * that writes the Lead / `scoring_failure` rows. A separate worker later
 * reads undispatched rows (`dispatched_at IS NULL`) and delivers them. This
 * guarantees the domain state reflects reality even if delivery fails, and
 * — crucially for scoring — if enqueuing the notification fails, the whole
 * transaction rolls back together with the `unscored` Lead save (R7.9).
 *
 * Design references:
 * - design.md → Error Handling → Pola Transaksi & Kompensasi (Outbox
 *   pattern): pesan notifikasi ditulis ke tabel outbox dalam transaksi yang
 *   sama, lalu dikirim oleh worker.
 * - Migration `1700000004000_outbox.cjs` defines the table.
 *
 * The insert is parameterized; `payload` is serialized to JSON for the
 * `jsonb` column. `id`, `created_at` are DB defaults and `dispatched_at`
 * starts NULL (undispatched).
 */

import type { Tx } from '../db/transaction.js';

/**
 * A notification message to enqueue. `payload` is an arbitrary
 * JSON-serializable object (e.g. `{ leadId }` for a `lead.unscored`
 * notification).
 */
export interface OutboxMessage {
  /** Tenant scope (R2.8). */
  teamId: string;
  /** Notification type discriminator, e.g. `'lead.unscored'`. */
  type: string;
  /** JSON-serializable message body. */
  payload: Record<string, unknown>;
}

/**
 * Repository for `outbox`. `enqueue` takes the active transaction so the
 * message is written atomically with the rest of the domain change.
 */
export class OutboxRepository {
  /**
   * Append one message to the outbox inside `tx`. The row starts
   * undispatched (`dispatched_at IS NULL`) for a downstream worker to pick
   * up. If this insert throws, the caller lets it bubble so the enclosing
   * transaction rolls back (R7.9).
   */
  async enqueue(tx: Tx, message: OutboxMessage): Promise<void> {
    await tx.query(
      `INSERT INTO outbox (team_id, type, payload)
       VALUES ($1, $2, $3::jsonb)`,
      [message.teamId, message.type, JSON.stringify(message.payload)],
    );
  }
}
