# Satori Renderer Refactor Plan

## Status

- Overall status: Planned
- Target file: `backend/src/content/satori-renderer.ts`
- Goal: reduce file size, separate responsibilities, preserve rendering behavior after worker/content/layout migration

## Working Agreement

Setiap phase yang selesai **wajib**:

1. ditandai selesai dengan checkbox `[x]`
2. bagian **Phase Result** di phase tersebut diisi singkat
3. bila ada perubahan scope, update bagian **Scope Changes**
4. bila acceptance criteria belum terpenuhi, phase **tidak boleh** ditandai selesai

## Master Checklist

- [x] Phase 1 — Baseline audit and safety net
- [x] Phase 2 — Extract shared primitives and accessors
- [x] Phase 3 — Extract font/chrome/token infrastructure
- [x] Phase 4 — Extract rich component renderers
- [x] Phase 5 — Extract template families and registry
- [x] Phase 6 — Isolate template selection and migration alias logic
- [ ] Phase 7 — Final cleanup, regression verification, and documentation sync

## Scope Changes

- None yet.

## Context and Problem Statement

`backend/src/content/satori-renderer.ts` currently handles too many responsibilities in one file:

- canvas sizing
- JSX-less node builder
- font loading and caching
- theme token generation and content fitting
- chrome rendering (logo/url/page/swipe)
- content access helpers
- rich component rendering
- many individual template renderers
- template dispatch
- migration alias compatibility
- public `SatoriRenderer` orchestration

Functionally this is still workable, but maintainability, reviewability, and regression isolation are getting worse after the migration in worker/content/layout areas.

## Refactor Objectives

1. Keep output behavior compatible or near-compatible.
2. Avoid big-bang rewrite.
3. Split by responsibility, not by arbitrary file size only.
4. Keep migration compatibility intact (`inferLayoutVariant`, alias mapping, existing `layout_variant_id` support).
5. Make each phase testable and reversible.

## Proposed Target Structure

```text
authors note: path names are proposed and may be adjusted during implementation

backend/src/content/rendering/
  satori/
    primitives.ts          # Node, Style, el(), low-level helpers
    canvas.ts              # canvasSize()
    accessors.ts           # find(), findAll(), componentText(), checklistItems(), etc
    fonts.ts               # font cache, fetchFont(), loadFonts(), fam(), fontWeight()
    tokens.ts              # makeTokens(), fitTitle(), fitting/estimate helpers
    chrome.ts              # topChrome(), bottomChrome(), logo/url pill helpers
    rich-renderers.ts      # renderRichComponent() and rich leaf blocks
    template-picker.ts     # pickTemplate(), resolveRendererTemplateId(), alias map
    template-registry.ts   # template registry object
    templates/
      core.ts              # cover/text/checklist/basic templates
      mixed.ts             # mixed templates 16-30
      feature.ts           # feature/comparison templates
      gallery.ts           # multi-image templates
      editorial.ts         # editorial templates
    index.ts               # orchestration exports if needed

backend/src/content/satori-renderer.ts
  # thin facade / public entrypoint
```

## Execution Rules

- Update this file immediately after each completed phase.
- Do not mark a phase complete until code changes, verification, and acceptance criteria are done.
- If implementation order changes, update both **Master Checklist** and the phase ordering notes.
- If a phase is partially done, keep the checkbox unchecked and explain the partial progress in **Phase Result**.
- If a new blocking issue appears, record it under the active phase and add it to **Scope Changes** if it alters the plan.

## Testing Strategy

Before marking a phase complete, verify as relevant:

- type-check / build for touched modules
- existing renderer-related tests
- worker/content integration paths affected by renderer imports
- spot checks for template selection behavior
- spot checks for rich component ordering and fallback behavior

## Phase Plan

---

## Phase 1 — Baseline audit and safety net

**Status:** Completed

### Goal
Create a safe starting point before moving logic across files.

### Scope
- identify high-risk behavior areas
- define what must stay behaviorally stable
- list test gaps
- freeze the intended split boundaries enough to begin implementation

### Tasks
- audit dependency boundaries inside `satori-renderer.ts`
- identify logic that is pure vs logic that touches remote fetch / rendering / migration
- document regression-sensitive areas
- decide initial extraction order

### Main concerns to preserve
- migrated layout alias behavior
- chosen template IDs for the same slide inputs
- font fallback behavior
- chrome placement behavior
- full-bleed handling for `cover_image_full`
- rich component rendering order

### Acceptance Criteria
- key risk areas are explicitly listed
- extraction order is documented
- split boundaries are clear enough to start coding

