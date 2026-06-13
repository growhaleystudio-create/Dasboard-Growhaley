# Implementation Plan: Leads Generation Dashboard

## Overview

Rencana ini menerjemahkan desain menjadi langkah-langkah implementasi inkremental di atas stack target: **frontend Next.js/React**, **backend Node.js + TypeScript**, **PostgreSQL**, dan **Redis** (session store + antrian kerja). Urutan tugas mengikuti ketergantungan: scaffolding & skema basis data lebih dulu, lalu lapisan repository ber-tenant, kemudian domain services (Auth → RBAC → Connector → Scan Config → Connector contract → Deduplication → Scoring → Scan Engine → Lead Manager → Query → Metrics → Privacy), lalu lapisan API, frontend, dan validasi performa.

Pendekatan pengujian bersifat ganda sesuai desain:
- **Property-based tests (PBT)** dengan **fast-check** (minimum 100 iterasi, `{ numRuns: 100 }`) untuk ke-36 Correctness Properties. Setiap properti diimplementasikan oleh **tepat satu** property test dan diberi tag komentar dengan format: `Feature: leads-generator-dashboard, Property {n}: {teks properti}`.
- **Unit / integration / performance tests** untuk kriteria non-PBT (contoh, edge case, infrastruktur, dan target performa) sesuai bagian Testing Strategy desain.

Sub-tugas pengujian ditandai dengan `*` (opsional) dan tidak diimplementasikan secara otomatis. Sub-tugas implementasi inti tidak ditandai `*` dan wajib diimplementasikan.

## Tasks

- [x] 1. Scaffolding proyek dan kerangka pengujian
  - [x] 1.1 Inisialisasi struktur monorepo dan toolchain
    - Buat struktur direktori: `backend/` (Node.js + TypeScript), `frontend/` (Next.js App Router), `shared/` (tipe domain bersama)
    - Konfigurasi `tsconfig` (strict), ESLint, Prettier, dan skrip build/test di tiap paket
    - Tambahkan dependensi inti (pg, redis client, BullMQ/pg-boss, argon2) tanpa logika bisnis
    - _Design: Architecture → Pilihan Teknologi & Alasan_
    - _Requirements: dasar untuk seluruh requirement_

  - [x] 1.2 Konfigurasi test runner dan fast-check
    - Pasang Vitest/Jest + `fast-check` (dan `@fast-check/jest` jika dipakai)
    - Buat helper PBT bersama dengan default `{ numRuns: 100 }` dan konvensi tag `Feature: leads-generator-dashboard, Property {n}`
    - Siapkan kerangka folder `tests/property`, `tests/unit`, `tests/integration`
    - _Design: Testing Strategy → Pustaka & Konfigurasi PBT_
    - _Requirements: dasar untuk seluruh pengujian_

  - [x] 1.3 Definisikan tipe domain bersama
    - Implementasikan tipe `Result<T>`, `AppError`, `Role`, `Action`, `LeadStatus`, `ConnectorStatus` di paket `shared/`
    - Definisikan antarmuka entitas inti (Lead, NormalizedLead, ScoringModel, ScoringFactor, ScanConfiguration, AuthSession) sebagai kontrak tipe
    - _Design: Components and Interfaces; Error Handling → Bentuk Kesalahan Terpadu_
    - _Requirements: dasar untuk seluruh requirement_

- [x] 2. Skema basis data dan lapisan persistensi ber-tenant
  - [x] 2.1 Tulis migrasi skema PostgreSQL
    - Buat tabel: `team`, `app_user`, `user_membership`, `invitation`, `team_connector`, `scan_configuration`, `scan_job`, `lead`, `lead_source`, `lead_note`, `activity`, `scoring_model`, `score_contribution`, `scoring_failure`, `audit_log`
    - Terapkan constraint CHECK (peran, status, panjang, rentang skor) dan `uniq_running_job`, `uniq_pending_invite` sesuai skema desain
    - _Design: Data Models → Skema PostgreSQL_
    - _Requirements: 1.6, 2.1, 2.2, 2.4, 3.1, 3.4, 4.1, 4.4, 5.6, 5.8, 7.2, 7.6, 7.8, 8.1, 8.3, 11.1, 11.2, 11.7_

  - [x] 2.2 Tulis migrasi indeks pendukung query dan performa
    - Buat `idx_lead_default_sort`, `idx_lead_status`, `idx_lead_source`, ekstensi `pg_trgm` + `idx_lead_search_trgm`, dan `idx_lead_acquired_at`
    - _Design: Data Models → Strategi Indeks_
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 12.1, 12.2_

  - [x] 2.3 Setup koneksi DB, helper transaksi, dan klien Redis
    - Implementasikan pool koneksi PostgreSQL dan helper `withTransaction(tx => ...)`
    - Implementasikan klien Redis untuk session store dan antrian kerja (BullMQ/pg-boss)
    - _Design: Architecture → Pilihan Teknologi; Error Handling → Pola Transaksi & Kompensasi_
    - _Requirements: 7.9, 1.5, 1.6_

  - [x] 2.4 Implementasikan lapisan repository ber-tenant (Tenant Guard)
    - Buat repository dasar yang setiap metodenya WAJIB menerima `teamId`; tidak ada metode akses lintas-team
    - Implementasikan repository untuk Lead, ScanConfiguration, ScanJob, TeamConnector, ScoringModel
    - _Design: Components → Tenant Guard; Security → Isolasi tenant_
    - _Requirements: 2.8_

  - [ ]* 2.5 Tulis property test isolasi data tenant
    - **Property 16: Isolasi data tenant**
    - **Validates: Requirements 2.8**

