# Dokumentasi Sprint — Leads Generation Dashboard

Dokumen ini memetakan rencana implementasi (`.kiro/specs/leads-generator-dashboard/tasks.md`)
menjadi sprint yang dapat dieksekusi, mencatat apa yang **sudah selesai** dan **apa yang
belum berjalan**. Eksekusi dilakukan **sprint demi sprint**, jeda di setiap batas sprint
untuk peninjauan.

> Legenda status: ✅ selesai · 🚧 sebagian (sedang berjalan / parsial) · ⏳ belum dimulai
>
> Tugas bertanda `*` di `tasks.md` adalah property-/integration-test opsional. Tugas
> implementasi inti tidak bertanda `*`.

---

## Ringkasan Progres

| Sprint | Fokus | Task tingkat atas | Status |
|---|---|---|---|
| Sprint 1 | Fondasi: scaffolding, skema DB, Auth, Team, Connector | 1–7 | ✅ Selesai |
| Sprint 2 | Domain inti: Scan_Config, Deduplication, Scoring | 8–11 | ✅ Selesai |
| Sprint 3 | Scan Engine, Lead Mgmt, Query, Metrics, Privacy | 12–16 | ✅ Selesai |
| Sprint 4 | Analisis AI (Gemini) | 17 | 🚧 Sebagian |
| Sprint 5 | Lapisan API (HTTP) + checkpoint backend | 18–19 | ⏳ Belum berjalan |
| Sprint 6 | Frontend, validasi performa, checkpoint akhir | 20–22 | ⏳ Belum berjalan |

**Garis besar**: Sprint 1–3 sudah tuntas. Sprint 4 (AI) masih sebagian — fondasi
(skema DB + RBAC) sudah ada, service Gemini penuh belum. **Sprint 5 dan Sprint 6 belum
berjalan sama sekali.**

---

## Sprint 1 — Fondasi ✅

**Task**: 1, 2, 3, 4, 5, 6, 7
**Tujuan**: menyiapkan tulang punggung aplikasi sebelum logika domain.

| Task | Deskripsi | Status |
|---|---|---|
| 1 | Scaffolding monorepo (backend/frontend/shared), toolchain, Vitest + fast-check, tipe domain bersama | ✅ |
| 2 | Skema PostgreSQL + indeks + repository ber-tenant (Tenant Guard) | ✅ |
| 3 | Auth_Service: session store (Redis), idle timeout 30 mnt, login/logout, penguncian akun, proteksi rute | ✅ |
| 4 | RBAC Guard: matriks izin Admin/Member/Viewer + peran efektif per-permintaan | ✅ |
| 5 | Team_Service: undangan (pending 168 jam), penerimaan, perubahan peran | ✅ |
| 6 | Connector_Registry + Credential_Vault (enkripsi at-rest) + mesin status aktivasi | ✅ |
| 7 | Kontrak Source_Connector + normalisasi (whitelist field publik) + UsagePolicy | ✅ |

**Hasil**: fondasi multi-tenant, autentikasi, otorisasi, dan integrasi connector siap.

---

## Sprint 2 — Domain Inti ✅

**Task**: 8, 9, 10, 11
**Tujuan**: konfigurasi pemindaian, deduplikasi, dan mesin skoring (fitur utama).

| Task | Deskripsi | Status |
|---|---|---|
| 8 | Scan_Config_Service: validasi keyword/niche/lokasi, penyaringan Source, interval jadwal | ✅ |
| 9 | Deduplication_Service: kunci identitas, ingest create/merge, merge atribut, idempotensi | ✅ |
| 10 | Lead_Scoring_Engine: `computeScore` (murni), `scoreAndPersist` (transaksional), recompute massal, Scoring_Model_Service | ✅ |
| 11 | Checkpoint — pastikan logika domain inti lulus (Auth, RBAC, Connector, Scan Config, Dedup, Scoring) | ✅ |

**Hasil**: skoring deterministik & auditable berfungsi; checkpoint backend domain inti lolos.

---

## Sprint 3 — Scan Engine, Lead, Query, Metrics, Privacy ✅

**Task**: 12, 13, 14, 15, 16
**Tujuan**: menjalankan pemindaian end-to-end dan mengelola Lead hasilnya.

| Task | Deskripsi | Status |
|---|---|---|
| 12 | Scan_Engine + Job_Scheduler: eksekusi connector terisolasi (timeout 60s), pipeline normalize→dedup→score, status job + outbox + keamanan kegagalan total, pencegahan tumpang-tindih | ✅ |
| 13 | Lead_Manager + Activity_Log: perubahan status, catatan, penghapusan terkonfirmasi | ✅ |
| 14 | Lead_Query_Service: default sort, filter gabungan (AND), validasi rentang skor, pagination 25/halaman | ✅ (inti) |
| 15 | Metrics_Service: agregasi, tingkat konversi, penyaringan rentang tanggal | ✅ |
| 16 | Privacy_Service: Audit_Log, ekspor (Admin-only + audit), DSAR Worker, Retention_Worker | ✅ |

**Catatan**: parent Task 14 masih bertanda `[ ]` di `tasks.md` karena beberapa sub-tugas
**test opsional** (`*`) belum dijalankan; seluruh sub-tugas **implementasi inti** (14.1,
14.3, 14.6) sudah selesai. Properti kunci tervalidasi: Property 22 (anti tumpang-tindih)
dan Property 36 (keamanan kegagalan total).

