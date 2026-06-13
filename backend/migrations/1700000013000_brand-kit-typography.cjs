/**
 * Migration: brand-kit-typography
 *
 * Adds a nullable `typography` jsonb column to `brand_kit` to store the
 * per-role text styling system (header/body/highlight fonts + colors) and
 * chrome defaults (background, pagination, meta text, accent).
 *
 * feature-update.md → Brand Kit v2 (per-role typography).
 */

/* eslint-disable @typescript-eslint/no-var-requires, camelcase */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE brand_kit ADD COLUMN IF NOT EXISTS typography jsonb;`);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE brand_kit DROP COLUMN IF EXISTS typography;`);
};
