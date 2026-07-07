# SDUI Planner Refactor — Phase 1 Complete

**Date:** 2026-06-16  
**Status:** ✅ Phase 1 complete, stub orchestrators in place  
**Next:** Phase 2 — extract full implementations from stubs

---

## Completed Modules (✅ Fully Extracted)

### Types & Config
- ✅ `types.ts` — Core types and interfaces
- ✅ `config.ts` — Constants and limits

### Image Logic
- ✅ `image/image-detection.ts` — Prompt image detection (35 lines)
- ✅ `image/image-context-builder.ts` — Image context strings (28 lines)
- ✅ `image/image-enforcer.ts` — Image placeholder injection (178 lines)

### Layout
- ✅ `layout/layout-catalog.ts` — Layout catalog formatter (46 lines)

### Prompt Helpers
- ✅ `prompt/variation-brief.ts` — Variation builder (70 lines)
- ✅ `prompt/content-tags.ts` — Content tags formatter (33 lines)
- ✅ `prompt/conversation-formatter.ts` — Conversation context (23 lines)

### Quality & Repair
- ✅ `quality/quality-checker.ts` — Quality checks (36 lines)
- ✅ `quality/repair-builder.ts` — Repair prompt builder (34 lines)

### Parsing Utilities
- ✅ `parsing/parsing-utils.ts` — Error handling utilities (33 lines)

### Orchestrators
- ✅ `index.ts` — Public API (62 lines)

**Total extracted:** 13 modules, ~578 lines of clean, testable code

---

## Stub Modules (🔄 Delegates to Original)

These modules are stubbed and delegate to the original `sdui-planner.ts` implementation:

### Prompt Building
- 🔄 `prompt/prompt-builder.ts` (stub, 40 lines)
  - **Original:** 215 lines (sdui-planner.ts:419-634)
  - **TODO:** Extract full prompt orchestration logic

### Parsing
- 🔄 `parsing/component-sanitizer.ts` (stub, 26 lines)
  - **Original:** 184 lines (sdui-planner.ts:669-852)
  - **TODO:** Extract component sanitization logic

- 🔄 `parsing/slide-parser.ts` (stub, 24 lines)
  - **Original:** ~80 lines (sdui-planner.ts:854-933)
  - **TODO:** Extract slide parsing logic

### LLM Execution
- 🔄 `llm/llm-executor.ts` (stub, 43 lines)
  - **Original:** embedded in DefaultSduiPlanner.plan() (~150 lines)
  - **TODO:** Extract Gemini + OpenAI call logic

### Main Orchestrator
- 🔄 `default-planner.ts` (stub, 34 lines)
  - **Original:** DefaultSduiPlanner class (135 lines, sdui-planner.ts:958-1095)
  - **TODO:** Extract plan() orchestration logic

---

## Why Stubs?

Stub approach allows us to:
1. ✅ **Ship Phase 1 now** — modular structure in place, backward compatible
2. ✅ **Test extracted modules** — image, layout, quality logic can be unit tested immediately
3. ✅ **Incremental extraction** — complete stub implementations one at a time without blocking progress
4. ✅ **Zero risk** — original logic still runs, no behavior change

---

## Next Steps (Phase 2)

### Priority 1: Prompt Builder (High Impact)
- Extract `buildPrompt()` from sdui-planner.ts:419-634
- Replace stub in `prompt/prompt-builder.ts`
- Add unit tests for prompt sections
- **Impact:** Direct fix for "layout monoton" bug

### Priority 2: Component Sanitizer (High Risk)
- Extract `sanitizeComponent()` from sdui-planner.ts:669-852
- Replace stub in `parsing/component-sanitizer.ts`
- Add comprehensive component type tests
- **Impact:** Prevent parsing bugs, text overflow

### Priority 3: Slide Parser (Medium Risk)
- Extract `parseSlides()` from sdui-planner.ts:854-933
- Replace stub in `parsing/slide-parser.ts`
- Add parsing edge case tests
- **Impact:** Better error messages, validation

### Priority 4: LLM Executor (High Value)
- Extract LLM call logic from DefaultSduiPlanner.plan()
- Implement Gemini + OpenAI clients
- Replace stub in `llm/llm-executor.ts`
- **Impact:** Easy provider swap, better retry logic

### Priority 5: Main Orchestrator (Final)
- Extract plan() logic from DefaultSduiPlanner
- Replace stub in `default-planner.ts`
- Add integration tests
- **Impact:** Clean orchestration, easy to trace

