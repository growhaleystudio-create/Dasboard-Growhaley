/**
 * Migration: visual-reference
 *
 * Creates the `visual_reference` table for Fase 3 Visual Reference Management.
 * Stores uploaded carousel reference images and their extracted Visual DNA
 * (component sequence + typography scale ratio).
 *
 * feature-update.md → Modul 2 (Structural Reference Dataset) + Section 3.1 point 3.
 */

/* eslint-disable @typescript-eslint/no-var-requires, camelcase */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE visual_reference (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id              uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      name                 text NOT NULL DEFAULT '',
      image_url            text NOT NULL,
      -- Visual DNA extracted by Vision AI
      component_sequence   jsonb NOT NULL DEFAULT '[]',
      header_to_body_ratio float NOT NULL DEFAULT 2.2,
      layout_archetype     text NOT NULL DEFAULT 'text_dominant'
                             CHECK (layout_archetype IN ('text_dominant','split_screen','background_overlay')),
      typography_scale     text NOT NULL DEFAULT 'balanced_classic'
                             CHECK (typography_scale IN ('editorial_bold','balanced_classic','information_dense')),
      -- optional tags for retrieval
      tags                 jsonb NOT NULL DEFAULT '[]',
      created_at           timestamptz NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX idx_visual_ref_team ON visual_reference(team_id, created_at DESC);`);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_visual_ref_team;`);
  pgm.sql(`DROP TABLE IF EXISTS visual_reference;`);
};