- [x] 3. Auth_Service, sesi, idle timeout, dan penguncian akun (R1)
  - [x] 3.1 Implementasikan session store dan logika idle timeout
    - Simpan sesi server-side (Redis) dengan `lastActivityAt`; anggap kedaluwarsa bila idle ≥ 30 menit
    - Implementasikan `validateSession` yang memperbarui aktivitas pada permintaan valid
    - _Design: Auth_Service; Security → Autentikasi_
    - _Requirements: 1.5_

  - [ ]* 3.2 Tulis property test kedaluwarsa sesi idle
    - **Property 34: Kedaluwarsa sesi idle**
    - **Validates: Requirements 1.5**

  - [x] 3.3 Implementasikan login/logout, reset counter, dan penguncian akun
    - `login` memverifikasi kredensial (argon2), mereset `failed_login_count` saat sukses, mengunci akun 15 menit setelah 5 kegagalan berturut dalam jendela 15 menit
    - `logout` mengakhiri sesi; pesan kegagalan generik (tidak membedakan email/password)
    - _Design: Auth_Service → Aturan kunci akun; Error Handling → Auth_
    - _Requirements: 1.1, 1.2, 1.4, 1.6_

  - [ ]* 3.4 Tulis property test penguncian akun berbasis ambang
    - **Property 33: Penguncian akun berbasis ambang**
    - **Validates: Requirements 1.6**

  - [ ]* 3.5 Tulis unit test login sukses/gagal dan logout
    - Verifikasi sesi terbentuk + reset counter (R1.1), pesan generik tanpa membocorkan field (R1.2), logout mengakhiri sesi (R1.4)
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 3.6 Implementasikan middleware proteksi rute dan redirect login
    - Tolak permintaan tanpa sesi terautentikasi dengan 401 dan arahkan ke halaman login untuk seluruh halaman pengelolaan Lead
    - _Design: Alur Permintaan Berbasis Peran; Security → Keamanan endpoint_
    - _Requirements: 1.3_

- [x] 4. RBAC Guard dan isolasi peran (R2.4–R2.8)
  - [x] 4.1 Implementasikan matriks izin RBAC
    - Implementasikan `RBAC_Guard.can(role, action)` sesuai matriks (Admin/Member/Viewer); Viewer baca-saja termasuk saat `pending`
    - _Design: Auth/RBAC Guard → Matriks izin_
    - _Requirements: 2.4, 2.5, 2.6, 2.7_

  - [ ]* 4.2 Tulis property test matriks izin RBAC
    - **Property 15: Matriks izin RBAC**
    - **Validates: Requirements 2.4, 2.5, 2.6, 2.7, 11.6**

  - [x] 4.3 Integrasikan RBAC Guard dengan pembacaan peran efektif per-permintaan
    - Baca peran efektif dari sumber kebenaran (DB/cache yang di-invalidasi) tiap permintaan agar perubahan peran berlaku pada permintaan berikutnya
    - Rangkai RBAC Guard di hadapan Tenant Guard pada pipeline permintaan
    - _Design: Alur Permintaan Berbasis Peran → Catatan R2.3_
    - _Requirements: 2.3_

- [x] 5. Team_Service dan undangan (R2.1–R2.3, R2.9, R2.10)
  - [x] 5.1 Implementasikan pembuatan undangan dengan validasi
    - `invite` memvalidasi email valid & ≤ 254 char & belum ada keanggotaan aktif/pending, lalu membuat keanggotaan `pending` berlaku 168 jam
    - _Design: Team_Service → Validasi undangan_
    - _Requirements: 2.1, 2.9_

  - [ ]* 5.2 Tulis property test validasi undangan
    - **Property 35: Validasi undangan**
    - **Validates: Requirements 2.1, 2.9**

  - [x] 5.3 Implementasikan penerimaan undangan dan perubahan peran
    - `acceptInvitation` menautkan User & mengaktifkan keanggotaan bila belum kedaluwarsa; menolak bila lewat `expiresAt`
    - `changeRole` memperbarui peran keanggotaan
    - _Design: Team_Service_
    - _Requirements: 2.2, 2.3, 2.10_

  - [ ]* 5.4 Tulis unit test penerimaan kedaluwarsa dan perubahan peran
    - Verifikasi penolakan penerimaan setelah kedaluwarsa (R2.10) dan penerapan peran baru (R2.2, R2.3)
    - _Requirements: 2.2, 2.3, 2.10_

- [x] 6. Connector_Registry dan Credential_Vault (R3, R11.9)
  - [x] 6.1 Implementasikan Credential_Vault dengan enkripsi at-rest
    - `store`/`load` kredensial connector terenkripsi (envelope encryption); plaintext tidak pernah ditulis ke log
    - _Design: Credential_Vault; Security → Kredensial connector_
    - _Requirements: 3.4_

  - [x] 6.2 Implementasikan Connector_Registry (list/register/get)
    - `list` mengembalikan deskriptor dengan tepat satu status aktif; `register` default `available` dan tidak mengubah connector lain
    - Tampilkan `unavailableReason` untuk connector `unavailable`
    - _Design: Connector_Registry; Landskap Ketersediaan API_
    - _Requirements: 3.1, 3.2, 3.3, 3.9_

  - [ ]* 6.3 Tulis property test non-interferensi registrasi connector
    - **Property 21: Non-interferensi registrasi connector**
    - **Validates: Requirements 3.9**

  - [x] 6.4 Implementasikan mesin status aktivasi connector
    - `activate` memvalidasi kredensial ke API Source dengan timeout 30 detik: sukses → `available` + simpan terenkripsi; ditolak → `requires_configuration`; timeout/gagal simpan → pertahankan status sebelumnya
    - _Design: Connector_Registry → Mesin status aktivasi; Error Handling → Connector aktivasi_
    - _Requirements: 3.4, 3.5, 3.6, 3.7_

  - [ ]* 6.5 Tulis unit test aktivasi dan ketersediaan connector
    - Verifikasi default `available` (R3.2), source tanpa API → `unavailable` + alasan (R3.3), aktivasi sukses/ditolak/timeout/gagal simpan (R3.4–R3.7)
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 7. Kontrak Source_Connector dan normalisasi (R5.2, R11.1, R11.9)
  - [x] 7.1 Definisikan kontrak Source_Connector dan fungsi normalize
    - Implementasikan interface `Source_Connector` (`checkAvailability`, `fetch` dengan AbortSignal, `normalize`) dan whitelist field publik (`name`, `public_contact`, `profile_url`, `location`)
    - `normalize` menetapkan `status='New'`, `discovered_at`, `acquired_source`, `acquired_at`, dan `matchedKeyword`
    - _Design: Source_Connector; Privacy → Minimisasi data_
    - _Requirements: 5.2, 8.8, 11.1, 11.2_

  - [ ]* 7.2 Tulis property test normalisasi Lead baru
    - **Property 14: Normalisasi Lead baru**
    - **Validates: Requirements 5.2, 8.8, 11.2**

  - [ ]* 7.3 Tulis property test penegakan kebijakan penggunaan Source
    - **Property 32: Penegakan kebijakan penggunaan Source**
    - **Validates: Requirements 11.9**

  - [x] 7.4 Implementasikan contoh Source_Connector dan penegakan UsagePolicy
    - Implementasikan minimal satu connector contoh + stub `checkAvailability`; terapkan `UsagePolicy` (buang `disallowFields`, batasi retensi) pada `normalize`
    - _Design: Source_Connector; Privacy → Penegakan ToS Source_
    - _Requirements: 11.9_

  - [ ]* 7.5 Tulis unit test whitelist field publik
    - Verifikasi hanya field publik yang dipertahankan saat normalisasi (R11.1)
    - _Requirements: 11.1_

