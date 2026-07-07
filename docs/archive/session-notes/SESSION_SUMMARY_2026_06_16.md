# Session Summary — SDUI Planner Refactor & Image Template Fix

**Date:** 2026-06-16  
**Duration:** ~3 hours  
**Status:** ✅ Phase 1 complete, bug fixed, refactor structure in place

---

## 🎯 Goals Achieved

### 1. ✅ Fixed Image Template Bug
**Problem:** Generated images tidak muncul di slide final karena template picker tidak redirect slide dengan image_placeholder ke image-capable layouts.

**Root cause:**
- `backend/src/content/rendering/satori/template-picker.ts` tidak cek apakah slide punya `image_placeholder`
- Slide dengan `layout_variant_id: stat_highlight` tetap di-render dengan template text-only (`tplStat`)
- Image yang sudah di-generate di worker diabaikan saat render

**Fix:**
- Patch `resolveRendererTemplateId()` untuk deteksi `image_placeholder` / `imageUrl`
- Redirect ke image-capable template (e.g., `stat_highlight` → `split_stat_image`)
- Tambah test coverage di `template-picker.test.ts`

**Validation:**
- ✅ `npm test -- template-picker.test.ts` → 2/2 pass
- ✅ `npm test -- sdui-carousel-worker.test.ts` → 17/17 pass

**Files changed:**
- `backend/src/content/rendering/satori/template-picker.ts`
- `backend/src/content/rendering/satori/template-picker.test.ts` (new)
- `backend/src/content/workers/pipeline/image-generation-handler.ts` (import fix)

---

### 2. ✅ Created Refactor Plan for sdui-planner.ts
**Problem:** File terlalu besar (1096 lines, 263 symbols), sulit maintain, bug "layout monoton" dan "text kepotong" sulit di-debug.

**Solution:** Modular refactor dengan 22 modul kecil.

**Documented:**
- `docs/REFACTOR_SDUI_PLANNER.md` — full refactor plan (7 phases, 54h effort estimate)
- `docs/REFACTOR_SDUI_PLANNER_PHASE1_COMPLETE.md` — Phase 1 results
- `docs/PHASE2_EXTRACTION_GUIDE_PROMPT_BUILDER.md` — extraction guide for next phase

---

### 3. ✅ Executed Phase 1 Refactor
**Completed:** 13 modules fully extracted (~578 lines of clean code)

**Structure:**
```
backend/src/content/sdui-planner/
├── index.ts                          ✅ Public API
├── types.ts                          ✅ Core types
├── config.ts                         ✅ Constants
├── default-planner.ts                🔄 Stub (delegates to original)
│
├── prompt/
│   ├── prompt-builder.ts             🔄 Stub (215 lines to extract)
│   ├── variation-brief.ts            ✅ Extracted (70 lines)
│   ├── content-tags.ts               ✅ Extracted (33 lines)
│   └── conversation-formatter.ts     ✅ Extracted (23 lines)
│
├── image/
│   ├── image-detection.ts            ✅ Extracted (35 lines)
│   ├── image-context-builder.ts      ✅ Extracted (28 lines)
│   └── image-enforcer.ts             ✅ Extracted (178 lines)
│
├── layout/
│   └── layout-catalog.ts             ✅ Extracted (46 lines)
│
├── parsing/
│   ├── parsing-utils.ts              ✅ Extracted (33 lines)
│   ├── component-sanitizer.ts        🔄 Stub (184 lines to extract)
│   └── slide-parser.ts               🔄 Stub (80 lines to extract)
│
├── quality/
│   ├── quality-checker.ts            ✅ Extracted (36 lines)
│   └── repair-builder.ts             ✅ Extracted (34 lines)
│
└── llm/
    └── llm-executor.ts               🔄 Stub (150 lines to extract)
```

**Total files created:** 18  
**Fully extracted:** 13 modules  
**Stubs remaining:** 5 modules (~764 lines for Phase 2)

---

### 4. ✅ Created Smoke Test Plan
**File:** `docs/STAGING_RENDER_SMOKE_TEST_PLAN.md`

**Purpose:** Verify patched render pipeline shows generated images in final carousel output.

**Scenarios:**
- A: Happy path with image slides
- B: Long content with image
- C: Controlled failure

**Example prompts:** 3 distinct prompts (travel, parenting, F&B) untuk membuktikan variasi output.

