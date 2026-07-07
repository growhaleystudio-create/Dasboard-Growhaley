# Implementation Plan: Quantitative Research Survey Module

Date: 2026-06-20  
Source PRD: `docs/superpowers/specs/2026-06-20-quantitative-research-survey-prd.md`

---

## 1. Purpose

Dokumen ini menerjemahkan PRD `Quantitative Research Survey Module` menjadi implementation plan teknis yang fokus pada **backend dan business logic phase awal**.

Target phase awal adalah membangun **V1 survey engine** yang usable untuk:
- authoring survey internal,
- publishing survey ke public link,
- menerima response tanpa login,
- menjalankan conditional logic sederhana,
- menyajikan analytics baseline,
- menjalankan AI post-response analysis,
- menyediakan export JSON/CSV.

Dokumen ini disusun agar konsisten dengan arsitektur repo saat ini:
- backend: `Fastify`
- database: `PostgreSQL` via `pg`
- migrations: `node-pg-migrate`
- async jobs: `BullMQ`
- shared contracts: `shared/src`
- AI infra existing: team AI settings, budget tracker, AI call log, worker

---

## 2. Scope Phase Awal

### Included

Phase awal mencakup:

1. **Survey CRUD internal**
2. **Question schema management**
3. **Draft / published / closed lifecycle**
4. **Public survey access via link**
5. **Public response submission tanpa login**
6. **Response quota dan auto-close**
7. **Manual rule-based conditional logic**
8. **Survey analytics baseline**
9. **AI post-response analysis (async)**
10. **Export JSON dan CSV**
11. **Team isolation + RBAC**
12. **Audit logging untuk perubahan penting**

### Excluded for now

Belum masuk scope phase awal:

1. Visual survey builder UI tingkat lanjut
2. Visual conditional logic tree builder
3. Nested branching yang kompleks
4. AI-generated follow-up questions / adaptive survey flow
5. Multi-phase AI-assisted survey creation (V2)
6. Excel export
7. Advanced BI-style analytics builder
8. Profiling individu sensitif
9. Respondent identity management di luar pertanyaan yang dibuat creator

---

## 3. Goals of the Backend Phase

Backend phase awal harus menghasilkan fondasi yang:

1. **stabil untuk V1 manual workflow**,
2. **aman untuk public response submission**,
3. **cukup fleksibel untuk analytics dan AI summary**,
4. **mudah di-extend untuk V2 tanpa rewrite total**.

Secara desain, backend harus sudah mengenal konsep:
- survey status,
- survey version,
- structured responses,
- normalized answers,
- cached AI analysis,
- async analysis jobs.

---

## 4. Recommended Domain Decisions

Sebelum implementasi, berikut keputusan desain yang direkomendasikan agar scope tetap terkendali.

### 4.1 Published survey immutable secara struktur

Saat `survey.status = published`, struktur pertanyaan **tidak boleh diubah** sampai survey di-unpublish atau dipindah kembali ke draft.

**Alasan:**
- mengurangi kompleksitas analytics,
- mencegah response tercampur dengan schema yang berubah-ubah,
- menyederhanakan public runtime,
- cocok untuk V1.

### 4.2 Matrix question dibatasi untuk V1

Untuk V1, `matrix` hanya mendukung:
- beberapa row,
- pilihan tunggal per row,
- tanpa nested matrix logic,
- tanpa multi-select per row.

### 4.3 Full schema replacement untuk question save API

API management pertanyaan direkomendasikan memakai pola:
- `PUT /questions` mengganti seluruh set pertanyaan dalam urutan final.

**Alasan:**
- jauh lebih sederhana daripada granular mutation + reorder,
- cocok untuk backend-first phase awal,
- cukup untuk kebutuhan builder UI awal.

### 4.4 Response disimpan dalam bentuk raw + normalized

Response V1 direkomendasikan disimpan dalam dua bentuk:
1. `answers_json` sebagai raw source of truth,
2. `survey_response_answer` sebagai normalized rows untuk query/filter/analytics.

### 4.5 AI analysis manual trigger dulu

AI analysis sebaiknya **manual trigger** di phase awal.

**Alasan:**
- kontrol cost,
- kontrol latency,
- menghindari workflow otomatis yang terlalu banyak moving parts pada V1.

