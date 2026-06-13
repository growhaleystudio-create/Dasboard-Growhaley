/**
 * Content_Plan_Validator — pure, deterministic, no I/O.
 *
 * Validates a ContentPlan against MasterTemplateRules (aturan keras):
 *   1. aspectRatio ∈ rules.aspectRatios
 *   2. slides.length ≤ rules.maxSlides  (and ≥ 1)
 *   3. Per-slide: each block.type ∈ rules.allowedBlocks
 *   4. Per-block: text.length ≤ rules.textLimits[block.type] (if limit exists)
 *   5. chart blocks require chartDataRef
 *   6. mockup blocks require mockupRef
 *   7. Each slide must have at least one block
 *
 * Validation is ALWAYS against Master_Template — Approved_Examples are
 * irrelevant here (master-menang, R9.2).
 *
 * Non-JSON / structural mismatches are handled by `parseContentPlan`.
 *
 * Design: Components and Interfaces → Content_Plan_Validator
 * Requirements: 4.1, 4.2, 9.2
 */

import { z } from 'zod';
import type {
  ContentPlan,
  MasterTemplateRules,
  AspectRatio,
  BlockType,
} from '@leads-generator/shared';
import type { Result } from '@leads-generator/shared';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ValidationOutcome {
  /** True iff `errors` is empty. */
  valid: boolean;
  /** All validation messages. Empty when valid. */
  errors: string[];
}

export interface ContentPlanValidator {
  /**
   * Pure, synchronous, no I/O. Same inputs → same output (deterministic).
   * Collects ALL errors rather than stopping at the first.
   */
  validate(plan: ContentPlan, rules: MasterTemplateRules): ValidationOutcome;
}

// ---------------------------------------------------------------------------
// Zod schema for `parseContentPlan`
// ---------------------------------------------------------------------------

const ASPECT_RATIOS: readonly AspectRatio[] = ['1:1', '4:5', '9:16'];
const BLOCK_TYPES: readonly BlockType[] = [
  'heading',
  'body',
  'mockup',
  'chart',
  'quote',
  'stat',
  'bullet',
  'cta',
  'image',
];

const ContentPlanBlockSchema = z.object({
  type: z.enum(BLOCK_TYPES as [BlockType, ...BlockType[]]),
  text: z.string().optional(),
  chartDataRef: z.string().optional(),
  mockupRef: z.string().optional(),
  imageRef: z.string().optional(),
});

const ContentPlanSlideSchema = z.object({
  index: z.number().int().min(0),
  layoutVariantHint: z.string().optional(),
  blocks: z.array(ContentPlanBlockSchema),
});

const ContentPlanSchema = z.object({
  aspectRatio: z.enum(ASPECT_RATIOS as [AspectRatio, ...AspectRatio[]]),
  slides: z.array(ContentPlanSlideSchema),
});

// ---------------------------------------------------------------------------
// parseContentPlan — helper to parse raw JSON from the Planner
// ---------------------------------------------------------------------------

/**
 * Parses a raw value (from Planner output) into a `ContentPlan`.
 *
 * Returns `{ ok: false }` if the value is not structurally valid JSON
 * matching the `ContentPlan` shape.
 */
export function parseContentPlan(raw: unknown): Result<ContentPlan> {
  const result = ContentPlanSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        messages: [`ContentPlan parse failed: ${result.error.message}`],
      },
    };
  }
  // Zod output is structurally compatible with ContentPlan (same shape).
  return { ok: true, value: result.data as ContentPlan };
}

// ---------------------------------------------------------------------------
// DefaultContentPlanValidator
// ---------------------------------------------------------------------------

export class DefaultContentPlanValidator implements ContentPlanValidator {
  validate(plan: ContentPlan, rules: MasterTemplateRules): ValidationOutcome {
    // Collect ALL errors — never stop at first.
    const errors: string[] = [];

    // 1. aspectRatio ∈ rules.aspectRatios
    if (!rules.aspectRatios.has(plan.aspectRatio)) {
      errors.push(
        `aspectRatio '${plan.aspectRatio}' is not in the allowed set: ${[...rules.aspectRatios].join(', ')}`,
      );
    }

    // 2. slides.length ≤ rules.maxSlides
    if (plan.slides.length > rules.maxSlides) {
      errors.push(
        `Plan has ${plan.slides.length} slides but maxSlides is ${rules.maxSlides}`,
      );
    }

    // 2b. at least one slide
    if (plan.slides.length === 0) {
      errors.push('Plan must have at least one slide');
    }

    // 3–7. Per-slide validation
    for (const slide of plan.slides) {
      // 7. Each slide must have at least one block
      if (slide.blocks.length === 0) {
        errors.push(`Slide ${slide.index}: must have at least one block`);
      }

      for (const block of slide.blocks) {
        // 3. block.type ∈ rules.allowedBlocks
        if (!rules.allowedBlocks.has(block.type)) {
          errors.push(
            `Slide ${slide.index}: block type '${block.type}' is not in allowedBlocks`,
          );
        }

        // 4. text length ≤ limit
        if (block.text !== undefined) {
          const limit = rules.textLimits.get(block.type);
          if (limit !== undefined && block.text.length > limit) {
            errors.push(
              `Slide ${slide.index}, block '${block.type}': text length ${block.text.length} exceeds limit ${limit}`,
            );
          }
        }

        // 5. chart → chartDataRef required
        if (block.type === 'chart' && !block.chartDataRef) {
          errors.push(
            `Slide ${slide.index}: block type 'chart' requires chartDataRef`,
          );
        }

        // 6. mockup → mockupRef required
        if (block.type === 'mockup' && !block.mockupRef) {
          errors.push(
            `Slide ${slide.index}: block type 'mockup' requires mockupRef`,
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

/** Singleton instance for convenience. */
export const defaultContentPlanValidator = new DefaultContentPlanValidator();
