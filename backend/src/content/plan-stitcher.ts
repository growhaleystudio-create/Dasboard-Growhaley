/**
 * plan-stitcher.ts — Layer 2: API Stitcher & Image API Caller.
 *
 * Arsitektur:
 * 1. parsePlannerOutput()  — baca raw JSON dari AI Planner, validasi,
 *    dan REPLACE image_board_ratio dengan nilai dari Registry (bukan dari AI).
 * 2. stitchPlan()          — gabungkan plan yang sudah di-parse dengan Brand Kit,
 *    lakukan image generation untuk setiap slot yang butuh gambar.
 *
 * Prinsip kunci:
 * - AI TIDAK dipercaya soal rasio gambar. Registry adalah satu-satunya
 *   sumber kebenaran (Single Source of Truth).
 * - Jika AI memilih template_12, kita paksa image_board_ratio = "4:5"
 *   dari Registry, apapun yang ditulis AI.
 */

import type { AspectRatio } from '@leads-generator/shared';
import {
  getTemplate,
  getImageBoardRatio,
  requiresImage,
  type TemplateContract,
  type ImageBoardRatio,
  type ComponentType,
} from './template-registry.js';

// ---------------------------------------------------------------------------
// Parsed plan types (output of parsePlannerOutput)
// ---------------------------------------------------------------------------

export interface ParsedComponent {
  type: ComponentType;
  text?: string;
  highlight?: string;
  label?: string;
  items?: string[];
  /** Set by stitcher AFTER successful image generation (never from AI). */
  imageUrl?: string;
  image_object_context?: string;
}

export interface ParsedSlide {
  slide_number: number;
  template_id: string;
  /** Resolved from Registry, NOT from AI output. */
  template: TemplateContract;
  /** Locked by Registry. Null for text-only templates. */
  image_board_ratio: ImageBoardRatio | null;
  components: ParsedComponent[];
}

export interface ParsedPlan {
  slides: ParsedSlide[];
  /** Any template IDs from AI that were unknown / rejected. */
  rejected_template_ids: string[];
  /** Any slides that were skipped due to validation errors. */
  skipped_slides: number[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Raw shape we expect from the AI Planner JSON output. */
interface RawSlide {
  slide_number?: unknown;
  template_id?: unknown;
  components?: unknown[];
}

interface RawComponent {
  type?: unknown;
  text?: unknown;
  highlight?: unknown;
  label?: unknown;
  items?: unknown[];
  image_object_context?: unknown;
}

const VALID_COMPONENT_TYPES = new Set<string>([
  'header', 'body', 'quote', 'checklist', 'button_cta', 'image_placeholder', 'stat',
]);

function parseComponent(raw: unknown): ParsedComponent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as RawComponent;
  const type = r.type;
  if (typeof type !== 'string' || !VALID_COMPONENT_TYPES.has(type)) return null;

  const comp: ParsedComponent = { type: type as ComponentType };
  if (typeof r.text === 'string') comp.text = r.text.slice(0, 300);
  if (typeof r.highlight === 'string') comp.highlight = r.highlight.slice(0, 60);
  if (typeof r.label === 'string') comp.label = r.label.slice(0, 60);
  if (Array.isArray(r.items)) {
    comp.items = r.items.filter((x): x is string => typeof x === 'string').slice(0, 8);
  }
  if (typeof r.image_object_context === 'string') {
    comp.image_object_context = r.image_object_context.slice(0, 300);
  }
  return comp;
}

/**
 * Parse and validate the raw JSON string/object from the AI Planner.
 *
 * KEY RULE: template_id is looked up in the Registry. The Registry
 * determines image_board_ratio — not the AI. If AI suggests an unknown
 * template_id, that slide is skipped and reported in rejected_template_ids.
 */
export function parsePlannerOutput(
  raw: unknown,
  maxSlides: number,
): ParsedPlan {
  const rejected_template_ids: string[] = [];
  const skipped_slides: number[] = [];
  const slides: ParsedSlide[] = [];

  let rawSlides: unknown[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
      rawSlides = Array.isArray(parsed?.slides) ? parsed.slides : [];
    } catch {
      return { slides: [], rejected_template_ids: [], skipped_slides: [] };
    }
  } else if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    rawSlides = Array.isArray(obj.slides) ? (obj.slides as unknown[]) : [];
  } else {
    return { slides: [], rejected_template_ids: [], skipped_slides: [] };
  }

  // Process up to maxSlides
  const toProcess = rawSlides.slice(0, maxSlides);
  for (let i = 0; i < toProcess.length; i++) {
    const rs = toProcess[i] as RawSlide;
    const slideNum = typeof rs.slide_number === 'number' ? rs.slide_number : i + 1;
    const rawTemplateId = typeof rs.template_id === 'string' ? rs.template_id : '';

    // Registry lookup — AI cannot forge this
    const contract = getTemplate(rawTemplateId);
    if (!contract) {
      rejected_template_ids.push(rawTemplateId);
      skipped_slides.push(slideNum);
      continue;
    }

    // Parse components
    const rawComps = Array.isArray(rs.components) ? rs.components : [];
    const components = rawComps
      .map(parseComponent)
      .filter((c): c is ParsedComponent => c !== null);

    // Ensure image_placeholder exists if the template requires it
    if (contract.requires_image) {
      const hasImg = components.some((c) => c.type === 'image_placeholder');
      if (!hasImg) {
        components.push({
          type: 'image_placeholder',
          image_object_context: `illustration related to the slide content`,
        });
      }
    }

    slides.push({
      slide_number: slideNum,
      template_id: contract.id,
      template: contract,
      // LOCKED by Registry — ignoring any "image_board_ratio" the AI may have included
      image_board_ratio: getImageBoardRatio(contract.id),
      components,
    });
  }

  // Re-number slides sequentially
  slides.forEach((s, i) => { s.slide_number = i + 1; });

  return { slides, rejected_template_ids, skipped_slides };
}