### 4.6 Public link lifecycle dibuat saat first publish

Untuk V1, `public_slug` **tidak perlu dibuat saat create draft**. `public_slug` dibuat saat survey pertama kali dipublish, lalu dipertahankan untuk lifecycle berikutnya.

**Aturan yang direkomendasikan:**
- create draft survey → belum ada public URL,
- first publish → generate `public_slug`,
- unpublish → survey kembali draft tetapi `public_slug` tetap tersimpan,
- re-publish → gunakan `public_slug` lama,
- close → `public_slug` tetap ada tetapi submission ditutup.

**Implikasi FE/UX:**
- creator tidak boleh diasumsikan langsung bisa share survey setelah create,
- detail page perlu state `no public link yet`,
- copy/open public link hanya muncul bila `public_slug` sudah ada.

---

## 5. High-Level Architecture

### 5.1 New module boundaries

Tambahkan modul baru:

```text
backend/src/survey/
  survey-service.ts
  survey-public-service.ts
  survey-logic-service.ts
  survey-response-service.ts
  survey-analytics-service.ts
  survey-analysis-service.ts
  survey-export-service.ts
```

Tambahkan repository baru:

```text
backend/src/repository/
  survey-repository.ts
  survey-question-repository.ts
  survey-response-repository.ts
  survey-analysis-repository.ts
```

Tambahkan route baru:

```text
backend/src/api/routes/
  survey.routes.ts
  survey-public.routes.ts
```

Tambahkan shared contracts baru:

```text
shared/src/survey.ts
```

---

## 6. Data Model Plan

## 6.1 Core entities

### 6.1.1 `survey`

Representasi research project / survey container.

Field yang direkomendasikan:
- `id`
- `team_id`
- `title`
- `description`
- `project_goal`
- `background_context`
- `target_participant`
- `primary_decision`
- `status` (`draft | published | closed`)
- `public_slug` (opsional; baru terisi saat first publish)
- `response_quota`
- `response_count`
- `current_version`
- `published_at`
- `closed_at`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

### 6.1.2 `survey_question`

Question definition per survey version.

Field:
- `id`
- `survey_id`
- `team_id`
- `version`
- `question_key`
- `type`
- `title`
- `description`
- `required`
- `display_order`
- `config` (jsonb)
- `logic_rules` (jsonb)
- `created_at`
- `updated_at`

### 6.1.3 `survey_response`

One public participant submission/session.

Field:
- `id`
- `survey_id`
- `team_id`
- `survey_version`
- `status` (`in_progress | completed | abandoned`)
- `answers_json`
- `metadata`
- `analysis_state` (`none | pending | success | failed`)
- `started_at`
- `submitted_at`
- `created_at`

### 6.1.4 `survey_response_answer`

Normalized answer rows untuk analytics/filtering.

Field:
- `id`
- `response_id`
- `survey_id`
- `team_id`
- `question_id`
- `question_key`
- `question_type`
- `answer_text`
- `answer_number`
- `answer_option`
- `answer_options`
- `answer_matrix`
- `normalized_value`
- `created_at`

### 6.1.5 `survey_analysis`

Cache hasil AI analysis.

Field:
- `id`
- `survey_id`
- `team_id`
- `scope` (`overall | question | segment`)
- `question_id`
- `filter_hash`
- `status` (`pending | success | failed`)
- `input_snapshot`
- `result_json`
- `model`
- `error_message`
- `created_by`
- `created_at`
- `updated_at`

---

## 6.2 Migration plan

Buat migration baru:

- `backend/migrations/1700000018000_survey-module-schema.cjs`

### Minimum tables

1. `survey`
2. `survey_question`
3. `survey_response`
4. `survey_response_answer`
5. `survey_analysis`

### Important constraints

- `project_goal` wajib non-empty
- `status` check enum
- `response_quota >= 1` bila tidak null
- `question_type` check enum
- `survey_response.status` check enum
- `survey_analysis.status` check enum
- unique `(survey_id, version, question_key)`
- unique `public_slug`

### Important indexes