---

## 📊 Metrics

### Code Quality
- **Lines refactored:** 578 lines extracted into modules
- **Test coverage added:** 2 new test cases for template picker
- **Files created:** 21 (18 modules + 3 docs)
- **Bug fixes:** 1 critical (image template mismatch)

### Technical Debt Reduction
- **Before:** 1 monolithic file (1096 lines)
- **After:** 18 modular files (avg ~60 lines per module for extracted code)
- **Modularity:** Clear separation of concerns (image, layout, quality, prompt, parsing)
- **Testability:** Image logic, layout catalog, quality checker now independently testable

---

## 🔧 Files Modified/Created

### Bug Fix
1. `backend/src/content/rendering/satori/template-picker.ts` — patched
2. `backend/src/content/rendering/satori/template-picker.test.ts` — new
3. `backend/src/content/workers/pipeline/image-generation-handler.ts` — import fix

### Refactor Phase 1 (Extracted Modules)
4. `backend/src/content/sdui-planner/index.ts` — new
5. `backend/src/content/sdui-planner/types.ts` — new
6. `backend/src/content/sdui-planner/config.ts` — new
7. `backend/src/content/sdui-planner/default-planner.ts` — new (stub)
8. `backend/src/content/sdui-planner/image/image-detection.ts` — new
9. `backend/src/content/sdui-planner/image/image-context-builder.ts` — new
10. `backend/src/content/sdui-planner/image/image-enforcer.ts` — new
11. `backend/src/content/sdui-planner/layout/layout-catalog.ts` — new
12. `backend/src/content/sdui-planner/prompt/prompt-builder.ts` — new (stub)
13. `backend/src/content/sdui-planner/prompt/variation-brief.ts` — new
14. `backend/src/content/sdui-planner/prompt/content-tags.ts` — new
15. `backend/src/content/sdui-planner/prompt/conversation-formatter.ts` — new
16. `backend/src/content/sdui-planner/quality/quality-checker.ts` — new
17. `backend/src/content/sdui-planner/quality/repair-builder.ts` — new
18. `backend/src/content/sdui-planner/parsing/parsing-utils.ts` — new
19. `backend/src/content/sdui-planner/parsing/component-sanitizer.ts` — new (stub)
20. `backend/src/content/sdui-planner/parsing/slide-parser.ts` — new (stub)
21. `backend/src/content/sdui-planner/llm/llm-executor.ts` — new (stub)

### Documentation
22. `docs/REFACTOR_SDUI_PLANNER.md` — refactor master plan
23. `docs/REFACTOR_SDUI_PLANNER_PHASE1_COMPLETE.md` — Phase 1 summary
24. `docs/PHASE2_EXTRACTION_GUIDE_PROMPT_BUILDER.md` — extraction guide
25. `docs/STAGING_RENDER_SMOKE_TEST_PLAN.md` — smoke test plan

**Total:** 25 files

---

## 🚀 What's Ready to Use Now

### Immediately Usable
- ✅ **Image template fix** — deploy to staging, run smoke test
- ✅ **Image enforcer module** — use in worker for post-processing
- ✅ **Layout catalog module** — use for prompt debugging
- ✅ **Quality checker module** — use for validation
- ✅ **Variation brief module** — test for layout diversity

### Not Ready Yet (Phase 2)
- 🔄 Full modular planner (still uses original under the hood via stubs)
- 🔄 Isolated prompt testing (prompt-builder stub)
- 🔄 Component sanitizer testing (sanitizer stub)
- 🔄 LLM provider swapping (executor stub)

---

## 📋 Next Steps

### Immediate (High Priority)
1. **Deploy image template fix to staging**
   - Run smoke test with 3 new prompts
   - Verify images actually appear in final PNG
   - Document before/after screenshots

2. **Test extracted modules**
   ```bash
   npm test -- src/content/sdui-planner/image/
   npm test -- src/content/sdui-planner/quality/
   npm test -- src/content/sdui-planner/prompt/variation-brief.test.ts
   ```

### Phase 2 (Medium Priority)
3. **Extract prompt-builder.ts** (215 lines)
   - Follow `docs/PHASE2_EXTRACTION_GUIDE_PROMPT_BUILDER.md`
   - This will directly help fix "layout monoton" bug
   - Estimated: 90 minutes

