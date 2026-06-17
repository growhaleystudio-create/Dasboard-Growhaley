/**
 * index.ts — Public API for SDUI Planner (modular refactored version)
 *
 * This module provides a modular, testable implementation of the SDUI Planner.
 *
 * Status: Phase 1 refactor complete (stub orchestrators in place)
 * - Types, config, image logic, layout catalog: ✅ fully extracted
 * - Prompt building, parsing, LLM: 🔄 stub delegates to original
 *
 * Usage:
 *   import { DefaultSduiPlanner } from './sdui-planner/index.js';
 *   const planner = new DefaultSduiPlanner(deps);
 *   const result = await planner.plan(input, signal);
 */

// Core types
export type {
  SduiPlanner,
  SduiPlannerDeps,
  SduiPlannerInput,
  SduiPlanResult,
  SduiPlannerError,
  SduiSlide,
  AspectRatio,
  SduiTypographyOverride,
} from './types.js';

// Main implementation
export { DefaultSduiPlanner } from './default-planner.js';

// Constants (useful for external validation/testing)
export {
  GEMINI_TEXT_PATH,
  HEADER_HARD_MAX,
  BODY_HARD_MAX,
  QUOTE_HARD_MAX,
  CHECKLIST_ITEM_HARD_MAX,
  COMPONENT_TYPES,
} from './config.js';

// Layout catalog (useful for external layout resolution)
export { promptLayoutCatalog, promptLayoutIds, getLayoutVariantSet } from './layout/layout-catalog.js';

// Image enforcement (useful for worker post-processing)
export {
  ensureImagePlaceholderForVisualLayers,
  ensureExplicitImageRequest,
} from './image/image-enforcer.js';

// Image detection (useful for pre-flight checks)
export { promptExplicitlyRequestsImages, promptRequestsVisualLedDeck } from './image/image-detection.js';

// Quality checking (useful for worker repair logic)
export { sduiImageRequirementIssues } from './quality/quality-checker.js';

// Parsing (useful for testing and external parsing needs)
export { parseSlides } from './parsing/slide-parser.js';
export { sanitizeComponent } from './parsing/component-sanitizer.js';

// Prompt building (useful for prompt debugging/testing)
export { buildPrompt } from './prompt/prompt-builder.js';
export { buildVariationBrief } from './prompt/variation-brief.js';
