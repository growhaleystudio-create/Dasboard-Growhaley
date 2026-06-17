/**
 * prompt-builder.ts — Main prompt orchestrator for SDUI Planner
 *
 * Extracted from sdui-planner.ts:419-634 (215 lines)
 * Status: ✅ Full implementation extracted
 */

import type { SduiPlannerInput } from '../types.js';
import { buildVariationBrief } from './variation-brief.js';
import { buildContentTagsSection } from './content-tags.js';
import { buildConversationSection } from './conversation-formatter.js';
import { buildLayoutPreferencePromptSection } from './layout-preference.js';
import { promptLayoutCatalog, promptLayoutIds } from '../layout/layout-catalog.js';
import { buildContentIntelligenceContext } from '../../content-intelligence-bank.js';
import {
  migratedNoImageLayoutCatalog,
  migratedEditorialLayoutCatalog,
} from '../../layout-migration.js';
import { promptExplicitlyRequestsImages } from '../image/image-detection.js';
import { resolveSduiTextLimits } from '../../sdui-text-guardrails.js';

export function buildPrompt(input: SduiPlannerInput): string {
  // ---- Reference section -------------------------------------------------
  let refSection = '';
  const mode = input.referenceMode ?? 'no_reference';

  if (mode === 'auto_match' && input.referenceCatalog && input.referenceCatalog.length > 0) {
    const catalog = input.referenceCatalog.map((r) => ({
      id: r.id,
      name: r.name,
      tags: r.tags,
      dna: r.dna,
    }));
    refSection =
      `\n\n[MODE: AUTO_MATCH] Berikut katalog referensi layout yang tersedia. ` +
      `Pilih 1 yang paling relevan dengan topik dan isi field "chosen_reference_id" di level root output JSON.\n` +
      `Katalog: ${JSON.stringify(catalog)}\n` +
      `Terapkan arsitektur komponen (component_sequence) dan typography_scale dari referensi yang dipilih pada SETIAP slide.`;
  } else if (mode === 'manual' && input.chosenReference) {
    const r = input.chosenReference;
    refSection =
      `\n\n[MODE: MANUAL_GALLERY] Pengguna telah memilih referensi layout: "${r.name}" (id: ${r.id}).\n` +
      `Visual DNA: ${JSON.stringify(r.dna)}\n` +
      `WAJIB menerapkan component_sequence [${r.dna.componentSequence.join(', ')}] dan typography_scale "${r.dna.typographyScale}" ` +
      `serta layout_archetype "${r.dna.layoutArchetype}" pada SETIAP slide.`;
  }

  const repairSlideNumbers = input.failedImageSlideNumbers ?? [];
  const noImageRepairLayouts = migratedNoImageLayoutCatalog().map((layout) => ({
    id: layout.id,
    family: layout.family,
    requiredComponents: layout.requiredComponents,
    bestFor: layout.bestFor,
  }));
  const repairSection =
    input.repairMode === 'image_failure_no_image'
      ? `\n\n[MODE: IMAGE_FAILURE_REPAIR]
Image generation provider gagal untuk slide nomor: ${JSON.stringify(repairSlideNumbers)}.
Tugasmu adalah memperbaiki HANYA slide terdampak agar memakai layout TANPA image.
Aturan repair:
- Untuk slide terdampak, pilih layout_variant_id hanya dari katalog no-image berikut: ${JSON.stringify(noImageRepairLayouts)}.
- Untuk slide terdampak, set image_requirement = "none".
- Untuk slide terdampak, HAPUS semua komponen bertipe "image_placeholder".
- Jangan membuat placeholder kosong, visual abstrak lokal, atau komponen pengganti yang membutuhkan gambar.
- Pertahankan jumlah slide, urutan slide, bahasa, dan pesan utama.
- Slide yang tidak terdampak boleh dipertahankan apa adanya kecuali perlu sedikit penyesuaian agar deck tetap mengalir.`
      : '';

  const editorialLayouts = migratedEditorialLayoutCatalog();
  const editorialBiasSection = input.editorialBias
    ? `\n\n[MODE: EDITORIAL BIAS — WAJIB DIPATUHI SEPENUHNYA]
User meminta gaya editorial/majalah. Berikut aturan WAJIB yang tidak boleh dilanggar:

LAYOUT:
- Slide cover (slide_number=1): WAJIB gunakan layout_variant_id "cover_editorial_left".
- Slide selain cover: pilih HANYA dari layout berikut (editorial family) — ${JSON.stringify(editorialLayouts.filter((l) => l.id !== 'cover_editorial_left').map((l) => ({ id: l.id, requiredComponents: l.requiredComponents, supportsImage: l.supportsImage, bestFor: l.bestFor })))}.
- DILARANG memilih layout dari family lain (text, checklist, stat, cta, cover, image_split, image_focus, multi_image) kecuali tidak ada editorial yang kompatibel dengan komponen slide tersebut.

KOMPONEN:
- DILARANG menggunakan feature_cards atau comparison. Ganti dengan body naratif panjang atau checklist untuk timeline_editorial.
- Setiap slide content WAJIB punya body dengan MINIMAL 150 karakter (idealnya 150–220 karakter). Tulis body sebagai 2–3 kalimat utuh yang padat informasi, bukan satu kalimat pelengkap. Ini WAJIB — slide editorial harus terasa berisi seperti paragraf majalah, bukan caption pendek.
- Untuk article_column_layout, tulis body 180–230 karakter agar kedua kolom terisi penuh.
- Gunakan komponen quote (bukan header biasa) untuk slide insight/kutipan penting → pilih pullquote_editorial.
- Untuk slide yang berisi langkah/fase/kronologi, gunakan checklist + layout timeline_editorial.
- Untuk slide data/angka penting, gunakan header berisi angka/stat + body interpretasi → pilih data_editorial.
- Untuk slide dengan gambar, pastikan ada image_placeholder di core_content dan pilih editorial_feature_spread, profile_story_layout, editorial_image_caption_grid, atau magazine_cover_story.

GAYA PENULISAN:
- Nada seperti media/majalah: otoritatif, deskriptif, sedikit narasi.
- Headline (header) boleh berupa pernyataan tegas, bukan sekedar label topik.
- Body berisi penjelasan yang utuh dan padat — jangan sekadar kalimat pelengkap.
- tag di top_meta: 1–2 kata rubrik/kategori majalah (mis. ANALISIS, LAPORAN, WAWANCARA, TREN, DATA).`
    : '';

  const effectiveLayoutCatalog = promptLayoutCatalog(input.typographyOverride);
  const typographySection = input.typographyOverride
    ? `\nUkuran teks efektif dari setting: ${JSON.stringify(input.typographyOverride)}. Jadikan textLimits sebagai constraint kreatif: ringkas, ubah struktur, atau pilih layout lain agar ide user tetap tersampaikan tanpa dipotong.`
    : '';
  const explicitImageSection =
    promptExplicitlyRequestsImages(input.prompt) && input.repairMode !== 'image_failure_no_image'
      ? `\n\n[USER EXPLICITLY REQUESTED IMAGE]
Prompt user meminta gambar/image/foto/ilustrasi/visual. WAJIB buat minimal 1 slide dengan:
- image_requirement = "required"
- layout_variant_id dari layout supportsImage=true
- komponen image_placeholder di core_content
- image_object_context konkret dalam Bahasa Inggris.
Jangan mengembalikan semua slide image_requirement="none".`
      : '';
  const intelligenceContext = buildContentIntelligenceContext(input.prompt, input.slideCount);
  const variationBrief = buildVariationBrief(input);
  const contentTagsSection = buildContentTagsSection(input.contentTags);
  const conversationSection = buildConversationSection(input.conversationContext);
  const layoutPreferenceSection = buildLayoutPreferencePromptSection({
    style: input.layoutStyle,
    imagePreference: input.imagePreference,
  });

  const base = `Kamu adalah AI Planner untuk carousel media sosial (Instagram/LinkedIn). Tugasmu HANYA menyusun struktur konten dan menulis teks. Kamu DILARANG menentukan ukuran piksel, warna, atau font — itu dikunci oleh Brand Kit.${typographySection}${explicitImageSection}${editorialBiasSection}
${conversationSection}
${contentTagsSection}
${layoutPreferenceSection}

[CREATIVE VARIATION]
${variationBrief}
Jika user menjalankan prompt yang sama lagi, hasil konten tetap harus terasa sebagai draft baru: gunakan angle, headline, contoh, urutan slide, layout, dan CTA yang berbeda selama tetap setia pada maksud user. Jangan mengulang exact wording dari generasi sebelumnya kecuali user meminta konsistensi.

[CONTENT INTELLIGENCE BANK]
Gunakan bank dataset internal berikut sebagai retrieval kreatif untuk menentukan alur naratif, variasi layout, dan style image yang sesuai kebutuhan user. Ini bukan schema output; ini contoh dan constraint kreatif yang harus kamu adaptasi.
${intelligenceContext}

ATURAN PENGGUNAAN BANK DATASET:
- Jika imageStyles tidak kosong, pilih style preset paling relevan dan masukkan promptFragment + avoid list ke setiap image_object_context yang membutuhkan gambar. Jangan mengganti style eksplisit user dengan style generik.
- Jika layoutRecipes tidak kosong, gunakan layoutCandidates dari recipe yang relevan sebagai kandidat utama untuk slide sesuai peran naratifnya, selama layout tersebut ada di katalog lengkap dan cocok dengan image_requirement.
- Untuk prompt 5+ slide, gabungkan beberapa layoutRecipes agar struktur tidak hanya header/body. Minimal gunakan 3 keluarga komponen berbeda bila memungkinkan: feature_cards, checklist/numbered steps, comparison, quote/stat, dan image_placeholder.
- Default slide content harus padat: jangan kirim slide content hanya berisi header. Minimal ada 2 content units bermakna per slide, mis. header+body, header+feature_cards, quote+body, stat+callout, comparison+body, atau timeline+callout.
- Jika konsep slide punya whitespace besar, isi dengan komponen berguna: body jelas, feature_cards, comparison, stat_row, key_value_list, timeline, callout, atau numbered_list. Whitespace besar hanya boleh jika user eksplisit minta gaya minimal/airy.
- Jangan pilih layout text-safe seperti text_stack, text_centered, atau big_statement kalau isi cocok untuk feature_cards, comparison, rich stack, atau layout multi-image.
- Jika prompt mengarah ke editorial/majalah/storytelling/opini/reportage/profile/data journalism, prioritaskan layout family editorial seperti editorial_feature_spread, magazine_cover_story, pullquote_editorial, article_column_layout, profile_story_layout, reportage_photo_essay, opinion_big_statement, timeline_editorial, atau data_editorial sesuai peran slide.
- Bank dataset adalah inspirasi terkurasi, bukan output mentah: jangan menulis id bank ke JSON kecuali field schema memang memintanya.

Kembalikan HANYA JSON valid (tanpa markdown, tanpa penjelasan) dengan skema:
{
  "chosen_reference_id": "ref-id-jika-auto_match" (atau null),
  "slides": [
    {
      "slide_number": 1,
      "slide_type": "cover" | "content",
      "container_layout": "text_dominant" | "split_screen" | "background_overlay",
      "layout_variant_id": ${JSON.stringify(promptLayoutIds(input.typographyOverride))},
      "image_requirement": "required" | "optional" | "none",
      "typography_scale": "editorial_bold" | "balanced_classic" | "information_dense",
      "contentDirection": "column" | "row",
      "nested_groups": {
        "top_meta": [ { "type": "tag", "text": "LABEL", "textTransform": "uppercase" } ],
        "core_content": [
          { "type": "header", "text": "Judul", "highlight": "kata kunci" },
          { "type": "body", "text": "Penjelasan yang cukup lengkap." },
          { "type": "checklist", "items": ["Poin 1", "Poin 2", "Poin 3"] },
          { "type": "feature_cards", "items_cards": [
            { "icon": "🎯", "title": "Judul Kartu", "description": "Deskripsi singkat" },
            { "icon": "📊", "title": "Kartu Dua", "description": "Penjelasan singkat" }
          ]},
          { "type": "comparison", "columns": [
            { "label": "DULU", "sentiment": "negative", "items": ["Masalah 1", "Masalah 2"] },
            { "label": "SEKARANG", "sentiment": "positive", "items": ["Solusi 1", "Solusi 2"] }
          ]},
          { "type": "image_placeholder", "requires_generation": true, "image_object_context": "English brief for generated artwork" }
        ],
        "action_footer": [
          { "type": "button_cta", "label": "Swipe", "style": "primary" }
        ]
      }
    }
  ]
}

ATURAN KOMPONEN KAYA (PENTING — GUNAKAN INI AGAR KONTEN DINAMIS):
- "feature_cards": Gunakan untuk slide yang punya 3–6 poin/fitur/manfaat/use case dengan icon emoji. Setiap kartu punya: "icon" (1 emoji), "title" (maks 28 karakter), "description" (opsional, maks 60 karakter). Pilih layout "feature_cards_with_header" (dengan judul) atau "feature_cards_grid" (tanpa judul). JANGAN gunakan checklist kalau kontennya lebih cocok jadi kartu visual.
- "comparison": Gunakan untuk slide perbandingan (DULU vs SEKARANG, Manual vs AI, Tanpa vs Dengan, Pro vs Kontra, sebelum vs sesudah). Wajib 2 kolom. Setiap kolom: "label" (maks 16 karakter), "sentiment" ("positive"/"negative"/"neutral"), "items" (2–4 poin, maks 48 karakter per poin). Pilih layout "comparison_with_header" (dengan judul di atas) atau "comparison_columns" (langsung 2 kolom). JANGAN gunakan 2 checklist terpisah kalau kontennya adalah perbandingan.
- Pilih komponen yang PALING TEPAT untuk menjelaskan ide: feature_cards untuk "apa saja yang ditawarkan", comparison untuk "sebelum vs sesudah", checklist untuk langkah/proses, quote untuk testimoni/kutipan, stat untuk angka penting, body untuk penjelasan naratif.
- Untuk slide yang terasa kosong, utamakan rich components daripada text-safe fallback: stat_block, stat_row, key_value_list, timeline, progress_bar, callout, pull_quote, byline, caption, divider.

KOMPONEN RICH TAMBAHAN (gunakan untuk slide yang lebih kaya/padat — paling cocok pada layout editorial_rich_stack atau editorial_rich_split):
- "stat_block": angka besar + label. Field: "value" (angka/metrik, maks 10 char, mis. "85%"), "label" (keterangan, pakai field "label"), opsional "delta" (mis. "+12% MoM") dan "trend" ("up"/"down"/"flat"). Untuk metrik tunggal yang penting.
- "stat_row": deretan 2–4 mini-KPI. Field: "stats": [{ "icon" (emoji opsional), "value" (maks 10 char), "label" (maks 26 char) }]. Untuk beberapa angka sekaligus.
- "key_value_list": pasangan label:nilai. Field: "rows": [{ "label" (maks 28 char), "value" (maks 44 char) }] (maks 6). Untuk spesifikasi, ringkasan, profil.
- "data_table": tabel kecil. Field: "tableHeaders": [string] (maks 4 kolom), "tableRows": [[string]] (maks 6 baris). Untuk data journalism/perbandingan terstruktur.
- "timeline": kronologi. Field: "timeline": [{ "time" (maks 18 char, mis. "2021" / "Fase 1"), "text" (maks 90 char) }] (maks 5). Untuk milestone/tahapan. Pakai dengan layout timeline_editorial atau editorial_rich_stack.
- "progress_bar": bar metrik. Field: "progress": [{ "label" (maks 30 char), "percent" (0–100) }] (maks 5). Untuk skor/proporsi.
- "numbered_list": daftar berurutan. Field: "items": [string] (maks 6). Untuk urutan/ranking (beda dari checklist yang non-urut).
- "callout": kotak sorot. Field: "text" (maks 200 char), "variant" ("info"/"tip"/"warning"/"success"), "icon" (emoji opsional). Untuk catatan penting/tips/peringatan.
- "pull_quote": kutipan besar bergaya majalah. Field: "text" (kutipan), "attribution" (nama), "attributionRole" (jabatan/perusahaan). Lebih kuat dari quote biasa untuk insight kunci.
- "byline": tanda tangan penulis/narasumber. Field: "text" (nama), "role" (jabatan), "avatarUrl" (opsional). Untuk slide profil/opini.
- "caption": keterangan kecil di bawah gambar. Field: "text" (maks 140 char), "credit" (sumber opsional). Pakai bersama image_placeholder.
- "divider": pemisah seksi. Field "text" opsional sebagai label kecil. Untuk memisah bagian dalam slide padat.
- Komponen rich di atas dirender berurutan (atas→bawah) saat memakai layout editorial_rich_stack/editorial_rich_split. Boleh menggabungkan beberapa dalam satu slide (mis. header + stat_row + body + callout).

ATURAN LAYOUT (PENTING):
- Pilih TEPAT 1 "layout_variant_id" dari katalog lengkap ini untuk tiap slide: ${JSON.stringify(effectiveLayoutCatalog)}.
- Set TEPAT 1 "image_requirement" per slide:
  * "required": visual sangat membantu pemahaman, demo, proof, product, before/after, mood, atau contoh konkret.
  * "optional": visual hanya dekoratif/penambah rasa; slide tetap kuat tanpa gambar.
  * "none": slide memang lebih kuat tanpa visual atau user tidak meminta visual untuk bagian itu.
- Kalau image_requirement = "required", pilih layout yang supportsImage=true dan wajib sertakan image_placeholder dengan image_object_context konkret dalam Bahasa Inggris.
- Kalau image_requirement = "optional", boleh pakai layout image jika visualnya relevan dengan prompt, mood, storytelling, contoh, atau kreativitas deck.
- Kalau image_requirement = "none", WAJIB pilih layout supportsImage=false dan JANGAN sertakan image_placeholder.
- Untuk layout multi-image berikut: dual_image_comparison, product_angle_pair, use_case_gallery_2up, mini_gallery_3up, moodboard_grid, step_visual_sequence, problem_solution_visual_pair, feature_visual_cards, testimonial_with_portrait_and_product, case_study_snapshot_grid, dos_donts_visual_pair, outfit_or_style_board, menu_or_food_combo, real_estate_room_pair, app_screen_flow, social_proof_wall, event_moment_grid, travel_itinerary_grid, collection_showcase, variant_selector_showcase:
  * WAJIB sertakan 2 sampai 4 komponen image_placeholder di core_content sesuai kebutuhan layout.
  * Setiap image_placeholder harus punya image_object_context berbeda, konkret, dan berbahasa Inggris.
  * Jangan membuat 2 placeholder dengan prompt identik; bedakan angle, subject, state, step, screen, room, variant, atau use case.
- Jika user menyebut style visual tertentu (misalnya photo realistic, 3D, watercolor, flat vector, anime, sticker, no background/transparan), masukkan style itu ke image_object_context dalam Bahasa Inggris.
- Untuk komposisi visual dinamis, kamu boleh menambahkan "visual_layer" sebagai metadata kreatif. Gunakan visual_treatment hanya dari: boxed_image, circle_asset, transparent_cutout, full_bleed_background, floating_object, pattern_layer, editorial_collage, ui_mockup_board, callout_card, connector_line.
- visual_layer TIDAK menggantikan image_placeholder untuk gambar wajib. Jika user minta gambar, tetap wajib sertakan image_placeholder pada minimal 1 slide; visual_layer hanya menjelaskan treatment/komposisi untuk composer generasi berikutnya.
- Untuk style seperti screenshot modern/editorial: gunakan kombinasi visual_layer ui_mockup_board, callout_card, connector_line, pattern_layer, floating_object, sambil tetap menjaga area tag/logo/footer/pagination tidak disentuh.
- VARIASIKAN family layout antar-slide. Untuk 5 slide, gunakan minimal 4 layout-family berbeda bila komponen dan cerita memungkinkan. Jangan pakai layout_variant_id yang sama dua slide berturut-turut.
- Kamu BOLEH menambahkan field heightPercent/align/dll, tapi worker akan mengabaikannya — fokus saja pilih template yang tepat + tulis konten yang bagus.
- "textTransform": "uppercase" hanya untuk tag.

Kontrak teknis:
- Hasilkan TEPAT ${input.slideCount} slide (tidak lebih, tidak kurang). slide_number mulai dari 1 berurutan.
- Slide pertama bertipe "cover", sisanya "content".
- Utamakan prompt user. textLimits adalah batas render, bukan alasan untuk membuang ide. Jika ide user panjang, ringkas secara natural, ubah menjadi checklist/CTA/quote, pilih layout lain, atau sebar ide ke slide lain dalam jumlah slide yang tersedia.
- Output akhir tetap harus muat dalam textLimits dari layout_variant_id yang dipilih:
  * header/body/quote/ctaLabel/checklistItem = maksimal karakter.
  * checklistItems = maksimal jumlah poin.
  * tag maksimal 1-3 kata dan sesuai textLimits.tag.
- Header sebaiknya headline singkat, tetapi boleh berupa statement utuh jika itu lebih sesuai dengan prompt dan masih muat.
- Jangan pernah membuat slide content yang hanya berisi header. Slide content wajib punya body, quote, checklist berisi minimal 2 item, atau CTA label yang relevan.
- Jika memilih layout checklist, komponen checklist WAJIB punya 2 sampai textLimits.checklistItems item non-empty. Jangan pernah mengirim checklist kosong.
- Semua body/quote/checklistItem harus berupa kalimat/frasa utuh dalam batas karakter, jangan terpotong di tengah kata atau tengah kalimat.
- Gunakan image_placeholder bila image_requirement required/optional dan gambar memperkuat prompt user. Jika user meminta deck yang visual-heavy, boleh gunakan lebih banyak slide visual selama tetap relevan dan layout mendukung.
- Untuk topik abstrak, boleh pilih visual metaforis/ilustratif jika prompt user meminta visual atau jika visual membuat carousel lebih kuat.
	- top_meta: satu "tag" pendek (1-3 kata, textTransform uppercase). Jika [CONTENT TAGS] berisi daftar tag user, wajib gunakan daftar itu.
- "highlight": 1 frasa (1-3 kata) dari teks header yang diberi aksen warna.
- Nada konten: ${input.tone}. Bahasa mengikuti bahasa prompt user.
- JANGAN menaruh url, logo, atau nomor halaman.${refSection}${repairSection}

[TOPIK DAN KONTEKS KONTEN]
Prompt user berikut berisi TOPIK UTAMA yang harus dibahas di SELURUH carousel, serta konteks tambahan (target audience, angle, dll). Pahami struktur ini:
- TOPIK = tema/isi yang harus dibahas di semua slide konten (bukan hanya slide pertama)
- Target Audience = untuk siapa konten ini dibuat (bukan topik slide terpisah)
- Detail lain = konteks pendukung, bukan daftar slide terpisah

SEMUA slide konten harus membahas TOPIK yang sama dari angle berbeda. Jangan interpretasikan target audience atau konteks lain sebagai topik slide berikutnya.

Prompt user: ${input.prompt}`;

  if (input.feedback && input.previousSlides && input.previousSlides.length > 0) {
    return (
      base +
      `\n\nIni revisi. Draft sebelumnya:\n${JSON.stringify({ slides: input.previousSlides })}\n\n` +
      `Umpan balik user: "${input.feedback}". Perbarui HANYA isi teks/komponen sesuai umpan balik, pertahankan jumlah slide dan struktur skema. Kembalikan JSON penuh.`
    );
  }
  return base;
}

// Re-export helpers for external use
export {
  buildVariationBrief,
  buildContentTagsSection,
  buildConversationSection,
  promptLayoutCatalog,
  promptLayoutIds,
};
