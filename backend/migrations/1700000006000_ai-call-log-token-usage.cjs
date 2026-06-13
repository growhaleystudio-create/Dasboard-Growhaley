/**
 * Migration: 1700000006000_ai-call-log-token-usage
 * Purpose:   Store Gemini usageMetadata token counts per AI call.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE ai_call_log
      ADD COLUMN IF NOT EXISTS prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
      ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
      ADD COLUMN IF NOT EXISTS total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE ai_call_log
      DROP COLUMN IF EXISTS total_tokens,
      DROP COLUMN IF EXISTS output_tokens,
      DROP COLUMN IF EXISTS prompt_tokens;
  `);
};
