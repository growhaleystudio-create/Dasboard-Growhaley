/**
 * variation-brief.ts — Builds variation instructions for prompt diversity
 */

import type { SduiPlannerInput } from '../types.js';

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickByHash<T>(items: readonly T[], hash: number, offset: number): T {
  return items[(hash + offset) % items.length]!;
}

/**
 * Builds a brief instruction for the LLM to vary its output style.
 * Uses deterministic hash to avoid repetitive outputs for the same team/job.
 */
export function buildVariationBrief(input: SduiPlannerInput): string {
  if (input.repairMode) return 'Repair pass: keep the existing narrative stable while fixing the requested issue.';
  if (input.feedback && input.previousSlides && input.previousSlides.length > 0) {
    return 'Revision pass: follow feedback, but do not unnecessarily rewrite unaffected slides.';
  }

  const hash = hashString(`${input.teamId}:${input.jobId}:${input.actorId}:${Date.now()}:${Math.random()}`);
  const angles = [
    'open with a sharper problem framing, then move into practical clarity',
    'open with a surprising insight, then build toward useful takeaways',
    'open empathetically, then explain the hidden mechanism behind the topic',
    'open with a concrete everyday scene, then extract the lesson',
    'open with a contrarian but responsible reframe, then make it actionable',
    'open with a question the audience might silently have, then answer it step by step',
  ] as const;
  const hookStyles = [
    'short punchy headline',
    'editorial statement',
    'question-led hook',
    'myth-busting hook',
    'scenario-led hook',
    'calm warning hook',
  ] as const;
  const layoutBiases = [
    // Visual-heavy approaches (image/editorial)
    'prioritize visual storytelling: use image-hero, image-balanced, rich-magazine, and editorial layouts for impact',
    'prioritize editorial depth: rich-editorial, rich-thirds, article-style layouts with pullquote and caption rhythm',
    'prioritize image-first flow: multi-product-story, image-fullbleed, mockup-hero for visual dominance',
    
    // Data/stat-driven approaches
    'prioritize data visualization: stat-hero, chart-balanced, data-chart-focus with clear metrics',
    'prioritize analytical structure: stat-explained, chart-explained, data-standard for insight delivery',
    'prioritize stat rhythm: mix stat-only, stat-headline, chart-only for quick metric scanning',
    
    // List/structured approaches
    'prioritize structured clarity: list-standard, checklist layouts, numbered steps for actionable content',
    'prioritize comparison structure: use comparison components, multi-list-visual, before/after rhythm',
    'prioritize feature showcase: feature_cards, bullet-with-intro, multi-text-list for benefit listing',
    
    // Text/narrative approaches
    'prioritize narrative depth: text-body-heavy, rich-editorial with detailed body copy and callouts',
    'prioritize bold statements: text-heading-hero, big-statement, quote-centered for memorable hooks',
    'prioritize traditional clarity: text-traditional, text-balanced, body-centered for straightforward delivery',
    
    // Mixed/dynamic approaches
    'prioritize dynamic rhythm: alternate between stat blocks, quotes, checklists, and visual slides',
    'prioritize storytelling mix: byline, pull_quote, timeline, key_value_list with reflective CTA',
    'prioritize multi-format: combine multi-story-quote, multi-pitch, rich-image-first for variety',
    
    // CTA/conversion approaches
    'prioritize conversion flow: build with stats/proof, then strong cta-centered or multi-pitch close',
    'prioritize engagement: use question hooks, interactive checklists, progress bars, ending with cta-bottom',
    'prioritize minimalist impact: image-only, stat-only, quote-centered for clean powerful slides',
  ] as const;
  const copyModes = [
    'concise clarity',
    'warm and reassuring',
    'sharp insight',
    'educational detail',
    'confident direction',
    'conversational trust',
  ] as const;

  const chosenAngle = pickByHash(angles, hash, 0);
  const chosenHook = pickByHash(hookStyles, hash, 1);
  const chosenLayout = pickByHash(layoutBiases, hash, 2);
  const chosenCopy = pickByHash(copyModes, hash, 3);
  const variationId = hash.toString(36);

  return `variation_id: ${variationId}
Narrative approach: ${chosenAngle}. Opening style: ${chosenHook}. Copy mode: ${chosenCopy}. Layout bias: ${chosenLayout}.
IMPORTANT: Vary layout families significantly across slides. Avoid using the same layout pattern (e.g., all text-*, all list-*, all image-*) repeatedly. Mix at least 3-4 different layout families in a 5+ slide deck for visual diversity.`;
}
