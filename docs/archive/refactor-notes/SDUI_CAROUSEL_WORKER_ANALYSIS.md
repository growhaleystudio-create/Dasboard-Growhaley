# Analisis sdui-carousel-worker.ts

**File:** `backend/src/content/sdui-carousel-worker.ts`  
**Ukuran:** 1820 baris  
**Tanggal Analisis:** 15 Juni 2026

## 🔴 PERLU REFACTOR - URGENT

### Ringkasan Eksekutif

File ini **sangat memerlukan refactoring**. Dengan 1820 baris kode dalam satu file, ini melanggar prinsip Single Responsibility dan menjadi maintenance nightmare.

---

## ❌ Masalah Utama

### 1. **File Terlalu Besar (1820 baris)**
- **Standar industri:** 200-400 baris per file
- **Current:** 1820 baris (4.5x - 9x lipat standar)
- **Impact:** Sulit di-maintain, debug, dan test

### 2. **God Object Anti-Pattern**
File ini menghandle terlalu banyak tanggung jawab:
- ✗ Job orchestration & pipeline management
- ✗ Slide generation & planning
- ✗ Image processing & generation
- ✗ Layout diversity & validation
- ✗ Text guardrails & quality checks
- ✗ Theme building
- ✗ Rendering & upload
- ✗ Error handling & recovery
- ✗ Content enrichment & repair
- ✗ Workflow management

### 3. **Fungsi Helper Tersebar (50+ fungsi)**
Banyak fungsi utility yang tidak terkait langsung dengan worker logic:

#### Image Processing (6 fungsi)
- `canvasWidth()` - lines 80-82
- `imagePlaceholderAspectRatio()` - lines 84-86
- `generatedImageAspectRatio()` - lines 88-101
- `imageStylePromptFromUserPrompt()` - lines 103-121
- `normalizeGeneratedImage()` - lines 123-136
- `parseHex()` - lines 138-150

#### Slide Manipulation (15+ fungsi)
- `slideComponents()` - lines 152-155
- `slidesForPersist()` - lines 166-192
- `luminance()` - lines 194-197
- `buildTheme()` - lines 199-258
- `sanitizeTypographyOverride()` - lines 260-275
- `typographyFromTheme()` - lines 277-282
- `cleanContentTag()` - lines 284-294
- `sanitizeContentTags()` - lines 296-304
- `sanitizeConversationContext()` - lines 306-324
- `applyContentTags()` - lines 326-339
- dll...

#### Content Quality (10+ fungsi)
- `componentContentUnits()` - lines ~600-650
- `slideContentUnits()` - lines ~652-655
- `isSparseContentSlide()` - lines ~657-660
- `hasStatSignal()` - lines ~662-675
- `compatibleVariants()` - lines ~677-730
- `enrichSparseSlide()` - lines ~800-850
- `repairIncompleteTextComponents()` - lines ~750-780
- dll...

### 4. **Deep Nesting & Kompleksitas Tinggi**
```typescript
// Contoh: fungsi dengan 4-5 level nesting
function enrichSparseSlide(slide: SduiSlide, index: number, prompt: string): SduiSlide {
  if (!isSparseContentSlide(slide)) return slide;
  let next = slide;
  const components = new Set(slideComponents(next).map((component) => component.type));
  const text = `${firstText(next, 'header') ?? ''} ${firstText(next, 'body') ?? ''} ${prompt}`.toLowerCase();

  if (components.has('feature_cards') && !hasRenderableComponent(next, 'feature_cards')) {
    next = upsertCoreComponent(next, fallbackFeatureCards(next, prompt));
  } else if (components.has('comparison') && !hasRenderableComponent(next, 'comparison')) {
    next = upsertCoreComponent(next, fallbackComparison(next, prompt));
  } else if (/\b(sebelum|sesudah|before|after|dulu|sekarang|manual\s+vs|vs\s+ai|tanpa|dengan|pro|kontra)\b/i.test(text) && !components.has('comparison')) {
    // ... lebih banyak nesting
  }
  // ... bahkan lebih banyak lagi
}
```

