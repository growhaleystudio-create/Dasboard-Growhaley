/**
 * Migration: 1700000008000_make-lead-id-nullable
 * Purpose: Make lead_id nullable in ai_call_log table.
 *          This allows logging AI calls that are not tied to a specific lead (like content generation).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE ai_call_log ALTER COLUMN lead_id DROP NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE ai_call_log ALTER COLUMN lead_id SET NOT NULL;
  `);
};
