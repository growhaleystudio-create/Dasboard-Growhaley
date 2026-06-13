/**
 * Migration: 1700000005000_expand-ai-insight
 * Purpose:   Allow richer Gemini lead-scoring reasoning in lead.ai_insight.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE lead
      DROP CONSTRAINT IF EXISTS lead_ai_insight_check,
      ADD CONSTRAINT lead_ai_insight_check
        CHECK (ai_insight IS NULL OR length(ai_insight) <= 2000);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE lead
      DROP CONSTRAINT IF EXISTS lead_ai_insight_check,
      ADD CONSTRAINT lead_ai_insight_check
        CHECK (ai_insight IS NULL OR length(ai_insight) <= 500);
  `);
};
