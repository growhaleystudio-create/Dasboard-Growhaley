# Refactor Plan: sdui-planner.ts

**Date:** 2026-06-16  
**Current state:** 1096 lines, 263 symbols, single file  
**Target state:** modular, testable, < 200 lines per module

---

## Problems

### 1. Size and Complexity
- `sdui-planner.ts`: **1096 lines**
- `buildPrompt()`: **215 lines**
- `sanitizeComponent()`: **184 lines**
- `DefaultSduiPlanner.plan()`: **135 lines**

### 2. Mixed Responsibilities
Single file handles:
- Prompt construction
- Image placeholder injection
- Layout enforcement
- Component sanitization
- Slide parsing
- Quality checking
- Repair logic
- LLM API orchestration (Gemini + fallback)
- Typography validation

### 3. Hard to Test
- Monolithic functions resist isolated testing
- API calls embedded in business logic
- Hard-coded endpoints and config
- No clear seams for mocking

### 4. Hard to Extend
- Adding new layout variant → edit multiple sections
- Adding new LLM provider → modify orchestration + parsing
- Tweaking prompt → navigate 200+ line function

### 5. Unclear Boundaries
- Image logic mixed with layout logic
- Parsing mixed with validation
- Prompt building mixed with API execution

---

## Proposed Structure

```
backend/src/content/sdui-planner/
├── index.ts                          # Public API, exports SduiPlanner interface
├── types.ts                          # SduiPlannerInput, SduiPlanResult, SduiPlannerError
├── config.ts                         # Constants: HEADER_HARD_MAX, BODY_HARD_MAX, etc.
│
├── prompt/
│   ├── prompt-builder.ts             # buildPrompt() orchestrator
│   ├── variation-brief.ts            # buildVariationBrief()
│   ├── content-tags.ts               # buildContentTagsSection()
│   ├── conversation-formatter.ts     # buildConversationSection()
│   └── layout-catalog-formatter.ts   # promptLayoutCatalog(), promptLayoutIds()
│
├── image/
│   ├── image-enforcer.ts             # ensureImagePlaceholderForVisualLayers()
│   ├── explicit-image-injector.ts    # ensureExplicitImageRequest()
│   ├── image-context-builder.ts      # imageContextFromPrompt(), visualLayerImageContext()
│   └── image-detection.ts            # promptExplicitlyRequestsImages(), visualLayerNeedsGeneratedArtwork()
│
├── layout/
│   ├── layout-catalog.ts             # Layout definitions (id, family, components, limits)
│   ├── layout-aliases.ts             # Alias resolution if needed
│   └── layout-picker-hints.ts        # Layout bias logic (editorial, visual-led, etc.)
│
├── parsing/
│   ├── slide-parser.ts               # parseSlides()
│   ├── component-sanitizer.ts        # sanitizeComponent()
│   └── parsing-utils.ts              # extractErrorMessage(), helper functions
│
├── quality/
│   ├── quality-checker.ts            # sduiImageRequirementIssues(), typography checks
│   ├── repair-builder.ts             # buildCompletenessRepairPrompt()
│   └── quality-types.ts              # QualityIssue, RepairContext types
│
├── llm/
│   ├── llm-executor.ts               # executePlannerPrompt() abstraction
│   ├── gemini-client.ts              # Gemini-specific call logic
│   ├── openai-client.ts              # OpenAI fallback logic
│   └── llm-types.ts                  # LlmRequest, LlmResponse abstractions
│
└── default-planner.ts                # DefaultSduiPlanner class (orchestrator only)
```

---

## Migration Strategy

### Phase 1: Extract Non-Disruptive Modules (Low Risk)
**Goal:** Pull out pure functions with no side effects

1. **`config.ts`**
   - Move: `HEADER_HARD_MAX`, `BODY_HARD_MAX`, `QUOTE_HARD_MAX`, `CHECKLIST_ITEM_HARD_MAX`, `GEMINI_TEXT_PATH`
   - Move: `COMPONENT_TYPES`, `LAYOUT_VARIANT_SET`
   - Test: none needed, just constants

