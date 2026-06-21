# Design: Survey UX Improvements (Sidebar, Question Card, Drag-Reorder, Per-Card Save)

**Date:** 2026-06-21
**Product:** Leads Generation Dashboard — Survey Module
**Status:** Approved (mockups reviewed)
**Owner:** Dashboard Team
**Scope:** Frontend only. No backend contract changes.

---

## 1. Overview

Tiga UX improvements untuk survey module, berdasarkan feedback user setelah initial release:

1. **Sidebar** — menu "Surveys" belum muncul di sidebar navigation (user harus tahu URL langsung).
2. **Question Card Layout** — form pertanyaan masih flat (semua field visible), overwhelming untuk survey panjang. Hierarki information-nya lemah.
3. **Save flow** — tombol Save global di header list, jauh dari card yang diedit. User tidak yakin perubahan mana yang sudah tersimpan.

Design ini menjawab ketiganya secara koheren, dengan satu prinsip utama: **"Apa yang user edit, itu yang user kontrol"** — visible feedback, in-context actions, dan progressive disclosure.

Mockup brainstorming: `.superpowers/brainstorm/15011-1782014442/content/`

---

## 2. Goals & Non-Goals

### Goals

1. **Discoverability** — menu "Surveys" muncul di sidebar dengan section label yang jelas (Research).
2. **Scannability** — question card bisa di-scan summary-nya tanpa harus expand semua field.
3. **Reorder** — user bisa reorder question dengan drag-and-drop (sambil tetap ada fallback keyboard).
4. **Save clarity** — setiap card punya eksplisit Save button + status indicator di dalam card-nya sendiri.
5. **No regressions** — existing flow (create survey, publish, public link) tetap berfungsi identik.

### Non-Goals (V1)

1. **Real-time collaborative editing** — single-editor per session.
2. **Auto-save / optimistic updates** — explicit per-card Save dulu, auto-save bisa V2.
3. **New question types** — tidak menambah tipe pertanyaan baru.
4. **Backend changes** — tidak menambah endpoint baru. PUT replace-all masih dipakai; client-side diff detection.
5. **Visual redesign keseluruhan** — hanya restruktur layout card, bukan ganti color/font/icon.

---

## 3. User Stories

| ID | As a | I want to | So that |
|----|------|-----------|---------|
| US-1 | Editor | see "Surveys" in the sidebar | I can navigate to it without remembering the URL |
| US-2 | Editor | collapse sections of a question card | I can focus on what I'm editing in long surveys |
| US-3 | Editor | drag a question to reorder it | Reordering feels natural and fast |
| US-4 | Editor | press ↑ / ↓ buttons to reorder | I can use keyboard and screen readers |
| US-5 | Editor | see "Unsaved" badge on a question I just edited | I know which changes are pending |
| US-6 | Editor | click "Save question" inside the card | The action is close to what I changed |
| US-7 | Editor | see "Last saved X min ago" timestamp | I have confidence the change persisted |
| US-8 | Editor | click "Discard" to revert unsaved changes | I can experiment without fear |

---

## 4. Design Decisions

### 4.1 Sidebar — New "Research" Section (Approved)

Section baru **Research** disisipkan di antara **Lead** dan **Content & AI**, dengan satu item: **Surveys**.

Alasan:
- Survey adalah domain berbeda (research/feedback), bukan sub-bagian content.
- Memudahkan scale ke item research lain nanti (interviews, polls, A/B tests).
- Visual hierarchy jelas, tidak tertukar dengan content generation.

Implementasi:
- File: `frontend/src/components/layout/DashboardLayout.tsx`
- Tambah entry ke array `navSections`:
  ```ts
  {
    label: 'Research',
    items: [
      { href: '/dashboard/surveys', label: 'Surveys', icon: ClipboardList },
    ],
  },
  ```
- Tambah case di `pageTitleFor()`:
  ```ts
  if (pathname?.startsWith('/dashboard/surveys')) {
    return { title: 'Surveys', subtitle: 'Create and manage quantitative research surveys.' };
  }
  ```
- Icon: `ClipboardList` dari `lucide-react` (sudah dipakai dependency).

### 4.2 Question Card Layout — Accordion Sections (Approved)

Struktur card berubah dari flat ke **4 collapsible sections**, masing-masing dengan summary text saat collapsed:

1. **① Content** — title + description
2. **② Type & settings** — question type + required toggle
3. **③ Answer config** — options / linear scale / matrix (type-specific)
4. **④ Conditional logic** — show/hide rules

#### Default state

