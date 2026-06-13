/**
 * Migration: 1700000004000_outbox
 * Purpose:   Tambahkan tabel `outbox` pendukung Outbox Pattern untuk notifikasi
 *            yang bersifat persisted (R7.9, R12.4).
 *
 *            Pesan notifikasi (mis. `lead.unscored`) ditulis ke tabel `outbox`
 *            di dalam transaksi domain yang SAMA dengan penyimpanan Lead /
 *            `scoring_failure`. Sebuah worker terpisah kemudian membaca baris
 *            yang belum terkirim (`dispatched_at IS NULL`) dan mengirimkannya.
 *            Pola ini menjamin status domain mencerminkan kenyataan walau
 *            pengiriman notifikasi gagal, dan bila enqueue ke outbox gagal maka
 *            transaksi di-ROLLBACK bersama langkah penanganan kegagalan lainnya
 *            (atomic, R7.9).
 *
 * Dependency:
 *   Bergantung pada migrasi `1700000001000_init-core-schema.cjs` (Task 2.1)
 *   yang membuat tabel `team`. Migrasi ini bersifat purely additive.
 *
 * Requirements: R7.9, R12.4
 * Design ref:   design.md → Error Handling → Pola Transaksi & Kompensasi
 *               (Outbox pattern); Desain Scoring_Model → Penanganan unscored
 *               & Transaksionalitas.
 */

/* eslint-disable camelcase */

exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // ---------------------------------------------------------------------------
  // outbox — pesan notifikasi persisted (R7.9, R12.4).
  //   - team_id      : tenant scope (R2.8).
  //   - type         : jenis notifikasi, mis. 'lead.unscored'.
  //   - payload      : isi pesan arbitrer (JSON), mis. { leadId }.
  //   - created_at   : waktu enqueue (di dalam transaksi domain).
  //   - dispatched_at: NULL selama belum terkirim; diisi oleh worker pengirim.
  // ---------------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE outbox (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id       uuid NOT NULL REFERENCES team(id),
      type          text NOT NULL,
      payload       jsonb NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now(),
      dispatched_at timestamptz
    );
  `);

  // Index pendukung worker pengirim: ambil pesan yang belum terkirim per Team.
  pgm.sql(`
    CREATE INDEX idx_outbox_pending
      ON outbox (team_id, created_at)
      WHERE dispatched_at IS NULL;
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop dalam urutan terbalik dari pembuatan.
  pgm.sql(`DROP INDEX IF EXISTS idx_outbox_pending;`);
  pgm.sql(`DROP TABLE IF EXISTS outbox;`);
};