// ---------------------------------------------------------------------------
// Stitcher — calls image API for each slot that needs a generated image
// ---------------------------------------------------------------------------

export interface ImageGeneratorFn {
  (prompt: string, ratio: ImageBoardRatio, signal: AbortSignal): Promise<string | null>;
}

export interface StitchResult {
  slides: ParsedSlide[];
  imageErrors: { slideNumber: number; reason: string }[];
}

/**
 * For each slide that requires_image, call the image generator and set
 * imageUrl on the image_placeholder component.
 *
 * Images are generated IN PARALLEL for speed.
 * Failures are best-effort — slide renders with a white placeholder.
 */
export async function stitchPlan(
  plan: ParsedPlan,
  generateImage: ImageGeneratorFn,
  signal: AbortSignal,
): Promise<StitchResult> {
  const imageErrors: StitchResult['imageErrors'] = [];

  // Collect all image jobs
  const jobs: Array<{
    slide: ParsedSlide;
    comp: ParsedComponent;
  }> = [];

  for (const slide of plan.slides) {
    if (!slide.template.requires_image || !slide.image_board_ratio) continue;
    for (const comp of slide.components) {
      if (comp.type === 'image_placeholder') {
        jobs.push({ slide, comp });
      }
    }
  }

  // Run all image generations in parallel
  await Promise.all(
    jobs.map(async ({ slide, comp }) => {
      const prompt =
        comp.image_object_context?.trim() ||
        `professional illustration for slide ${slide.slide_number}`;
      try {
        const url = await generateImage(
          prompt,
          slide.image_board_ratio!,
          signal,
        );
        if (url) {
          comp.imageUrl = url;
        } else {
          imageErrors.push({ slideNumber: slide.slide_number, reason: 'generator_returned_null' });
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'unknown';
        imageErrors.push({ slideNumber: slide.slide_number, reason });
        // imageUrl stays undefined → renderer shows async white placeholder
      }
    }),
  );

  return { slides: plan.slides, imageErrors };
}

// ---------------------------------------------------------------------------
// Helper: map ImageBoardRatio → mirava ratio string
// ---------------------------------------------------------------------------

export const IMAGE_BOARD_RATIO_TO_MIRAVA: Record<ImageBoardRatio, string> = {
  '4:5': '4:5',
  '1:1': '1:1',
  '16:9': '16:9',
};

/** Map ImageBoardRatio to the carrier AspectRatio (canvas ratio). */
export function imageBoardRatioToCanvasAspect(ratio: ImageBoardRatio): AspectRatio {
  switch (ratio) {
    case '4:5': return '4:5';
    case '1:1': return '1:1';
    case '16:9': return '1:1'; // 16:9 board lives inside a 1:1 canvas
  }
}