- **Section ① Content** expanded by default (saat user add question baru).
- Section lain collapsed, dengan summary text di header:
  - Type & settings: `"Linear scale · Required"` atau `"Dropdown · Optional"`
  - Answer config: `"Min/Max/Step · Labels"` atau `"4 options"` atau `"3 rows × 5 columns"`
  - Conditional logic: `"Off"` atau `"2 rules"`

#### Header card

- Drag handle (⋮⋮) di kiri — hanya ini yang bisa di-drag, bukan seluruh card body.
- Question number + key + type summary di tengah.
- ↑ / ↓ buttons (outline, small) + Delete (danger, small) di kanan.

#### Behavior

- Klik header section → toggle expand/collapse (animated, height transition).
- Hanya 1 section expanded at a time? **Tidak** — multi-expand OK. User bisa buka beberapa sekaligus untuk cross-reference.
- Local state per card (`useState`), tidak persist ke server.

#### Styling

- Header collapsed: `bg-bg-weak-50/60` (subtle gray), icon chevron `▸` muted.
- Header expanded: `bg-bg-weak-50` + accent border-left `border-l-2 border-primary`, icon `▾` primary color.
- Section content padding: `p-4`.
- Border between sections: `border-t border-stroke-soft-200`.

### 4.3 Drag-to-Reorder — Dedicated Handle (Approved)

Library: **`@dnd-kit/core` + `@dnd-kit/sortable`**.

Alasan dnd-kit:
- Modern, accessible (keyboard navigation built-in via `@dnd-kit/sortable` + `@dnd-kit/accessibility`).
- Ringan: ~12kb gzipped total.
- Dipakai Notion, Linear, Trello (battle-tested).

#### Pattern

- **Drag handle**: icon `GripVertical` (lucide-react) di kiri card header, hanya ini yang drag-able.
- **Cursor**: `cursor-grab` saat hover handle, `cursor-grabbing` saat drag.
- **Tombol ↑ / ↓**: tetap ada di header (outline buttons) sebagai fallback keyboard / precise 1-step.
- **Tombol disabled state**: ↑ disabled di question pertama, ↓ disabled di question terakhir.

#### Visual feedback saat drag

- **Dragging card**: opacity 0.5, scale 1.02, shadow-xl, ring-2 ring-primary.
- **Drop indicator**: bar horizontal 4px di antara cards (`bg-primary`).
- **Other cards**: subtle shift animation 200ms.

#### Accessibility

- Handle punya `aria-label="Drag to reorder question {n}"`.
- ↑ / ↓ buttons: `aria-label="Move question {n} up"` / `"down"`.
- Live region announcement saat reorder: `"Question moved to position {newPos}"`.
- Keyboard support via `KeyboardSensor` dari dnd-kit: Space to pick up, Arrow keys to move, Space to drop, Escape to cancel.

### 4.4 Save Button — Per-Card Explicit Save (Approved)

Setiap card punya **Save button sendiri di footer**, plus tombol Discard.

#### Card state machine

```
idle → dirty (user edit field) → saving → saved | error
  ↑_________________________________________|
```

State indicator:
- **idle**: tidak ada badge, timestamp "Last saved X min ago" (gray text).
- **dirty**: badge kuning "● Unsaved" di header card.
- **saving**: badge biru "Saving..." di header, button disabled, spinner.
- **saved**: badge hijau "✓ Saved" sebentar (3 detik), lalu kembali ke "Last saved X min ago".
- **error**: badge merah "⚠ Save failed" + retry button + error tooltip.

#### Footer layout

```
[Last saved 2 min ago]  [Discard] [Save question]
```

- Discard disabled saat `idle` atau `saving`. Konfirmasi dulu via inline confirmation: klik sekali → text jadi "Click again to confirm discard", 3 detik timeout.
- Save button disabled saat `idle` atau `saving`.
- Save button label: "Save question" (bukan "Save") — eksplisit apa yang disave.

#### Edge cases

- **Unsaved + navigate away**: confirmation modal "You have unsaved changes in {N} questions. Discard changes?"
- **Unsaved + close tab**: `beforeunload` event listener, browser-native warning.
- **Multiple cards dirty**: tidak ada global "Save all" (V1). User save per-card. Bisa V2.
- **Network optimistic update**: tidak dipakai. Pessimistic — klik Save → request terkirim ke server → response OK baru update `serverQuestions` snapshot dan clear dirty flag. Lebih predictable.

#### Backend integration (no contract change)

Tetap pakai endpoint existing `PUT /api/teams/:teamId/surveys/:surveyId/questions` (replace-all).

