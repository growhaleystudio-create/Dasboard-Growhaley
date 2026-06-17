/**
 * image-utils.ts
 * 
 * Image-related utility functions for SDUI carousel worker.
 * Handles canvas sizing, aspect ratio calculations, and image normalization.
 */

import sharp from 'sharp';
import type { AspectRatio, SduiSlide } from '@leads-generator/shared';

/**
 * Get canvas width for a given aspect ratio.
 * All supported aspect ratios use a 1080px-wide canvas.
 */
function canvasWidth(aspectRatio: AspectRatio): number {
  return 1080;
}

/**
 * Determine the aspect ratio for an image placeholder in a slide.
 * Cover-full layouts match canvas aspect, others use 1:1.
 */
function imagePlaceholderAspectRatio(slide: SduiSlide, canvasAspectRatio: AspectRatio): AspectRatio {
  return slide.layout_variant_id === 'cover_image_full' ? canvasAspectRatio : '1:1';
}

/**
 * Determine the aspect ratio for a generated image based on layout.
 * Some layouts require specific aspect ratios for optimal display.
 */
function generatedImageAspectRatio(slide: SduiSlide, canvasAspectRatio: AspectRatio): AspectRatio {
  if (slide.layout_variant_id === 'cover_image_full') return canvasAspectRatio;
  
  // Multi-image layouts need specific aspect ratios
  if (
    slide.layout_variant_id === 'dual_image_comparison' ||
    slide.layout_variant_id === 'product_angle_pair' ||
    slide.layout_variant_id === 'use_case_gallery_2up' ||
    slide.layout_variant_id === 'problem_solution_visual_pair' ||
    slide.layout_variant_id === 'dos_donts_visual_pair' ||
    slide.layout_variant_id === 'real_estate_room_pair'
  ) {
    return canvasAspectRatio === '9:16' ? '4:5' : '1:1';
  }
  
  return '1:1';
}

/**
 * Extract image style hints from user prompt.
 * Supports both explicit style declarations and keyword detection.
 */
function imageStylePromptFromUserPrompt(prompt: string): string | undefined {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  
  // Check for explicit style declaration
  const explicitStyle = compact.match(
    /(?:style(?:\s+image|\s+gambar)?|gaya(?:\s+gambar|\s+visual)?|dengan\s+gaya|buat\s+style(?:\s+image|\s+gambar)?)\s*[:=,-]?\s*(.+)$/i,
  )?.[1]?.trim();
  
  if (explicitStyle) return explicitStyle.slice(0, 180);

  // Detect style keywords
  const styleKeywords = [
    'doodle', 'minimalist', 'minimalis', 'watercolor', 'flat vector', 'vector',
    'soft 3d', '3d', 'photorealistic', 'realistic', 'anime', 'sticker',
    'isometric', 'clay', 'pixel art', 'line art',
  ];
  
  const lower = compact.toLowerCase();
  const matches = styleKeywords.filter((keyword) => lower.includes(keyword));
  
  // Check for transparent/no-background request
  if (/\b(transparent|transparan|no background|tanpa background|cutout|isolated)\b/i.test(compact)) {
    matches.push('transparent no-background cutout');
  }
  
  return matches.length > 0 ? [...new Set(matches)].join(', ') : undefined;
}

/**
 * Normalize a generated image to the required dimensions and aspect ratio.
 * Handles both square (1:1) and other aspect ratios.
 */
async function normalizeGeneratedImage(
  image: Buffer,
  slide: SduiSlide,
  canvasAspectRatio: AspectRatio,
  width: number,
): Promise<Buffer> {
  // Square images need explicit contain fit with transparent background
  if (imagePlaceholderAspectRatio(slide, canvasAspectRatio) === '1:1') {
    return sharp(image)
      .resize(width, width, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  // Other aspect ratios: resize width only, preserve aspect ratio
  return sharp(image)
    .resize(width, undefined, { withoutEnlargement: true })
    .png()
    .toBuffer();
}

/**
 * Parse hex color string to RGB components.
 * Supports both 3-digit (#RGB) and 6-digit (#RRGGBB) formats.
 */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const c = hex.replace(/^#/, '');
  
  // 3-digit format: #RGB
  if (c.length === 3) {
    const r = parseInt(c[0]! + c[0], 16);
    const g = parseInt(c[1]! + c[1], 16);
    const b = parseInt(c[2]! + c[2], 16);
    return Number.isNaN(r) ? null : { r, g, b };
  }
  
  // 6-digit format: #RRGGBB
  if (c.length === 6) {
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return Number.isNaN(r) ? null : { r, g, b };
  }
  
  return null;
}

/**
 * ImageUtils - Exported utility object for image operations
 */
export const ImageUtils = {
  canvasWidth,
  getPlaceholderAspect: imagePlaceholderAspectRatio,
  getGeneratedAspect: generatedImageAspectRatio,
  extractStyle: imageStylePromptFromUserPrompt,
  normalize: normalizeGeneratedImage,
  parseHex,
};
