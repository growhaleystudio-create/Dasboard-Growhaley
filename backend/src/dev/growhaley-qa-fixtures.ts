/**
 * growhaley-qa-fixtures.ts — shared fixture deck for visual QA.
 *
 * Consumed by two harnesses:
 *   - dev/qa-growhaley-render.ts (manual PNG inspection)
 *   - rendering/satori/growhaley-golden.test.ts (metrics-based golden test)
 *
 * One slide per template (poster_cards twice: feature_cards + comparison),
 * with composition variations exercising palette/accent/blob/scatter paths.
 */

import type { SduiDocument, SduiSlide, AspectRatio } from '@leads-generator/shared';

import { buildGrowhaleyDocument, buildGrowhaleyTheme } from '../content/preview-document.js';

export const GW_COLORS = {
  lime: '#e8ff03',
  blue: '#177db5',
  ink: '#232326',
  cream: '#fff7e8',
  magenta: '#da457f',
};

// 1x1 transparent PNG placeholder so image slots render without network.
export const SAMPLE_IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/pdmxggAAAABJRU5ErkJggg==';

function slide(partial: Partial<SduiSlide> & { slide_number: number }): SduiSlide {
  return {
    slide_type: 'content',
    container_layout: 'text_dominant',
    image_requirement: 'none',
    layout_source: 'worker_adjusted',
    typography_scale: 'editorial_bold',
    nested_groups: { top_meta: [], core_content: [], action_footer: [] },
    ...partial,
  } as SduiSlide;
}

