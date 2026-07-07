# Frontend Integration Plan: Quantitative Research Survey Module

## 1. Purpose

Dokumen ini mem-breakdown rencana integrasi frontend untuk `Quantitative Research Survey Module` V1 di aplikasi Next.js yang sudah ada.

Fokus dokumen ini:
- menyambungkan backend survey module yang sudah tersedia,
- mengikuti pola frontend existing,
- menjaga konsistensi komponen dan styling,
- memetakan route, state, query, mutation, dan screen behavior secara operasional.

Dokumen ini **tidak** mendesain ulang backend. Dokumen ini mengasumsikan backend contract yang sudah aktif sekarang, termasuk lifecycle `public_slug` yang baru tersedia saat first publish.

---

## 2. Implementation Principles

### 2.1 Ikuti pola existing app

Frontend saat ini memakai pola berikut:
- Next.js App Router di `frontend/src/app`
- client components untuk page yang memakai query/form/mutation
- `@tanstack/react-query` untuk server state
- `fetchApi()` dari `frontend/src/lib/api.ts` untuk API calls
- `useSession()` dari `frontend/src/lib/useSession.ts` untuk team/session context
- toast/feedback mengikuti pola existing app

Implementasi survey module harus memakai pola yang sama agar:
- mudah dipelihara,
- konsisten secara DX,
- tidak memperkenalkan stack frontend baru tanpa kebutuhan kuat.

### 2.2 Pakai komponen existing dulu

Komponen yang sudah tersedia dan direkomendasikan untuk dipakai:
- `Button`
- `Input`
- `Textarea`
- `Select`
- `Switch`
- `Modal`
- `Tabs`
- `Badge`
- `Table`
- `Card`
- `Pagination`
- `Skeleton`
- `DropdownMenu`

Jangan menambah dependency UI baru pada slice awal kecuali benar-benar diperlukan.

### 2.3 Backend contract adalah source of truth

Frontend harus align ke backend behavior yang sudah diverifikasi:
- create survey menghasilkan draft survey,
- `public_slug` belum ada saat create draft,
- `public_slug` dibuat saat first publish,
- `unpublish` dan `close` tidak mengganti slug lama,
- public route hanya usable saat survey `published`.

---

## 3. Current Backend Contract Summary

### 3.1 Internal endpoints

Tersedia endpoint berikut:
- `POST /api/teams/:id/surveys`
- `GET /api/teams/:id/surveys`
- `GET /api/teams/:id/surveys/:surveyId`
- `PATCH /api/teams/:id/surveys/:surveyId`
- `PUT /api/teams/:id/surveys/:surveyId/questions`
- `POST /api/teams/:id/surveys/:surveyId/publish`
- `POST /api/teams/:id/surveys/:surveyId/unpublish`
- `POST /api/teams/:id/surveys/:surveyId/close`
- `GET /api/teams/:id/surveys/:surveyId/responses`
- `GET /api/teams/:id/surveys/:surveyId/analytics`
- `POST /api/teams/:id/surveys/:surveyId/analysis`
- `GET /api/teams/:id/surveys/:surveyId/analysis`
- `GET /api/teams/:id/surveys/:surveyId/analysis/:analysisId`
- `GET /api/teams/:id/surveys/:surveyId/export/json`
- `GET /api/teams/:id/surveys/:surveyId/export/csv`

### 3.2 Public endpoints

- `GET /api/public/surveys/:slug`
- `POST /api/public/surveys/:slug/responses`

### 3.3 Public link lifecycle

Frontend harus memperlakukan public link dengan aturan berikut:
- draft baru **tidak otomatis** punya public URL,
- publish pertama kali membuat `public_slug`,
- unpublish mengembalikan survey ke draft tetapi slug tetap ada,
- publish ulang memakai slug yang sama,
- close mempertahankan slug tetapi menolak submission baru.

Implikasinya:
- FE tidak boleh mengasumsikan survey baru langsung shareable,
- FE perlu state khusus untuk `publicSlug` yang belum ada,
- FE perlu membedakan `slug exists` vs `publicly available now`.

---

## 4. Recommended Route Structure

### 4.1 Internal dashboard routes