- `survey(team_id, status, created_at desc)`
- `survey_question(survey_id, version, display_order)`
- `survey_response(survey_id, submitted_at desc)`
- `survey_response(team_id, survey_id, status)`
- `survey_response_answer(survey_id, question_key)`
- `survey_response_answer(question_id)`
- `survey_analysis(survey_id, scope, status)`

---

## 7. Shared Contracts Plan

## 7.1 Files to change

### New
- `shared/src/survey.ts`

### Update
- `shared/src/auth.ts`
- `shared/src/index.ts`

## 7.2 New shared types

`shared/src/survey.ts` perlu mendefinisikan:

### Enums / unions
- `SurveyStatus`
- `SurveyQuestionType`
- `SurveyResponseStatus`
- `SurveyAnalysisStatus`
- `SurveyAnalysisScope`

### Domain types
- `Survey`
- `SurveyQuestion`
- `SurveyQuestionConfig`
- `SurveyLogicCondition`
- `SurveyLogicGroup`
- `SurveyResponse`
- `SurveyAnswer`
- `SurveyAnalyticsSummary`
- `SurveyQuestionStats`
- `SurveyAnalysis`

### Input types
- `CreateSurveyInput`
- `UpdateSurveyInput`
- `ReplaceSurveyQuestionsInput`
- `SubmitSurveyResponseInput`
- `SurveyAnalyticsFilter`
- `RunSurveyAnalysisInput`

---

## 8. RBAC Plan

## 8.1 Shared action additions

Tambahkan ke `shared/src/auth.ts`:

- `survey.read`
- `survey.write`
- `survey.publish`
- `survey.analyze`
- `survey.export`

## 8.2 RBAC matrix updates

Update `backend/src/auth/rbac.ts` dengan matrix berikut:

```ts
'survey.read': { admin: true, member: true, viewer: true },
'survey.write': { admin: true, member: true, viewer: false },
'survey.publish': { admin: true, member: true, viewer: false },
'survey.analyze': { admin: true, member: true, viewer: false },
'survey.export': { admin: true, member: false, viewer: false },
```

Jika diperlukan policy lebih ketat, `survey.publish` dapat dibatasi ke `admin` only. Namun untuk phase awal, `admin + member` masih masuk akal selama sesuai policy platform.

---

## 9. Repository Plan

## 9.1 `survey-repository.ts`

Responsibilities:
- create survey
- update survey metadata
- list surveys for team
- find by id (team scoped)
- find by public slug
- change status
- increment response count
- auto-close update

## 9.2 `survey-question-repository.ts`

Responsibilities:
- replace full question set for survey version
- list by survey and version
- validate uniqueness of `question_key`

## 9.3 `survey-response-repository.ts`

Responsibilities:
- insert response
- insert normalized answers
- list responses for survey
- fetch response detail
- fetch answer rows for analytics
- count completed/incomplete responses

## 9.4 `survey-analysis-repository.ts`

Responsibilities:
- create analysis record
- update analysis status
- fetch latest analyses by survey
- fetch analysis detail

---

## 10. Service Plan

## 10.1 `survey-service.ts`

Internal survey authoring and lifecycle.

Responsibilities:
- create survey draft
- update metadata
- replace question schema
- publish survey
- unpublish survey
- close survey
- validate editability rules
- write audit events

## 10.2 `survey-public-service.ts`

Public access layer.

Responsibilities:
- load published survey by slug
- enforce published/open state
- return public-safe schema
- submit response via response service

## 10.3 `survey-logic-service.ts`

Pure business logic.

Responsibilities:
- validate question configuration per type
- evaluate conditional visibility
- validate answer payloads
- sanitize answers for hidden questions
- normalize answers into storage format

## 10.4 `survey-response-service.ts`

Submission orchestration.

Responsibilities:
- transaction-safe response insert
- enforce quota
- increment response_count
- auto-close when quota reached
- write normalized answer rows
- optionally mark response analysis state

## 10.5 `survey-analytics-service.ts`

Analytics read service.

Responsibilities:
- compute survey summary
- compute completion rate
- compute per-question distributions
- support basic segmentation filters

## 10.6 `survey-analysis-service.ts`

AI post-response analysis service.

Responsibilities:
- create pending analysis request
- enqueue async job
- prepare survey context for AI
- store analysis results
- expose cached analysis to API

