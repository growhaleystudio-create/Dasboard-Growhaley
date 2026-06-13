/**
 * Migration: init-core-schema
 *
 * Creates the core PostgreSQL schema for the Leads Generation Dashboard.
 * Mirrors the "Data Models -> Skema PostgreSQL" section of design.md and
 * includes the AI columns added by R13 on `scan_configuration`, `lead`,
 * and `audit_log` so the initial schema is internally consistent.
 *
 * Tables `team_ai_settings` and `ai_call_log` are NOT created here; they
 * belong to Task 17.1 and ship in a separate migration.
 *
 * Constraints applied here cover the design's CHECK rules for roles,
 * statuses, length bounds, score ranges, and the partial unique indexes
 * `uniq_running_job` and `uniq_pending_invite`.
 */

/* eslint-disable @typescript-eslint/no-var-requires, camelcase */

exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // -- Extensions ------------------------------------------------------------
  // pgcrypto provides gen_random_uuid() used by all uuid PKs.
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  // citext supports case-insensitive email comparisons (app_user, invitation).
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS citext;`);

  // -- Identity & team -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE team (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      data_retention_days integer NOT NULL DEFAULT 365, -- R11.7
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE app_user (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email citext UNIQUE NOT NULL,                      -- citext = case-insensitive
      password_hash text NOT NULL,                       -- argon2/bcrypt
      failed_login_count integer NOT NULL DEFAULT 0,     -- R1.6
      locked_until timestamptz,                          -- R1.6
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE user_membership (
      team_id uuid NOT NULL REFERENCES team(id),
      user_id uuid NOT NULL REFERENCES app_user(id),
      role text NOT NULL CHECK (role IN ('admin','member','viewer')), -- R2.4-R2.7
      status text NOT NULL CHECK (status IN ('pending','active')),    -- R2.2, R2.5
      PRIMARY KEY (team_id, user_id)
    );
  `);

  pgm.sql(`
    CREATE TABLE invitation (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES team(id),
      email citext NOT NULL CHECK (length(email) <= 254),                  -- R2.1, R2.9
      role text NOT NULL CHECK (role IN ('admin','member','viewer')),       -- R2.4-R2.7
      status text NOT NULL CHECK (status IN ('pending','active','expired')), -- R2.10
      token text UNIQUE NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,                                      -- R2.1 (created_at + 168h)
      -- Prevent duplicate active/pending invites for the same email per team (R2.9)
      CONSTRAINT uniq_pending_invite UNIQUE (team_id, email, status)
    );
  `);

  // -- Connector & credentials ----------------------------------------------
  pgm.sql(`
    CREATE TABLE team_connector (
      team_id uuid NOT NULL REFERENCES team(id),
      source_id text NOT NULL,
      status text NOT NULL CHECK (status IN ('available','unavailable','requires_configuration')), -- R3.1
      unavailable_reason text,                  -- R3.3
      encrypted_credentials bytea,              -- R3.4 (encrypted at rest)
      usage_policy jsonb,                       -- R11.9
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (team_id, source_id)
    );
  `);

  // -- Scan configuration & jobs --------------------------------------------
  pgm.sql(`
    CREATE TABLE scan_configuration (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES team(id),
      keywords text[] NOT NULL CHECK (array_length(keywords,1) BETWEEN 1 AND 50), -- R4.1, R4.7
      niche text CHECK (niche IS NULL OR length(niche) <= 100),                   -- R4.4
      location text CHECK (location IS NULL OR length(location) <= 100),          -- R4.4
      source_ids text[] NOT NULL CHECK (array_length(source_ids,1) >= 1),         -- R4.3, R4.8
      schedule_interval_minutes integer
        CHECK (schedule_interval_minutes IS NULL
               OR schedule_interval_minutes BETWEEN 60 AND 43200),                -- R5.6 (1 jam..30 hari)
      ai_enabled boolean NOT NULL DEFAULT false,                                   -- R13.4 (opt-in per Scan_Configuration)
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE scan_job (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES team(id),
      configuration_id uuid NOT NULL REFERENCES scan_configuration(id),
      trigger text NOT NULL CHECK (trigger IN ('manual','scheduled')),
      status text NOT NULL CHECK (status IN ('running','succeeded','failed','skipped')), -- R5.8, R12.4
      summary jsonb NOT NULL DEFAULT '{}',      -- ScanSummary (R5.3)
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz
    );
  `);

  // Overlap prevention (R5.8): only one running job per scan_configuration.
  pgm.sql(`
    CREATE UNIQUE INDEX uniq_running_job
      ON scan_job (configuration_id)
      WHERE status = 'running';
  `);

  // -- Lead -----------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE lead (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES team(id),
      name text,                                          -- public Personal_Data (R11.1)
      public_contact text,
      profile_url text,
      location text,
      matched_keywords text[] NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'New'
        CHECK (status IN ('New','Reviewed','Contacted','Qualified','Converted','Rejected')), -- R8.1
      score smallint CHECK (score IS NULL OR score BETWEEN 0 AND 100),                       -- R7.2; NULL = unscored (R7.8)
      score_state text NOT NULL DEFAULT 'unscored'
        CHECK (score_state IN ('scored','unscored')),                                        -- R7.8
      is_duplicate boolean NOT NULL DEFAULT false,                                            -- R6.1, R10.1
      duplicate_of uuid REFERENCES lead(id),                                                  -- R6.1
      discovered_at timestamptz NOT NULL DEFAULT now(),                                       -- R8.8, R10.6
      acquired_source text,                                                                   -- R11.2 (traceability)
      acquired_at timestamptz,                                                                -- R11.2
      ai_intent_score smallint
        CHECK (ai_intent_score IS NULL OR ai_intent_score BETWEEN 0 AND 100),                 -- R13.9
      ai_insight text CHECK (ai_insight IS NULL OR length(ai_insight) <= 500),                -- R13.9
      ai_state text NOT NULL DEFAULT 'none'
        CHECK (ai_state IN ('none','pending','success','unavailable')),                       -- R13.13, R13.15
      ai_unavailable_reason text,                                                              -- e.g. 'no_api_key', 'budget_exceeded', 'timeout'
      ai_analyzed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE lead_source (   -- list of Sources per canonical Lead (R6.2)
      lead_id uuid NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
      source_id text NOT NULL,
      acquired_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (lead_id, source_id)
    );
  `);

  pgm.sql(`
    CREATE TABLE lead_note (   -- R8.3, R8.4
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id uuid NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
      body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),  -- R8.3, R8.4
      author_id uuid NOT NULL REFERENCES app_user(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE activity (    -- R8.2
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id uuid NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
      type text NOT NULL CHECK (type IN ('status_change','note_added','deleted')),
      actor_id uuid,
      from_status text,
      to_status text,
      at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // -- Scoring --------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE scoring_model (
      team_id uuid PRIMARY KEY REFERENCES team(id),
      version integer NOT NULL DEFAULT 1,   -- R7.3 (increments on update)
      factors jsonb NOT NULL DEFAULT '[]'
    );
  `);

  pgm.sql(`
    CREATE TABLE score_contribution (   -- R7.6 factor breakdown stored
      lead_id uuid NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
      model_version integer NOT NULL,
      factor_id text NOT NULL,
      raw_value numeric NOT NULL,
      weighted_value numeric NOT NULL,
      PRIMARY KEY (lead_id, factor_id)
    );
  `);

  pgm.sql(`
    CREATE TABLE scoring_failure (   -- R7.8 failure/uncertainty record
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id uuid NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
      reason text NOT NULL CHECK (reason IN ('compute_error','model_unconfigured','uncertain')),
      at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // -- Audit ----------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE audit_log (   -- R11.2, R11.5, R11.8, R13.8
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES team(id),
      actor_id text NOT NULL,    -- uuid of user, or the literal 'system'
      action text NOT NULL CHECK (action IN
        ('create','update','delete','export','retention_delete','dsar_delete','ai_call')), -- R13.8 adds 'ai_call'
      object_type text NOT NULL,
      object_id text NOT NULL,
      metadata jsonb,            -- e.g. ai_call: { trigger, outcome, reason }
      at timestamptz NOT NULL DEFAULT now()
    );
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop in reverse order to respect foreign-key dependencies.
  pgm.sql(`DROP TABLE IF EXISTS audit_log;`);
  pgm.sql(`DROP TABLE IF EXISTS scoring_failure;`);
  pgm.sql(`DROP TABLE IF EXISTS score_contribution;`);
  pgm.sql(`DROP TABLE IF EXISTS scoring_model;`);
  pgm.sql(`DROP TABLE IF EXISTS activity;`);
  pgm.sql(`DROP TABLE IF EXISTS lead_note;`);
  pgm.sql(`DROP TABLE IF EXISTS lead_source;`);
  pgm.sql(`DROP TABLE IF EXISTS lead;`);
  // Drop the partial unique index explicitly before scan_job, even though
  // dropping the table would also drop it.
  pgm.sql(`DROP INDEX IF EXISTS uniq_running_job;`);
  pgm.sql(`DROP TABLE IF EXISTS scan_job;`);
  pgm.sql(`DROP TABLE IF EXISTS scan_configuration;`);
  pgm.sql(`DROP TABLE IF EXISTS team_connector;`);
  pgm.sql(`DROP TABLE IF EXISTS invitation;`);
  pgm.sql(`DROP TABLE IF EXISTS user_membership;`);
  pgm.sql(`DROP TABLE IF EXISTS app_user;`);
  pgm.sql(`DROP TABLE IF EXISTS team;`);
  // Extensions are intentionally retained; other migrations may depend on them.
};