- [x] 8. Scan_Config_Service (R4, R5.6)
  - [x] 8.1 Implementasikan pipeline validasi konfigurasi
    - Trim keyword & buang yang kosong; validasi 1–50 keyword, panjang 2–100 char, niche/location ≤ 100 char; kumpulkan SEMUA pesan kesalahan sekaligus
    - _Design: Scan_Config_Service → Pipeline validasi (langkah 1–4)_
    - _Requirements: 4.1, 4.2, 4.4, 4.7_

  - [ ]* 8.2 Tulis property test validasi & normalisasi Scan_Configuration
    - **Property 17: Validasi & normalisasi Scan_Configuration**
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.7**

  - [x] 8.3 Implementasikan penyaringan Source dan validasi interval penjadwalan
    - Saring Source non-`available` ke `excludedSources` + peringatan tanpa konfirmasi; tolak bila tidak ada Source tersisa; validasi interval 60–43200 menit
    - _Design: Scan_Config_Service → Pipeline validasi (langkah 5–6); ScheduleSpec_
    - _Requirements: 4.3, 4.6, 4.8, 5.6_

  - [ ]* 8.4 Tulis property test penyaringan Source non-available
    - **Property 18: Penyaringan Source non-available pada konfigurasi**
    - **Validates: Requirements 4.6, 4.8**

  - [ ]* 8.5 Tulis property test validasi interval penjadwalan
    - **Property 19: Validasi interval penjadwalan**
    - **Validates: Requirements 5.6**

- [x] 9. Deduplication_Service (R6)
  - [x] 9.1 Implementasikan normalisasi nilai dan kunci identitas
    - `identityKey` menerapkan `trim` + `toLowerCase`; aturan kecocokan: profile_url, atau email, atau name+location; nilai kosong tidak dipakai sebagai kunci
    - _Design: Algoritma Deduplikasi → Normalisasi & Kunci Identitas_
    - _Requirements: 6.3_

  - [ ]* 9.2 Tulis property test pencocokan identitas case-insensitive & trim
    - **Property 9: Pencocokan identitas case-insensitive & trim**
    - **Validates: Requirements 6.3**

  - [x] 9.3 Implementasikan ingest (create/merge) dan merge atribut
    - Lead cocok → tandai `is_duplicate`, tautkan ke kanonik, tambah Source ke `lead_source`, tanpa entri utama baru; tak cocok → buat entri kanonik baru; merge atribut existing-wins/fill-empty
    - _Design: Algoritma Deduplikasi → flow + Aturan Merge Atribut_
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 9.4 Tulis property test Lead cocok digabung tanpa entri utama baru
    - **Property 10: Lead cocok digabung tanpa entri utama baru**
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 9.5 Tulis property test Lead tak cocok menjadi entri terpisah
    - **Property 11: Lead tak cocok menjadi entri terpisah**
    - **Validates: Requirements 6.4, 6.6**

  - [ ]* 9.6 Tulis property test idempotensi ingest
    - **Property 12: Idempotensi ingest**
    - **Validates: Requirements 6.1, 6.4**

  - [ ]* 9.7 Tulis property test aturan merge atribut
    - **Property 13: Aturan merge atribut (existing-wins, fill-empty)**
    - **Validates: Requirements 6.5, 6.7**