## 10.7 `survey-export-service.ts`

Export service.

Responsibilities:
- export JSON
- export CSV
- flatten multi-select and matrix answers
- write audit event for export

---

## 11. Conditional Logic Design

## 11.1 Scope V1

Conditional logic V1 dibatasi pada **simple rule-based branching**.

Direkomendasikan untuk V1 hanya mendukung semantik:
- question visible by default bila tidak punya logic,
- question dengan logic hanya tampil bila semua / salah satu condition match,
- fokus pada `show-if` logic.

## 11.2 Canonical logic shape

```ts
type SurveyLogicCondition = {
  sourceQuestionKey: string;
  operator: 'eq' | 'neq' | 'includes' | 'not_includes' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
  value?: string | number | boolean;
  values?: Array<string | number>;
  range?: { min?: number; max?: number };
};

type SurveyLogicGroup = {
  effect: 'show';
  match: 'all' | 'any';
  conditions: SurveyLogicCondition[];
};
```

## 11.3 Where logic is enforced

Conditional logic harus dievaluasi di dua tempat:

1. **frontend/public form** untuk pengalaman interaktif,
2. **backend saat submit** sebagai source of truth final.

Saat submit:
- pertanyaan yang hidden by logic tidak wajib dijawab,
- jawaban untuk pertanyaan hidden direkomendasikan untuk **diabaikan** daripada error, agar submission lebih robust.

---

## 12. Question Validation Plan

## 12.1 Supported question types in V1

- `short_text`
- `long_text`
- `multiple_choice`
- `checkboxes`
- `dropdown`
- `linear_scale`
- `matrix`

## 12.2 Validation rules per type

### `short_text`
- answer harus string
- optional min/max length

### `long_text`
- answer harus string
- optional min/max length

### `multiple_choice`
- answer harus string
- value harus salah satu dari `options`

### `checkboxes`
- answer harus array of string
- setiap value harus ada di `options`

### `dropdown`
- answer harus string
- value harus salah satu dari `options`

### `linear_scale`
- answer harus number
- value harus dalam range `min..max`

### `matrix`
- answer harus object keyed by row
- setiap row harus valid
- setiap row hanya boleh punya satu selected value pada V1

---

## 13. API Plan

## 13.1 Internal authenticated routes

Tambahkan route baru:
- `backend/src/api/routes/survey.routes.ts`

Prefix:
- `/api/teams/:id/surveys`

### Endpoints

#### Survey CRUD
- `POST /api/teams/:id/surveys`
- `GET /api/teams/:id/surveys`
- `GET /api/teams/:id/surveys/:surveyId`
- `PATCH /api/teams/:id/surveys/:surveyId`

#### Question schema
- `PUT /api/teams/:id/surveys/:surveyId/questions`

#### Lifecycle
- `POST /api/teams/:id/surveys/:surveyId/publish`
- `POST /api/teams/:id/surveys/:surveyId/unpublish`
- `POST /api/teams/:id/surveys/:surveyId/close`

Catatan kontrak lifecycle publik:
- `publish` pertama kali meng-generate `public_slug`,
- `unpublish` tidak menghapus `public_slug`, hanya menonaktifkan akses public,
- `close` tidak menghapus `public_slug`, tetapi submission public harus ditolak.

#### Responses (internal read)
- `GET /api/teams/:id/surveys/:surveyId/responses`
- `GET /api/teams/:id/surveys/:surveyId/responses/:responseId`

#### Analytics
- `GET /api/teams/:id/surveys/:surveyId/analytics`
- `POST /api/teams/:id/surveys/:surveyId/analytics/query`

#### AI analysis
- `POST /api/teams/:id/surveys/:surveyId/analysis`
- `GET /api/teams/:id/surveys/:surveyId/analysis`
- `GET /api/teams/:id/surveys/:surveyId/analysis/:analysisId`

#### Export
- `GET /api/teams/:id/surveys/:surveyId/export/json`
- `GET /api/teams/:id/surveys/:surveyId/export/csv`

---

## 13.2 Public routes

Tambahkan route baru:
- `backend/src/api/routes/survey-public.routes.ts`

Prefix:
- `/api/public/surveys`