```text
frontend/src/app/dashboard/surveys/page.tsx
frontend/src/app/dashboard/surveys/[surveyId]/page.tsx
frontend/src/app/dashboard/surveys/[surveyId]/responses/page.tsx
frontend/src/app/dashboard/surveys/[surveyId]/analytics/page.tsx
frontend/src/app/dashboard/surveys/[surveyId]/analysis/page.tsx
```

### 4.2 Public route

```text
frontend/src/app/surveys/[slug]/page.tsx
```

### 4.3 Initial implementation recommendation

Untuk iterasi awal, tidak perlu langsung memecah semua subpage detail. Lebih aman mulai dengan:

```text
frontend/src/app/dashboard/surveys/page.tsx
frontend/src/app/dashboard/surveys/[surveyId]/page.tsx
```

Lalu di `detail page` gunakan `Tabs` untuk shell:
- `Overview`
- `Questions`
- `Responses`
- `Analytics`
- `AI Analysis`

Setelah flow stabil, tab tertentu bisa dipisahkan menjadi nested routes.

---

## 5. Recommended Frontend File Structure

### 5.1 App routes

```text
frontend/src/app/dashboard/surveys/page.tsx
frontend/src/app/dashboard/surveys/[surveyId]/page.tsx
frontend/src/app/surveys/[slug]/page.tsx
```

### 5.2 Feature components

Direkomendasikan membuat folder baru:

```text
frontend/src/components/surveys/
```

Komponen awal yang direkomendasikan:
- `SurveyListTable.tsx`
- `SurveyStatusBadge.tsx`
- `CreateSurveyModal.tsx`
- `SurveyDetailHeader.tsx`
- `SurveyMetaForm.tsx`
- `QuestionListEditor.tsx`
- `QuestionEditorCard.tsx`
- `PublishSurveyActions.tsx`
- `SurveyResponsesTable.tsx`
- `SurveyAnalyticsOverview.tsx`
- `SurveyAnalysisPanel.tsx`
- `PublicSurveyRenderer.tsx`
- `PublicSurveyQuestionField.tsx`

### 5.3 Shared frontend survey module helpers

```text
frontend/src/lib/surveys/types.ts
frontend/src/lib/surveys/api.ts
frontend/src/lib/surveys/queryKeys.ts
frontend/src/lib/surveys/utils.ts
```

Tujuannya:
- menghindari page component menjadi terlalu besar,
- memisahkan contract API dari presentational layer,
- membuat query key dan response mapping konsisten.

---

## 6. Frontend Data Contract Plan

### 6.1 Frontend types yang direkomendasikan

Di `frontend/src/lib/surveys/types.ts`, definisikan minimal:
- `SurveyStatus`
- `SurveyListItem`
- `SurveyDetail`
- `SurveyQuestion`
- `SurveyQuestionType`
- `SurveyLogicCondition`
- `SurveyLogicGroup`
- `SurveyResponseListItem`
- `SurveyAnalyticsSummary`
- `SurveyAnalysisRecord`
- `PublicSurveyDetail`
- `PublicSurveySubmissionPayload`

### 6.2 Shape practical yang dibutuhkan FE

Untuk V1, FE bisa memakai bentuk sederhana seperti:

```ts
export type SurveyStatus = 'draft' | 'published' | 'closed'

export interface SurveyListItem {
  id: string
  title: string
  description?: string
  projectGoal: string
  status: SurveyStatus
  publicSlug?: string
  responseQuota?: number
  responseCount: number
  publishedAt?: string
  closedAt?: string
  updatedAt: string
}
```

### 6.3 Public URL helper

Karena backend hanya mengembalikan `publicSlug`, FE sebaiknya punya helper:

```ts
export function buildSurveyPublicUrl(slug: string): string {
  return `/surveys/${slug}`
}
```

Untuk URL absolut shareable, FE bisa derive dari `window.location.origin` pada client-side action copy/open.

---

## 7. React Query Plan

### 7.1 Query keys

Gunakan query key yang konsisten:

```ts
['surveys', teamId]
['surveys', teamId, 'list']
['surveys', teamId, surveyId]
['surveys', teamId, surveyId, 'responses']
['surveys', teamId, surveyId, 'analytics']
['surveys', teamId, surveyId, 'analysis']
['public-survey', slug]
```

Kalau nanti ada filter/pagination, tambahkan object filter sebagai elemen terakhir.