2. **`types.ts`**
   - Move: `SduiPlannerInput`, `SduiPlanResult`, `SduiPlannerError`, `SduiPlanner`, `SduiPlannerDeps`
   - Test: type-only, no runtime test

3. **`layout/layout-catalog.ts`**
   - Move: layout definitions array
   - Move: `promptLayoutCatalog()`, `promptLayoutIds()`
   - Test: layout catalog completeness, no duplicates

4. **`parsing/parsing-utils.ts`**
   - Move: `extractErrorMessage()`, `mapWrapperError()`, `cleanPromptTag()`
   - Test: unit test each helper

### Phase 2: Extract Image Logic (Medium Risk)
**Goal:** Consolidate image-related decisions

5. **`image/image-detection.ts`**
   - Move: `promptExplicitlyRequestsImages()`, `promptRequestsVisualLedDeck()`, `visualLayerNeedsGeneratedArtwork()`
   - Test: various prompts → image intent detection

6. **`image/image-context-builder.ts`**
   - Move: `imageContextFromPrompt()`, `visualLayerImageContext()`
   - Test: prompt → image context string

7. **`image/image-enforcer.ts`**
   - Move: `ensureImagePlaceholderForVisualLayers()`
   - Test: slide transformation when visual layer present

8. **`image/explicit-image-injector.ts`**
   - Move: `ensureExplicitImageRequest()`
   - Test: slide deck transformation, min image count enforcement

### Phase 3: Extract Prompt Building (Medium-High Risk)
**Goal:** Make prompt construction testable and maintainable

9. **`prompt/variation-brief.ts`**
   - Move: `buildVariationBrief()`, `hashString()`, `pickByHash()`
   - Test: deterministic variation given same input

10. **`prompt/content-tags.ts`**
    - Move: `buildContentTagsSection()`
    - Test: tag formatting

11. **`prompt/conversation-formatter.ts`**
    - Move: `buildConversationSection()`
    - Test: conversation array → formatted string

12. **`prompt/layout-catalog-formatter.ts`**
    - Move: layout catalog section building logic from `buildPrompt()`
    - Test: catalog section output format

