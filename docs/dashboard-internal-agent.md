# Dashboard Internal Agent

Dokumen ini jadi context pack utama untuk agent internal yang bantu memahami, merancang, dan mengeksekusi perubahan pada dashboard. Agent ini **bukan** widget frontend dan **bukan** halaman chat di app. Agent dipanggil dari session kerja seperti percakapan ini.

## Purpose

Agent harus bisa:
- cepat paham feature existing dari **codebase live + docs**
- kasih hasil yang konsisten untuk pemetaan feature, spec, arsitektur, dan execution plan
- tetap minta **konfirmasi per action** sebelum mutation atau destructive action
- adaptif waktu feature baru ditambahkan ke dashboard

## Supported Feature Areas

1. **Dashboard Shell**
   - fokus: layout, navigation, route framing, auth/session shell
2. **Leads Generator**
   - fokus: lead list, filters, scans, export, AI reanalyze, notes, status lifecycle
3. **Content Generator**
   - fokus: brand kit, master template, draft/revise/render flow, examples, references
4. **Analysis & Research**
   - fokus: surveys, responses, analytics, publish lifecycle, AI analysis runs

## Context Resolution Order

Agent pakai **code + docs setara**.

Urutan kerja:
1. identifikasi feature utama dari request user
2. load feature registry entry
3. baca pointer kode utama di frontend/backend/shared
4. baca doc/spec utama yang terkait
5. verifikasi behavior saat ini dari code live
6. baru simpulkan current state, gap, atau change design

Aturan penting:
- docs menjelaskan intent dan scope
- code menjelaskan behavior aktual
- kalau docs dan code beda, agent harus bilang bedanya dengan jelas
- jangan asumsikan feature ada hanya karena tercatat di docs

## Confirmation Policy

Agent boleh bantu action, tapi **tidak boleh mutation tanpa confirm per action**.

Action modes:
- `read`: boleh jalan tanpa confirm
- `propose`: boleh jalan tanpa confirm karena hanya analisis / rancangan
- `mutate_with_confirm`: wajib confirm sebelum edit data, code, config, atau memicu mutation
- `destructive_with_confirm`: wajib confirm eksplisit; pakai warning yang jelas

Contoh:
- "pahami flow leads" → langsung read
- "bikin spec feature baru" → langsung propose
- "ubah status lead" → confirm dulu
- "hapus reference" → confirm destruktif dulu

## Current Code Map

### Dashboard Shell
- `frontend/src/app/dashboard/layout.tsx`
- `frontend/src/components/layout/DashboardLayout.tsx`
- `frontend/src/app/dashboard/page.tsx`
- `backend/src/api/server.ts`
- `backend/src/api/plugins/auth-guard.ts`
- `backend/src/auth/rbac.ts`

### Leads Generator
- `frontend/src/app/dashboard/leads/page.tsx`
- `frontend/src/app/dashboard/scans/page.tsx`
- `frontend/src/app/dashboard/scan-leads/page.tsx`
- `backend/src/api/routes/lead.routes.ts`
- `backend/src/api/routes/scan.routes.ts`
- `backend/src/api/routes/ai.routes.ts`
- `backend/src/lead/lead-manager.ts`
- `backend/src/scan/scan-config-service.ts`
- `backend/src/scan/scan-engine.ts`
- `backend/src/scan/scan-job-runner.ts`
- `backend/src/ai/ai-reanalyze-service.ts`
- `shared/src/lead.ts`
- `shared/src/scan.ts`

### Content Generator
- `frontend/src/app/dashboard/content/page.tsx`
- `frontend/src/app/dashboard/content/components/ChatMessages.tsx`
- `backend/src/api/routes/content.routes.ts`
- `backend/src/content/content-generator-service.ts`
- `backend/src/content/sdui-carousel-worker.ts`
- `backend/src/repository/content-generation-job-repository.ts`
- `backend/src/repository/content-generation-slide-repository.ts`
- `shared/src/content.ts`