### 7.2 Query list awal

- survey list query
- survey detail query
- public survey query

### 7.3 Mutation list awal

- create survey
- update survey
- replace questions
- publish survey
- unpublish survey
- close survey
- trigger analysis
- submit public response
- export json
- export csv

### 7.4 Invalidation strategy

- create/update/delete lifecycle → invalidate `['surveys', teamId]`
- detail mutation → invalidate detail survey + list
- question replace → invalidate detail survey
- publish/unpublish/close → invalidate list + detail
- public submit → invalidate internal responses/analytics setelah kembali ke dashboard atau manual refresh
- trigger analysis → invalidate analysis list

---

## 8. Screen-by-Screen Plan

## 8.1 Survey List Page

### Route
`frontend/src/app/dashboard/surveys/page.tsx`

### Purpose
Menjadi entry point untuk internal user melihat semua survey dan membuat research baru.

### Backend reads
- `GET /api/teams/:id/surveys`

### Backend actions
- `POST /api/teams/:id/surveys`
- optional quick lifecycle actions dari row:
  - publish
  - unpublish
  - close

### UI composition
Gunakan:
- page header section
- `Button` untuk create CTA
- `Card` atau section wrapper
- `Table` untuk list
- `Badge` untuk status
- `DropdownMenu` untuk row actions
- `Modal` untuk create survey
- `Skeleton` untuk loading

### Table columns
- title
- status
- responses
- public link state
- updated at
- actions

### Public link state di row
- `Draft` tanpa slug → tampilkan `No public link yet`
- `Published` dengan slug → tampilkan `Live`
- `Draft` dengan slug akibat unpublish → tampilkan `Unpublished`
- `Closed` dengan slug → tampilkan `Closed`

### Create modal fields
Required:
- `title`
- `projectGoal`

Optional:
- `description`
- `backgroundContext`
- `targetParticipant`
- `primaryDecision`
- `responseQuota`

### UX note
`projectGoal` harus ditonjolkan sebagai field penting, bukan secondary metadata.

### Success behavior
Setelah create success:
- tutup modal
- invalidate survey list
- navigate ke `dashboard/surveys/[surveyId]`
- jangan tampilkan copy public link dulu bila slug belum ada

---

## 8.2 Survey Detail Page

### Route
`frontend/src/app/dashboard/surveys/[surveyId]/page.tsx`

### Purpose
Menjadi shell authoring dan control center untuk satu survey.

### Backend reads
- `GET /api/teams/:id/surveys/:surveyId`

### Backend actions
- `PATCH /api/teams/:id/surveys/:surveyId`
- `PUT /api/teams/:id/surveys/:surveyId/questions`
- `POST /api/teams/:id/surveys/:surveyId/publish`
- `POST /api/teams/:id/surveys/:surveyId/unpublish`
- `POST /api/teams/:id/surveys/:surveyId/close`

### Top-level layout
Gunakan:
- `SurveyDetailHeader`
- `Tabs`
- tab content di bawah header

### Tabs awal
- `Overview`
- `Questions`
- `Responses`
- `Analytics`
- `AI Analysis`

---

## 8.3 Survey Detail Header

### Purpose
Menampilkan identity survey, status, dan public link lifecycle secara jelas.

### Komponen
- `Card`
- `Badge`
- `Button`
- maybe small link actions section

### State yang wajib didukung

#### A. Draft tanpa slug
Tampilkan:
- title
- status `Draft`
- helper text: `Publish survey to generate a public link`
- no copy/open public link action

#### B. Published dengan slug
Tampilkan:
- title
- status `Published`
- full public URL
- `Copy link`
- `Open survey`
- `Unpublish`
- `Close`

#### C. Draft dengan slug
Ini terjadi setelah unpublish.

Tampilkan:
- title
- status `Draft`
- info `Currently unpublished`
- tampilkan existing URL sebagai reserved identity
- copy action boleh ada
- open public route boleh ada, tapi user harus paham route sedang tidak live

#### D. Closed dengan slug
Tampilkan:
- title
- status `Closed`
- existing public URL
- info `Responses are closed`
- open/copy masih boleh

### Important UX rule
Status availability dan existence link adalah dua hal berbeda:
- survey bisa punya slug,
- tapi belum tentu public route sedang menerima submission.

