import {
  layoutStyleGroupById,
  type LayoutStylePreference,
  type ImagePreferenceMode,
} from '@leads-generator/shared';

export interface LayoutStylePromptContext {
  style: LayoutStylePreference | undefined;
  imagePreference: ImagePreferenceMode | undefined;
}

export function buildLayoutPreferencePromptSection({
  style,
  imagePreference,
}: LayoutStylePromptContext): string {
  const sections: string[] = [];
  const styleGroup = layoutStyleGroupById(style);

  if (styleGroup && styleGroup.supportsAllSlidesImage === false) {
    // Poster group has zero image-capable variants → text-only is a HARD
    // rule, not a preference. Forbid photo/collage entirely.
    sections.push(`
[USER-SELECTED LAYOUT STYLE — WAJIB]
User memilih style "${styleGroup.label}" (${styleGroup.description}).
- WAJIB: SEMUA slide pakai layout_variant_id dari daftar ini saja: ${JSON.stringify(styleGroup.variantIds)}.
- DILARANG memakai layout foto/kolase (gw_photo_statement, gw_photo_rotated, gw_collage_showcase).
- SEMUA slide WAJIB image_requirement="none" dan TANPA komponen image_placeholder. Deck ini 100% grafis/teks tanpa foto.`);
  } else if (styleGroup) {
    sections.push(`
[USER-SELECTED LAYOUT STYLE]
User memilih style layout "${styleGroup.label}".
- Jadikan ini target visual utama deck.
- Prioritaskan layout_variant_id dari daftar berikut: ${JSON.stringify(styleGroup.variantIds)}.
- Karakter style: ${styleGroup.description}
- Jika ada slide yang tidak kompatibel dengan style ini, fallback secukupnya ke style terdekat yang tetap menjaga rasa visual deck. Fallback style utama: ${styleGroup.fallbackStyle}.`);
  }

  if (imagePreference === 'all_slides_image') {
    sections.push(`
[USER-SELECTED IMAGE MODE]
User mengaktifkan mode ALL SLIDES IMAGE.
Aturan WAJIB:
- SEMUA slide harus memakai layout yang supportsImage=true.
- SEMUA slide harus punya image_requirement="required".
- SEMUA slide harus menyertakan minimal 1 image_placeholder yang relevan di nested_groups.core_content.
- Setiap image_placeholder wajib punya image_object_context konkret dalam Bahasa Inggris.
- Jangan hasilkan slide text-only/no-image.
- Jika style layout pilihan user tidak sepenuhnya mendukung semua slide bergambar, pertahankan rasa style itu sebisa mungkin tetapi utamakan kepatuhan pada all-slides-image.`);
  }

  return sections.join('\n');
}
