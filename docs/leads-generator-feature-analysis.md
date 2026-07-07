# Analisis Feature Leads Generator: Survey / Research Module

## 1. Context Feature

Repo ini utama adalah **Leads Generation Dashboard**: SaaS multi-team buat scanning lead dari API resmi, normalisasi data, dedup, scoring deterministik, dan workflow privasi. Di dalam produk yang sama, sudah ada modul **survey research** yang posisinya bukan core lead ops, tapi sub-feature buat **quantitative UX research**.

Arah feature ini jelas:
- team internal bisa bikin survey,
- publish public link,
- collect response,
- lihat analytics kuantitatif,
- lalu trigger AI-assisted analysis kalau perlu.

Jadi context-nya bukan sekadar “form builder”, tapi **research workflow inside dashboard**. Produk diarahkan ke **quantitative-first research tool** dengan **limited qualitative context**. Ini penting karena seluruh struktur data, UI, dan flow existing dibangun buat data terukur, bukan qual platform penuh.

### Problem yang diselesaikan
- Workflow research pecah di tool eksternal.
- Pembuatan, distribusi, pengumpulan, dan analisis pindah-pindah platform.
- Insight manual lambat dan mudah lepas.
- Survey research belum hidup di dashboard yang sama dengan operasi tim lain.

### Target user
**Internal authenticated:**
- Admin
- Member
- Viewer

**External unauthenticated:**
- Participant yang akses public link

---

## 2. Existing Feature

Feature survey sudah ada dan lumayan matang. Bentuknya:

### Frontend screens
1. **Survey list**
   - `frontend/src/app/dashboard/surveys/page.tsx`
   - buat list survey per team
   - ada create, publish, unpublish, close

2. **Survey detail**
   - `frontend/src/app/dashboard/surveys/[surveyId]/page.tsx`
   - jadi control center
   - tab existing:
     - Overview
     - Questions
     - Responses
     - Analytics
     - AI Analysis

3. **Public survey page**
   - `frontend/src/app/surveys/[slug]/page.tsx`
   - participant isi survey via public link

### Backend surface
- `backend/src/api/routes/survey.routes.ts`
- `backend/src/api/routes/survey-public.routes.ts`
- core service di:
  - `backend/src/survey/survey-service.ts`
  - `backend/src/survey/survey-public-service.ts`
  - `backend/src/survey/survey-logic-service.ts`
  - `backend/src/survey/survey-analytics-service.ts`
  - `backend/src/survey/survey-analysis-service.ts`
  - `backend/src/survey/survey-export-service.ts`

### Behavior existing
- Survey start as `draft`.
- Draft bisa diedit.
- Publish butuh minimal 1 question.
- First publish generate `public_slug`.
- Unpublish bikin public access mati, slug tetap ada.
- Close bikin survey berhenti total.
- Public submit cuma masuk kalau survey `published` dan belum quota penuh.
- Quota penuh auto-close.
- Questions punya conditional logic sederhana.
- Responses bisa diekspor JSON/CSV.
- AI analysis manual trigger, async, dan disimpan sebagai record.

### UI flow existing
- List survey
- Create survey
- Edit overview metadata
- Edit questions
- Publish
- Share public link
- Collect response
- View analytics
- Trigger AI analysis
- Export data
- Close survey

---

## 3. User Flow

### A. Internal creator flow
1. User buka dashboard survey list.
2. User create survey baru.
3. User isi metadata awal:
   - title
   - description
   - project goal / research objective
   - background context
   - target participant
   - primary decision
   - response quota
4. User masuk tab Questions.
5. User tambah / edit / reorder pertanyaan.
6. User set tipe pertanyaan dan config.
7. User bisa set required dan conditional logic.
8. User publish survey.
9. System generate public link.
10. User share link ke participant.
11. Response masuk dan tercatat.
12. User lihat Responses, Analytics, dan AI Analysis.
13. User export hasil kalau perlu.
14. User bisa unpublish atau close survey.

### B. Public participant flow
1. Participant buka `surveys/[slug]`.
2. System load survey published.
3. Participant isi pertanyaan yang visible.
4. Conditional logic dipakai buat hide/show question.
5. Participant submit response.
6. System simpan response + answer normalized.
7. Kalau quota penuh, survey auto-close.
8. User lihat success state atau state gagal kalau survey closed / invalid / quota penuh.

### C. Lifecycle survey
- `draft` → editing penuh
- `published` → public access aktif
- `closed` → final, no submit
- `unpublish` → public off, data tetap ada
- `close` → final lock