---

## 8.4 Overview Tab

### Purpose
Mengelola metadata survey-level.

### UI
- `Card`
- `Input`
- `Textarea`
- `Button`

### Fields
- title
- description
- project goal
- background context
- target participant
- primary decision
- response quota

### Save pattern
Untuk V1, gunakan explicit save button dulu.
Jangan autosave dulu agar lebih sederhana dan mudah diaudit.

### Backend behavior note
Metadata update hanya boleh saat status masih `draft`, jadi FE perlu disable form bila survey bukan `draft`.

---

## 8.5 Questions Tab

### Purpose
Membangun dan mengelola ordered survey schema.

### UI composition
- `Card`
- list of `QuestionEditorCard`
- `Button` untuk add question
- `Select` untuk type
- `Input` untuk title
- `Textarea` untuk description
- `Switch` untuk required

### Supported question types
- short text
- long text
- multiple choice
- checkboxes
- dropdown
- linear scale
- matrix

### Scope V1 builder
Cukup support:
- add question
- remove question
- move up / move down
- edit title/description
- required flag
- type-specific config
- simple logic rules

### Reorder interaction
Untuk V1, lebih aman pakai:
- `Move up`
- `Move down`

Bukan drag-and-drop dulu.

### Save strategy
Karena backend memakai `PUT /questions` full-replace, FE builder sebaiknya:
- maintain local draft question array,
- convert ke full payload,
- save seluruh schema sekaligus.

### Draft restriction
Jika survey bukan `draft`, builder harus readonly.

---

## 8.6 Conditional Logic UI Plan

### Scope V1
Karena backend hanya menargetkan simple rule-based branching, FE tidak perlu visual tree builder.

### Minimal rule editor
Per question:
- `Switch`: enable conditional logic
- `Select`: source question
- `Select`: operator
- `Input`/`Select`: expected value
- `Select`: match mode (`all` / `any`) bila rule group lebih dari satu

### Operators yang practical untuk V1
- `eq`
- `neq`
- `includes`
- `gt`
- `gte`
- `lt`
- `lte`
- `between`

### Non-goal
- nested logic tree
- visual branch graph
- multi-step logic debugging UI

---

## 8.7 Responses Tab or Page

### Route
Awal bisa ditaruh di tab detail page.

Kalau nantinya dipisah:
`frontend/src/app/dashboard/surveys/[surveyId]/responses/page.tsx`

### Backend reads
- `GET /api/teams/:id/surveys/:surveyId/responses`

### UI
- `Table`
- `Badge` untuk completion state
- `Card`
- optional row detail modal

### Columns minimal
- response id
- status
- submitted at
- analysis state
- actions

### Future enhancement
- response detail drawer/modal
- date filter
- answer-based filter

Untuk phase awal, raw list dulu sudah cukup.

---

## 8.8 Analytics Tab or Page

### Backend reads
- `GET /api/teams/:id/surveys/:surveyId/analytics`

### Purpose
Menampilkan output analytics baseline tanpa dependency chart library baru.

### UI
- summary KPI cards
- per-question summary cards
- simple distribution bars via plain div
- fallback table layout untuk angka

### KPI cards
- total responses
- completed responses
- completion rate
- latest submitted at

### Per-question rendering
- choice/dropdown → distribution list
- checkboxes → frequency list
- linear scale → average/min/max + bucket summary
- matrix → grouped row summary
- text → count answered + optional note bahwa insight detail ada di AI Analysis

### Recommendation
Jangan introduce chart library baru dulu. Untuk V1 awal, visual sederhana dari existing primitives cukup.

---

## 8.9 AI Analysis Tab or Page

### Backend reads
- `GET /api/teams/:id/surveys/:surveyId/analysis`

### Backend actions
- `POST /api/teams/:id/surveys/:surveyId/analysis`

### Purpose
Menampilkan AI-generated post-response insight untuk V1.

### Important product clarification
AI di V1 **ada**, tapi sifatnya:
- post-response analysis,
- bukan adaptive question generation,
- bukan real-time branching AI.

### UI sections
- analysis status card
- trigger/re-run action
- overall survey summary
- per-question analysis blocks
- respondent insight section