Client-side:
1. Simpan **original questions array** saat initial load (`useRef` atau state `serverQuestions`).
2. Track **dirty questions** via diff comparison.
3. Saat Save:
   - Bangun array baru = `serverQuestions` dengan replacement untuk dirty question.
   - PUT ke endpoint.
   - On success: update `serverQuestions`, clear dirty flag, set timestamp.
   - On error: tampilkan error state, keep dirty flag.

#### Implementation details

- Hook baru: `useQuestionDraft(initialQuestions)` returning:
  ```ts
  {
    questions: Question[],
    serverQuestions: Question[],
    isDirty: (key: string) => boolean,
    updateQuestion: (key: string, next: Question) => void,
    discardQuestion: (key: string) => void,
    saveQuestion: (key: string) => Promise<void>,
    saveState: Map<string, 'idle' | 'saving' | 'saved' | 'error'>,
    isAnyDirty: boolean,
  }
  ```
- React Query mutation: `useMutation` untuk PUT, invalidasi query `['survey', surveyId]` setelah save success.
- Optimistic UI **disabled** (pessimistic). Tombol Save disabled saat `saving`. User tunggu konfirmasi.

---

## 5. Component Architecture

### Modified components

| File | Change |
|------|--------|
| `frontend/src/components/layout/DashboardLayout.tsx` | Tambah Research section + pageTitleFor case |
| `frontend/src/components/surveys/QuestionListEditor.tsx` | Refactor: hapus global Save button, wrap dengan `useQuestionDraft`, integrate dnd-kit `<DndContext>` |
| `frontend/src/components/surveys/QuestionEditorCard.tsx` | Restructure jadi accordion sections + footer Save/Discard + drag handle + isDirty/isSaving state |

### New components

| File | Purpose |
|------|---------|
| `frontend/src/components/surveys/QuestionSection.tsx` | Reusable collapsible section (header + content + summary) |
| `frontend/src/components/surveys/QuestionCardFooter.tsx` | Footer dengan timestamp + Discard + Save buttons + state badge |
| `frontend/src/hooks/useQuestionDraft.ts` | Custom hook untuk manage per-card dirty/save state |
| `frontend/src/lib/surveys/questionsDiff.ts` | Pure utility: `getDirtyQuestions(current, original)`, `applyChanges(original, changes)` |

### Component dependency

```
QuestionListEditor
  ├─ useQuestionDraft (hook)
  ├─ DndContext + SortableContext (dnd-kit)
  └─ QuestionEditorCard[]
        ├─ GripVertical (handle, drag listener)
        ├─ QuestionSection (4 instances)
        │     ├─ Content section
        │     ├─ Type section
        │     ├─ Answer config section
        │     └─ Conditional logic section
        └─ QuestionCardFooter
              ├─ Timestamp text
              ├─ Discard button
              ├─ Save button
              └─ State badge (Unsaved / Saving / Saved / Error)
```

---

## 6. State Management

### Local state per card

```ts
interface QuestionCardState {
  // accordion UI state (local, not persisted)
  expandedSections: Set<'content' | 'type' | 'config' | 'logic'>;
}
```

Hook signature:
```ts
const {
  questions,              // current working state
  serverQuestions,        // last persisted snapshot
  saveState,              // Map<questionKey, 'idle' | 'saving' | 'saved' | 'error'>
  isDirty,                // (key) => boolean
  updateQuestion,         // (key, next) => void — updates local working copy only
  discardQuestion,        // (key) => void — revert local working copy to server version
  saveQuestion,           // (key) => Promise<void> — PUT to server, then sync local
  isAnyDirty,             // boolean — for global unsaved indicator
} = useQuestionDraft(initialQuestions);
```

### Server state

Tetap via React Query:
- `useQuery(['survey', surveyId])` → list + detail.
- `useMutation` for PUT questions → on success, `queryClient.invalidateQueries(['survey', surveyId])`.

### Navigation guard

- `useEffect` di `QuestionListEditor`: jika `isAnyDirty === true`, register `beforeunload` listener.
- Tambah internal navigation guard (Next.js): `useRouter` events atau custom hook `usePromptUnsaved(isAnyDirty)`.

---

## 7. Accessibility

| Concern | Solution |
|---------|----------|
| Drag-to-reorder tanpa mouse | dnd-kit `KeyboardSensor` (Space → arrow → Space) |
| Screen reader info untuk reorder | `aria-label` di handle & buttons + live region announcement |
| Accordion state | `aria-expanded`, `aria-controls` di header button |
| Save state indicator | `role="status"` + `aria-live="polite"` untuk timestamp update |
| Focus management | Setelah Save success, focus tetap di Save button (tidak pindah) |
| Color-only state | Badge punya icon (● / ✓ / ⚠) + text, tidak hanya color |
| Disabled state saat saving | `aria-disabled="true"` + visible spinner |