---

## 4. ERD / Data Model

### Entity list
1. `survey`
2. `survey_question`
3. `survey_response`
4. `survey_response_answer`
5. `survey_analysis`
6. referensi ke `team`
7. referensi ke `app_user`

### ERD text
```text
team 1 ────< survey 1 ────< survey_question
                 │
                 ├────< survey_response ────< survey_response_answer
                 │
                 └────< survey_analysis

survey_question ────< survey_response_answer
survey_question ────< survey_analysis   (kalau scope = question)
app_user ────< survey.created_by / updated_by
app_user ────< survey_analysis.created_by
```

### Tabel `survey`
Root aggregate feature.

Field penting:
- `id`
- `team_id`
- `title`
- `description`
- `project_goal`
- `background_context`
- `target_participant`
- `primary_decision`
- `status` = `draft | published | closed`
- `public_slug`
- `response_quota`
- `response_count`
- `current_version`
- `published_at`
- `closed_at`
- `created_by`
- `updated_by`

Constraint penting:
- `title` wajib non-empty
- `project_goal` wajib non-empty
- `response_quota >= 1`
- `response_count >= 0`
- `current_version >= 1`
- `public_slug` unique

### Tabel `survey_question`
Simpan definisi pertanyaan per survey version.

Field penting:
- `survey_id`
- `team_id`
- `version`
- `question_key`
- `type`
- `title`
- `description`
- `required`
- `display_order`
- `config`
- `logic_rules`

Constraint penting:
- `version >= 1`
- `question_key` non-empty
- `title` non-empty
- `display_order >= 0`
- unique `(survey_id, version, question_key)`

Question type existing:
- `short_text`
- `long_text`
- `multiple_choice`
- `checkboxes`
- `dropdown`
- `linear_scale`
- `matrix`

### Tabel `survey_response`
Satu submission dari participant.

Field penting:
- `survey_id`
- `team_id`
- `survey_version`
- `status` = `in_progress | completed | abandoned`
- `answers_json`
- `metadata`
- `analysis_state` = `none | pending | success | failed`
- `started_at`
- `submitted_at`

Catatan:
- flow public submit sekarang pakai `completed`
- `in_progress` dan `abandoned` masih disiapkan di schema, belum dipakai penuh di path public submission

### Tabel `survey_response_answer`
Normalisasi jawaban per question.

Field penting:
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

Fungsi:
- bikin analytics/export lebih gampang
- simpan satu jawaban per baris
- tetap jaga `answers_json` buat payload fleksibel

### Tabel `survey_analysis`
Simpan job analysis AI / insight.

Field penting:
- `survey_id`
- `team_id`
- `scope` = `overall | question | segment`
- `question_id`
- `filter_hash`
- `status` = `pending | success | failed`
- `input_snapshot`
- `result_json`
- `model`
- `error_message`
- `created_by`

Catatan:
- `scope = question` butuh `question_id`
- analysis ini async / queued

---

## 5. What Already Looks Good

- Flow utama sudah end-to-end.
- Data model sudah cukup rapi buat versioned survey.
- Ada pemisahan antara raw payload dan normalized answer.
- Analytics, export, dan AI analysis sudah dipisah service masing-masing.
- Public submission route sudah dipisah dari internal routes.
- Access control team-based sudah ada.
- UI detail page sudah jadi pusat operasi survey.

---

## 6. Gap / Future Note

Ini bukan bug list, cuma pembacaan konteks.

### Yang terlihat sudah disiapkan, tapi belum fully exploited
- Versioning survey ada, tapi alur replace question masih terasa overwrite-centric.
- `in_progress` / `abandoned` response status ada di schema, tapi belum dipakai penuh.
- `survey_response_answer` sudah ada, tapi analytics utama masih banyak baca `answers_json`.
- AI analysis masih post-response manual, belum adaptive / real-time.

### Arah feature berikutnya
- AI-assisted survey creation
- adaptive branching yang lebih kaya
- version history yang benar-benar dipakai
- segment analytics yang lebih dalam
- better qual context without losing quantitative core

---

## 7. Ringkasan

Feature ini adalah **survey research module** yang hidup di dalam Leads Generation Dashboard. Fungsinya buat bantu team bikin survey quantitative, distribusi via public link, collect response, analisis hasil, dan export data tanpa pindah tool.

Arsitektur existing sudah matang cukup buat V1. Kalau mau lanjut ke V2, arah paling natural adalah AI-assisted mode, better versioning, dan analytics/branching yang lebih advanced.
