/**
 * Migration: 1700000012000_audit-content-actions
 * Purpose: Extend the `audit_log.action` CHECK constraint to include the two
 *          new content-related audit actions introduced by the AI Content
 *          Carousel Generator feature.
 *
 *   - 'content_generate' — logged each time content is generated via the
 *                          AI pipeline (distinct from 'ai_call' which remains
 *                          for raw AI-API calls tracked in ai_call_log).
 *   - 'content_manage'   — logged for CRUD operations on Master_Template,
 *                          Content_Item, and related content objects.
 *
 * Existing actions are unchanged:
 *   'create', 'update', 'delete', 'export', 'retention_delete',
 *   'dsar_delete', 'ai_call'
 *
 * Tables `ai_call_log` and `team_ai_settings` are reused as-is; the
 * `lead_id` column in `ai_call_log` is set NULL for content-scoped calls.
 *
 * Design: Data Models → Keputusan: aksi Audit_Log untuk konten; Rencana Migrasi
 * Requirements: 1.1, 2.1, 8.1, 13.3, 14.2, 14.6, 15.5
 */

exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Postgres names an inline CHECK on column `action` of table `audit_log` as
  // `audit_log_action_check`.  Drop it first, then add the expanded version.
  pgm.sql(`
    ALTER TABLE audit_log
      DROP CONSTRAINT IF EXISTS audit_log_action_check;

    ALTER TABLE audit_log
      ADD CONSTRAINT audit_log_action_check
      CHECK (action IN (
        'create',
        'update',
        'delete',
        'export',
        'retention_delete',
        'dsar_delete',
        'ai_call',
        'content_generate',
        'content_manage'
      ));
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Restore the original CHECK constraint (without content_ actions).
  pgm.sql(`
    ALTER TABLE audit_log
      DROP CONSTRAINT IF EXISTS audit_log_action_check;

    ALTER TABLE audit_log
      ADD CONSTRAINT audit_log_action_check
      CHECK (action IN (
        'create',
        'update',
        'delete',
        'export',
        'retention_delete',
        'dsar_delete',
        'ai_call'
      ));
  `);
};
