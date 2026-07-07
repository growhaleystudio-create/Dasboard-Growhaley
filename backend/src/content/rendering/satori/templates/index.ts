import type { LegacyLayoutVariantId, SduiSlide } from '@leads-generator/shared';

import type { Node } from '../primitives.js';
import { templateRegistry } from '../template-registry.js';
import type { Tokens } from '../tokens.js';
import { registerGrowhaleyTemplates } from './growhaley.js';

let templatesRegistered = false;

function ensureTemplatesRegistered(): void {
  if (templatesRegistered) return;
  registerGrowhaleyTemplates();
  templatesRegistered = true;
}

/**
 * Forgiving fallbacks within the Growhaley set — used only if a renderer is
 * ever disabled; every catalog id has a direct renderer today.
 */
const TEMPLATE_FALLBACKS: Partial<Record<LegacyLayoutVariantId, LegacyLayoutVariantId>> = {
  gw_photo_rotated: 'gw_photo_statement',
  gw_collage_showcase: 'gw_photo_statement',
};

function resolveRenderer(id: LegacyLayoutVariantId) {
  const direct = templateRegistry.get(id);
  if (direct) return direct;

  const fallbackId = TEMPLATE_FALLBACKS[id];
  if (!fallbackId) return undefined;
  return templateRegistry.get(fallbackId);
}

export async function renderTemplate(id: LegacyLayoutVariantId, slide: SduiSlide, tk: Tokens): Promise<Node> {
  ensureTemplatesRegistered();
  const renderer = resolveRenderer(id);
  if (!renderer) {
    throw new Error(`missing_template_renderer:${id}`);
  }
  return await renderer(slide, tk);
}