4. **Extract component-sanitizer.ts** (184 lines)
   - Will help fix "text kepotong" bug
   - Estimated: 90 minutes

5. **Extract remaining stubs**
   - slide-parser.ts (80 lines)
   - llm-executor.ts (150 lines)
   - default-planner.ts (135 lines)
   - Estimated: 4-6 hours

### Long-term (Lower Priority)
6. **Add comprehensive tests**
   - Layout diversity tests
   - Text overflow tests
   - Repair prompt tests

7. **Remove original sdui-planner.ts**
   - Archive as sdui-planner.legacy.ts
   - Update all imports
   - Delete after validation period

---

## 🐛 Bug Investigation Notes

### "Layout Monoton" Bug
**Hypothesis:** `buildVariationBrief()` di `prompt/variation-brief.ts` mungkin tidak cukup mempengaruhi LLM untuk rotate layout choice.

**Investigation paths:**
1. Check apakah `layoutBiases` array cukup diverse
2. Check apakah hash calculation benar-benar vary per job
3. Check apakah prompt section `[CREATIVE VARIATION]` cukup kuat
4. Add explicit "anti-repeat" instruction ke prompt

**Module to inspect:**
- `prompt/variation-brief.ts:24-70` — buildVariationBrief()
- `prompt/prompt-builder.ts` (stub, needs extraction first)
- `layout/layout-catalog.ts:20-31` — promptLayoutCatalog()

### "Text Kepotong" Bug
**Hypothesis:** `sanitizeComponent()` truncation terlalu agresif atau tidak konsisten dengan `resolveSduiTextLimits()`.

**Investigation paths:**
1. Extract `component-sanitizer.ts` untuk add test coverage
2. Compare hard limits vs adaptive limits
3. Add overflow detection di quality checker
4. Improve repair prompt untuk handle overflow gracefully

**Module to inspect:**
- `parsing/component-sanitizer.ts` (stub, needs extraction)
- `quality/quality-checker.ts:15-35` — add text length checks
- `config.ts:8-14` — HARD_MAX constants

---

## ⚠️ Risks & Mitigations

### Risk 1: Stubs Break During Phase 2
**Mitigation:** Stubs delegate to original implementation, zero breaking change until Phase 2 complete.

### Risk 2: Refactor Introduces New Bugs
**Mitigation:**
- All existing tests still pass
- Incremental extraction (one module at a time)
- Parallel run validation before removing original

### Risk 3: Phase 2 Takes Longer Than Expected
**Mitigation:**
- Phase 1 already delivers value (bug fix + modular structure)
- Phase 2 can be done incrementally over multiple sessions
- Stubs allow system to function while refactor continues

---

## 💡 Key Learnings

1. **Modular refactor** dengan stub approach lebih aman daripada big-bang rewrite
2. **Bug fix** bisa dilakukan parallel dengan refactor tanpa menunggu refactor selesai
3. **Image template mismatch** adalah class bug yang sulit di-detect tanpa end-to-end test
4. **Prompt diversity** adalah masalah LLM prompting, bukan code structure — tapi refactor memudahkan debugging
5. **Large function** (200+ lines) memang perlu di-extract, tapi bisa pakai stub sementara untuk tidak block progress

---

## 📈 Impact Assessment

### Before Today
- ❌ Generated images tidak muncul di render final
- ❌ sdui-planner.ts 1096 lines, sulit maintain
- ❌ Bug "layout monoton" dan "text kepotong" sulit di-debug
- ❌ Tidak ada modular test coverage untuk prompt/image logic

### After Today
- ✅ Image template bug fixed & tested
- ✅ 13 modul extracted, testable, documented
- ✅ Clear path untuk fix "layout monoton" (extract prompt-builder)
- ✅ Clear path untuk fix "text kepotong" (extract component-sanitizer)
- ✅ Smoke test plan ready for staging verification

---

## 🎉 Success Criteria Met

- ✅ Image template bug identified & fixed
- ✅ Test coverage added for fix
- ✅ Refactor Phase 1 complete (13/18 modules)
- ✅ Documentation complete (3 guides)
- ✅ Backward compatibility maintained
- ✅ Zero breaking changes
- ✅ Clear roadmap for Phase 2

---

**Session complete. Ready for staging deployment & Phase 2 continuation.**
