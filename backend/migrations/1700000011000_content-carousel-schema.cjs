/**
 * Migration: content-carousel-schema
 *
 * Creates the carousel/content generation schema for the AI Content Carousel
 * Generator feature. Implements all tables, CHECK constraints, UNIQUE
 * constraints, and indexes specified in:
 *
 *   Design  : Data Models → Skema PostgreSQL
 *   Requirements: 1.5, 1.6, 2.1, 2.5, 5.8, 5.9, 5.11, 8.1, 8.5,
 *                 10.2, 10.5, 11.4, 14.1, 14.5, 16.1
 *
 * Tables created (dependency order):
 *   brand_kit                  – per-team brand asset references (URL only, no base64)
 *   brand_font                 – fonts belonging to a brand_kit
 *   master_template            – slide generation rules per team
 *   content_provider_setting   – Gemini endpoint config per team
 *   content_generation_job     – async generation request + overall status
 *   content_generation_slide   – per-slide result with image_url (Object_Storage ref)
 *   approved_example           – approved layout structures for the example library
 *
 * NOTE: All image / font asset columns are URL references to Object_Storage.
 *       No base64 / data-URI columns are included (Requirements 1.5, 5.9, 5.11, 16.1).
 */

/* eslint-disable @typescript-eslint/no-var-requires, camelcase */

exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // -- brand_kit ------------------------------------------------------------
  // One Brand_Kit per team (UNIQUE). Stores Object_Storage URL references for
  // logo + fonts; JSON columns for color palette and chrome spec (Requirements
  // 1.5, 1.6, 16.1).
  pgm.sql(`
    CREATE TABLE brand_kit (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id     uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      logo_url    text NOT NULL,
      colors      jsonb NOT NULL,
      chrome      jsonb NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT brand_kit_colors_nonempty CHECK (jsonb_array_length(colors) >= 1),
      CONSTRAINT uniq_brand_kit_team UNIQUE (team_id)
    );
  `);

  // -- brand_font -----------------------------------------------------------
  // Fonts attached to a brand_kit. URL reference to Object_Storage (.ttf/.otf
  // only). Optional weight/style columns (Requirements 1.5).
  pgm.sql(`
    CREATE TABLE brand_font (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_kit_id  uuid NOT NULL REFERENCES brand_kit(id) ON DELETE CASCADE,
      url           text NOT NULL,
      family        text NOT NULL,
      weight        integer,
      style         text CHECK (style IS NULL OR style IN ('normal','italic')),
      format        text NOT NULL CHECK (format IN ('ttf','otf')),
      created_at    timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`CREATE INDEX idx_brand_font_kit ON brand_font(brand_kit_id);`);

  // -- master_template ------------------------------------------------------
  // Slide generation rules per team. Enforces hard limits: max_slides 1..10,
  // at least one allowed_block type, at least one aspect_ratio
  // (Requirements 2.1, 2.5).
  pgm.sql(`
    CREATE TABLE master_template (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id         uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      brand_kit_id    uuid NOT NULL REFERENCES brand_kit(id),
      allowed_blocks  jsonb NOT NULL,
      max_slides      integer NOT NULL CHECK (max_slides BETWEEN 1 AND 10),
      text_limits     jsonb NOT NULL DEFAULT '[]',
      aspect_ratios   jsonb NOT NULL,
      default_tone    text NOT NULL DEFAULT '',
      updated_at      timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT master_template_blocks_nonempty CHECK (jsonb_array_length(allowed_blocks) >= 1),
      CONSTRAINT master_template_ratios_nonempty CHECK (jsonb_array_length(aspect_ratios) >= 1),
      CONSTRAINT uniq_master_template_team UNIQUE (team_id)
    );
  `);

  // -- content_provider_setting ---------------------------------------------
  // Gemini / third-party proxy endpoint config per team. Default google_official.
  // HTTPS-only enforced via CHECK (Requirements 14.1, 14.5).
  pgm.sql(`
    CREATE TABLE content_provider_setting (
      team_id     uuid PRIMARY KEY REFERENCES team(id) ON DELETE CASCADE,
      kind        text NOT NULL DEFAULT 'google_official'
                    CHECK (kind IN ('google_official','third_party_proxy')),
      base_url    text NOT NULL DEFAULT 'https://generativelanguage.googleapis.com',
      CONSTRAINT provider_https_only CHECK (base_url LIKE 'https://%'),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
  `);

  // -- content_generation_job -----------------------------------------------
  // Async generation request. prompt trimmed and bounded 1..2000. status enum.
  // aspect_ratio validated against allowed set (Requirements 10.2, 10.5).
  pgm.sql(`
    CREATE TABLE content_generation_job (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id            uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      master_template_id uuid REFERENCES master_template(id),
      prompt             text NOT NULL CHECK (length(btrim(prompt)) BETWEEN 1 AND 2000),
      aspect_ratio       text NOT NULL CHECK (aspect_ratio IN ('1:1','4:5','9:16')),
      status             text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','success','failed')),
      reason             text,
      inputs             jsonb NOT NULL DEFAULT '{}',
      created_at         timestamptz NOT NULL DEFAULT now(),
      finished_at        timestamptz
    );
  `);

  // Index supports per-team job listing ordered by recency (Requirements 10.5).
  pgm.sql(`CREATE INDEX idx_cgj_team ON content_generation_job(team_id, created_at DESC);`);

  // -- content_generation_slide ---------------------------------------------
  // Per-slide result. image_url is an Object_Storage URL reference; never
  // null when status='success' (slide_success_has_url). reason required on
  // failure (slide_failed_has_reason) (Requirements 5.8, 5.9, 5.11, 11.4).
  pgm.sql(`
    CREATE TABLE content_generation_slide (
      job_id             uuid NOT NULL REFERENCES content_generation_job(id) ON DELETE CASCADE,
      index              integer NOT NULL CHECK (index >= 0),
      status             text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','success','failed')),
      image_url          text,
      reason             text,
      used_fallback      boolean NOT NULL DEFAULT false,
      block_composition  jsonb NOT NULL DEFAULT '[]',
      PRIMARY KEY (job_id, index),
      CONSTRAINT slide_success_has_url CHECK (status <> 'success' OR image_url IS NOT NULL),
      CONSTRAINT slide_failed_has_reason CHECK (status <> 'failed' OR reason IS NOT NULL)
    );
  `);

  // -- approved_example -----------------------------------------------------
  // Approved layout structures (layout JSON, no brand data). Scoped per team.
  // source_job_id SET NULL on job delete (Requirements 8.1, 8.5).
  pgm.sql(`
    CREATE TABLE approved_example (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id          uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      layout_structure jsonb NOT NULL,
      tags             jsonb NOT NULL DEFAULT '[]',
      aspect_ratio     text NOT NULL CHECK (aspect_ratio IN ('1:1','4:5','9:16')),
      source_job_id    uuid REFERENCES content_generation_job(id) ON DELETE SET NULL,
      created_at       timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`CREATE INDEX idx_approved_example_team ON approved_example(team_id);`);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop indexes and tables in reverse dependency order.

  // approved_example
  pgm.sql(`DROP INDEX IF EXISTS idx_approved_example_team;`);
  pgm.sql(`DROP TABLE IF EXISTS approved_example;`);

  // content_generation_slide (depends on content_generation_job)
  pgm.sql(`DROP TABLE IF EXISTS content_generation_slide;`);

  // content_generation_job
  pgm.sql(`DROP INDEX IF EXISTS idx_cgj_team;`);
  pgm.sql(`DROP TABLE IF EXISTS content_generation_job;`);

  // content_provider_setting
  pgm.sql(`DROP TABLE IF EXISTS content_provider_setting;`);

  // master_template (depends on brand_kit + team)
  pgm.sql(`DROP TABLE IF EXISTS master_template;`);

  // brand_font (depends on brand_kit)
  pgm.sql(`DROP INDEX IF EXISTS idx_brand_font_kit;`);
  pgm.sql(`DROP TABLE IF EXISTS brand_font;`);

  // brand_kit
  pgm.sql(`DROP TABLE IF EXISTS brand_kit;`);
};
