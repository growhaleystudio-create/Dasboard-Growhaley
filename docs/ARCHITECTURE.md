# Arsitektur & Dokumentasi Teknis — Leads Generation Dashboard

Dokumen ini menjelaskan arsitektur, modul, dan konvensi implementasi backend
Leads Generation Dashboard. Sumber kebenaran fungsional tetap berada di
`.kiro/specs/leads-generator-dashboard/` (`requirements.md`, `design.md`,
`tasks.md`); dokumen ini adalah peta praktis dari spesifikasi tersebut ke kode
yang sudah ada di `backend/src`.

---

## 1. Ringkasan Produk

Leads Generation Dashboard adalah aplikasi web SaaS **multi-tim (multi-tenant)**
yang:

1. **Memindai** sumber eksternal (Fiverr, Threads, LinkedIn, Google, Facebook, dll.)
   **hanya melalui API resmi** masing-masing platform — **bukan scraping**.
2. **Menormalkan** hasil menjadi entitas `Lead` (hanya data publik).
3. **Mendeduplikasi** Lead yang merujuk prospek yang sama.
4. **Memberi skor** potensi setiap Lead secara otomatis dan deterministik.
5. **(Opsional) memperkaya** Lead dengan analisis niat berbasis AI (Google Gemini),
   opt-in per Scan_Configuration.
6. **Menyajikan** Lead dalam dashboard yang dapat disaring, diberi status, dan
   ditindaklanjuti, dengan kepatuhan privasi (GDPR / UU PDP).

### Prinsip desain utama

| Prinsip | Penjelasan | Requirement |
|---|---|---|
| Isolasi data per Team | Setiap baris ber-tenant via `team_id`; difilter di lapisan repository. | R2.8 |
| Hanya API resmi | Tidak ada scraping. Connector tanpa API → status `unavailable`. | R3, R11.9 |
| Determinisme skoring | Skor adalah fungsi murni dari atribut Lead + Scoring_Model. | R7.7 |
| Isolasi kegagalan | Kegagalan satu connector/Lead tidak menggagalkan keseluruhan job. | R5.4, R7.10, R12.3 |
| Transaksionalitas | Operasi "semua atau tidak sama sekali" dibungkus transaksi DB. | R7.9 |
| Privacy by design | Hanya simpan data publik; retensi & penghapusan subjek data otomatis & teraudit. | R11 |

---

## 2. Stack Teknologi

- **Frontend**: Next.js 14 (App Router), React 18, TanStack Query, TypeScript
- **Backend**: Node.js 20+, TypeScript, Fastify, Zod, BullMQ (Redis), `pg`, `ioredis`, `argon2`
- **Persistensi**: PostgreSQL (+ ekstensi `pg_trgm`), Redis (session store + antrian kerja)
- **AI (opsional)**: Google Gemini via API resmi
- **Tooling**: npm workspaces, ESLint (typescript-eslint), Prettier, Vitest + fast-check

### Alasan pemilihan (ringkas)

- **PostgreSQL** — isolasi tenant relasional, indeks komposit untuk sort+filter,
  transaksi ACID untuk skoring transaksional (R7.9), `pg_trgm` untuk pencarian
  substring case-insensitive (R9.2).
- **Redis** — session store (idle timeout R1.5, penguncian akun R1.6) dan antrian
  kerja BullMQ untuk Scan_Job, recompute skoring, retensi, dan DSAR agar tidak
  memblokir request.
- **fast-check** — property-based testing untuk memvalidasi 44 correctness
  properties dari desain.

---

## 3. Struktur Repositori

```
.
├── shared/      # Tipe domain bersama (TypeScript, tanpa runtime deps)
│   └── src/     # auth, connector, errors, lead, result, scan, scoring + testing/pbt
├── backend/     # API + domain services + workers
│   ├── migrations/   # node-pg-migrate (skema PostgreSQL)
│   └── src/          # lihat bagian 5
├── frontend/    # Next.js App Router (belum diimplementasikan penuh)
├── docs/        # Dokumentasi ini
└── .kiro/specs/leads-generator-dashboard/   # requirements, design, tasks
```

---

## 4. Arsitektur Tingkat Tinggi

