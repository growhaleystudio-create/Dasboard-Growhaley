/**
 * repair-builder.ts — Builds repair prompts for quality issues
 */

import type { SduiSlide } from '@leads-generator/shared';
import type { SduiPlannerInput } from '../types.js';
import { buildPrompt } from '../prompt/prompt-builder.js';

/**
 * Builds a repair prompt for completeness and quality issues.
 */
export function buildCompletenessRepairPrompt(
  input: SduiPlannerInput,
  slides: SduiSlide[],
  issues: string[],
): string {
  return (
    buildPrompt({
      ...input,
      previousSlides: slides,
      feedback:
        `QUALITY REPAIR WAJIB. Perbaiki issue berikut: ${issues.join('; ')}. ` +
        `Jangan ubah jumlah slide. Jangan buat slide content hanya header. ` +
        `Setiap slide content harus punya minimal 2 content units bermakna; tambah body, feature_cards, comparison, stat_row, timeline, callout, atau numbered_list jika slide masih kosong. ` +
        `Hindari text_stack/text_centered/big_statement sebagai fallback jika layout rich/cards/comparison cocok. ` +
        `Checklist harus punya minimal 2 item non-empty. Body/quote harus non-empty bila layout membutuhkannya. ` +
        `Jika ada body/quote/checklistItem yang berakhir dengan kata sambung seperti "yang", "dan", "untuk", "dengan", tulis ulang menjadi frasa/kalimat pendek yang selesai. ` +
        `Jika teks terlalu panjang untuk textLimits, JANGAN sekadar memotong. Ringkas secara natural, pecah ide menjadi checklist/CTA bila cocok, atau pilih layout_variant_id lain yang lebih sesuai. ` +
        `Pilih layout_variant_id lain bila layout saat ini tidak cocok dengan isi. ` +
        `Tulis ulang teks agar utuh, kreatif, dan tetap dalam textLimits.`,
    }) + `\n\nValidasi akhir wajib lolos. Issue yang harus hilang: ${JSON.stringify(issues)}`
  );
}
