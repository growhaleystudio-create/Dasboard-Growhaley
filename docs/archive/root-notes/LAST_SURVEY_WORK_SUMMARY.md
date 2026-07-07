# Last Survey Work Summary

## Konteks
Kita lagi ngerjain simplifikasi UI survey question card di frontend.

Goal utama yang udah disepakati:
- 1 question = 1 accordion card
- tidak ada nested accordion section (`① Content`, `② Type & settings`, dst)
- move up / move down dihapus dari card UI
- answer option cukup 1 input yang kelihatan
- value option tetap ada di data model, tapi hidden dan stabil
- remove question dipindah ke footer, dekat save controls

## Workspace Discovery
Awalnya kerja sempat diarahkan ke worktree baru, tapi ternyata file survey frontend yang relevan ada di workspace utama, bukan di worktree itu.

File frontend survey yang ditemukan di workspace utama:
- `frontend/src/components/surveys/QuestionListEditor.tsx`
- `frontend/src/components/surveys/QuestionEditorCard.tsx`
- `frontend/src/components/surveys/QuestionListEditor.test.tsx`
- `frontend/src/hooks/useQuestionDraft.ts`
- `frontend/src/app/dashboard/surveys/page.tsx`
- `frontend/src/app/dashboard/surveys/[surveyId]/page.tsx`

## Last Thing That Was Actually Done
### 1. TDD RED step untuk Task 1
File test yang diubah:
- `frontend/src/components/surveys/QuestionListEditor.test.tsx`

Test diubah untuk nge-lock behavior baru berikut:
- harus ada button `Toggle question 1`
- nested section title lama tidak boleh muncul:
  - `① Content`
  - `② Type & settings`
  - `③ Answer config`
  - `④ Conditional logic`
- move up / move down buttons tidak boleh tampil di question card UI
- choice option harus cuma punya 1 visible input
- remove question harus ada di footer dekat save controls

### 2. Failing test berhasil dijalankan
Command yang dipakai:
```bash
cd frontend && npm run test -- src/components/surveys/QuestionListEditor.test.tsx
```

Hasil:
- test **FAIL** dan ini **expected**
- failure utama: elemen `Toggle question 1` belum ada

Artinya:
- test baru memang berhasil membuktikan bahwa implementation sekarang belum sesuai target
- ini adalah RED step yang valid dalam TDD

### 3. Perubahan kecil yang sempat mulai dilakukan di production file
File:
- `frontend/src/components/surveys/QuestionEditorCard.tsx`

Perubahan yang sempat dilakukan:
- import icon diubah dari:
  - `ArrowDown`, `ArrowUp`, `Trash2`
- menjadi:
  - `ChevronDown`, `ChevronRight`
- import `QuestionSection` dihapus

Status perubahan ini:
- **baru parsial**
- belum selesai
- belum diverifikasi dengan test run setelah refactor

## Yang Belum Dikerjakan
Belum ada implementation lengkap untuk Task 2 dan 3.

Artinya production code masih belum selesai untuk:
- single accordion card
- flat content layout tanpa nested section accordion
- removal move up/down buttons dari card UI
- one visible option input
- stable hidden option value behavior
- remove action di footer

## Next Steps
### Task 2 — Refactor `QuestionEditorCard` jadi single accordion card
Perlu dilakukan di:
- `frontend/src/components/surveys/QuestionEditorCard.tsx`

Yang perlu diubah:
1. ganti state `expandedSections` menjadi 1 state `expanded`
2. bikin card header yang punya toggle button `Toggle question {n}`
3. collapse / expand seluruh body card dari header
4. hapus semua pemakaian `QuestionSection`
5. ubah isi card jadi section biasa pakai heading visual sederhana
6. tambahkan label/aria yang dipakai test (`Question title`, dll)

### Task 3 — Simplify answer config
Perlu dilakukan di:
- `frontend/src/components/surveys/QuestionEditorCard.tsx`
- `frontend/src/components/surveys/QuestionListEditor.tsx`

Yang perlu diubah:
1. hilangkan input `option_value` dari UI
2. sisakan 1 input label per option
3. jaga supaya `value` internal tetap ada dan stabil
4. ubah validation di `QuestionListEditor.tsx` supaya tidak lagi mewajibkan visible/manual option value

### Task 4 — Move actions out of heavy header
Perlu dilakukan di:
- `frontend/src/components/surveys/QuestionEditorCard.tsx`
- `frontend/src/components/surveys/QuestionCardFooter.tsx`
- `frontend/src/components/surveys/QuestionListEditor.tsx`

Yang perlu diubah:
1. hapus move up/down buttons dari card UI
2. pindahkan remove question ke footer
3. teruskan `onRemove` ke `QuestionCardFooter`
4. stop passing `onMoveUp` / `onMoveDown` kalau sudah tidak dipakai lagi

### Verification
Setelah implementation selesai:
```bash
cd frontend && npm run test -- src/components/surveys/QuestionListEditor.test.tsx
```

Lalu kalau lolos, lanjutkan ke test survey/frontend yang lebih luas.

## Ringkasan Singkat
Kerjaan terakhir yang benar-benar selesai adalah:
- update test untuk behavior baru
- jalankan test dan dapat FAIL yang expected

Belum selesai:
- implementation production code untuk card simplification
- cleanup action placement
- one-input option config