```mermaid
graph TB
    subgraph Client["Frontend - Next.js / React"]
        UI_Dash[Dashboard & Lead List]
        UI_Scan[Scan Config & Connector Admin]
        UI_Team[Team & Role Admin]
    end

    subgraph API["Backend - API Layer"]
        AUTH[Auth_Service + RBAC Guard]
        TENANT[Tenant Guard]
        LEADAPI[Lead_Manager / Lead_Query_Service]
        SCANAPI[Scan_Config_Service]
        METRICS[Metrics_Service]
        PRIV[Privacy_Service]
    end

    subgraph Domain["Domain Services"]
        SCAN[Scan_Engine]
        DEDUP[Deduplication_Service]
        SCORE[Lead_Scoring_Engine]
        REG[Connector_Registry]
        VAULT[Credential_Vault]
    end

    subgraph Workers["Background Workers"]
        SCHED[Job_Scheduler]
        RETENTION[Retention_Worker]
        DSAR[Data-Subject Deletion Worker]
        AIW[AI Analyzer Worker]
    end

    subgraph Connectors["Source_Connector (pluggable)"]
        C1[Fiverr / Threads / LinkedIn / Google / Facebook]
    end

    subgraph Data["Persistensi"]
        PG[(PostgreSQL)]
        SESS[(Redis)]
    end

    EXT[(API Resmi Platform)]
    GEM[(Google Gemini API)]

    Client --> API
    AUTH --> SESS
    API --> Domain
    SCANAPI --> SCAN
    SCAN --> REG --> Connectors --> EXT
    SCAN --> DEDUP --> SCORE --> PG
    LEADAPI --> PG
    METRICS --> PG
    PRIV --> PG
    SCHED --> SCAN
    RETENTION --> PG
    DSAR --> PG
    REG --> VAULT --> PG
    SCAN --> AIW --> GEM
    AIW --> PG
    AIW --> SCORE
```

### Alur permintaan berbasis peran

Setiap permintaan terotorisasi melewati dua lapisan penjaga sebelum mencapai domain:

1. **Auth_Service** — validasi sesi (aktif? idle < 30 menit?). Invalid → 401 → redirect login.
2. **RBAC Guard** — cek izin peran (Admin/Member/Viewer) untuk aksi. Tidak berwenang → 403.
3. **Tenant Guard** — seluruh query selalu di-scope dengan `team_id`.

> Catatan R2.3: perubahan peran berlaku pada permintaan **berikutnya** karena RBAC
> Guard membaca peran efektif dari sumber kebenaran tiap permintaan, bukan dari
> klaim sesi yang dibekukan saat login.

---

## 5. Peta Modul Backend (`backend/src`)

| Modul | Tanggung jawab | Requirement |
|---|---|---|
| `auth/` | Login/logout, session store (Redis), idle timeout, penguncian akun, RBAC, peran efektif, Credential_Vault | R1, R2.3–R2.8, R3.4 |
| `team/` | Team_Service, undangan (pending 168 jam), perubahan peran | R2.1, R2.2, R2.9, R2.10 |
| `connector/` | Kontrak `Source_Connector`, registry, mesin status aktivasi, normalisasi, connector contoh | R3, R5.2, R11.1 |
| `scan/` | Validasi Scan_Configuration, eksekusi connector terisolasi, pipeline scan, runner job, scheduler | R4, R5, R12.3, R12.4 |
| `dedup/` | Kunci identitas, pencarian kanonik, ingest (create/merge), merge atribut | R6 |
| `scoring/` | `computeScore` (murni), `scoreAndPersist` (transaksional), recompute massal, model service, outbox | R7 |
| `lead/` | Lead_Manager (status + Activity), catatan, penghapusan terkonfirmasi | R8 |
| `lead-query/` | Default sort deterministik, filter gabungan (AND), validasi rentang skor, pagination | R9, R7.4, R7.5 |
| `metrics/` | Agregasi metrik, tingkat konversi, penyaringan rentang tanggal | R10 |
| `privacy/` | Audit_Log, ekspor (Admin-only + audit), DSAR Worker, Retention_Worker | R11 |
| `repository/` | Repository ber-tenant (Tenant Guard), mapping baris↔domain | R2.8 |
| `db/`, `redis/`, `queue/`, `config/` | Pool PostgreSQL, helper transaksi, klien Redis, koneksi antrian, env | infrastruktur |

### 5.1 Auth & RBAC (`auth/`)

- **Session store (Redis)** menyimpan `lastActivityAt`; sesi idle ≥ 30 menit
  dianggap kedaluwarsa (R1.5). `validateSession` memperbarui aktivitas tiap
  permintaan valid.
- **Login** memverifikasi kredensial dengan `argon2`, mereset penghitung gagal saat
  sukses, dan mengunci akun 15 menit setelah 5 kegagalan berturut dalam jendela
  15 menit (R1.6). Pesan kegagalan generik (tidak membocorkan email vs password).
