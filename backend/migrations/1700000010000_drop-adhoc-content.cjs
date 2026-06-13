/**
 * Migration: 1700000010000_drop-adhoc-content
 * Purpose: Drop ad-hoc content tables superseded by the Master Template system.
 *          Closes migrations 1700000007000 and 1700000009000.
 *          No data migration needed — these tables are pre-production only.
 *
 * Dropped objects (in dependency order):
 *   - idx_content_generation_team  (index on content_generation)
 *   - idx_content_template_team    (index on content_template)
 *   - content_generation           (references content_template)
 *   - content_template_reference   (references content_template)
 *   - content_template             (root table)
 *
 * Design: Data Models → Rencana Migrasi (Supersede Tabel Konten Ad-hoc)
 * Requirements: R2 (Master_Template replaces content_template), R10
 */

exports.shorthands = undefined;

const expandedTypes = [
  'instagram',
  'email_marketing',
  'threads',
  'linkedin',
  'facebook',
  'twitter_x',
  'social_post',
  'email_banner',
  'carousel',
  'story',
  'other',
];

exports.up = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_content_generation_team;
    DROP INDEX IF EXISTS idx_content_template_team;
    DROP TABLE IF EXISTS content_generation;
    DROP TABLE IF EXISTS content_template_reference;
    DROP TABLE IF EXISTS content_template;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    CREATE TABLE content_template (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id         uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      name            text NOT NULL,
      type            text NOT NULL CHECK (type IN ('social_post', 'email_banner', 'carousel', 'story', 'other')),
      style_guide     jsonb NOT NULL DEFAULT '{}'::jsonb,
      system_prompt   text NOT NULL DEFAULT '',
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE content_template_reference (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id   uuid NOT NULL REFERENCES content_template(id) ON DELETE CASCADE,
      image_url     text NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE content_generation (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id             uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      template_id         uuid REFERENCES content_template(id) ON DELETE SET NULL,
      prompt              text NOT NULL,
      generated_text      text,
      generated_image_url text,
      created_at          timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_content_template_team ON content_template(team_id);
    CREATE INDEX idx_content_generation_team ON content_generation(team_id);

    ALTER TABLE content_template
      DROP CONSTRAINT IF EXISTS content_template_type_check;

    ALTER TABLE content_template
      ADD CONSTRAINT content_template_type_check
      CHECK (type IN (${expandedTypes.map((type) => `'${type}'`).join(', ')}));
  `);
};