---

## 8. Testing Strategy

### Unit tests

- `questionsDiff.ts`: pure functions untuk dirty detection & apply changes
  - Empty diff → no PUT
  - Single question changed → PUT with 1 replacement
  - Multiple changes → PUT with all replacements
  - Discard → restore from server snapshot
- `useQuestionDraft` hook (via React Testing Library):
  - `updateQuestion` sets dirty flag
  - `saveQuestion` triggers mutation, clears dirty on success
  - `saveQuestion` keeps dirty on error
  - `discardQuestion` reverts to server version
- `QuestionSection` accordion toggle

### Integration tests

- `QuestionListEditor`: render 2 questions, edit one, verify only that card shows Unsaved badge.
- Drag reorder: simulate dnd-kit keyboard sensor (Space, ArrowDown, Space), verify order changes.
- Save flow: mock mutation, click Save, verify PUT called with correct payload, badge changes to Saved.

### Manual / e2e checks (smoke)

- Add new question → Content section expanded by default.
- Edit title → Unsaved badge appears.
- Click ↑ when first question → button disabled (no movement).
- Drag question 3 to position 1 → order updates, indicator bar visible.
- Refresh page mid-edit → beforeunload warning fires.
- Save question → badge transitions Unsaved → Saving → Saved.
- Click Save → network tab shows PUT with correct payload.
- Error case: simulate 500 → badge shows "Save failed", data stays dirty.

---

## 9. Migration & Rollout

V1 (single-pass implementation):
1. Add `Research` section to sidebar.
2. Install `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`.
3. Build `useQuestionDraft` hook + `questionsDiff` utility (with unit tests).
4. Refactor `QuestionEditorCard` to accordion sections.
5. Refactor `QuestionListEditor` to integrate dnd-kit + per-card save flow.
6. Add footer Save/Discard + state badges.
7. Add navigation guard for unsaved changes.
8. Manual smoke test on local.
9. Manual smoke test on staging.

No DB migration needed (frontend-only change). No backend deploy needed.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| dnd-kit bundle size adds weight | Tree-shakeable; only import what's used. ~12kb gz, acceptable. |
| PUT replace-all risky kalau 2 user edit bersamaan | Out of scope V1. Add row-level version check di V2. Untuk V1: last-write-wins, document. |
| Local diff detection misses nested config changes | Deep equality check via JSON.stringify (config is plain JSON). Test edge cases (matrix row reorder, option re-add). |
| Unsaved modal interrupts flow terlalu sering | Modal hanya muncul kalau `isAnyDirty`. Kosongkan dirty sebelum navigate (auto-discard on explicit cancel). |
| Accordion state hilang saat re-render | Local `useState` di `QuestionEditorCard`. Tidak depend pada parent re-render. |
| Save button disabled tanpa feedback | Selalu tampilkan state badge (Saving / Saved / Error) + tooltip di button saat hover. |

---

## 11. Open Questions (resolved during brainstorm)

- ✅ Section default expanded: hanya **① Content** saat add new question.
- ✅ Library drag: **dnd-kit** (bukan react-dnd / framer-motion).
- ✅ Save pattern: **per-card explicit** (bukan auto-save, bukan hybrid).
- ✅ Backend integration: **PUT replace-all + client-side diff** (bukan endpoint baru).
- ✅ Discard behavior: **inline confirmation** (klik sekali lagi dalam 3 detik).
- ✅ Multi-section expand: **boleh buka beberapa sekaligus**.
- ✅ Global "Save all": **tidak ada di V1**.

---

## 12. References

- Mockup sidebar: `.superpowers/brainstorm/15011-1782014442/content/sidebar-options.html`
- Mockup card layout: `.superpowers/brainstorm/15011-1782014442/content/question-card-layout.html`
- Mockup drag handle: `.superpowers/brainstorm/15011-1782014442/content/drag-handle-patterns.html`
- Mockup save button: `.superpowers/brainstorm/15011-1782014442/content/save-button-placement.html`
- Existing PRD: `docs/superpowers/specs/2026-06-20-quantitative-research-survey-prd.md`
- Existing FE plan: `docs/superpowers/plans/2026-06-20-quantitative-research-survey-frontend-integration-plan.md`
- dnd-kit docs: https://docs.dndkit.com/