- [x] 10. Lead_Scoring_Engine dan Scoring_Model (R7) — fitur utama
  - [x] 10.1 Implementasikan `computeScore` sebagai fungsi murni deterministik
    - Hitung `weightedValue = clamp(rawValue,0,1) * weight`, normalkan ke integer 0–100 dengan round half up; tanpa I/O/waktu/acak; hasilkan `FactorContribution` per faktor
    - _Design: Desain Scoring_Model → Model Faktor Berbobot_
    - _Requirements: 7.2, 7.6, 7.7_

  - [ ]* 10.2 Tulis property test determinisme skoring
    - **Property 1: Determinisme skoring**
    - **Validates: Requirements 7.7**

  - [ ]* 10.3 Tulis property test batas rentang skor
    - **Property 2: Batas rentang skor**
    - **Validates: Requirements 7.2**

  - [ ]* 10.4 Tulis property test kontribusi faktor konsisten dengan skor
    - **Property 4: Kontribusi faktor konsisten dengan skor**
    - **Validates: Requirements 7.6**

  - [x] 10.5 Implementasikan `scoreAndPersist` transaksional dengan penanganan unscored
    - Simpan Lead + `score_contribution` dalam satu transaksi; pada error/model kosong/tidak pasti simpan `score=null`, `score_state='unscored'` + `scoring_failure` + outbox notifikasi; rollback bila langkah penanganan kegagalan gagal
    - _Design: Desain Scoring_Model → Penanganan unscored & Transaksionalitas; Error Handling → Pola Transaksi_
    - _Requirements: 7.1, 7.8, 7.9_

  - [ ]* 10.6 Tulis property test persist & recompute konsisten dengan computeScore
    - **Property 3: Persist & recompute konsisten dengan computeScore**
    - **Validates: Requirements 7.1, 7.3**

  - [ ]* 10.7 Tulis property test penanganan keadaan unscored
    - **Property 5: Penanganan keadaan unscored**
    - **Validates: Requirements 7.8**

  - [ ]* 10.8 Tulis property test atomisitas penyimpanan Lead unscored
    - **Property 6: Atomisitas penyimpanan Lead unscored**
    - **Validates: Requirements 7.9**
    - Catatan: gunakan fault injection pada langkah logging/notifikasi untuk memicu rollback secara deterministik

  - [x] 10.9 Implementasikan Scoring_Model_Service dan recompute massal
    - `update` menaikkan `version`; `recomputeForTeam` menghitung ulang seluruh Lead dengan isolasi per-Lead (gagal → pertahankan skor lama, lanjut Lead lain) sebagai background job
    - _Design: Recompute saat Model Berubah_
    - _Requirements: 7.3, 7.10_

  - [ ]* 10.10 Tulis property test isolasi kegagalan recompute
    - **Property 7: Isolasi kegagalan recompute**
    - **Validates: Requirements 7.10**

- [x] 11. Checkpoint — pastikan logika domain inti lulus
  - Pastikan semua test (unit + property) untuk Auth, RBAC, Connector, Scan Config, Deduplication, dan Scoring lulus, tanyakan kepada user bila ada pertanyaan.

- [x] 12. Scan_Engine dan Job_Scheduler (R5, R12.3, R12.4)
  - [x] 12.1 Implementasikan eksekusi connector terisolasi dengan timeout 60s
    - Ambil Source `available` dari Registry; panggil tiap connector via `fetch` dengan AbortSignal 60 detik; catat outcome per-connector (`ok/partial/error/timeout/rate_limited`)
    - Isolasi: error/timeout satu connector tidak menggagalkan yang lain; rate limit → hentikan source & tandai `partial`
    - _Design: Alur Eksekusi Pemindaian; Error Handling → Scan per-connector_
    - _Requirements: 5.1, 5.4, 5.5_

  - [x] 12.2 Rangkai pipeline scan: normalize → dedup → score → ringkasan job
    - Untuk tiap hasil: normalize → `Deduplication_Service.ingest` → `Lead_Scoring_Engine.scoreAndPersist`; akumulasi `ScanSummary` (newLeads, duplicateLeads, excludedSources, connectorResults)
    - Batalkan job tanpa Lead bila tidak ada Source `available` (R5.7); kecualikan Source non-`available` saat eksekusi & catat (R3.8)
    - _Design: Alur Eksekusi Pemindaian (flowchart); ScanSummary_
    - _Requirements: 3.8, 5.2, 5.3, 5.7_

  - [ ]* 12.3 Tulis property test seleksi connector available saat eksekusi
    - **Property 20: Seleksi connector available saat eksekusi**
    - **Validates: Requirements 3.8**

  - [x] 12.4 Implementasikan status job, keamanan kegagalan total, dan outbox notifikasi
    - Tulis status `scan_job` (`running/succeeded/failed/skipped`) berdasarkan hasil eksekusi sebenarnya sebelum & terlepas dari pengiriman notifikasi; kegagalan total mempertahankan Lead lama utuh dan menandai `failed`
    - Tulis notifikasi ke tabel outbox dalam transaksi domain yang sama
    - _Design: Catatan R12.4; Error Handling → Outbox pattern_
    - _Requirements: 12.3, 12.4_

  - [ ]* 12.5 Tulis property test keamanan kegagalan Scan_Job total
    - **Property 36: Keamanan kegagalan Scan_Job total**
    - **Validates: Requirements 12.3, 12.4**

  - [x] 12.6 Implementasikan Job_Scheduler dan pencegahan tumpang-tindih
    - `markDue` menandai Scan_Job jatuh tempo per interval terjadwal; cegah dua job `running` untuk konfigurasi sama via `uniq_running_job`; job jatuh tempo saat job lain berjalan → `skipped` + dicatat
    - Jalankan eksekusi terjadwal otomatis melalui worker antrian
    - _Design: Job_Scheduler; Alur Eksekusi (cabang skipped)_
    - _Requirements: 5.6, 5.8_

  - [ ]* 12.7 Tulis property test pencegahan tumpang-tindih Scan_Job terjadwal
    - **Property 22: Pencegahan tumpang-tindih Scan_Job terjadwal**
    - **Validates: Requirements 5.8**

  - [ ]* 12.8 Tulis integration test eksekusi scan dengan mock connector
    - Verifikasi timeout 60s & abort (R5.1), isolasi error connector (R5.4), rate limit partial (R5.5), dan ringkasan job (R5.3) memakai connector mock
    - _Requirements: 5.1, 5.3, 5.4, 5.5_

- [x] 13. Lead_Manager dan Activity_Log (R8)
  - [x] 13.1 Implementasikan perubahan status dan pencatatan Activity
    - Sediakan tepat enam status; `changeStatus` menyimpan status baru bila berbeda dari asal dan mencatat Activity (status asal, tujuan, pelaku, waktu)
    - _Design: Lead_Manager & Activity_Log_
    - _Requirements: 8.1, 8.2_

  - [ ]* 13.2 Tulis property test pencatatan Activity perubahan status
    - **Property 23: Pencatatan Activity perubahan status**
    - **Validates: Requirements 8.2**

  - [x] 13.3 Implementasikan catatan tindak lanjut dan penghapusan Lead terkonfirmasi
    - `addNote` menyimpan catatan 1–2000 char + pembuat & waktu; di luar rentang ditolak tanpa mengubah catatan lama
    - `deleteLead` butuh konfirmasi eksplisit; batal → Lead utuh; konfirmasi → hapus permanen + audit `delete`
    - _Design: Lead_Manager_
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 13.4 Tulis property test validasi catatan tindak lanjut
    - **Property 24: Validasi catatan tindak lanjut**
    - **Validates: Requirements 8.3, 8.4**

  - [ ]* 13.5 Tulis unit test enam status dan alur konfirmasi hapus
    - Verifikasi tepat enam status (R8.1), batal hapus mempertahankan Lead (R8.5, R8.6), konfirmasi hapus + audit (R8.7)
    - _Requirements: 8.1, 8.5, 8.6, 8.7_