### Endpoints
- `GET /api/public/surveys/:slug`
- `POST /api/public/surveys/:slug/responses`

Catatan availability:
- route public hanya melayani survey dengan `status = published`,
- draft tanpa publish tidak punya URL public yang usable,
- survey `closed` tetap punya slug, tetapi endpoint public harus menolak submission baru.

### Public response payload

Direkomendasikan payload seperti:

```json
{
  "answers": {
    "q1": "Ya",
    "q2": 4,
    "q3": ["Option A", "Option B"],
    "q4": {
      "fitur_a": 5,
      "fitur_b": 3
    }
  },
  "metadata": {
    "submittedFrom": "web"
  }
}
```

---

## 14. Wiring Plan in Existing Backend

## 14.1 Files to update

### `backend/src/api/server.ts`
Tambahkan:
- `surveyRoutes`
- `surveyPublicRoutes`
- `AppDeps` entries baru
- route registration baru

### `backend/src/start.ts`
Tambahkan:
- survey repositories
- survey services
- survey route deps
- survey analysis queue / enqueue function bila perlu

## 14.2 Suggested route registration

```ts
api.register(surveyRoutes(deps.surveyRoutes), { prefix: '/teams/:id/surveys' });
api.register(surveyPublicRoutes(deps.surveyPublicRoutes), { prefix: '/public/surveys' });
```

---

## 15. Submission Flow Plan

## 15.1 Public submit sequence

Saat participant submit response:

1. find survey by `public_slug`
2. verify `status = published`
3. verify not manually closed
4. verify quota not exceeded
5. load current question schema for current version
6. evaluate conditional visibility
7. validate visible required questions
8. validate answer types
9. sanitize hidden answers
10. normalize answers
11. insert `survey_response`
12. insert `survey_response_answer` rows
13. increment `response_count`
14. auto-close survey bila quota tercapai
15. commit transaction

## 15.2 Reliability requirement

Seluruh flow di atas harus dibungkus dalam **single DB transaction** untuk mencegah:
- lost response,
- double count quota,
- inconsistent close state.

---

## 16. Analytics Plan

## 16.1 Minimum analytics output

V1 analytics minimum harus mencakup:
- total responses,
- completed responses,
- completion rate,
- distributions per question,
- simple descriptive stats,
- basic filters.

## 16.2 Filter scope

Filter yang didukung phase awal:
- `dateFrom`
- `dateTo`
- `completionStatus`
- `answerFilters[]`

Contoh answer filter:
- response dengan `q1 = Ya`
- response dengan rating `q3 >= 4`
- response dengan checkbox tertentu selected

## 16.3 Aggregation strategy

Analytics sebaiknya dibangun dari `survey_response_answer`, bukan dari `answers_json` saja.

**Alasan:**
- query lebih sederhana,
- filter by answer lebih murah,
- distribution stats lebih reliable.

## 16.4 Per-question stats

### Multiple choice / dropdown
- count per option
- percentage per option

### Checkboxes
- count per selected option
- percentage per option

### Linear scale
- count
- average
- min
- max
- optional histogram sederhana

### Matrix
- per row × column counts
- optional row average bila scale ordinal

### Short / long text
- response count
- non-empty count
- optional sample list untuk internal review
- AI summary source

---

## 17. AI Analysis Plan

## 17.1 Scope V1 AI

AI di V1 hanya untuk **post-response analysis**, bukan adaptive questioning.

Minimum modes:
1. overall survey summary,
2. per-question open-ended analysis,
3. aggregate respondent insight.

## 17.2 Existing infra to reuse

Codebase sudah punya komponen yang bisa direuse:
- `TeamAiSettingsService`
- `AiBudgetTracker`
- `GeminiClient`
- `AiCallLogRepository`
- `DbAuditLog`
- `BullMQ worker`

Survey AI harus memakai pola yang sama agar tetap konsisten.

## 17.3 Worker plan

Buat worker khusus survey analysis, misalnya:
- `backend/src/survey/survey-analysis-worker.ts`

Atau bila ingin dikelompokkan di domain AI:
- `backend/src/ai/survey-analysis-worker.ts`

### Queue name
- `survey-analysis`

### Job payload

```ts
type SurveyAnalysisJobData = {
  teamId: string;
  surveyId: string;
  analysisId: string;
  trigger: 'manual' | 'refresh';
};
```