export function makeSlides(): SduiSlide[] {
  return [
    slide({
      slide_number: 1,
      slide_type: 'cover',
      layout_variant_id: 'gw_poster_cover',
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'GROWTH' }],
        core_content: [
          { type: 'header', text: 'Grow Your Business With Us' },
          { type: 'body', text: 'Fondasi digital yang tepat untuk pertumbuhan jangka panjang.' },
        ],
        action_footer: [],
      },
    }),
    slide({
      slide_number: 2,
      layout_variant_id: 'gw_poster_statement',
      composition: { palette: 'ink', accent: 'lime', blob: 'bottom-right', ornaments: 'rich' },
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'STRATEGY' }],
        core_content: [
          { type: 'header', text: 'Website Bukan Sekadar Pajangan', highlight: 'Pajangan' },
          { type: 'body', text: 'Website yang efektif adalah aset yang bekerja mencari pelanggan untukmu setiap hari.' },
        ],
        action_footer: [],
      },
    }),
    slide({
      slide_number: 3,
      layout_variant_id: 'gw_poster_list',
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'CHECKLIST' }],
        core_content: [
          { type: 'header', text: 'Fondasi Digital Kuat' },
          { type: 'checklist', items: ['Website cepat dan jelas', 'SEO yang tepat sasaran', 'Brand yang konsisten', 'Konten yang dipercaya'] },
        ],
        action_footer: [],
      },
    }),
    slide({
      slide_number: 4,
      layout_variant_id: 'gw_poster_stat',
      composition: { palette: 'lime', accent: 'magenta', blob: 'center', headerComposition: 'center' },
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'DATA' }],
        core_content: [
          { type: 'header', text: 'Hasil Nyata' },
          { type: 'stat_block', value: '3.2x', label: 'Pertumbuhan traffic organik klien' },
          { type: 'body', text: 'Rata-rata dalam 6 bulan pendampingan.' },
        ],
        action_footer: [],
      },
    }),
    slide({
      slide_number: 5,
      layout_variant_id: 'gw_poster_quote',
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'INSIGHT' }],
        core_content: [
          { type: 'quote', text: 'Pertumbuhan lahir dari strategi yang tepat, bukan kebetulan.', attribution: 'Growhaley Studio' },
        ],
        action_footer: [],
      },
    }),
    slide({
      slide_number: 6,
      layout_variant_id: 'gw_poster_cards',
      composition: { palette: 'cream', accent: 'magenta', blob: 'none' },
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'LAYANAN' }],
        core_content: [
          { type: 'header', text: 'Apa Yang Kami Bangun' },
          {
            type: 'feature_cards',
            items_cards: [
              { icon: '🌐', title: 'Website', description: 'Cepat, jelas, kredibel.' },
              { icon: '🔍', title: 'SEO', description: 'Mudah ditemukan audiens tepat.' },
              { icon: '🎨', title: 'Branding', description: 'Identitas yang konsisten.' },
              { icon: '📈', title: 'Strategy', description: 'Arah tumbuh yang terukur.' },
            ],
          },
        ],
        action_footer: [],
      },
    }),
    slide({
      slide_number: 7,
      layout_variant_id: 'gw_poster_cards',
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'COMPARE' }],
        core_content: [
          { type: 'header', text: 'Dulu vs Sekarang' },
          {
            type: 'comparison',
            columns: [
              { label: 'DULU', sentiment: 'negative', items: ['Website lambat', 'Tidak ditemukan Google', 'Brand tidak konsisten'] },
              { label: 'SEKARANG', sentiment: 'positive', items: ['Loading 2 detik', 'Peringkat 1 lokal', 'Identitas kuat'] },
            ],
          },
        ],
        action_footer: [],
      },
    }),
    slide({
      slide_number: 8,
      layout_variant_id: 'gw_photo_rotated',
      image_requirement: 'required',
      container_layout: 'background_overlay',
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'Partner.' }],
        core_content: [
          { type: 'header', text: 'Grow Your Business' },
          { type: 'body', text: 'Deliver what you want, serving what you need.' },
          { type: 'image_placeholder', requires_generation: false, imageUrl: SAMPLE_IMG, image_object_context: 'sample' },
        ],
        action_footer: [],
      },
    }),
    slide({
      slide_number: 9,
      layout_variant_id: 'gw_photo_statement',
      composition: { accent: 'magenta' },
      image_requirement: 'required',
      container_layout: 'background_overlay',
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'VISUAL' }],
        core_content: [
          { type: 'header', text: 'Design As Strategy', highlight: 'Strategy' },
          { type: 'body', text: 'Desain memperkuat positioning dan membangun kepercayaan.' },
          { type: 'image_placeholder', requires_generation: false, imageUrl: SAMPLE_IMG, image_object_context: 'sample' },
        ],
        action_footer: [{ type: 'button_cta', label: 'Lihat Karya', style: 'primary' }],
      },
    }),
    slide({
      slide_number: 10,
      layout_variant_id: 'gw_poster_cta',
      composition: { palette: 'lime', accent: 'magenta', headerComposition: 'center', blob: 'bottom-left' },
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'MULAI' }],
        core_content: [
          { type: 'header', text: 'Rapikan Brand-mu Hari Ini' },
          { type: 'body', text: 'Samakan logo, warna, tone caption, dan gaya penawaran di semua kanal.' },
        ],
        action_footer: [{ type: 'button_cta', label: 'Cek branding bisnismu', style: 'primary' }],
      },
    }),
    slide({
      slide_number: 11,
      layout_variant_id: 'gw_collage_showcase',
      composition: { scatter: 'zigzag' },
      image_requirement: 'required',
      container_layout: 'background_overlay',
      nested_groups: {
        top_meta: [{ type: 'tag', text: 'PORTFOLIO' }],
        core_content: [
          { type: 'header', text: 'Growhaley' },
          { type: 'body', text: 'For your growth partnership on your best brand.' },
          { type: 'image_placeholder', requires_generation: false, imageUrl: SAMPLE_IMG, image_object_context: 'p1' },
          { type: 'image_placeholder', requires_generation: false, imageUrl: SAMPLE_IMG, image_object_context: 'p2' },
          { type: 'image_placeholder', requires_generation: false, imageUrl: SAMPLE_IMG, image_object_context: 'p3' },
        ],
        action_footer: [],
      },
    }),
  ];
}

export function buildTheme(): SduiDocument['theme'] {
  return buildGrowhaleyTheme();
}

export function makeDoc(ratio: AspectRatio): SduiDocument {
  return buildGrowhaleyDocument(ratio, makeSlides());
}