- [ ] 14. Lead_Query_Service: pencarian, filter, pagination, dan sort (R9, R7.4, R7.5)
  - [x] 14.1 Implementasikan urutan bawaan deterministik
    - Urutkan Lead non-duplikat: `score` menurun, lalu `discovered_at` menurun, lalu `id` menaik
    - _Design: Lead_Query_Service; Strategi Indeks (idx_lead_default_sort)_
    - _Requirements: 7.4, 7.5_

  - [ ]* 14.2 Tulis property test pengurutan total deterministik
    - **Property 8: Pengurutan total deterministik**
    - **Validates: Requirements 7.4, 7.5**

  - [x] 14.3 Implementasikan filter gabungan (logika DAN) dan validasi rentang skor
    - Pencarian substring case-insensitive (1–100 char, trim) pada nama/kontak/niche; filter status, source, rentang skor inklusif; kombinasi = irisan (AND)
    - Tolak rentang skor dengan batas bawah > atas atau di luar 0–100 tanpa mengubah hasil; pesan "tidak ada Lead yang cocok" saat kosong
    - _Design: Lead_Query_Service → LeadFilter_
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 14.4 Tulis property test filter merupakan irisan predikat (logika DAN)
    - **Property 25: Filter merupakan irisan predikat (logika DAN)**
    - **Validates: Requirements 9.2, 9.3, 9.4, 9.5, 9.7**

  - [ ]* 14.5 Tulis property test validasi rentang skor filter
    - **Property 26: Validasi rentang skor filter**
    - **Validates: Requirements 9.8**

  - [~] 14.6 Implementasikan pagination 25 per halaman
    - Kembalikan `Page<Lead>` maksimum 25 item per halaman dengan navigasi, mempertahankan urutan bawaan tanpa duplikasi/kehilangan antarhalaman
    - _Design: Lead_Query_Service → Page<T>_
    - _Requirements: 9.1_

  - [ ]* 14.7 Tulis property test pagination mempertahankan ukuran & urutan
    - **Property 27: Pagination mempertahankan ukuran & urutan**
    - **Validates: Requirements 9.1**

  - [ ]* 14.8 Tulis unit test hasil filter kosong
    - Verifikasi pesan "tidak ada Lead yang cocok" saat penyaringan kosong (R9.6)
    - _Requirements: 9.6_

- [x] 15. Metrics_Service (R10)
  - [x] 15.1 Implementasikan agregasi metrik dan tingkat konversi
    - Hitung `totalLeads` (exclude duplikat), `byStatus` (keenam status, 0 jika kosong), `bySource` (konsisten dengan total), dan `conversionRatePercent` (2 desimal; 0% bila total=0)
    - _Design: Metrics_Service → DashboardMetrics; Aturan Konsistensi Penting_
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 15.2 Tulis property test konsistensi agregasi metrik
    - **Property 28: Konsistensi agregasi metrik**
    - **Validates: Requirements 10.1, 10.2, 10.3**

  - [ ]* 15.3 Tulis property test perhitungan tingkat konversi
    - **Property 29: Perhitungan tingkat konversi**
    - **Validates: Requirements 10.4**

  - [x] 15.4 Implementasikan penyaringan metrik berdasarkan rentang tanggal
    - Hitung ulang metrik hanya untuk Lead dengan `discovered_at` dalam rentang inklusif (awal ≤ akhir); tolak rentang awal > akhir tanpa mengubah metrik saat ini
    - _Design: Metrics_Service → compute(range)_
    - _Requirements: 10.6, 10.7_

  - [ ]* 15.5 Tulis property test penyaringan metrik berdasarkan rentang tanggal
    - **Property 30: Penyaringan metrik berdasarkan rentang tanggal**
    - **Validates: Requirements 10.6**

  - [ ]* 15.6 Tulis unit test conversion rate total=0 dan rentang tanggal invalid
    - Verifikasi 0% saat total=0 (R10.5) dan penolakan rentang awal > akhir (R10.7)
    - _Requirements: 10.5, 10.7_

- [x] 16. Privacy_Service, Audit_Log, dan worker retensi/DSAR (R11)
  - [x] 16.1 Implementasikan Audit_Log
    - `record` menulis entri (teamId, actorId|'system', action, objectType, objectId, at) untuk create/update/delete/export/retention_delete/dsar_delete
    - _Design: Privacy_Service → Audit_Log; Privacy → Audit menyeluruh_
    - _Requirements: 11.8_

  - [x] 16.2 Implementasikan ekspor Lead dengan otorisasi dan audit
    - `exportLeads` hanya untuk Admin; catat aksi ekspor ke Audit_Log; tolak akses hasil bagi User tak berwenang dengan pesan otorisasi meski artefak telah dibuat
    - _Design: Privacy_Service; Privacy → Otorisasi ekspor; Error Handling → Ekspor_
    - _Requirements: 11.5, 11.6_

  - [ ]* 16.3 Tulis integration test penghapusan DSAR, ekspor, dan audit
    - Verifikasi penghapusan DSAR + audit (R11.3, R11.8), audit ekspor (R11.5), dan penolakan ekspor tak berwenang (R11.6) memakai dependensi mock
    - _Requirements: 11.3, 11.5, 11.6, 11.8_

  - [x] 16.4 Implementasikan DSAR Worker (penghapusan subjek data)
    - Permintaan terverifikasi → enqueue job; hapus seluruh Personal_Data Lead ≤ 72 jam + audit `dsar_delete` tanpa konfirmasi ke pemohon; gagal → pertahankan data + notifikasi kegagalan terpisah dari error otorisasi
    - _Design: Privacy → Hak subjek data; flowchart DSAR; Error Handling → Privacy DSAR_
    - _Requirements: 11.3, 11.4_

  - [x] 16.5 Implementasikan Retention_Worker
    - `sweep` menghapus Lead yang umur penyimpanannya melampaui `data_retention_days` Team dalam ≤ 24 jam setelah terlampaui + audit `retention_delete`
    - _Design: Retention_Worker; Privacy → Retensi otomatis_
    - _Requirements: 11.7_

  - [ ]* 16.6 Tulis property test kelayakan penghapusan retensi
    - **Property 31: Kelayakan penghapusan retensi**
    - **Validates: Requirements 11.7**

