/**
 * Migration: split-ai-api-keys
 *
 * Adds separate encrypted API key slots for:
 * - lead analysis
 * - content suggestion / text planning
 * - image generation
 *
 * The previous `encrypted_gemini_api_key` column is retained as a legacy
 * fallback and copied into the new columns so existing teams keep working.
 */

/* eslint-disable camelcase */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE team_ai_settings
      ADD COLUMN IF NOT EXISTS encrypted_leads_api_key bytea,
      ADD COLUMN IF NOT EXISTS encrypted_content_suggestion_api_key bytea,
      ADD COLUMN IF NOT EXISTS encrypted_image_generation_api_key bytea;

    UPDATE team_ai_settings
       SET encrypted_leads_api_key = COALESCE(encrypted_leads_api_key, encrypted_gemini_api_key),
           encrypted_content_suggestion_api_key = COALESCE(encrypted_content_suggestion_api_key, encrypted_gemini_api_key),
           encrypted_image_generation_api_key = COALESCE(encrypted_image_generation_api_key, encrypted_gemini_api_key)
     WHERE encrypted_gemini_api_key IS NOT NULL;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE team_ai_settings
      DROP COLUMN IF EXISTS encrypted_image_generation_api_key,
      DROP COLUMN IF EXISTS encrypted_content_suggestion_api_key,
      DROP COLUMN IF EXISTS encrypted_leads_api_key;
  `);
};