### State handling
Karena backend analysis async, FE harus mendukung:
- no analysis yet
- pending
- success
- failed

### Messaging
Karena AI adalah assistant, FE sebaiknya menampilkan copy seperti:
- `AI-generated summary. Review before using as final conclusion.`

---

## 8.10 Export Actions

### Backend actions
- `GET /api/teams/:id/surveys/:surveyId/export/json`
- `GET /api/teams/:id/surveys/:surveyId/export/csv`

### Placement
Bisa di:
- `SurveyDetailHeader`
- atau row action di survey list jika status memungkinkan

### Interaction
Karena endpoint download file, FE butuh helper download, bukan `fetchApi<T>` biasa.

Direkomendasikan helper khusus:
- `downloadSurveyExport(teamId, surveyId, format)`

Flow:
1. panggil endpoint dengan credentials,
2. ambil blob,
3. parse filename dari `content-disposition` jika ada,
4. trigger browser download.

---

## 8.11 Public Survey Page

### Route
`frontend/src/app/surveys/[slug]/page.tsx`

### Backend reads
- `GET /api/public/surveys/:slug`

### Backend actions
- `POST /api/public/surveys/:slug/responses`

### Purpose
Menjadi public-facing survey runtime untuk participant tanpa login.

### Layout recommendation
- centered container
- intro `Card`
- form card/body
- submit section at bottom

### Render states
Public page wajib menangani:
- loading
- not found / unavailable
- closed
- quota reached saat submit
- submit success
- submit failure

### Form rendering
Gunakan existing components sebisa mungkin:
- short text → `Input`
- long text → `Textarea`
- dropdown → `Select`
- multiple choice / checkboxes → controlled native inputs dengan styling existing
- linear scale → row of buttons/radio
- matrix → simple table/grid layout

### Conditional logic handling
FE public renderer harus menghitung question visibility dari current answers.
Tetapi backend tetap source of truth saat submit.

### Important constraint
Public preview sebelum publish **tidak** tersedia via public route.
Kalau butuh preview draft, itu harus dianggap fitur internal terpisah, bukan reuse route public.

---

## 9. API Helper Plan

### 9.1 `frontend/src/lib/surveys/api.ts`

Helper yang direkomendasikan:
- `listSurveys(teamId)`
- `createSurvey(teamId, input)`
- `getSurvey(teamId, surveyId)`
- `updateSurvey(teamId, surveyId, input)`
- `replaceSurveyQuestions(teamId, surveyId, input)`
- `publishSurvey(teamId, surveyId)`
- `unpublishSurvey(teamId, surveyId)`
- `closeSurvey(teamId, surveyId)`
- `listSurveyResponses(teamId, surveyId)`
- `getSurveyAnalytics(teamId, surveyId)`
- `listSurveyAnalyses(teamId, surveyId)`
- `triggerSurveyAnalysis(teamId, surveyId, input)`
- `getPublicSurvey(slug)`
- `submitPublicSurveyResponse(slug, payload)`
- `downloadSurveyExport(teamId, surveyId, format)`

### 9.2 Why helpers matter

Jangan panggil endpoint raw di banyak page/component. API helper akan:
- menjaga path consistency,
- mempermudah refactor,
- memisahkan UI concern dari contract concern.

---

## 10. Query Key Helper Plan

### 10.1 `frontend/src/lib/surveys/queryKeys.ts`

Contoh bentuk:

```ts
export const surveyKeys = {
  all: (teamId: string) => ['surveys', teamId] as const,
  list: (teamId: string) => ['surveys', teamId, 'list'] as const,
  detail: (teamId: string, surveyId: string) => ['surveys', teamId, surveyId] as const,
  responses: (teamId: string, surveyId: string) => ['surveys', teamId, surveyId, 'responses'] as const,
  analytics: (teamId: string, surveyId: string) => ['surveys', teamId, surveyId, 'analytics'] as const,
  analysis: (teamId: string, surveyId: string) => ['surveys', teamId, surveyId, 'analysis'] as const,
  public: (slug: string) => ['public-survey', slug] as const,
}
```

Ini akan menjaga invalidation tetap konsisten.

---

## 11. UX States That Must Be Explicit

### 11.1 Status survey
FE harus secara konsisten memetakan:
- `draft`
- `published`
- `closed`

