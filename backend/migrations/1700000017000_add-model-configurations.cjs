/**
 * Migration: add-model-configurations
 *
 * Stores selected model names for text generation (leads) and image generation.
 */

/* eslint-disable camelcase */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE team_ai_settings
      ADD COLUMN IF NOT EXISTS text_model text DEFAULT 'gemini-2.5-flash-lite',
      ADD COLUMN IF NOT EXISTS image_model text DEFAULT 'gpt-image-1';

    UPDATE team_ai_settings
       SET text_model = COALESCE(text_model, 'gemini-2.5-flash-lite'),
           image_model = COALESCE(image_model, 'gpt-image-1');
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE team_ai_settings
      DROP COLUMN IF EXISTS image_model,
      DROP COLUMN IF EXISTS text_model;
  `);
};
