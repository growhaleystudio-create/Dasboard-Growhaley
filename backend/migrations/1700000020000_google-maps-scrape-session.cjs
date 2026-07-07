exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE google_maps_scrape_session (
      id uuid PRIMARY KEY,
      team_id uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      keyword text NOT NULL CHECK (length(btrim(keyword)) BETWEEN 1 AND 100),
      location text CHECK (location IS NULL OR length(btrim(location)) <= 200),
      status text NOT NULL CHECK (status IN ('waiting_browser','collecting_results','importing','done','failed')),
      google_maps_url text NOT NULL,
      capture_token_hash text NOT NULL,
      summary jsonb NOT NULL DEFAULT '{}',
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      received_at timestamptz,
      completed_at timestamptz
    );
  `);

  pgm.sql(`
    CREATE INDEX idx_google_maps_scrape_session_team_created
      ON google_maps_scrape_session(team_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS google_maps_scrape_session;');
};