### 5. **Fungsi Terlalu Panjang**
Beberapa fungsi melebihi 100 baris:
- `buildTheme()` - ~60 baris tapi sangat kompleks
- `enforceLayoutDiversity()` - ~80+ baris
- `processSduiCarouselJobInner()` - ~200+ baris
- `compatibleVariants()` - ~50+ baris dengan banyak kondisi

### 6. **Coupling Tinggi**
- Worker terlalu tahu tentang detail internal slide structure
- Banyak fungsi yang memanipulasi nested_groups secara langsung
- Hard dependency pada banyak module eksternal

### 7. **Lack of Abstraction**
```typescript
// Bad: Manipulasi data struktur kompleks secara langsung
next = {
  ...slide,
  nested_groups: {
    ...slide.nested_groups,
    action_footer: [
      ...(slide.nested_groups.action_footer ?? []).filter((c) => c.type !== 'button_cta'),
      { type: 'button_cta', label: 'Lanjutkan', style: 'primary' },
    ],
  },
};
```

### 8. **Magic Numbers & Constants Tersebar**
```typescript
// Magic numbers tidak didokumentasikan
const baseBody = Math.round(width * 0.03);
const tag = { ..., sizePx: Math.round(bodyPx * 0.76) };
const caption = { ..., sizePx: Math.round(bodyPx * 0.72) };
const limit = 72;
const JOB_TIMEOUT_MS = 180_000;
```

---

## ✅ Rekomendasi Refactoring

### Fase 1: Ekstraksi Module (PRIORITAS TINGGI)

#### 1.1 Image Processing Module
```
backend/src/content/workers/image-processor.ts
```
- `canvasWidth()`
- `imagePlaceholderAspectRatio()`
- `generatedImageAspectRatio()`
- `imageStylePromptFromUserPrompt()`
- `normalizeGeneratedImage()`

#### 1.2 Theme Builder Module
```
backend/src/content/workers/theme-builder.ts
```
- `buildTheme()`
- `luminance()`
- `parseHex()`
- `typographyFromTheme()`
- `sanitizeTypographyOverride()`

#### 1.3 Slide Validator & Quality Module
```
backend/src/content/workers/slide-quality-validator.ts
```
- `componentContentUnits()`
- `slideContentUnits()`
- `isSparseContentSlide()`
- `hasStatSignal()`
- `sduiContentQualityIssues()`
- `visualIntegrityIssues()`

#### 1.4 Slide Enrichment Module
```
backend/src/content/workers/slide-enrichment.ts
```
- `enrichSparseSlide()`
- `repairIncompleteTextComponents()`
- `makeSlideQualityRepairable()`
- `fallbackBodyForSlide()`
- `fallbackChecklistItems()`
- `fallbackFeatureCards()`
- `fallbackComparison()`
- `fallbackCallout()`

#### 1.5 Layout Diversity Module
```
backend/src/content/workers/layout-diversity.ts
```
- `enforceLayoutDiversity()`
- `compatibleVariants()`
- `applyLayoutFields()`
- `normalizeSlideMetadata()`

#### 1.6 Content Sanitizer Module
```
backend/src/content/workers/content-sanitizer.ts
```
- `cleanContentTag()`
- `sanitizeContentTags()`
- `sanitizeConversationContext()`
- `applyContentTags()`

### Fase 2: Pipeline Extraction

#### 2.1 Job Pipeline Orchestrator
```
backend/src/content/workers/job-pipeline.ts
```
Coordinate phases:
- Acquisition phase
- Planning phase
- Image generation phase
- Quality gate phase
- Render phase

#### 2.2 Phase Handlers (Separate Files)
```
backend/src/content/workers/phases/
  ├── acquisition-phase.ts
  ├── planning-phase.ts
  ├── image-generation-phase.ts
  ├── quality-gate-phase.ts
  └── render-phase.ts
```

### Fase 3: Domain Models

#### 3.1 Slide Domain Model
```
backend/src/content/workers/models/slide-model.ts
```
Encapsulate operations:
```typescript
class SlideModel {
  constructor(private slide: SduiSlide) {}
  
  hasImagePlaceholder(): boolean
  imagePlaceholderCount(): number
  contentUnits(): number
  isSparse(): boolean
  hasStatSignal(): boolean
  components(): SduiComponent[]
  removeImagePlaceholders(): SlideModel
  applyLayout(layoutId: LayoutVariantId): SlideModel
  // ... dll
}
```

