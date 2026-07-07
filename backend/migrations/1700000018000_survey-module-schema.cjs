/* eslint-disable @typescript-eslint/no-var-requires, camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE survey (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES team(id),
      title text NOT NULL CHECK (length(btrim(title)) > 0),
      description text,
      project_goal text NOT NULL CHECK (length(btrim(project_goal)) > 0),
      background_context text,
      target_participant text,
      primary_decision text,
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
      public_slug text UNIQUE,
      response_quota integer CHECK (response_quota IS NULL OR response_quota >= 1),
      response_count integer NOT NULL DEFAULT 0 CHECK (response_count >= 0),
      current_version integer NOT NULL DEFAULT 1 CHECK (current_version >= 1),
      published_at timestamptz,
      closed_at timestamptz,
      created_by uuid REFERENCES app_user(id),
      updated_by uuid REFERENCES app_user(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE survey_question (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      survey_id uuid NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
      team_id uuid NOT NULL REFERENCES team(id),
      version integer NOT NULL CHECK (version >= 1),
      question_key text NOT NULL CHECK (length(btrim(question_key)) > 0),
      type text NOT NULL CHECK (type IN ('short_text','long_text','multiple_choice','checkboxes','dropdown','linear_scale','matrix')),
      title text NOT NULL CHECK (length(btrim(title)) > 0),
      description text,
      required boolean NOT NULL DEFAULT false,
      display_order integer NOT NULL CHECK (display_order >= 0),
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      logic_rules jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uniq_survey_question_key_per_version UNIQUE (survey_id, version, question_key)
    );
  `);

  pgm.sql(`
    CREATE TABLE survey_response (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      survey_id uuid NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
      team_id uuid NOT NULL REFERENCES team(id),
      survey_version integer NOT NULL CHECK (survey_version >= 1),
      status text NOT NULL CHECK (status IN ('in_progress','completed','abandoned')),
      answers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      analysis_state text NOT NULL DEFAULT 'none' CHECK (analysis_state IN ('none','pending','success','failed')),
      started_at timestamptz NOT NULL DEFAULT now(),
      submitted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE survey_response_answer (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      response_id uuid NOT NULL REFERENCES survey_response(id) ON DELETE CASCADE,
      survey_id uuid NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
      team_id uuid NOT NULL REFERENCES team(id),
      question_id uuid NOT NULL REFERENCES survey_question(id),
      question_key text NOT NULL,
      question_type text NOT NULL CHECK (question_type IN ('short_text','long_text','multiple_choice','checkboxes','dropdown','linear_scale','matrix')),
      answer_text text,
      answer_number numeric,
      answer_option text,
      answer_options jsonb,
      answer_matrix jsonb,
      normalized_value text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE survey_analysis (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      survey_id uuid NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
      team_id uuid NOT NULL REFERENCES team(id),
      scope text NOT NULL CHECK (scope IN ('overall','question','segment')),
      question_id uuid REFERENCES survey_question(id),
      filter_hash text,
      status text NOT NULL CHECK (status IN ('pending','success','failed')),
      input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
      result_json jsonb,
      model text,
      error_message text,
      created_by uuid REFERENCES app_user(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(
    `CREATE INDEX idx_survey_team_status_created ON survey(team_id, status, created_at DESC);`,
  );
  pgm.sql(
    `CREATE INDEX idx_survey_question_order ON survey_question(survey_id, version, display_order);`,
  );
  pgm.sql(
    `CREATE INDEX idx_survey_response_submitted ON survey_response(survey_id, submitted_at DESC);`,
  );
  pgm.sql(
    `CREATE INDEX idx_survey_response_team_status ON survey_response(team_id, survey_id, status);`,
  );
  pgm.sql(
    `CREATE INDEX idx_survey_response_answer_qkey ON survey_response_answer(survey_id, question_key);`,
  );
  pgm.sql(`CREATE INDEX idx_survey_response_answer_qid ON survey_response_answer(question_id);`);
  pgm.sql(
    `CREATE INDEX idx_survey_analysis_scope_status ON survey_analysis(survey_id, scope, status);`,
  );
  pgm.sql(
    `CREATE INDEX idx_survey_public_slug ON survey(public_slug) WHERE public_slug IS NOT NULL;`,
  );
  pgm.sql(`CREATE INDEX idx_survey_response_created ON survey_response(created_at DESC);`);

  pgm.sql(`
    ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
  `);
  pgm.sql(`
    ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN
      ('create','update','delete','export','retention_delete','dsar_delete','ai_call','content_generate','content_manage','survey_analysis','survey_export'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_survey_response_created;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_survey_public_slug;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_survey_analysis_scope_status;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_survey_response_answer_qid;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_survey_response_answer_qkey;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_survey_response_team_status;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_survey_response_submitted;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_survey_question_order;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_survey_team_status_created;`);
  pgm.sql(`DROP TABLE IF EXISTS survey_analysis;`);
  pgm.sql(`DROP TABLE IF EXISTS survey_response_answer;`);
  pgm.sql(`DROP TABLE IF EXISTS survey_response;`);
  pgm.sql(`DROP TABLE IF EXISTS survey_question;`);
  pgm.sql(`DROP TABLE IF EXISTS survey;`);

  pgm.sql(`ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;`);
  pgm.sql(`
    ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN
      ('create','update','delete','export','retention_delete','dsar_delete','ai_call'));
  `);
};
