/**
 * Migration: 1700000003000_perf-indexes
 * Purpose:   Tambahkan indeks pendukung query daftar Lead, filter, pencarian
 *            substring (trigram), dan sweep retensi. Semua statement memakai
 *            `pgm.sql()` mentah karena indeks-indeks ini menggunakan partial
 *            WHERE clause, GIN, dan operator class trigram yang tidak bisa
 *            diekspresikan rapi via DSL helper node-pg-migrate.
 *
 * Dependency:
 *   Bergantung pada migrasi `1700000001000_init-core-schema.cjs` (Task 2.1).
 *   Tabel berikut harus sudah ada: `lead`, `lead_source` beserta kolom
 *   `team_id`, `score`, `discovered_at`, `is_duplicate`, `status`, `name`,
 *   `public_contact`, `location`, `acquired_at`, dan `lead_source.source_id`.
 *
 * Requirements / mapping:
 *   - idx_lead_default_sort  → R7.4, R7.5, R12.1 (sort bawaan halaman pertama
 *                              p95 < 2s pada 100k Lead, eksklusi duplikat R6.1)
 *   - idx_lead_status        → R9.3 (filter status, eksklusi duplikat)
 *   - idx_lead_source        → R9.4 (filter Source via lead_source)
 *   - pg_trgm + idx_lead_search_trgm
 *                            → R9.2, R12.2 (pencarian substring < 1s pada 10k Lead)
 *   - idx_lead_acquired_at   → R11.7 (sweep retensi per Team)
 *
 * Design ref: design.md → Data Models → Strategi Indeks (mendukung R9 & R12)
 */

/* eslint-disable @typescript-eslint/no-var-requires, camelcase */

exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // ---------------------------------------------------------------------------
  // Sort bawaan daftar Lead (R7.4, R7.5, R12.1) — eksklusi duplikat (R6.1, R10.1)
  // Komposit (team_id, score DESC, discovered_at DESC, id ASC) memungkinkan
  // keyset/limit tanpa full scan untuk Lead non-duplikat.
  // ---------------------------------------------------------------------------
  pgm.sql(`
    CREATE INDEX idx_lead_default_sort
      ON lead (team_id, score DESC, discovered_at DESC, id ASC)
      WHERE is_duplicate = false;
  `);

  // ---------------------------------------------------------------------------
  // Filter status (R9.3) — partial index untuk Lead non-duplikat saja.
  // ---------------------------------------------------------------------------
  pgm.sql(`
    CREATE INDEX idx_lead_status
      ON lead (team_id, status)
      WHERE is_duplicate = false;
  `);

  // ---------------------------------------------------------------------------
  // Filter Source via tabel lead_source (R9.4).
  // ---------------------------------------------------------------------------
  pgm.sql(`
    CREATE INDEX idx_lead_source
      ON lead_source (source_id);
  `);

  // ---------------------------------------------------------------------------
  // Pencarian substring case-insensitive (R9.2, R12.2) memakai trigram GIN
  // pada gabungan name + public_contact + location.
  // ---------------------------------------------------------------------------
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  pgm.sql(`
    CREATE INDEX idx_lead_search_trgm
      ON lead USING gin (
        (coalesce(name,'') || ' ' || coalesce(public_contact,'') || ' ' || coalesce(location,''))
        gin_trgm_ops
      );
  `);

  // ---------------------------------------------------------------------------
  // Sweep retensi (R11.7) per Team berdasarkan acquired_at.
  // ---------------------------------------------------------------------------
  pgm.sql(`
    CREATE INDEX idx_lead_acquired_at
      ON lead (team_id, acquired_at);
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop dalam urutan terbalik dari pembuatan.
  pgm.sql(`DROP INDEX IF EXISTS idx_lead_acquired_at;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_lead_search_trgm;`);
  // (extensions retained intentionally) — pg_trgm bisa dipakai bagian lain.
  pgm.sql(`DROP INDEX IF EXISTS idx_lead_source;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_lead_status;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_lead_default_sort;`);
};