- **RBAC_Guard.can(role, action)** menerapkan matriks izin Admin/Member/Viewer
  (Viewer baca-saja, termasuk saat keanggotaan `pending`).
- **Credential_Vault** menyimpan kredensial connector terenkripsi at-rest (envelope
  encryption); plaintext tidak pernah ditulis ke log.

### 5.2 Connector (`connector/`)

Kontrak `Source_Connector`:

```ts
interface Source_Connector {
  checkAvailability(): Promise<ConnectorStatus>;
  fetch(query: ScanQuery, signal: AbortSignal): Promise<RawProspect[]>;
  normalize(raw: RawProspect, teamId: string): NormalizedLead;
}
```

- `normalize` hanya mempertahankan field publik (whitelist: `name`,
  `public_contact`, `profile_url`, `location`) dan menetapkan `status='New'`,
  `discovered_at`, `acquired_source`, `acquired_at`, `matchedKeyword`.
- **Mesin status aktivasi**: validasi kredensial ke API Source dengan timeout 30
  detik → sukses `available` (+ simpan terenkripsi), ditolak `requires_configuration`,
  timeout/gagal simpan → pertahankan status sebelumnya.
- **Registry** menjamin tepat satu status aktif per connector; registrasi connector
  baru tidak mengubah connector lain (non-interferensi, Property 21).

### 5.3 Scan_Engine & Job_Scheduler (`scan/`)

Alur eksekusi pemindaian:

```
resolve Source `available` (R3.8)
   │  tidak ada Source available → batalkan job, tidak buat Lead (R5.7)
   ▼
buka transaksi → untuk tiap connector available:
   fetch (AbortSignal 60 dtk, terisolasi)            ── R5.1, R5.4, R5.5
   │   error/timeout 1 connector ≠ gagalkan lainnya
   │   rate limit → hentikan source, tandai `partial`
   ▼
untuk tiap RawProspect: normalize → dedup.ingest → (jika created) scoreAndPersist
   ▼
akumulasi ScanSummary (newLeads, duplicateLeads, excludedSources, connectorResults)
```

- **`scan-engine.ts`** — resolusi Source + guard R5.7, menjalankan pipeline dalam transaksi.
- **`scan-pipeline.ts`** — inti `normalize → dedup → score`.
- **`scan-job-runner.ts`** — membungkus eksekusi dengan siklus hidup `scan_job`
  (`running/succeeded/failed/skipped`) + **Outbox pattern**. Status job ditulis dari
  **hasil sebenarnya**, **sebelum & terlepas** dari pengiriman notifikasi. Kegagalan
  total → transaksi domain rollback (Lead lama utuh, R12.3) dan job ditandai `failed`
  lewat penulisan terpisah yang bertahan dari rollback (R12.4).
- **`job-scheduler.ts`** — `markDue` menandai job jatuh tempo per interval; pencegahan
  tumpang-tindih dua lapis: (1) fast-path `listRunningForConfiguration`, (2) penjaga
  otoritatif via indeks parsial unik `uniq_running_job` (tangkap PG `23505` → catat
  `skipped`).

### 5.4 Deduplication (`dedup/`)

- **Kunci identitas**: `trim` + `toLowerCase`; cocok bila `profile_url` sama, atau
  `email` sama, atau `name`+`location` sama. Nilai kosong tidak dipakai sebagai kunci.
- **Ingest**: cocok → tandai `is_duplicate`, tautkan ke kanonik, tambah Source ke
  `lead_source` (tanpa entri utama baru); tak cocok → buat entri kanonik baru.
- **Merge atribut**: existing-wins, fill-empty. Ingest bersifat **idempoten**.

### 5.5 Lead_Scoring_Engine (`scoring/`) — fitur utama

**Skoring 100% deterministik berbasis aturan — bukan AI.** AI (bagian 6) hanya
pengayaan opsional.

```
weightedValue = clamp(rawValue, 0, 1) * weight        // per faktor
score = round_half_up( Σ weightedValue dinormalkan ke 0..100 )   // integer
```

- `computeScore` adalah **fungsi murni**: tanpa I/O, waktu, atau keacakan
  (Property 1). Skor selalu dalam rentang 0–100 (Property 2). Menghasilkan
  `FactorContribution` per faktor yang konsisten dengan skor (Property 4).
- `scoreAndPersist` menyimpan Lead + `score_contribution` dalam **satu transaksi**.
  Pada error / model kosong / tidak pasti → simpan `score=null`,
  `score_state='unscored'` + `scoring_failure` + notifikasi via outbox; bila langkah
  penanganan kegagalan sendiri gagal → rollback (atomisitas, Property 6).