## 17.4 AI input context

Prompt input harus mencakup:
- survey title,
- description,
- `project_goal`,
- optional background context,
- question schema,
- summary analytics,
- sampled open-ended responses,
- explicit instruction bahwa hasil AI adalah assistant-level interpretation.

## 17.5 Guardrails

- AI tidak boleh mengubah raw response
- AI result harus tersimpan terpisah di `survey_analysis`
- AI analysis tetap tenant-scoped
- hasil harus bisa direview user
- cache analysis by survey/scope/filter bila memungkinkan

---

## 18. Export Plan

## 18.1 JSON export

JSON export minimal berisi:
- survey metadata,
- question schema,
- raw responses,
- normalized answers,
- export timestamp.

## 18.2 CSV export

CSV harus di-flatten agar usable.

Kolom minimum:
- `response_id`
- `submitted_at`
- `status`
- `q_{questionKey}`

Untuk multi-value:
- checkbox: gunakan delimiter stabil, mis. `|`
- matrix: flatten menjadi `q_{questionKey}__{rowKey}`

Contoh:
- `q_usage_frequency`
- `q_feature_rating__checkout`
- `q_feature_rating__search`

---

## 19. Auditability Plan

Survey lifecycle sebaiknya memanfaatkan audit infra existing.

Gunakan `audit_log` dengan `object_type` seperti:
- `survey`
- `survey_response`
- `survey_analysis`

Event minimum:
- survey created
- survey updated
- question schema replaced
- survey published
- survey unpublished
- survey closed
- export executed
- AI analysis triggered
- AI analysis completed / failed

---

## 20. File-by-File Change Plan

## 20.1 Shared package

### New
- `shared/src/survey.ts`

### Update
- `shared/src/auth.ts`
- `shared/src/index.ts`

## 20.2 Backend migrations

### New
- `backend/migrations/1700000018000_survey-module-schema.cjs`

## 20.3 Backend repositories

### New
- `backend/src/repository/survey-repository.ts`
- `backend/src/repository/survey-question-repository.ts`
- `backend/src/repository/survey-response-repository.ts`
- `backend/src/repository/survey-analysis-repository.ts`

## 20.4 Backend services

### New
- `backend/src/survey/survey-service.ts`
- `backend/src/survey/survey-public-service.ts`
- `backend/src/survey/survey-logic-service.ts`
- `backend/src/survey/survey-response-service.ts`
- `backend/src/survey/survey-analytics-service.ts`
- `backend/src/survey/survey-analysis-service.ts`
- `backend/src/survey/survey-export-service.ts`

## 20.5 API routes

### New
- `backend/src/api/routes/survey.routes.ts`
- `backend/src/api/routes/survey-public.routes.ts`

### Update
- `backend/src/api/server.ts`
- `backend/src/start.ts`

## 20.6 Worker integration

### New
- `backend/src/survey/survey-analysis-worker.ts`

### Update
- `backend/src/worker.ts`
- optional `backend/src/start.ts`

---

## 21. Milestone Plan

## Milestone 1 — Shared contracts and RBAC

Deliverables:
- `shared/src/survey.ts`
- survey action types
- RBAC updates

Done when:
- backend dan shared compile dengan survey actions/types baru.

## Milestone 2 — Database schema

Deliverables:
- survey migration
- tables + indexes + constraints

Done when:
- database punya core schema survey V1.

## Milestone 3 — Survey authoring core

Deliverables:
- repositories dasar
- `survey-service`
- internal CRUD routes
- question full-replace endpoint
- publish/unpublish/close

Done when:
- authenticated team member bisa create draft survey,
- first publish menghasilkan `public_slug`,
- publish ulang setelah unpublish tetap memakai `public_slug` yang sama.

## Milestone 4 — Public response runtime

Deliverables:
- public routes
- logic validator/evaluator
- response submission transaction
- quota handling
- auto-close

Done when:
- public participant bisa submit response ke survey published.

## Milestone 5 — Analytics baseline

Deliverables:
- analytics service
- summary endpoint
- question distribution endpoint/query
- basic filter support

Done when:
- internal user bisa melihat total responses, completion rate, dan distribusi jawaban.