13. **`prompt/prompt-builder.ts`**
    - Move: `buildPrompt()` orchestrator
    - Depends on: all prompt/* modules
    - Test: full prompt snapshot tests for known inputs

### Phase 4: Extract Quality & Repair (Low-Medium Risk)

14. **`quality/quality-checker.ts`**
    - Move: `sduiImageRequirementIssues()`, typography validation
    - Test: slide deck → issue detection

15. **`quality/repair-builder.ts`**
    - Move: `buildCompletenessRepairPrompt()`
    - Test: feedback → repair prompt

### Phase 5: Extract Parsing (Medium Risk)

16. **`parsing/component-sanitizer.ts`**
    - Move: `sanitizeComponent()` (184 lines)
    - Test: comprehensive component type coverage

17. **`parsing/slide-parser.ts`**
    - Move: `parseSlides()`
    - Depends on: `component-sanitizer.ts`
    - Test: raw JSON → SduiSlide[] with edge cases

### Phase 6: Extract LLM Execution (High Risk, High Value)

18. **`llm/llm-types.ts`**
    - Define: `LlmRequest`, `LlmResponse`, `LlmProvider` interface
    - Test: type-only

19. **`llm/gemini-client.ts`**
    - Move: Gemini-specific logic from `executePlannerPrompt()`
    - Implements: `LlmProvider`
    - Test: mock HTTP, verify request structure

20. **`llm/openai-client.ts`**
    - Move: OpenAI fallback logic from `executePlannerPrompt()`
    - Implements: `LlmProvider`
    - Test: mock HTTP, verify request structure

21. **`llm/llm-executor.ts`**
    - Orchestrates: provider selection, retry, error mapping
    - Test: provider fallback, error handling

### Phase 7: Slim Down Orchestrator (Final)

22. **`default-planner.ts`**
    - Keep: `DefaultSduiPlanner` class
    - Responsibilities:
      - dependency injection
      - orchestrate: prompt → LLM → parse → quality check → repair (if needed) → return
    - Test: integration test with mocked LLM

23. **`index.ts`**
    - Export: `SduiPlanner`, `DefaultSduiPlanner`, types
    - Re-export: necessary helpers if other modules need them

---

## Testing Strategy

### Unit Tests (per module)
- Each extracted module gets dedicated test file
- Test coverage target: **90%+** for business logic modules
- Snapshot tests for prompt output

### Integration Tests
- `default-planner.test.ts`: end-to-end with mocked LLM responses
- Existing `sdui-carousel-worker.test.ts` continues to pass

### Regression Safety
- Keep original `sdui-planner.ts` temporarily as `sdui-planner.legacy.ts`
- Run both implementations in parallel during migration (feature flag)
- Compare outputs, assert equivalence
- Remove legacy after validation period

---

## Rollout Plan

### Step 1: Create Directory Structure
```bash
mkdir -p backend/src/content/sdui-planner/{prompt,image,layout,parsing,quality,llm}
```

### Step 2: Extract in Order (Phase 1 → Phase 7)
- One module at a time
- Write tests first (or alongside)
- Update imports in `sdui-planner.ts` as extraction proceeds

### Step 3: Parallel Run (Safety Net)
- Keep original logic intact
- New modular planner runs alongside
- Log divergences
- Fix until outputs converge

### Step 4: Cut Over
- Replace `sdui-planner.ts` with modular implementation
- Archive legacy as `sdui-planner.legacy.ts` (delete after 1 sprint)

### Step 5: Cleanup
- Remove old file
- Update documentation
- Celebrate maintainability win

---

## Risk Mitigation

### High-Risk Areas
- **Parsing**: `parseSlides()` and `sanitizeComponent()` touch every component type
- **LLM execution**: retry/fallback logic fragile
- **Image enforcement**: mutates slides in place

### Mitigation
- Exhaustive test coverage before extraction
- Snapshot tests for parsing output
- Integration tests with real sample LLM responses
- Parallel run validation

---

## Benefits

### Immediate
- **Testability**: isolated modules easy to test
- **Readability**: < 200 lines per file, clear names
- **Debuggability**: stack traces point to specific concern

### Medium-Term
- **Extensibility**: add layout variant → edit `layout-catalog.ts` only
- **Provider flexibility**: swap LLM → edit `llm/*` only
- **Prompt tuning**: edit `prompt/*` without touching parsing/API

### Long-Term
- **Onboarding**: new devs understand one module at a time
- **Reusability**: image logic, layout catalog reusable in other flows
- **Velocity**: changes localized, less fear of breaking distant code

---

## Estimated Effort

| Phase | Modules | Effort | Risk |
|-------|---------|--------|------|
| 1. Constants & Types | 3 | 2 hours | Low |
| 2. Image Logic | 4 | 6 hours | Medium |
| 3. Prompt Building | 5 | 12 hours | Medium-High |
| 4. Quality & Repair | 2 | 4 hours | Low-Medium |
| 5. Parsing | 2 | 8 hours | Medium |
| 6. LLM Execution | 4 | 10 hours | High |
| 7. Orchestrator | 2 | 4 hours | Medium |
| **Testing & Validation** | - | 8 hours | - |
| **Total** | **22 modules** | **~54 hours** | - |

**Timeline:** ~2 weeks with 1 engineer, or 1 week with pair programming

---

## Success Criteria

- [ ] All existing tests pass
- [ ] No behavioral change in production output
- [ ] Test coverage ≥ 90% for new modules
- [ ] No file > 250 lines
- [ ] No function > 80 lines
- [ ] Clear module boundaries (low coupling, high cohesion)
- [ ] Documentation updated
- [ ] Team review approved

---

## Notes

- This refactor **does not change behavior**, only structure
- Prioritize **safety** over speed
- Use **feature flags** or parallel runs for validation
- Keep original file until confident
- Refactor is **not urgent**, but highly valuable before next major feature

---

## Next Steps

1. **Get team buy-in** on approach
2. **Create tracking ticket** with subtasks per phase
3. **Start Phase 1** (low risk, quick wins)
4. **Review after Phase 2** to validate approach before continuing