- [ ] 17. AI_Analyzer_Service dan integrasi Gemini (R13)
  - [x] 17.1 Tulis migrasi tabel & kolom AI
    - Tambah `team_ai_settings` (encrypted_gemini_api_key, ai_enabled, call_budget_30d, ai_intent_factor_weight)
    - Tambah `ai_call_log` (+ index `idx_ai_call_log_window`) untuk jendela bergulir 30 hari
    - Tambah kolom AI di `lead` (ai_intent_score, ai_insight, ai_state, ai_unavailable_reason, ai_analyzed_at) dan `ai_enabled` di `scan_configuration`
    - Tambah enum `'ai_call'` pada CHECK action `audit_log` (+ kolom `metadata jsonb`)
    - _Design: Data Models → Pengayaan AI (R13); Audit_
    - _Requirements: 13.2, 13.4, 13.8, 13.9, 13.13, 13.15_

  - [-] 17.2 Simpan kunci API Gemini per Team terenkripsi (Admin-only)
    - Tambahkan operasi di Credential_Vault/Team_AI_Settings_Service untuk menyimpan/membaca kunci API terenkripsi at-rest dengan envelope encryption; plaintext tidak pernah ditulis ke log
    - Endpoint admin Team untuk set/clear API key, enable AI global, set AI_Call_Budget, dan bobot faktor `ai_intent_match`
    - _Design: AI_Analyzer_Service; Security → Kredensial connector (mekanisme setara)_
    - _Requirements: 13.2, 13.18_

  - [x] 17.3 Tambah action AI ke RBAC dan tegakkan otorisasi
    - Perluas `Action`: `ai.configure`, `ai.enable_scan`, `ai.reanalyze`, `ai.read_insight`
    - Update matriks: Admin-only `ai.configure`; Admin/Member `ai.enable_scan` & `ai.reanalyze`; semua peran `ai.read_insight`
    - _Design: RBAC matrix + tipe Action_
    - _Requirements: 13.11, 13.16, 13.17, 13.18_

  - [ ]* 17.4 Tulis property test otorisasi peran untuk fitur AI
    - **Property 42: Otorisasi peran untuk fitur AI**
    - **Validates: Requirements 13.11, 13.16, 13.17, 13.18**

  - [~] 17.5 Toggle AI pada Scan_Configuration dengan pra-syarat
    - Izinkan `ai_enabled = true` pada save Scan_Configuration hanya jika Team punya kunci API Gemini terkonfigurasi; jika belum, paksa `false` dan tampilkan pesan
    - _Design: AI_Analyzer_Service → Property 44_
    - _Requirements: 13.3, 13.4_

  - [ ]* 17.6 Tulis property test pra-syarat enable AI per Scan_Configuration
    - **Property 44: Pra-syarat enable AI per Scan_Configuration**
    - **Validates: Requirements 13.3, 13.4**

  - [-] 17.7 Implementasikan Gemini_Client dengan timeout 30 detik
    - `analyze(apiKey, snapshot, signal)` memanggil API resmi Google Generative Language; timeout 30s via AbortSignal; parse keluaran terstruktur (intent score 0–100 + insight ≤500 char); deteksi malformed
    - _Design: AI_Analyzer_Service → Gemini_Client_
    - _Requirements: 13.7, 13.9, 13.12_

  - [ ]* 17.8 Tulis property test timeout panggilan AI
    - **Property 43: Timeout panggilan AI**
    - **Validates: Requirements 13.12, 13.13**

  - [-] 17.9 Implementasikan Public_Lead_Snapshot dan jaga privasi payload
    - Builder snapshot yang HANYA memuat: name, public_contact, profile_url, location, matched_keywords, post_snippet (jika sah dari Source_Connector); blok atribut lain
    - _Design: AI_Analyzer_Service → PublicLeadSnapshot; Privacy_
    - _Requirements: 13.7_

  - [ ]* 17.10 Tulis property test privasi panggilan AI
    - **Property 38: Privasi panggilan AI**
    - **Validates: Requirements 13.7**

  - [ ] 17.11 Implementasikan AI_Budget_Tracker (jendela bergulir 30 hari)
    - `consumeIfWithinBudget(teamId)` menghitung jumlah panggilan dari `ai_call_log` dalam 30 hari terakhir, izinkan jika < `call_budget_30d`; tolak dengan reason `budget_exceeded` saat tercapai
    - _Design: AI_Analyzer_Service → AI_Budget_Tracker_
    - _Requirements: 13.15_

  - [ ]* 17.12 Tulis property test AI_Call_Budget berbasis jendela bergulir
    - **Property 40: AI_Call_Budget berbasis jendela bergulir 30 hari**
    - **Validates: Requirements 13.15**

  - [~] 17.13 Implementasikan AI Analyzer Worker (asinkron, fallback aman)
    - Worker antrian latar belakang yang memproses Lead: cek budget → load API key → bangun snapshot → panggil Gemini → persist `ai_intent_score`/`ai_insight`/`ai_state` (`success` atau `unavailable` + reason: `no_api_key`/`budget_exceeded`/`timeout`/`provider_error`/`malformed_output`/`quota_exceeded`)
    - Tidak memblokir Scan_Engine; tidak pernah rollback Lead pada kegagalan AI
    - _Design: AI_Analyzer_Service → flow + Property 39_
    - _Requirements: 13.4, 13.13, 13.14_

  - [ ]* 17.14 Tulis property test fallback AI tidak memblokir scan dan tidak memicu rollback
    - **Property 39: Fallback AI tidak memblokir scan dan tidak memicu rollback**
    - **Validates: Requirements 13.13, 13.14**

  - [~] 17.15 Catat setiap panggilan AI ke `ai_call_log` dan Audit_Log
    - Tulis baris `ai_call_log` (team, lead, trigger, outcome, at) untuk semua hasil (sukses & gagal); tulis entri `audit_log` ber-action `ai_call` dengan metadata (`trigger`, `outcome`, `reason`)
    - _Design: AI_Analyzer_Service → flow akhir; Audit_
    - _Requirements: 13.8_

  - [ ]* 17.16 Tulis property test audit log panggilan AI lengkap
    - **Property 41: Audit log panggilan AI lengkap**
    - **Validates: Requirements 13.8**

  - [~] 17.17 Integrasikan faktor `ai_intent_match` ke Lead_Scoring_Engine
    - Perluas `kind` ScoringFactor dengan `'ai_intent_match'`; saat Scoring_Model memuat faktor ini dan `lead.aiIntentScore` non-null, hitung `rawValue = aiIntentScore / 100` dikali bobot Team (`ai_intent_factor_weight`)
    - Saat AI Worker selesai sukses, panggil `recompute` Lead_Score untuk Lead tersebut sehingga `score_contribution` mencerminkan kontribusi AI
    - _Design: Lead_Scoring_Engine + AI_Analyzer_Service_
    - _Requirements: 13.10_

  - [ ]* 17.18 Tulis property test determinisme `computeScore` dengan AI_Intent_Score tersimpan
    - **Property 37: Determinisme `computeScore` dengan AI_Intent_Score tersimpan**
    - **Validates: Requirements 7.7, 13.10**

  - [~] 17.19 Hubungkan Scan_Engine ke AI Analyzer (opsional per Scan_Configuration)
    - Saat sebuah Scan_Configuration `ai_enabled = true`, Scan_Engine memanggil `AI_Analyzer_Service.enqueue(teamId, leadId, 'scan')` setelah Lead persist; tidak menunggu hasilnya, tidak memblokir alur scan
    - _Design: AI_Analyzer_Service → asinkron, tidak memblokir scan_
    - _Requirements: 13.4_

  - [~] 17.20 Endpoint dan UI re-analisis manual per Lead
    - Endpoint `POST /leads/:id/ai/reanalyze` (RBAC `ai.reanalyze`) memasukkan job baru ke antrian dengan trigger `manual`
    - Tombol UI di detail Lead untuk Member/Admin; Viewer tidak melihat tombol tetapi tetap melihat AI_Insight
    - _Design: AI_Analyzer_Service.enqueue trigger `manual`_
    - _Requirements: 13.16, 13.17_

  - [ ]* 17.21 Tulis integration test AI Analyzer dengan Gemini_Client mock
    - Verifikasi alur sukses end-to-end (snapshot terkirim → score+insight tersimpan → Lead_Score di-recompute → audit `ai_call` ditulis), mode kegagalan masing-masing (no_api_key, budget_exceeded, timeout, provider_error, malformed_output) memicu fallback yang benar tanpa rollback Lead
    - _Requirements: 13.7, 13.8, 13.9, 13.10, 13.12, 13.13, 13.14, 13.15_

