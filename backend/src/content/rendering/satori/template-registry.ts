import type { SduiSlide } from '@leads-generator/shared';

import type { Node } from './primitives.js';
import type { Tokens } from './tokens.js';

// Local type alias for layout variant IDs (string-based)
type LayoutVariantId = string;

export type TemplateRenderer = (slide: SduiSlide, tk: Tokens) => Promise<Node> | Node;

export const templateRegistry = new Map<LayoutVariantId, TemplateRenderer>();
