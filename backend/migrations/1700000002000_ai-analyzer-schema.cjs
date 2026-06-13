/**
 * Migration: 1700000002000_ai-analyzer-schema
 * Purpose:   Tambahkan tabel pendukung AI_Analyzer_Service (R13):
 *              - team_ai_settings   : kunci API Gemini terenkripsi per Team,
 *                                     toggle global, AI_Call_Budget, dan bobot
 *                                     factor `ai_intent_match`.
 *              - ai_call_log        : penghitung jendela bergulir 30 hari
 *                                     untuk AI_Call_Budget enforcement.
 *              - idx_ai_call_log_window : index pendukung query rolling window.
 *
 * Dependency:
 *   Bergantung pada migrasi `1700000001000_init-core-schema.cjs` (Task 2.1).
 *   Migrasi inti diasumsikan SUDAH membuat:
 *     - kolom AI di tabel `lead`
 *         (ai_intent_score, ai_insight, ai_state, ai_unavailable_reason,
 *          ai_analyzed_at)
 *     - kolom `ai_enabled` di `scan_configuration`
 *     - enum value `'ai_call'` pada CHECK action `audit_log` dan kolom
 *       `metadata jsonb` di `audit_log`.
 *
 *   Pemisahan ini menjaga migrasi inti tetap self-consistent sementara migrasi
 *   AI ini bersifat purely additive (bisa ditunda jika fitur AI di-disable).
 *
 * Requirements: R13.2, R13.10, R13.15, R13.18
 * Design ref:   design.md → Data Models → Pengayaan AI (R13)
 */

/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ---------------------------------------------------------------------------
  // team_ai_settings — konfigurasi AI per Team (R13.2, R13.10, R13.15, R13.18)
  // ---------------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE team_ai_settings (
      team_id                  uuid PRIMARY KEY REFERENCES team(id),
      -- R13.2: kunci API Gemini disimpan terenkripsi at-rest (envelope encryption);
      --        plaintext tidak pernah ditulis. Nullable agar Team tanpa kunci tetap valid.
      encrypted_gemini_api_key bytea,
      -- R13.18: toggle global AI per Team (Admin-only di layer aplikasi).
      ai_enabled               boolean NOT NULL DEFAULT false,
      -- R13.15, R13.18: AI_Call_Budget untuk jendela bergulir 30 hari.
      call_budget_30d          integer NOT NULL DEFAULT 0
                                 CHECK (call_budget_30d >= 0),
      -- R13.10: bobot factor 'ai_intent_match' pada agregasi skor.
      ai_intent_factor_weight  numeric NOT NULL DEFAULT 1.0
                                 CHECK (ai_intent_factor_weight >= 0),
      updated_at               timestamptz NOT NULL DEFAULT now()
    );
  `);

  // ---------------------------------------------------------------------------
  // ai_call_log — log panggilan AI untuk rolling window 30 hari (R13.15)
  // ---------------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE ai_call_log (
      id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id   uuid NOT NULL REFERENCES team(id),
      lead_id   uuid NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
      -- Pemicu panggilan: dari scan otomatis atau aksi manual (re-analyze).
      trigger   text NOT NULL CHECK (trigger IN ('scan','manual')),
      -- Hasil panggilan; mendukung enforcement budget & telemetri kegagalan.
      outcome   text NOT NULL CHECK (outcome IN (
                  'success',
                  'timeout',
                  'provider_error',
                  'malformed_output',
                  'no_api_key',
                  'budget_exceeded',
                  'quota_exceeded'
                )),
      at        timestamptz NOT NULL DEFAULT now()
    );
  `);

  // R13.15: index pendukung agregasi rolling window per Team.
  pgm.sql(`
    CREATE INDEX idx_ai_call_log_window ON ai_call_log (team_id, at);
  `);
};

exports.down = (pgm) => {
  // Reverse order: index → ai_call_log → team_ai_settings.
  pgm.sql(`DROP INDEX IF EXISTS idx_ai_call_log_window;`);
  pgm.sql(`DROP TABLE IF EXISTS ai_call_log;`);
  pgm.sql(`DROP TABLE IF EXISTS team_ai_settings;`);
};