- [ ] 18. Lapisan API backend (wiring endpoint)
  - [~] 18.1 Rangkai middleware Auth + RBAC + Tenant Guard pada pipeline API
    - Pasang rantai penjaga: validasi sesi → RBAC `can(role, action)` → Tenant Guard (`team_id` wajib) → domain service; 401 redirect login, 403 pesan otorisasi
    - _Design: Alur Permintaan Berbasis Peran_
    - _Requirements: 1.3, 2.3, 2.8, 11.6_

  - [~] 18.2 Implementasikan endpoint Auth dan Team/connector admin
    - Endpoint login/logout/session; manajemen undangan & peran; admin connector (list/activate); seluruhnya melewati penjaga dan memetakan `AppError` ke respons HTTP
    - _Design: Components and Interfaces (Auth_Service, Team_Service, Connector_Registry)_
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 2.9, 2.10, 3.1, 3.3, 3.4_

  - [~] 18.3 Implementasikan endpoint Scan, Lead, metrik, dan privasi
    - Endpoint simpan/jalankan Scan_Configuration (termasuk toggle `ai_enabled`); daftar/cari/filter Lead; ubah status/catatan/hapus Lead; metrik dashboard; ekspor & DSAR
    - _Design: Components and Interfaces (Scan_Config_Service, Lead_Manager, Lead_Query_Service, Metrics_Service, Privacy_Service)_
    - _Requirements: 4.1, 4.6, 5.1, 5.7, 8.2, 8.3, 8.5, 9.1, 9.2, 10.1, 10.6, 11.3, 11.5, 13.4_

  - [~] 18.4 Implementasikan endpoint AI (admin & re-analisis)
    - Admin endpoint untuk konfigurasi kunci API Gemini, enable AI global, set AI_Call_Budget, dan bobot faktor `ai_intent_match` (RBAC `ai.configure`)
    - Endpoint `POST /leads/:id/ai/reanalyze` (RBAC `ai.reanalyze`) memasukkan job baru dengan trigger `manual`
    - Endpoint baca AI_Insight pada detail Lead (RBAC `ai.read_insight`)
    - _Design: AI_Analyzer_Service; RBAC matrix_
    - _Requirements: 13.2, 13.11, 13.16, 13.17, 13.18_

- [~] 19. Checkpoint — pastikan backend dan seluruh test lulus
  - Pastikan semua test (unit + property + integration) backend lulus, tanyakan kepada user bila ada pertanyaan.

