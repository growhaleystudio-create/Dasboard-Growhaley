/**
 * template-section.ts — Prompt section that turns team-approved carousel
 * structures into few-shot structural templates for the planner.
 *
 * The examples carry structure only (block sequence + optional layout variant
 * per slide, no copy/brand data), so the AI is forced to write fresh content
 * while mirroring the structural rhythm the team already approved.
 */

import type { ApprovedExampleStructure } from '@leads-generator/shared';

const MAX_EXAMPLES = 3;

/**
 * Renders the "[KERANGKA STRUKTUR CAROUSEL TIM]" prompt section.
 * Returns '' when no examples are available so the base prompt is unchanged.
 */
export function buildTemplateStructurePromptSection(
  examples: ApprovedExampleStructure[] | undefined,
): string {
  if (!examples || examples.length === 0) return '';

  const compact = examples.slice(0, MAX_EXAMPLES).map((example) => ({
    aspectRatio: example.aspectRatio,
    slides: example.slides.map((slide) => ({
      blocks: slide.blocks,
      ...(slide.layoutVariant ? { layoutVariant: slide.layoutVariant } : {}),
    })),
  }));

  return `

[KERANGKA STRUKTUR CAROUSEL TIM]
Berikut struktur carousel yang sudah disetujui tim untuk brand ini. WAJIB gunakan pola urutan blok (cover/text/checklist/stat/image/cta) dari salah satu contoh sebagai kerangka struktural deck — sesuaikan jumlah slide bila berbeda, tapi pertahankan ritme dan proporsi jenis blok semirip mungkin. Jika layoutVariant tercantum, jadikan kandidat utama untuk slide dengan peran yang sama.
Contoh HANYA memberi STRUKTUR, BUKAN isi teks — tulis konten baru secara kreatif sesuai prompt user: angle, headline, copy, dan framing tetap bebas.
Contoh terstruktur: ${JSON.stringify(compact)}`;
}