---

## Sprint 4 — Analisis AI (Gemini) 🚧 SEBAGIAN

**Task**: 17
**Tujuan**: pengayaan niat berbasis AI, opt-in per Scan_Configuration, melengkapi (bukan
menggantikan) skoring berbasis aturan.

| Sub-task | Deskripsi | Status |
|---|---|---|
| 17.1 | Migrasi tabel & kolom AI (`team_ai_settings`, `ai_call_log`, kolom AI di `lead`, `ai_enabled`, audit `ai_call`) | ✅ |
| 17.3 | Tambah action AI ke RBAC (`ai.configure`, `ai.enable_scan`, `ai.reanalyze`, `ai.read_insight`) | ✅ |
| 17.2 | Simpan kunci API Gemini per Team terenkripsi (Admin-only) + endpoint admin | ⏳ belum |
| 17.5 | Toggle `ai_enabled` pada Scan_Configuration dengan pra-syarat kunci API | ⏳ belum |
| 17.7 | Gemini_Client (timeout 30s, parse keluaran terstruktur) | ⏳ belum |
| 17.9 | Public_Lead_Snapshot (jaga privasi payload) | ⏳ belum |
| 17.11 | AI_Budget_Tracker (jendela bergulir 30 hari) | ⏳ belum |
| 17.13 | AI Analyzer Worker (asinkron, fallback aman, tidak rollback Lead) | ⏳ belum |
| 17.15 | Catat panggilan AI ke `ai_call_log` + Audit_Log | ⏳ belum |
| 17.17 | Integrasi faktor `ai_intent_match` ke Lead_Scoring_Engine + recompute | ⏳ belum |
| 17.19 | Hubungkan Scan_Engine ke AI Analyzer (opsional per Scan_Configuration) | ⏳ belum |
| 17.20 | Endpoint + UI re-analisis manual per Lead | ⏳ belum |
| 17.4, 17.6, 17.8, 17.10, 17.12, 17.14, 17.16, 17.18, 17.21 | Property/integration test AI (opsional) | ⏳ belum |

**Apa yang sudah ada**: fondasi AI — skema basis data dan otorisasi RBAC siap.
**Apa yang belum berjalan**: seluruh service AI (Gemini_Client, snapshot privasi, budget
tracker, worker asinkron, integrasi skoring, endpoint re-analisis) belum diimplementasikan.

---

## Sprint 5 — Lapisan API + Checkpoint Backend ⏳ BELUM BERJALAN

**Task**: 18, 19
**Tujuan**: mengekspos domain services lewat HTTP dan memvalidasi seluruh backend.

| Sub-task | Deskripsi | Status |
|---|---|---|
| 18.1 | Rangkai middleware Auth + RBAC + Tenant Guard pada pipeline API | ⏳ belum |
| 18.2 | Endpoint Auth + Team/connector admin | ⏳ belum |
| 18.3 | Endpoint Scan, Lead, metrik, privasi | ⏳ belum |
| 18.4 | Endpoint AI (admin & re-analisis) | ⏳ belum |
| 19 | Checkpoint — pastikan backend & seluruh test lulus | ⏳ belum |

**Status**: belum berjalan. Sampai sprint ini selesai, domain services hanya dapat diakses
secara programatik (belum ada antarmuka HTTP). Contoh kontrak request ada di
`docs/ARCHITECTURE.md` bagian "Contoh Request API".

---

## Sprint 6 — Frontend, Performa, Checkpoint Akhir ⏳ BELUM BERJALAN

**Task**: 20, 21, 22
**Tujuan**: antarmuka pengguna, validasi performa, dan penutupan.

| Sub-task | Deskripsi | Status |
|---|---|---|
| 20.1 | Autentikasi & proteksi rute frontend (login, redirect, logout) | ⏳ belum |
| 20.2 | Dashboard_View (metrik + daftar Lead, pagination, rentang tanggal, Data Visualization Kit) | 🚧 sebagian |
| 20.3 | UI pencarian, filter, manajemen Lead + tampilan AI_Insight | ⏳ belum |
| 20.4 | UI Scan Config + Connector/Team admin + admin AI | ⏳ belum |
| 21.1 | Performance test daftar Lead (p95 < 2s @100k) & search/filter (p95 < 1s @10k) — opsional | ⏳ belum |
| 22 | Checkpoint akhir — seluruh test (unit + property + integration + performance) lulus | ⏳ belum |

**Status**: Sedang berjalan. `frontend/` sudah memiliki kerangka dasar dan *Chart UI Kit* lengkap (MD & XL) terintegrasi pada `Dashboard_View`.

---

## Catatan Eksekusi

- Eksekusi **sprint demi sprint**; ucapkan "lanjut sprint N" untuk melanjutkan.
- Tugas independen di dalam satu wave dapat dikerjakan paralel (lihat **Task Dependency
  Graph** di akhir `tasks.md`).
- Property-based test memakai `fast-check` (min. 100 runs) dan diberi tag
  `Feature: leads-generator-dashboard, Property {n}: {teks}`.
- Connector tanpa API resmi melaporkan `unavailable` — proyek ini **bukan scraper**.