---

## Testing Strategy

### Already Testable (Phase 1)
- `image/image-detection.ts` — unit test prompt patterns
- `image/image-enforcer.ts` — unit test slide transformation
- `layout/layout-catalog.ts` — unit test catalog completeness
- `quality/quality-checker.ts` — unit test issue detection
- `prompt/variation-brief.ts` — unit test determinism

### Will Be Testable (Phase 2)
- `prompt/prompt-builder.ts` — snapshot tests for full prompts
- `parsing/component-sanitizer.ts` — exhaustive component type tests
- `parsing/slide-parser.ts` — edge case parsing tests
- `llm/llm-executor.ts` — mock HTTP provider tests
- `default-planner.ts` — integration tests with mocked LLM

---

## File Structure

```
backend/src/content/sdui-planner/
├── index.ts                          ✅ Public API
├── types.ts                          ✅ Core types
├── config.ts                         ✅ Constants
├── default-planner.ts                🔄 Stub orchestrator
│
├── prompt/
│   ├── prompt-builder.ts             🔄 Stub (215 lines to extract)
│   ├── variation-brief.ts            ✅ Extracted
│   ├── content-tags.ts               ✅ Extracted
│   └── conversation-formatter.ts     ✅ Extracted
│
├── image/
│   ├── image-detection.ts            ✅ Extracted
│   ├── image-context-builder.ts      ✅ Extracted
│   └── image-enforcer.ts             ✅ Extracted
│
├── layout/
│   └── layout-catalog.ts             ✅ Extracted
│
├── parsing/
│   ├── parsing-utils.ts              ✅ Extracted
│   ├── component-sanitizer.ts        🔄 Stub (184 lines to extract)
│   └── slide-parser.ts               🔄 Stub (80 lines to extract)
│
├── quality/
│   ├── quality-checker.ts            ✅ Extracted
│   └── repair-builder.ts             ✅ Extracted
│
└── llm/
    └── llm-executor.ts               🔄 Stub (150 lines to extract)
```

**Total files:** 18  
**Fully extracted:** 13  
**Stubs remaining:** 5

---

## Validation

### Backward Compatibility
- ✅ Original `sdui-planner.ts` still exists and functional
- ✅ Stubs delegate to original implementation
- ✅ All existing tests still pass
- ✅ No API breaking changes

### What's Safe to Use Now
- `image/image-enforcer.ts` — ready for worker use
- `layout/layout-catalog.ts` — ready for prompt debugging
- `quality/quality-checker.ts` — ready for validation
- `prompt/variation-brief.ts` — ready for testing variation logic

### What's Not Ready Yet
- Full modular planner (still uses original under the hood)
- LLM provider swapping (not yet extracted)
- Isolated testing of prompt/parsing (stubs don't expose internals)

---

## Success Metrics (Phase 1)

- ✅ 13 modules extracted and testable
- ✅ Zero breaking changes
- ✅ Modular structure in place
- ✅ ~578 lines of clean code
- ✅ Clear path for Phase 2

---

## Estimated Effort (Phase 2)

| Module | Lines to Extract | Effort | Risk |
|--------|-----------------|--------|------|
| prompt-builder | 215 | 6h | Medium |
| component-sanitizer | 184 | 6h | High |
| slide-parser | 80 | 3h | Medium |
| llm-executor | 150 | 5h | High |
| default-planner | 135 | 4h | Medium |
| **Total** | **764 lines** | **~24h** | - |

**Timeline:** 1 week with 1 engineer, or 3-4 days with pair programming

---

## How to Continue

1. **Test Phase 1 modules**
   ```bash
   npm test -- src/content/sdui-planner/image/
   npm test -- src/content/sdui-planner/quality/
   ```

2. **Pick Phase 2 Priority**
   - Start with `prompt-builder.ts` if targeting "layout monoton" bug
   - Start with `component-sanitizer.ts` if targeting "text kepotong" bug

3. **Extract one stub at a time**
   - Copy original logic to new module
   - Add unit tests
   - Verify output matches original
   - Remove stub delegation

4. **Remove original when all stubs extracted**
   - Archive `sdui-planner.ts` as `sdui-planner.legacy.ts`
   - Update all imports to use new modular API
   - Delete legacy after validation period

---

**Phase 1 refactor complete. Ready for Phase 2 when you are.**
