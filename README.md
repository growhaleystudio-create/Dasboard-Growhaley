# Leads Generation Dashboard

Monorepo untuk **Leads Generation Dashboard** — aplikasi web SaaS multi-tim yang
memindai sumber eksternal **melalui API resmi** (bukan scraping), menormalkan hasil
menjadi `Lead`, mendeduplikasi, memberi skor otomatis secara deterministik, dan
menyajikannya dalam dashboard yang dapat disaring dan ditindaklanjuti — dengan
kepatuhan privasi (GDPR / UU PDP) dan pengayaan AI opsional (Google Gemini).

## Struktur Repositori

```
.
├── shared/      # Tipe domain bersama (TypeScript, tanpa runtime deps)
├── backend/     # Node.js + TypeScript (Fastify, BullMQ, pg, ioredis, argon2)
│   └── migrations/   # Skema PostgreSQL (node-pg-migrate)
├── frontend/    # Next.js 14 App Router (React 18, TanStack Query)
├── docs/        # Dokumentasi teknis — lihat docs/ARCHITECTURE.md
├── .kiro/specs/leads-generator-dashboard/   # requirements, design, tasks
├── tsconfig.base.json
├── tsconfig.json
├── .eslintrc.cjs
├── .prettierrc
└── package.json # npm workspaces root
```

## Stack

- **Frontend**: Next.js 14 (App Router), React 18, TanStack Query, TypeScript
- **Backend**: Node.js 20+, TypeScript, Fastify, Zod, BullMQ (Redis), `pg`, `ioredis`, `argon2`
- **Persistensi**: PostgreSQL (+ `pg_trgm`), Redis (session store + antrian kerja)
- **AI (opsional)**: Google Gemini via API resmi
- **Tooling**: npm workspaces, ESLint, Prettier, Vitest + fast-check (property-based testing)

## Persyaratan

- Node.js ≥ 20.11
- npm ≥ 10
- PostgreSQL & Redis (pengembangan lokal)

## Memulai

```bash
# 1. Pasang dependensi seluruh workspace
npm install

# 2. Konfigurasi environment backend
cp backend/.env.example backend/.env   # isi DATABASE_URL & REDIS_URL

# 3. Jalankan migrasi skema PostgreSQL
npm run migrate -w @leads-generator/backend

# 4. Build & test
npm run build
npm test
```

## Skrip Tingkat Root

| Skrip            | Deskripsi                                       |
| ---------------- | ----------------------------------------------- |
| `npm install`         | Memasang dependensi seluruh workspace                    |
| `npm run dev`         | Menjalankan backend build watch + backend API + frontend |
| `npm run dev:worker`  | Menjalankan backend worker watcher                       |
| `npm run dev:backend` | Menjalankan backend build watch + backend API            |
| `npm run dev:frontend`| Menjalankan frontend saja                                |
| `npm run build`       | Build seluruh workspace (`tsc -b`)                       |
| `npm run lint`        | Lint seluruh workspace                                   |
| `npm run format`      | Memformat seluruh repositori dengan Prettier             |
| `npm test`            | Menjalankan test seluruh workspace (Vitest)              |

## Dokumentasi

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — arsitektur, peta modul backend,
  ERD, model data, alur eksekusi pemindaian, skoring, privasi, AI, contoh request API,
  dan strategi pengujian.
- **[docs/SPRINTS.md](docs/SPRINTS.md)** — dokumentasi sprint, progres, dan sprint yang
  belum berjalan (berdasarkan task).
- **Spesifikasi** (`.kiro/specs/leads-generator-dashboard/`):
  - `requirements.md` — kebutuhan fungsional/non-fungsional (pola EARS / INCOSE)
  - `design.md` — desain teknis + correctness properties
  - `tasks.md` — rencana implementasi + dependency graph

## Prinsip Utama

- **Hanya API resmi** — tidak ada scraping. Connector tanpa API → status `unavailable`.
- **Isolasi data per Team** — setiap baris ber-tenant via `team_id`, difilter di lapisan repository.
- **Skoring deterministik** — skor adalah fungsi murni dari atribut Lead + Scoring_Model; AI bersifat opsional dan melengkapi, bukan menggantikan.
- **Privacy by design** — hanya data publik yang disimpan; retensi & penghapusan subjek data otomatis dan teraudit.
- **Versi dependensi dipinning eksak** untuk reproducibility.
- **Database Status**: Konfigurasi PostgreSQL (Supabase) dan Redis (Upstash) untuk produksi telah dikonfigurasi di `.env` lokal dan diverifikasi online.

