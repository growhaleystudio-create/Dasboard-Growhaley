/**
 * Drop the Brand Kit feature (multi-tenant per-team branding). The product is
 * now single-tenant, dedicated to the Growhaley brand — colors/chrome are
 * hardcoded in backend/src/content/growhaley-brand.ts instead of being
 * configured per team.
 *
 * ⚠️ DESTRUCTIVE: drops master_template.brand_kit_id (FK + column),
 * brand_font, and brand_kit. Any existing per-team brand data is lost.
 * Do NOT run against a database whose brand_kit rows are still needed.
 */

/* eslint-disable @typescript-eslint/no-var-requires, camelcase */

exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE master_template DROP COLUMN IF EXISTS brand_kit_id;`);
  pgm.sql(`DROP TABLE IF EXISTS brand_font;`);
  pgm.sql(`DROP TABLE IF EXISTS brand_kit;`);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.sql(`
    CREATE TABLE brand_kit (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id     uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      logo_url    text NOT NULL,
      colors      jsonb NOT NULL,
      chrome      jsonb NOT NULL,
      typography  jsonb,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE (team_id)
    );
  `);
  pgm.sql(`
    CREATE TABLE brand_font (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_kit_id  uuid NOT NULL REFERENCES brand_kit(id) ON DELETE CASCADE,
      url           text NOT NULL,
      family        text NOT NULL,
      weight        integer,
      style         text CHECK (style IS NULL OR style IN ('normal','italic')),
      format        text NOT NULL CHECK (format IN ('ttf','otf'))
    );
  `);
  pgm.sql(`CREATE INDEX idx_brand_font_kit ON brand_font(brand_kit_id);`);
  pgm.sql(`ALTER TABLE master_template ADD COLUMN brand_kit_id uuid REFERENCES brand_kit(id);`);
};