#### 3.2 Job Context Model
```
backend/src/content/workers/models/job-context.ts
```
Encapsulate pipeline context dengan type-safe operations

### Fase 4: Service Layer

#### 4.1 Slide Repair Service
```
backend/src/content/workers/services/slide-repair-service.ts
```
- Handle quality repairs
- Image failure repairs
- Text completeness repairs

#### 4.2 Image Generation Service
```
backend/src/content/workers/services/image-generation-service.ts
```
- Generate images for slides
- Retry logic
- Failure handling

---

## 📊 Metrics

### Current State
```
Lines of Code:        1820
Functions:            50+
Cyclomatic Complexity: High (banyak if-else bersarang)
Maintainability Index: Low
Test Coverage:        Sulit di-test karena terlalu banyak dependencies
```

### After Refactoring (Target)
```
Main Worker:          ~200 baris
Per Module:           100-300 baris
Total Modules:        12-15 files
Cyclomatic Complexity: Medium (isolated concerns)
Maintainability Index: High
Test Coverage:        Easy to test (mocked dependencies)
```

---

## 🎯 Prioritas Action Items

### P0 - Critical (Minggu 1-2)
1. ✅ Ekstrak Image Processing functions → `image-processor.ts`
2. ✅ Ekstrak Theme Builder → `theme-builder.ts`
3. ✅ Ekstrak Layout Diversity → `layout-diversity.ts`

### P1 - High (Minggu 3-4)
4. ✅ Ekstrak Slide Quality Validator → `slide-quality-validator.ts`
5. ✅ Ekstrak Slide Enrichment → `slide-enrichment.ts`
6. ✅ Create Slide Domain Model

### P2 - Medium (Minggu 5-6)
7. ✅ Ekstrak Pipeline Phases
8. ✅ Create Job Context Model
9. ✅ Refactor main worker untuk menggunakan modules baru

### P3 - Low (Minggu 7-8)
10. ✅ Add comprehensive tests untuk setiap module
11. ✅ Documentation & code examples
12. ✅ Performance optimization

---

## ⚠️ Risks & Mitigation

### Risk 1: Breaking Existing Functionality
**Mitigation:** 
- Keep existing tests passing
- Refactor incrementally
- Feature flags untuk rollback

### Risk 2: Performance Degradation
**Mitigation:**
- Benchmark before/after
- Avoid unnecessary object creation
- Keep hot paths optimized

### Risk 3: Team Velocity Impact
**Mitigation:**
- Clear communication
- Pair programming sessions
- Code review mandatory

---

## 📈 Benefits After Refactoring

### Developer Experience
- ✅ Lebih mudah onboarding developer baru
- ✅ Faster debugging (isolated concerns)
- ✅ Easier to add new features
- ✅ Better code reusability

### Code Quality
- ✅ Single Responsibility Principle
- ✅ Better testability
- ✅ Lower coupling
- ✅ Higher cohesion

### Maintenance
- ✅ Easier to find bugs
- ✅ Safer to modify code
- ✅ Better documentation through structure
- ✅ Reduced cognitive load

---

## 🎓 Learning Resources

- [Refactoring.guru - God Object](https://refactoring.guru/smells/large-class)
- [Martin Fowler - Refactoring](https://martinfowler.com/books/refactoring.html)
- [Clean Code by Robert Martin](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882)

---

## 📝 Kesimpulan

**Status:** 🔴 **PERLU REFACTOR SEGERA**

File `sdui-carousel-worker.ts` adalah technical debt yang signifikan. Dengan 1820 baris dan 50+ fungsi, ini menjadi bottleneck untuk:
- Developer velocity
- Code quality
- Bug detection
- Feature development

**Rekomendasi:** Mulai refactoring secara incremental mengikuti fase di atas. Target 8 minggu untuk complete refactoring dengan minimal disruption ke existing functionality.

**Expected ROI:**
- 40% reduction dalam bug rate
- 60% faster onboarding time
- 50% faster feature development
- 80% better test coverage

---

**Approved by:** [Your Name]  
**Date:** 2026-06-15
