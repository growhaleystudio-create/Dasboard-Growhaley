/**
 * Migration: ai-api-base-urls
 *
 * Stores provider base URLs per AI key slot so API keys are not routed to any
 * hardcoded provider endpoint.
 */

/* eslint-disable camelcase */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE team_ai_settings
      ADD COLUMN IF NOT EXISTS leads_api_base_url text,
      ADD COLUMN IF NOT EXISTS image_generation_api_base_url text;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE team_ai_settings
      DROP COLUMN IF EXISTS image_generation_api_base_url,
      DROP COLUMN IF EXISTS leads_api_base_url;
  `);
};
