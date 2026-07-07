# Phase 2 Extraction Guide — prompt-builder.ts

**File:** `backend/src/content/sdui-planner/prompt/prompt-builder.ts`  
**Source:** `backend/src/content/sdui-planner.ts:419-634` (215 lines)  
**Status:** 🔄 Stub needs full extraction

---

## Dependencies to Import

```typescript
import type { SduiPlannerInput } from '../types.js';
import { buildVariationBrief } from './variation-brief.js';
import { buildContentTagsSection } from './content-tags.js';
import { buildConversationSection } from './conversation-formatter.js';
import { promptLayoutCatalog, promptLayoutIds } from '../layout/layout-catalog.js';
import { buildContentIntelligenceContext } from '../../content-intelligence-bank.js';
import { 
  migratedNoImageLayoutCatalog, 
  migratedEditorialLayoutCatalog 
} from '../../layout-migration.js';
import { promptExplicitlyRequestsImages } from '../image/image-detection.js';
import { resolveSduiTextLimits } from '../../sdui-text-guardrails.js';
```

---

## Function Signature

```typescript
export function buildPrompt(input: SduiPlannerInput): string {
  // ... 215 lines of prompt orchestration
}
```

---

## Sections to Extract (in order)

### 1. Reference Section (lines 420-443)
- Handles `referenceMode`: auto_match, manual, no_reference
- Builds `refSection` string

### 2. Repair Section (lines 445-459)
- Handles `repairMode === 'image_failure_no_image'`
- Uses `migratedNoImageLayoutCatalog()`
- Builds `repairSection` string

### 3. Editorial Bias Section (lines 461-485)
- Handles `preferEditorialLayouts`
- Uses `migratedEditorialLayoutCatalog()`
- Builds `editorialBiasSection` string

### 4. Typography Section (lines 487-490)
- Handles `typographyOverride`
- Uses `promptLayoutCatalog()` and `resolveSduiTextLimits()`
- Builds `typographySection` string

### 5. Explicit Image Section (lines 491-499)
- Handles explicit image requests
- Uses `promptExplicitlyRequestsImages()`
- Builds `explicitImageSection` string

### 6. Context Assembly (lines 500-503)
- Calls `buildContentIntelligenceContext()`
- Calls `buildVariationBrief()`
- Calls `buildContentTagsSection()`
- Calls `buildConversationSection()`

### 7. Base Prompt Template (lines 505-624)
- Large template string with:
  - System role instruction
  - Layout catalog
  - Component rules
  - Image generation rules
  - Output schema
  - Examples

### 8. Feedback/Revision Section (lines 625-632)
- Handles `feedback` and `previousSlides`
- Adds revision instructions

---

## Extraction Steps

1. **Copy lines 419-634** from `sdui-planner.ts`
2. **Add imports** listed above
3. **Replace function declaration** with export
4. **Test output** matches original with sample inputs
5. **Remove stub** delegation in prompt-builder.ts
6. **Update repair-builder.ts** to use extracted buildPrompt

---

## Testing Checklist

- [ ] Auto-match reference mode works
- [ ] Manual reference mode works
- [ ] No-reference mode works
- [ ] Repair mode generates correct prompt
- [ ] Editorial bias section appears when enabled
- [ ] Typography override reflected in limits
- [ ] Explicit image section appears when needed
- [ ] Variation brief changes per job
- [ ] Content tags propagated correctly
- [ ] Conversation context included
- [ ] Feedback/revision mode works
- [ ] Output matches original implementation

---

## Estimated Effort

- **Read & understand:** 30 min
- **Copy & adapt imports:** 15 min
- **Test & validate:** 30 min
- **Fix edge cases:** 15 min
- **Total:** ~90 minutes

---

## Notes

- This is the **most critical** function for "layout monoton" bug
- The `CREATIVE VARIATION` section (lines 509-511) is key for diversity
- The `layoutBiases` in `variation-brief.ts` drives layout selection
- Editorial layouts catalog affects output significantly

---

**Next:** After this is extracted, move to `component-sanitizer.ts` (184 lines)