- `recomputeForTeam` menghitung ulang seluruh Lead saat model berubah, dengan
  **isolasi per-Lead** (satu Lead gagal → pertahankan skor lama, lanjut Lead lain;
  Property 7), dijalankan sebagai background job. `update` menaikkan `version`.

### 5.6 Lead_Manager & Query (`lead/`, `lead-query/`)

- Enam status: `New, Reviewed, Contacted, Qualified, Converted, Rejected`.
  `changeStatus` mencatat `Activity` (status asal, tujuan, pelaku, waktu).
- Catatan 1–2000 karakter; penghapusan Lead butuh konfirmasi eksplisit + audit `delete`.
- **Default sort** deterministik: `score` menurun → `discovered_at` menurun → `id` menaik.
- **Filter** gabungan (logika **DAN**): substring case-insensitive pada nama/kontak/niche,
  status, source, rentang skor inklusif. Rentang skor invalid ditolak tanpa mengubah hasil.
- **Pagination** maksimum 25 item/halaman, mempertahankan urutan tanpa duplikasi/kehilangan antarhalaman.

### 5.7 Metrics (`metrics/`)

- `totalLeads` (eksklusi duplikat), `byStatus` (keenam status, 0 jika kosong),
  `bySource` (konsisten dengan total), `conversionRatePercent` (2 desimal; 0% bila total=0).
- Penyaringan rentang tanggal inklusif berdasarkan `discovered_at`; rentang awal > akhir ditolak.

### 5.8 Privacy (`privacy/`)

- **Audit_Log** mencatat create/update/delete/export/retention_delete/dsar_delete (+ `ai_call`).
- **Ekspor** hanya untuk Admin, dengan audit; akses tak berwenang ditolak meski artefak terbentuk.
- **DSAR Worker** — permintaan terverifikasi → hapus seluruh Personal_Data Lead ≤ 72 jam + audit `dsar_delete`.
- **Retention_Worker** — `sweep` menghapus Lead yang melampaui `data_retention_days` Team ≤ 24 jam + audit `retention_delete`.

> **Keputusan desain "hapus Personal_Data"**: kolom personal (`name`,
> `public_contact`, `profile_url`, `location`) di-NULL-kan; baris dipertahankan untuk
> integritas metrik & audit.

---

## 6. Analisis Niat Berbasis AI (Gemini) — opsional

Pengayaan **opt-in per Scan_Configuration** (nonaktif sebagai bawaan), **melengkapi**
skoring berbasis aturan tanpa menggantikannya.

- **Bring-your-own-key**: kunci API Gemini per Team disimpan terenkripsi at-rest
  (Admin-only). AI hanya dapat diaktifkan jika kunci terkonfigurasi.
- **Privasi payload**: hanya `Public_Lead_Snapshot` (nama, kontak publik, URL profil,
  lokasi, kata kunci, cuplikan publik yang sah) yang dikirim ke Gemini.
- **Asinkron & fallback aman**: worker latar belakang memanggil Gemini (timeout 30 dtk);
  hasil `ai_intent_score` (0–100) + `ai_insight` (≤500 char) atau state `unavailable` + alasan.
- **Budget**: `AI_Call_Budget` per jendela bergulir 30 hari; melebihi → tolak dengan alasan `budget_exceeded`.
- **Integrasi skor**: kontribusi AI masuk sebagai faktor `ai_intent_match` berbobot dalam Scoring_Model.

> Status: skema & otorisasi AI sudah disiapkan; implementasi service penuh ada di
> roadmap Task 17 (lihat `tasks.md`).

---

## 7. Model Data (PostgreSQL)

Migrasi dikelola dengan `node-pg-migrate` di `backend/migrations/`:

| Migrasi | Isi |
|---|---|
| `1700000001000_init-core-schema` | Tabel inti: `team`, `app_user`, `user_membership`, `invitation`, `team_connector`, `scan_configuration`, `scan_job`, `lead`, `lead_source`, `lead_note`, `activity`, `scoring_model`, `score_contribution`, `scoring_failure`, `audit_log` + constraint (`uniq_running_job`, `uniq_pending_invite`, CHECK peran/status/rentang skor) |
| `1700000002000_ai-analyzer-schema` | `team_ai_settings`, `ai_call_log`, kolom AI pada `lead`, `ai_enabled` pada `scan_configuration`, enum `ai_call` + `metadata jsonb` pada `audit_log` |
| `1700000003000_perf-indexes` | `idx_lead_default_sort`, `idx_lead_status`, `idx_lead_source`, `pg_trgm` + `idx_lead_search_trgm`, `idx_lead_acquired_at` |
| `1700000004000_outbox` | Tabel `outbox` untuk Outbox pattern (notifikasi transaksional) |