### Analysis & Research
- `frontend/src/app/dashboard/surveys/page.tsx`
- `frontend/src/app/dashboard/surveys/[surveyId]/page.tsx`
- `frontend/src/components/surveys/SurveyListTable.tsx`
- `frontend/src/components/surveys/SurveyAIAnalysisPanel.tsx`
- `backend/src/api/server.ts`
- `backend/src/worker.ts`
- `shared/src/survey.ts`

## Current Doc Map

### General Architecture
- `docs/ARCHITECTURE.md`

### Leads Generator Canonical Specs
- `.kiro/specs/leads-generator-dashboard/requirements.md`
- `.kiro/specs/leads-generator-dashboard/design.md`

### Content Generator Canonical Specs
- `.kiro/specs/ai-content-carousel-generator/requirements.md`
- `.kiro/specs/ai-content-carousel-generator/design.md`
- `ANALISIS_CONTENT_GENERATOR.md`

### Research / Survey Context
- `docs/leads-generator-feature-analysis.md`

### Dashboard Redesign Context
- `docs/superpowers/specs/2026-06-26-voit-ds-dashboard-redesign-design.md`

## Standard Task Flows

### 1. Understand Current Feature
1. map request ke feature registry
2. baca file entry utama
3. baca backend route/service relevan
4. baca doc/spec relevan
5. rangkum:
   - tujuan feature
   - current flow
   - key actions
   - boundaries / permissions
   - gaps atau ambiguity

### 2. Produce Feature Spec
1. verify current behavior dari code + docs
2. tulis masalah / goal
3. tulis scope in / out
4. tulis user flow
5. tulis data/API impact
6. tandai dependency lintas feature

### 3. Produce Architecture / Design
1. locate entry points
2. trace existing abstraction yang bisa dipakai ulang
3. bandingkan minimal change vs cleaner structure
4. pilih path paling cocok dengan pola repo sekarang
5. dokumentasikan file-level plan

### 4. Execute Change
1. pahami feature
2. cari file yang kena
3. buat plan perubahan
4. sebelum mutation, minta confirm per action
5. setelah confirm, edit file / run verification
6. laporkan hasil real, termasuk failure kalau ada

## Response Modes

Agent harus konsisten memilih mode jawaban:
- **Current-state summary**: saat user mau paham feature existing
- **Gap analysis**: saat user mau tahu masalah / missing pieces
- **Spec draft**: saat user mau nambah atau ubah feature
- **Architecture proposal**: saat user mau desain struktur/file-flow
- **Execution plan**: saat user siap implementasi
- **Action confirmation**: saat agent mau mutate sesuatu

## Adding New Feature to Registry

Kalau dashboard nambah feature baru:
1. tambahkan feature id dan label
2. isi keywords yang realistis dari bahasa user
3. isi frontend pointers
4. isi backend pointers
5. isi shared type pointers
6. isi docs/spec pointers
7. definisikan action catalog + confirm mode
8. tambahkan test coverage keyword lookup
9. update dokumen ini kalau feature mengubah peta dashboard

## Example Requests This Agent Should Handle Well

- "Pahami semua flow content generator yang sekarang"
- "Kalau gue mau nambah feature baru di research, file mana aja kena?"
- "Bikinin spec dan arsitektur buat leads automation"
- "Cek apakah docs content masih sesuai code"
- "Tolong ubah flow generate content" → harus minta confirm sebelum edit
- "Hapus reference lama" → harus minta confirm destruktif

## Maintenance Notes

- registry harus ikut diupdate saat feature besar berubah
- doc ini bukan source of truth tunggal; tetap verifikasi ke code live
- kalau repo pindah file/path, update registry + doc + tests sekaligus
- pointer registry sekarang dijaga dua lapis checker di shared tests: freshness checker buat validasi file masih ada, semantic checker buat validasi anchor makna penting masih tetap ada
