/**
 * Migration: 1700000007000_content-generator-schema
 * Purpose: Add supporting tables for AI Content Generator:
 *          - content_template: store team-level content templates, style guides, and prompts.
 *          - content_template_reference: store references (image urls) for templates.
 *          - content_generation: store history of generated content (text and images).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
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
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_content_generation_team;
    DROP INDEX IF EXISTS idx_content_template_team;
    DROP TABLE IF EXISTS content_generation;
    DROP TABLE IF EXISTS content_template_reference;
    DROP TABLE IF EXISTS content_template;
  `);
};