### 11.2 Public link existence
State ini terpisah dari status:
- `no slug`
- `has slug but unavailable`
- `has slug and live`

### 11.3 AI analysis state
- `none`
- `pending`
- `success`
- `failed`

### 11.4 Async page state
Semua screen utama harus punya handling eksplisit untuk:
- loading
- empty state
- error state
- success state

---

## 12. Suggested Implementation Order

## Phase FE-1 — foundation + survey list

Deliverables:
- `frontend/src/lib/surveys/types.ts`
- `frontend/src/lib/surveys/api.ts`
- `frontend/src/lib/surveys/queryKeys.ts`
- `frontend/src/components/surveys/SurveyStatusBadge.tsx`
- `frontend/src/components/surveys/CreateSurveyModal.tsx`
- `frontend/src/components/surveys/SurveyListTable.tsx`
- `frontend/src/app/dashboard/surveys/page.tsx`

Outcome:
- internal user bisa melihat semua survey,
- internal user bisa membuat survey draft,
- internal user bisa masuk ke detail page.

## Phase FE-2 — detail shell + metadata management

Deliverables:
- `SurveyDetailHeader`
- `SurveyMetaForm`
- `dashboard/surveys/[surveyId]/page.tsx`
- publish/unpublish/close actions
- public link lifecycle UI

Outcome:
- internal user bisa mengelola metadata survey dan lifecycle status.

## Phase FE-3 — question builder basic

Deliverables:
- `QuestionListEditor`
- `QuestionEditorCard`
- question full-replace save
- move up / move down reorder
- simple conditional logic editor

Outcome:
- internal user bisa menyusun survey schema V1 secara end-to-end.

## Phase FE-4 — responses + analytics + exports

Deliverables:
- responses table
- analytics summary panel
- export JSON/CSV helper + actions

Outcome:
- survey hasil publish bisa ditinjau secara kuantitatif dari dashboard.

## Phase FE-5 — AI analysis + public runtime

Deliverables:
- AI analysis panel
- public survey page
- public submission flow
- public success/error/closed states

Outcome:
- frontend V1 lengkap untuk authoring, collecting, and reviewing.

---

## 13. Risks and Guardrails

### Risk 1 — Page components jadi terlalu besar
Mitigasi:
- pecah logic ke `components/surveys` dan `lib/surveys`
- hindari menaruh semua logic dalam satu `page.tsx`

### Risk 2 — FE salah asumsi soal public link
Mitigasi:
- treat `publicSlug` as optional
- always derive behavior dari `status + publicSlug`

### Risk 3 — Builder terlalu kompleks untuk V1
Mitigasi:
- gunakan full-replace payload
- reorder via move buttons
- logic builder minimal

### Risk 4 — Analytics mendorong dependency chart terlalu cepat
Mitigasi:
- gunakan KPI cards + simple bars/tables dulu
- evaluasi chart library hanya bila benar-benar diperlukan

### Risk 5 — Public form validation drift
Mitigasi:
- FE validate untuk UX,
- backend tetap final source of truth,
- tampilkan pesan error submit yang actionable.

---

## 14. Definition of Done

FE integration awal dianggap berhasil bila:
1. dashboard survey list tersedia,
2. create survey draft berjalan,
3. detail page menampilkan lifecycle status dengan benar,
4. FE tidak mengasumsikan public URL ada sebelum publish,
5. first publish menghasilkan state UI yang bisa share link,
6. builder dapat menyimpan ordered question schema,
7. responses dan analytics bisa ditampilkan,
8. AI analysis V1 bisa ditrigger dan dilihat hasilnya,
9. public survey published bisa diisi tanpa login.

---

## 15. Recommended Next Action

Langkah implementasi paling aman setelah dokumen ini:
1. buat foundation di `frontend/src/lib/surveys/*`
2. implement `dashboard/surveys/page.tsx`
3. implement `SurveyListTable`, `CreateSurveyModal`, `SurveyStatusBadge`
4. lanjut ke `dashboard/surveys/[surveyId]/page.tsx`
5. baru setelah itu masuk builder dan public runtime

Dengan urutan ini, integrasi frontend bisa tumbuh bertahap, tetap konsisten dengan backend, dan tidak overbuild di awal.