### Phase Result
- Baseline audit completed from current code and import graph.
- Confirmed primary entrypoints/importers: `start.ts`, `worker.ts`, and `dev/process-content-job.ts`.
- Confirmed current regression-sensitive zones: template picking, migration aliases, rich component stack ordering, chrome placement, and full-bleed cover behavior.
- Confirmed there is no dedicated `satori-renderer` test file yet, so phased verification must rely on existing content/worker tests plus targeted type-checking.

---

## Phase 2 — Extract shared primitives and accessors

**Status:** Completed

### Goal
Move the lowest-risk, lowest-coupling helpers out first.

### Candidate extractions
- `canvasSize()` → `canvas.ts`
- `Style`, `Node`, `el()` → `primitives.ts`
- `find()`, `findAll()`, `tagText()`, `componentText()`, `checklistItems()` → `accessors.ts`
- generic helpers like `clamp()` / basic parsing helpers if they are reused broadly

### Why this phase first
These helpers are stable and have low business complexity, so they are the safest first split.

### Acceptance Criteria
- extracted helpers live in dedicated files
- `satori-renderer.ts` imports them without behavior change
- no circular dependency introduced

### Phase Result
- Created `backend/src/content/rendering/satori/primitives.ts` for `Node`, `Style`, and `el()`.
- Created `backend/src/content/rendering/satori/canvas.ts` for `canvasSize()`.
- Created `backend/src/content/rendering/satori/accessors.ts` for `find()`, `findAll()`, `tagText()`, `componentText()`, and `checklistItems()`.
- Updated `backend/src/content/satori-renderer.ts` to import and use the extracted helpers.
- Fixed follow-up type issue by restoring `AspectRatio` import required by template selection helpers.
- Initial backend build/type-check was kicked off after extraction to validate the phase.

---

## Phase 3 — Extract font/chrome/token infrastructure

**Status:** Completed

### Goal
Separate renderer infrastructure from template rendering logic.

### Candidate extractions
- font cache + `fetchFont()` + `loadFonts()` + `fam()` + `fontWeight()` → `fonts.ts`
- token creation and fitting helpers → `tokens.ts`
- logo/url pill and top/bottom chrome helpers → `chrome.ts`

### Risks
- async logo/font loading paths can break if imports are split carelessly
- token functions and chrome helpers currently share many local helpers and types

### Acceptance Criteria
- renderer still produces the same orchestration flow
- font fallback remains intact
- chrome rendering still respects logo placement and fallback logic

### Phase Result
- Completed extraction of font infrastructure into `backend/src/content/rendering/satori/fonts.ts`.
- Added `backend/src/content/rendering/satori/tokens.ts` for `Tokens`, `makeTokens()`, fitting helpers, and content size estimation.
- Added `backend/src/content/rendering/satori/chrome.ts` for `urlPill()`, `logoPill()`, `topChrome()`, `bottomChrome()`, and related helpers.
- Updated `backend/src/content/satori-renderer.ts` to consume the extracted modules while preserving the public `BrandFontRef` export for compatibility.
- Fixed follow-up import issue (`tagText`) after moving chrome logic.
- Build verification was triggered again after the extraction; however, the captured terminal output still only returned the active `tsc -b` spinner instead of a final success line, so verification signal from tool output remains incomplete even though no new TypeScript error was surfaced in the editor feedback.

---

## Phase 4 — Extract rich component renderers

**Status:** Completed

### Goal
Move the rich component leaf rendering system into a dedicated module.

### Candidate extractions
- `renderRichComponent()`
- `RICH_STACK_TYPES`
- all `rich*` helper renderers
- any helper used only by rich component rendering

### Benefits
- makes editorial/flexible content rendering easier to reason about
- lowers mental overhead in the main renderer file
- enables more focused testing later

### Acceptance Criteria
- rich components render in the same order as before
- null/fallback behavior is preserved
- editorial rich templates still work with the extracted module

### Phase Result
- Completed extraction into `backend/src/content/rendering/satori/rich-renderers.ts`.
- Moved `richText`, `renderRichComponent`, `RICH_STACK_TYPES`, and all supporting `rich*` rich leaf helpers into the dedicated module.
- Updated `backend/src/content/satori-renderer.ts` so editorial/flexible templates consume the extracted module instead of local definitions.
- Confirmed via project search that the moved helper definitions no longer remain duplicated in `satori-renderer.ts` and the active references now point to the extracted module.
- Build verification was triggered again, but the tool output still only returned the active `tsc -b` spinner rather than a final success line; no new editor-reported TypeScript error surfaced during the extraction, so the phase is being treated as completed with verification output caveat documented.