### Pola transaksi & kompensasi (Outbox)

Pesan notifikasi ditulis ke tabel `outbox` di dalam transaksi domain yang sama
(`dispatched_at IS NULL`); worker terpisah mengirimkannya. Ini membuat status domain
selalu mencerminkan kenyataan meski pengiriman notifikasi gagal — dasar dari keamanan
kegagalan Scan_Job (R12.4) dan atomisitas Lead unscored (R7.9).

### Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    team ||--o{ user_membership   : "punya anggota"
    app_user ||--o{ user_membership : "tergabung"
    team ||--o{ invitation         : "mengundang"
    team ||--o{ team_connector     : "memasang"
    team ||--o{ scan_configuration : "memiliki"
    team ||--o{ scan_job           : "menjalankan"
    scan_configuration ||--o{ scan_job : "memicu"
    team ||--o{ lead               : "memiliki"
    lead ||--o{ lead_source        : "berasal dari"
    lead ||--o{ lead_note          : "punya catatan"
    app_user ||--o{ lead_note      : "menulis"
    lead ||--o{ activity           : "punya aktivitas"
    lead ||--o| lead               : "duplikat dari"
    team ||--|| scoring_model      : "punya model skor"
    lead ||--o{ score_contribution : "rincian skor"
    lead ||--o{ scoring_failure    : "catatan gagal skor"
    team ||--o{ audit_log          : "teraudit"
    team ||--|| team_ai_settings   : "konfigurasi AI"
    team ||--o{ ai_call_log        : "panggilan AI"
    lead ||--o{ ai_call_log        : "dianalisis"
    team ||--o{ outbox             : "notifikasi"

    team {
        uuid id PK
        text name
        integer data_retention_days "R11.7"
    }
    app_user {
        uuid id PK
        citext email UK "case-insensitive"
        text password_hash "argon2"
        integer failed_login_count "R1.6"
        timestamptz locked_until "R1.6"
    }
    user_membership {
        uuid team_id PK,FK
        uuid user_id PK,FK
        text role "admin|member|viewer"
        text status "pending|active"
    }
    invitation {
        uuid id PK
        uuid team_id FK
        citext email "<=254 char"
        text role
        text status "pending|active|expired"
        timestamptz expires_at "created_at + 168h"
    }
    team_connector {
        uuid team_id PK,FK
        text source_id PK
        text status "available|unavailable|requires_configuration"
        bytea encrypted_credentials "R3.4 at-rest"
        jsonb usage_policy "R11.9"
    }
    scan_configuration {
        uuid id PK
        uuid team_id FK
        text_array keywords "1..50"
        text niche "<=100"
        text location "<=100"
        text_array source_ids ">=1"
        integer schedule_interval_minutes "60..43200"
        boolean ai_enabled "R13.4 opt-in"
    }
    scan_job {
        uuid id PK
        uuid team_id FK
        uuid configuration_id FK
        text trigger "manual|scheduled"
        text status "running|succeeded|failed|skipped"
        jsonb summary "ScanSummary"
        timestamptz started_at
        timestamptz finished_at
    }
    lead {
        uuid id PK
        uuid team_id FK
        text name "Personal_Data publik"
        text public_contact
        text profile_url
        text location
        text status "6 status R8.1"
        smallint score "0..100, NULL=unscored"
        text score_state "scored|unscored"
        boolean is_duplicate
        uuid duplicate_of FK "self-ref"
        timestamptz discovered_at
        smallint ai_intent_score "0..100"
        text ai_insight "<=500"
        text ai_state "none|pending|success|unavailable"
    }
    lead_source {
        uuid lead_id PK,FK
        text source_id PK
    }
    lead_note {
        uuid id PK
        uuid lead_id FK
        text body "1..2000"
        uuid author_id FK
    }
    activity {
        uuid id PK
        uuid lead_id FK
        text type "status_change|note_added|deleted"
        uuid actor_id
        text from_status
        text to_status
    }
    scoring_model {
        uuid team_id PK,FK
        integer version "naik saat update"
        jsonb factors
    }
    score_contribution {
        uuid lead_id PK,FK
        integer model_version
        text factor_id PK
        numeric raw_value
        numeric weighted_value
    }
    scoring_failure {
        uuid id PK
        uuid lead_id FK
        text reason "compute_error|model_unconfigured|uncertain"
    }
    audit_log {
        uuid id PK
        uuid team_id FK
        text actor_id "uuid user | 'system'"
        text action "create|update|delete|export|retention_delete|dsar_delete|ai_call"
        text object_type
        text object_id
        jsonb metadata
    }
    team_ai_settings {
        uuid team_id PK,FK
        bytea encrypted_gemini_api_key "R13.2 at-rest"
        boolean ai_enabled
        integer call_budget_30d "R13.15"
        numeric ai_intent_factor_weight "R13.10"
    }
    ai_call_log {
        uuid id PK
        uuid team_id FK
        uuid lead_id FK
        text trigger "scan|manual"
        text outcome "success|timeout|... "
        timestamptz at "rolling 30d window"
    }
    outbox {
        uuid id PK
        uuid team_id FK
        text type "mis. lead.unscored"
        jsonb payload
        timestamptz dispatched_at "NULL=belum terkirim"
    }
```

> Catatan: penghapusan Personal_Data (DSAR/retensi) **mem-NULL-kan** kolom personal
> pada `lead` (name, public_contact, profile_url, location), baris tetap dipertahankan
> untuk integritas metrik & audit. `lead_source`, `lead_note`, `activity`,
> `score_contribution`, `scoring_failure`, dan `ai_call_log` memakai
> `ON DELETE CASCADE` terhadap `lead`.

---

## 8. Contoh Request API (rancangan)

> **Status**: lapisan HTTP (Task 18) **belum diimplementasikan**. Kontrak di bawah
> adalah rancangan berdasarkan `design.md` untuk memandu implementasi. Semua endpoint
> (kecuali login) memerlukan cookie sesi dan melewati rantai penjaga
> **Auth → RBAC → Tenant Guard**. Galat dipetakan dari `AppError` ke status HTTP
> (`401` sesi invalid, `403` otorisasi, `422` validasi, `409` konflik, `500` internal).

### Autentikasi

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "ana@contoh.id", "password": "rahasia-kuat" }
```

```http
HTTP/1.1 200 OK
Set-Cookie: sid=<opaque>; HttpOnly; Secure; SameSite=Lax
Content-Type: application/json

{ "user": { "id": "f1...", "email": "ana@contoh.id" }, "teamId": "a9...", "role": "admin" }
```

Kredensial salah → `401` dengan pesan generik (tidak membocorkan email vs password, R1.2):

```json
{ "error": { "code": "AUTH", "message": "Email atau kata sandi salah." } }
```

### Daftar & filter Lead (paginasi 25/halaman)

```http
GET /api/leads?search=desain&status=New,Reviewed&source=google&scoreMin=60&scoreMax=100&page=1
```

```json
{
  "items": [
    {
      "id": "ld_01...",
      "name": "Studio Kopi Nusantara",
      "publicContact": "halo@studiokopi.id",
      "profileUrl": "https://example.com/studiokopi",
      "location": "Bandung",
      "status": "New",
      "score": 87,
      "scoreState": "scored",
      "sources": ["google"],
      "discoveredAt": "2026-05-30T08:12:00Z",
      "aiIntentScore": 74,
      "aiInsight": "Menyebut kebutuhan landing page baru untuk peluncuran produk.",
      "aiState": "success"
    }
  ],
  "page": 1,
  "pageSize": 25,
  "totalItems": 1,
  "totalPages": 1
}
```

Rentang skor invalid (`scoreMin > scoreMax` atau di luar 0–100) → `422` tanpa mengubah hasil (R9.8):

```json
{ "error": { "code": "VALIDATION", "messages": ["Rentang skor tidak valid"] } }
```

Hasil kosong tetap `200` dengan pesan ramah (R9.6): `{ "items": [], "message": "Tidak ada Lead yang cocok" }`

### Ubah status Lead (mencatat Activity)

```http
PATCH /api/leads/ld_01.../status
Content-Type: application/json

{ "to": "Contacted" }
```

```json
{ "id": "ld_01...", "status": "Contacted", "activity": { "from": "New", "to": "Contacted", "actorId": "f1...", "at": "2026-06-01T03:20:00Z" } }
```

Viewer (baca-saja) → `403` (R2.4).

### Tambah catatan tindak lanjut

```http
POST /api/leads/ld_01.../notes
Content-Type: application/json

{ "body": "Sudah DM via kontak publik, menunggu balasan." }
```

Catatan di luar 1–2000 karakter → `422` tanpa mengubah catatan lama (R8.4).

### Hapus Lead (butuh konfirmasi eksplisit)

```http
DELETE /api/leads/ld_01...
Content-Type: application/json

{ "confirm": true }
```

`confirm: false`/absen → `422`, Lead utuh (R8.5/R8.6). `confirm: true` → hapus permanen + audit `delete` (R8.7).

### Jalankan Scan_Configuration (manual)

```http
POST /api/scan-configurations/sc_01.../run
```

```json
{ "jobId": "job_77...", "status": "running" }
```

Tidak ada Source `available` → job dibatalkan, tidak membuat Lead (R5.7):

```json
{ "error": { "code": "VALIDATION", "messages": ["Tidak ada Source yang tersedia"] } }
```

### Metrik dashboard (opsional rentang tanggal)

```http
GET /api/metrics?from=2026-05-01&to=2026-05-31
```

```json
{
  "totalLeads": 1240,
  "byStatus": { "New": 800, "Reviewed": 220, "Contacted": 120, "Qualified": 60, "Converted": 30, "Rejected": 10 },
  "bySource": { "google": 900, "threads": 340 },
  "conversionRatePercent": 2.42
}
```

### Ekspor Lead (Admin-only, teraudit)

```http
POST /api/leads/export
Content-Type: application/json

{ "format": "csv" }
```

Non-Admin → `403` meski artefak terbentuk (R11.6). Sukses mencatat audit `export` (R11.5).

### AI: konfigurasi (Admin) & re-analisis manual

```http
PUT /api/ai/settings           # RBAC ai.configure (Admin-only)
Content-Type: application/json

{ "geminiApiKey": "<key>", "aiEnabled": true, "callBudget30d": 500, "aiIntentFactorWeight": 1.5 }
```

```http
POST /api/leads/ld_01.../ai/reanalyze     # RBAC ai.reanalyze (Admin/Member)
```

```json
{ "leadId": "ld_01...", "aiState": "pending", "trigger": "manual" }
```

Worker memproses asinkron; bila gagal/anggaran habis → `aiState: "unavailable"` + `aiUnavailableReason` (mis. `budget_exceeded`), tanpa memblokir/rollback Lead (R13.13/R13.14).

---

## 9. Strategi Pengujian

Pengujian bersifat ganda:

1. **Property-Based Testing (PBT)** dengan **fast-check** (min. 100 iterasi,
   `{ numRuns: 100 }`) untuk ke-44 Correctness Properties. Setiap properti
   diimplementasikan oleh **tepat satu** property test, ditandai komentar:
   `Feature: leads-generator-dashboard, Property {n}: {teks}`.
2. **Unit / integration / performance tests** untuk kriteria non-PBT (edge case,
   infrastruktur, target performa).

Helper PBT bersama ada di `shared/src/testing/pbt`. Folder test backend:
`backend/tests/{property,unit,integration}`.

Contoh properti penting yang sudah tervalidasi:

- Property 1 — Determinisme skoring
- Property 8 — Pengurutan total deterministik
- Property 16 — Isolasi data tenant
- Property 22 — Pencegahan tumpang-tindih Scan_Job terjadwal
- Property 36 — Keamanan kegagalan Scan_Job total

### Status quality gate saat ini

- `npm run build` berhasil untuk seluruh workspace.
- `npm test` berhasil; workspace frontend saat ini memakai `vitest run --passWithNoTests`
  karena belum ada test UI.
- `npm run type-check -w @leads-generator/frontend` berhasil setelah kontrak halaman
  dashboard diketik dengan DTO lokal.
- `npm run lint -w @leads-generator/frontend` berhasil setelah halaman dashboard dan
  primitive UI menghapus `any` utama serta menerima props HTML native.
- `npm run lint` masih perlu pekerjaan lanjutan. Penyebab utama: konfigurasi ESLint
  type-aware belum memasukkan folder test ke `tsconfig`, beberapa modul API/AI masih
  memakai `any`, dan beberapa route masih melempar object literal domain error.

---

## 10. Setup & Pengembangan Lokal

### Prasyarat
- Node.js ≥ 20.11, npm ≥ 10
- PostgreSQL & Redis berjalan lokal

### Langkah

```bash
# 1. Pasang dependensi seluruh workspace
npm install

# 2. Konfigurasi environment backend
cp backend/.env.example backend/.env
#   - DATABASE_URL=postgres://postgres:postgres@localhost:5432/leads_generator
#   - REDIS_URL=redis://localhost:6379/0

# 3. Jalankan migrasi skema
npm run migrate -w @leads-generator/backend

# 4. Build & test
npm run build      # tsc -b seluruh workspace
npm test           # Vitest seluruh workspace
```

### Skrip tingkat root

| Skrip | Deskripsi |
|---|---|
| `npm install` | Pasang dependensi seluruh workspace |
| `npm run build` | Build seluruh workspace (`tsc -b`) |
| `npm run lint` | Lint seluruh workspace |
| `npm run format` | Format dengan Prettier |
| `npm test` | Test seluruh workspace (Vitest) |

### Catatan `package-lock.json`

`package-lock.json` dikelola otomatis oleh npm dan memang bisa mencapai ribuan baris
pada monorepo Next.js + Fastify + Vitest. File ini bukan target refactor manual:
ukurannya berasal dari graph dependensi transitif dan berguna untuk instalasi yang
reproducible. Perubahan lockfile hanya dilakukan saat dependency atau workspace
metadata berubah melalui npm, bukan dengan menghapus baris secara manual.

> Catatan dev: jalankan dev server / worker / build watcher di terminal Anda sendiri
> (jangan via skrip yang memblokir agen).

---

## 11. Status Implementasi

Roadmap lengkap (22 tugas tingkat atas) ada di `.kiro/specs/leads-generator-dashboard/tasks.md`.
Bagian ini mencatat status kode aktual di repository saat ini.

| Area | Status |
|---|---|
| Scaffolding, skema DB, repository ber-tenant | ✅ Selesai |
| Auth, sesi, RBAC, Team & undangan | ✅ Selesai |
| Connector registry, vault, kontrak Source_Connector | ✅ Selesai |
| Scan_Config, Deduplication, Lead_Scoring_Engine | ✅ Selesai |
| Scan_Engine, Job_Scheduler, Lead_Manager, Query, Metrics, Privacy | ✅ Selesai |
| Analisis AI Gemini | 🚧 Sebagian; service/route ada, worker & recompute AI belum tersambung penuh |
| Lapisan API (HTTP) | 🚧 Ada route Fastify untuk auth, team, connector, scan, lead, metrics, privacy, AI; perlu hardening RBAC dan error model |
| Frontend (Next.js) | 🚧 Ada dashboard awal; perlu state management, typed contracts penuh, dan test UI |
| Validasi performa & checkpoint akhir | ⏳ Belum tuntas |

### State Management UI

Frontend memakai dua lapis state:

1. **Server state** melalui TanStack Query: sesi, leads, scans, metrics, connectors.
   Ini arah yang tepat untuk data dari API karena cache, loading state, invalidation,
   dan retry bisa dikelola terpusat.
2. **Local UI state** melalui `useState`: modal terbuka, form scan, tab aktif,
   filter lead, lead terpilih, note draft, dan toggle setting.

Kondisi saat ini cukup untuk MVP, tetapi belum matang untuk dashboard produksi:

- Belum ada typed API client terpusat; halaman sudah mulai memakai DTO lokal, tetapi
  endpoint dan query key masih tersebar.
- Filter, pagination, selected lead, dan modal state masih lokal di halaman Leads.
  Saat kebutuhan bertambah, sebaiknya dipisah menjadi custom hook seperti
  `useLeadsController` agar table, drawer/modal, dan action mutation tidak saling
  menumpuk di satu komponen.
- State form masih manual `useState`; untuk form yang punya validasi domain
  (scan config, AI settings, invite member), gunakan `react-hook-form` + Zod agar
  validasi UI sama dengan kontrak API.
- Belum ada optimistic update/error recovery yang konsisten. Mutasi status/note/AI
  perlu pola standar: disable action saat pending, tampilkan toast error, invalidate
  query yang relevan, dan rollback optimistic patch bila gagal.
- Belum ada mekanisme global untuk session expiry dan 401 handling. `fetchApi`
  sebaiknya mengarahkan pengguna ke login atau membersihkan cache session saat
  server mengembalikan 401.
- Settings page masih banyak mock/local-only state. Perlu dihubungkan ke endpoint
  `PUT /api/teams/:id/ai/settings` dan query settings agar perubahan persisted.

---

## 12. Referensi

- `.kiro/specs/leads-generator-dashboard/requirements.md` — 13 requirement (EARS/INCOSE)
- `.kiro/specs/leads-generator-dashboard/design.md` — arsitektur + 44 correctness properties
- `.kiro/specs/leads-generator-dashboard/tasks.md` — rencana implementasi + dependency graph
- `docs/SPRINTS.md` — dokumentasi sprint & progres
- [fast-check](https://github.com/dubzzz/fast-check) — pustaka property-based testing

*Konten yang merujuk sumber eksternal dirangkum ulang untuk kepatuhan lisensi.*