## Milestone 6 — AI post-response analysis

Deliverables:
- analysis repository
- analysis service
- worker integration
- overall summary
- open-ended question analysis

Done when:
- user bisa trigger AI analysis dan melihat hasilnya.

## Milestone 7 — Export and audit hardening

Deliverables:
- CSV export
- JSON export
- audit integration lengkap
- validation tightening

Done when:
- data bisa diexport dan perubahan penting tercatat.

---

## 22. Recommended Sprint Breakdown

## Sprint 1 — Core survey engine

Target:
- shared survey types
- RBAC updates
- migration schema
- survey repository core
- internal survey CRUD
- question full replace
- publish/unpublish/close
- public fetch survey
- public submit response
- validation + quota enforcement

Expected outcome:
- survey bisa dibuat, dipublish, diakses publik, dan menerima response dengan aman.

## Sprint 2 — Analytics baseline

Target:
- response listing internal
- analytics summary
- question distributions
- completion metrics
- filter by date / completion status / selected answer

Expected outcome:
- internal team bisa membaca hasil survey secara kuantitatif.

## Sprint 3 — AI + export hardening

Target:
- survey analysis async worker
- overall AI summary
- open-ended per-question AI analysis
- aggregate respondent insight
- JSON export
- CSV export
- audit completion

Expected outcome:
- survey module punya insight layer dan operability baseline sesuai PRD V1.

---

## 23. Risks and Mitigations

### Risk 1 — Published survey berubah setelah response masuk

**Mitigation:**
- jadikan published survey immutable secara struktur pada V1.

### Risk 2 — Quota race condition saat public submit

**Mitigation:**
- gunakan single transaction + row lock pada `survey` saat insert response.

### Risk 3 — Analytics sulit di-query bila hanya raw JSON

**Mitigation:**
- simpan `answers_json` dan `survey_response_answer` sekaligus.

### Risk 4 — Logic FE dan BE tidak sinkron

**Mitigation:**
- definisikan satu canonical logic schema dan backend sebagai source of truth saat submit.

### Risk 5 — AI cost membengkak

**Mitigation:**
- jadikan analysis manual-trigger dulu,
- cache hasil analysis,
- kirim aggregate/sampled data ke AI, bukan seluruh dataset mentah bila tidak perlu.

---

## 24. Immediate Next Steps

Urutan implementasi yang direkomendasikan setelah dokumen ini disetujui:

1. tambah `shared/src/survey.ts`
2. tambah survey actions ke `shared/src/auth.ts`
3. update `backend/src/auth/rbac.ts`
4. buat migration survey schema
5. buat repository layer survey
6. buat `survey-logic-service.ts`
7. buat `survey-service.ts` dan `survey-public-service.ts`
8. expose internal + public routes
9. pastikan kontrak `public_slug` jelas: generated on first publish, retained on unpublish/close
10. tambah analytics service
11. tambah worker-backed AI analysis
12. tambah export endpoints

---

## 25. Success Criteria for Phase Awal

Phase awal dianggap berhasil bila:

1. internal user dapat membuat survey draft dengan `project_goal`
2. internal user dapat menyimpan ordered question schema
3. first publish menghasilkan public link yang stabil untuk survey tersebut
4. participant publik dapat mengisi survey tanpa login
5. response tersimpan aman dan quota bekerja konsisten
6. internal user dapat melihat total response, completion rate, dan distribusi jawaban
7. internal user dapat menjalankan AI summary berbasis `project_goal`
8. internal user dapat export data ke JSON dan CSV
9. unpublish/close tidak mengganti slug, hanya mengubah availability public

---

## 26. Summary

Implementation plan ini merekomendasikan pendekatan **backend-first, V1-manual-first, dan repo-consistent**.

Prinsip utamanya:
- jaga struktur tetap sederhana,
- prioritaskan reliability public submission,
- simpan data dalam format yang siap untuk analytics,
- reuse AI/audit/worker infrastructure yang sudah ada,
- siapkan model yang bisa tumbuh ke V2 tanpa rewrite total.

Dengan urutan implementasi yang disarankan, team bisa membangun survey engine V1 secara bertahap tetapi tetap usable sejak milestone awal.

---

