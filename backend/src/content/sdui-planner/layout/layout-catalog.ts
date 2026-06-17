/**
 * layout-catalog.ts — Layout catalog formatter for prompt generation
 */

import type { SduiTypographyOverride } from '@leads-generator/shared';
import { migratedLayoutCatalog } from '../../layout-migration.js';
import { resolveSduiTextLimits } from '../../sdui-text-guardrails.js';

export interface PromptLayoutEntry {
  id: string;
  family: string;
  requiredComponents: string[];
  supportsImage: boolean;
  bestFor: string[];
  textLimits: any; // SduiLayoutTextLimits or Record<string, number>
}

/**
 * Returns layout catalog formatted for LLM prompt consumption.
 */
export function promptLayoutCatalog(
  _typographyOverride: SduiTypographyOverride | undefined,
): PromptLayoutEntry[] {
  return migratedLayoutCatalog().map((layout) => ({
    id: layout.id,
    family: layout.family,
    requiredComponents: layout.requiredComponents,
    supportsImage: layout.supportsImage,
    bestFor: layout.bestFor,
    textLimits: resolveSduiTextLimits(layout.id, { typography: _typographyOverride }),
  }));
}

/**
 * Returns just the layout IDs for prompt generation.
 */
export function promptLayoutIds(typographyOverride: SduiTypographyOverride | undefined): string[] {
  return promptLayoutCatalog(typographyOverride).map((layout) => layout.id);
}

/**
 * Returns the full migrated layout catalog (for LAYOUT_VARIANT_SET construction).
 */
export function getLayoutVariantSet(): Set<string> {
  return new Set<string>(migratedLayoutCatalog().map((layout) => layout.id));
}