- [ ] 20. Frontend Next.js/React
  - [~] 20.1 Implementasikan autentikasi dan proteksi rute frontend
    - Halaman login; redirect ke login untuk halaman terproteksi; tampilkan pesan kunci akun & kegagalan generik; aksi logout
    - _Design: Architecture (Next.js); Security → Keamanan endpoint_
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_

  - [~] 20.2 Implementasikan Dashboard_View (metrik + daftar Lead)
    - Tampilkan metrik (total, per status, per source, conversion rate) dan daftar Lead terurut bawaan dengan pagination 25/halaman; selektor rentang tanggal
    - _Design: Metrics_Service; Lead_Query_Service_
    - _Requirements: 7.4, 7.5, 9.1, 10.1, 10.2, 10.3, 10.4, 10.6_

  - [~] 20.3 Implementasikan UI pencarian, filter, dan manajemen Lead
    - Kontrol pencarian/filter (status, source, rentang skor) dengan pesan validasi & state kosong; ubah status, catatan tindak lanjut, dan konfirmasi hapus; tampilkan rincian skor & indikasi unscored
    - Tampilkan AI_Insight dan AI_Intent_Score pada detail Lead untuk semua peran (termasuk Viewer); tombol "Re-analyze with AI" untuk Admin/Member; indikator AI `unavailable` + reason
    - _Design: Lead_Query_Service; Lead_Manager; Lead_Scoring_Engine (kontribusi); AI_Analyzer_Service_
    - _Requirements: 7.6, 7.8, 8.2, 8.3, 8.5, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 13.16, 13.17_

  - [~] 20.4 Implementasikan UI Scan Config dan Connector/Team admin
    - Form Scan_Configuration dengan peringatan Source dikecualikan & pesan validasi; toggle `ai_enabled` (dinonaktifkan jika Team belum punya API key Gemini)
    - Admin connector (status, aktivasi); admin tim (undangan, peran)
    - Admin AI: input kunci API Gemini (terenkripsi at-rest), AI_Call_Budget, bobot faktor `ai_intent_match`
    - _Design: Scan_Config_Service; Connector_Registry; Team_Service; AI_Analyzer_Service_
    - _Requirements: 3.1, 3.3, 4.1, 4.2, 4.3, 4.6, 4.7, 5.6, 2.1, 2.3, 13.2, 13.3, 13.4, 13.18_

- [ ] 21. Validasi performa dan indexing
  - [ ]* 21.1 Tulis performance test daftar Lead dan search/filter
    - Load test dengan dataset benih: daftar Lead p95 < 2s pada 100k Lead (R12.1) dan search/filter p95 < 1s pada 10k Lead (R12.2) memanfaatkan indeks yang dirancang
    - _Design: Strategi Indeks; Testing Strategy → Performa_
    - _Requirements: 12.1, 12.2_

- [~] 22. Checkpoint akhir — pastikan seluruh test lulus
  - Pastikan seluruh test (unit + property + integration + performance) lulus, tanyakan kepada user bila ada pertanyaan.

## Notes

- Tugas bertanda `*` bersifat opsional (pengujian) dan dapat dilewati untuk MVP yang lebih cepat; tugas implementasi inti tidak ditandai `*`.
- Setiap tugas merujuk requirement spesifik dan bagian desain terkait untuk ketertelusuran.
- Ke-36 Correctness Properties dipetakan tepat satu property-based test (fast-check, `{ numRuns: 100 }`), diberi tag `Feature: leads-generator-dashboard, Property {n}: {teks}`.
- Property 6 (atomisitas) dan Property 7 (isolasi recompute) menggunakan fault injection terhadap dependensi untuk memicu jalur kegagalan secara deterministik.
- Kriteria non-PBT (R1.1–1.4, R3.2/3.3, R5.x integrasi, R8.1/8.5–8.7, R9.6, R10.5/10.7, R11.x, R12.1/12.2) dicakup unit/integration/performance test.
- Checkpoint memastikan validasi inkremental pada batas-batas yang wajar.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "17.1"] },
    { "id": 3, "tasks": ["2.2", "2.3"] },
    { "id": 4, "tasks": ["2.4"] },
    { "id": 5, "tasks": ["2.5", "3.1", "4.1", "6.1", "7.1", "9.1", "10.1", "17.3"] },
    { "id": 6, "tasks": ["3.2", "3.3", "4.2", "4.3", "6.2", "7.2", "7.3", "9.2", "10.2", "10.3", "10.4", "15.1", "17.2", "17.4", "17.7", "17.9", "17.11"] },
    { "id": 7, "tasks": ["3.4", "3.5", "3.6", "5.1", "6.3", "6.4", "7.4", "7.5", "8.1", "9.3", "10.5", "15.2", "15.3", "15.4", "17.5", "17.8", "17.10", "17.12", "17.13", "17.17"] },
    { "id": 8, "tasks": ["5.2", "5.3", "6.5", "8.2", "8.3", "9.4", "9.5", "9.6", "9.7", "10.6", "10.7", "10.9", "13.1", "14.1", "15.5", "15.6", "16.1", "17.6", "17.14", "17.15", "17.18"] },
    { "id": 9, "tasks": ["5.4", "8.4", "8.5", "10.8", "10.10", "12.1", "13.2", "13.3", "14.2", "14.3", "14.6", "16.2", "16.4", "16.5", "17.16", "17.19", "17.20"] },
    { "id": 10, "tasks": ["12.2", "12.4", "12.6", "13.4", "13.5", "14.4", "14.5", "14.7", "14.8", "16.3", "16.6", "17.21"] },
    { "id": 11, "tasks": ["12.3", "12.5", "12.7", "12.8"] },
    { "id": 12, "tasks": ["18.1"] },
    { "id": 13, "tasks": ["18.2", "18.3", "18.4"] },
    { "id": 14, "tasks": ["20.1", "20.2", "20.3", "20.4"] },
    { "id": 15, "tasks": ["21.1"] }
  ]
}
```