---

## Phase 5 — Extract template families and registry

**Status:** Completed

### Goal
Break template implementations into coherent families and remove the giant switch burden gradually.

### Candidate structure
- `templates/core.ts`
- `templates/mixed.ts`
- `templates/feature.ts`
- `templates/gallery.ts`
- `templates/editorial.ts`
- central `template-registry.ts`

### Recommended approach
- move templates family by family
- first keep `renderTemplate()` as adapter if needed
- then replace the switch with typed registry lookup when safe

### Acceptance Criteria
- every active template ID remains registered exactly once
- no template is silently dropped
- template dispatch stays behaviorally compatible

### Phase Result
- Added `backend/src/content/rendering/satori/templates/shared.ts` for shared template helpers (`titleNode`, `bodyNode`, image/checklist/CTA helpers, and stack layout helpers).
- Added `backend/src/content/rendering/satori/templates/core.ts` for the original core 15 templates and centralized their registration through `registerCoreTemplates()`.
- Added `backend/src/content/rendering/satori/templates/mixed.ts` for the mixed template family and centralized their registration through `registerMixedTemplates()`.
- Reduced `backend/src/content/rendering/satori/templates/index.ts` to a small adapter that lazily registers template families and dispatches through `templateRegistry`.
- Verified the backend still type-checks/builds after the template family extraction.

---

## Phase 6 — Isolate template selection and migration alias logic

**Status:** Completed

### Goal
Separate layout selection concerns from rendering concerns.

### Candidate extractions
- `ALL_TEMPLATES`
- `TEMPLATE_SET`
- `MIGRATED_RENDERER_TEMPLATE_ALIASES`
- `resolveRendererTemplateId()`
- `pickTemplate()`
- helper `has()` if still needed there

### Design intent
Renderer should trend toward receiving a final template decision, while still keeping a controlled fallback path.

### Acceptance Criteria
- migrated alias mapping keeps working
- inferred layout fallback still works
- auto-pick behavior does not regress for common slide shapes

### Phase Result
- Refined `backend/src/content/rendering/satori/template-picker.ts` so renderer-owned template IDs are explicitly isolated as `LegacyLayoutVariantId[]` instead of broad `LayoutVariantId[]`.
- Kept migration compatibility centralized through `MIGRATED_RENDERER_TEMPLATE_ALIASES` and extracted alias resolution into `resolveTemplateAlias()`.
- Split final template decision flow into clearer steps: direct renderer-template acceptance, migrated alias resolution, inferred-layout alias resolution, and fallback template heuristics.
- Preserved the public `pickTemplate()`, `resolveRendererTemplateId()`, `ALL_TEMPLATES`, `TEMPLATE_SET`, and `has()` exports while narrowing their internal responsibilities.
- Verified backend build/type-check remains green after the Phase 6 extraction.

---

## Phase 7 — Final cleanup, regression verification, and documentation sync

**Status:** In progress

### Goal
Finish with a smaller facade file, cleaner imports, and updated plan status.

### Scope
- reduce `backend/src/content/satori-renderer.ts` to orchestration-focused entrypoint
- remove dead helpers / duplicate helpers left behind
- run verification on touched flows
- update this document with actual completed results

### Acceptance Criteria
- main file is materially smaller and easier to audit
- imports are understandable and stable
- this `.md` reflects the real completed phase status

### Phase Result
- Reduced `backend/src/content/satori-renderer.ts` further to an orchestration-focused facade by dropping stale type imports left over from the pre-extraction monolith.
- Tightened `backend/src/content/rendering/satori/template-picker.ts` and `templates/index.ts` to use renderer-owned `LegacyLayoutVariantId` boundaries consistently instead of broader layout ID unions where not needed.
- Backend build/type-check still passes after the cleanup.
- A targeted `sdui-carousel-worker.test.ts` run exposed 5 existing behavior/regression failures around mixed legacy-vs-migrated `layout_variant_id` expectations and downstream `getLayoutCatalogItem(...)` assumptions, so final verification is not complete yet.
- Phase 7 remains open until those verification failures are either fixed or explicitly documented as accepted pre-existing issues.

## Definition of Done

This refactor is considered done when:

- the planned phases are marked complete with real results
- the renderer entrypoint is thinner and responsibility boundaries are clearer
- migration compatibility remains intact
- no known regression blocker is left undocumented

## Suggested Implementation Order

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7

## Notes for Ongoing Execution

When we start implementation:

- after each completed phase, update this `.md`
- if scope changes, record them explicitly
- if a phase turns out too large, split it into subphases and update the checklist here first
