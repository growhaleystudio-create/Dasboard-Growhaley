/**
 * image-context-builder.ts — Builds image context strings for AI generation
 */

/**
 * Extracts a compact image context string from the user's prompt.
 */
export function imageContextFromPrompt(prompt: string): string {
  const compactPrompt = prompt.slice(0, 200).toLowerCase();
  return compactPrompt;
}

/**
 * Builds a detailed image context string from visual layer metadata.
 */
export function visualLayerImageContext(
  visualLayer: string | undefined,
  prompt: string,
): string | undefined {
  const visualLayerNormalized = visualLayer?.toLowerCase().trim();
  if (!visualLayerNormalized) return undefined;

  const brief = imageContextFromPrompt(prompt);
  const treatment = visualLayerNormalized;
  const base = `${treatment} style, context: ${brief}`;

  return base;
}
