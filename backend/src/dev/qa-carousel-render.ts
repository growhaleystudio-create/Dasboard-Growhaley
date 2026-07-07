import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { BrandKit, SduiDocument, SduiSlide } from '@leads-generator/shared';

import { SatoriRenderer, type BrandFontRef } from '../content/satori-renderer.js';

function brandKit(): BrandKit {
  return {
    id: 'qa-brand-1',
    teamId: 'qa-team-1',
    logoUrl: '',
    colors: ['#187DB4', '#1A1D24', '#F4F3EF'],
    fonts: [],
    chrome: {
      logoPlacement: 'top-left',
      logoSizePx: 52,
      siteUrl: 'growhaley.com',
      pageNumberFormat: '{current}/{total}',
    },
    typography: {
      cover: { fontFamily: '', color: '#1A1D24', sizePx: 88 },
      header: { fontFamily: '', color: '#1A1D24', sizePx: 64 },
      body: { fontFamily: '', color: '#5B626E', sizePx: 30 },
      tag: { fontFamily: '', color: '#5B626E', sizePx: 22 },
      chrome: { fontFamily: '', color: '#5B626E', sizePx: 22 },
      cta: { fontFamily: '', color: '#FFFFFF', sizePx: 28 },
      highlightColor: '#187DB4',
      background: '#F4F3EF',
      paginationColor: '#5B626E',
      metaTextColor: '#5B626E',
      accent: '#187DB4',
    },
    updatedAt: new Date('2026-06-15T00:00:00.000Z'),
  };
}

function slideCover(): SduiSlide {
  return {
    slide_number: 1,
    slide_type: 'cover',
    container_layout: 'text_dominant',
    layout_variant_id: 'gw_poster_cover',
    image_requirement: 'none',
    layout_source: 'worker_adjusted',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'QA CHECK' }],
      core_content: [
        { type: 'header', text: 'Brand Asset Binding Check' },
        { type: 'body', text: 'Cover slide untuk validasi tema, chrome, dan hierarchy render carousel.' },
      ],
      action_footer: [],
    },
  };
}

function slideContent(): SduiSlide {
  return {
    slide_number: 2,
    slide_type: 'content',
    container_layout: 'text_dominant',
    layout_variant_id: 'gw_poster_cards',
    image_requirement: 'none',
    layout_source: 'worker_adjusted',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'THEME TOKENS' }],
      core_content: [
        { type: 'header', text: 'Renderer memakai warna & typography role' },
        {
          type: 'feature_cards',
          items_cards: [
            { icon: '🎯', title: 'Accent', description: 'Pill/button harus memakai accent brand.' },
            { icon: '🔖', title: 'Meta', description: 'Tag dan chrome harus memakai warna meta/pagination.' },
            { icon: '📝', title: 'Body', description: 'Teks isi harus mengikuti body role dari theme.' },
          ],
        },
      ],
      action_footer: [],
    },
  };
}

function slideCta(): SduiSlide {
  return {
    slide_number: 3,
    slide_type: 'content',
    container_layout: 'text_dominant',
    layout_variant_id: 'gw_poster_cta',
    layout_family: 'poster',
    image_requirement: 'none',
    layout_source: 'worker_adjusted',
    typography_scale: 'balanced_classic',
    nested_groups: {
      top_meta: [{ type: 'tag', text: 'FINAL CHECK' }],
      core_content: [
        { type: 'header', text: 'Result-Carrousel siap direview' },
        { type: 'body', text: 'Gunakan output PNG ini untuk QA visual end-to-end binding brand asset.' },
      ],
      action_footer: [{ type: 'button_cta', label: 'Review Output', style: 'primary' }],
    },
  };
}

function buildTheme(kit: BrandKit) {
  const t = kit.typography;
  if (!t) {
    throw new Error('QA brand kit membutuhkan typography agar theme dapat dibangun.');
  }
  const accentBrand = kit.colors[0] ?? '#187DB4';
  const colors = {
    background: t.background || '#F4F3EF',
    header: t.header.color || '#1A1D24',
    body: t.body.color || '#5B626E',
    highlight: t.highlightColor || accentBrand,
    pagination: t.paginationColor || '#5B626E',
    meta: t.metaTextColor || '#5B626E',
    accent: t.accent || accentBrand,
    onAccent: '#FFFFFF',
  };
  const coverRole = t.cover ?? t.header;
  return {
    logoUrl: kit.logoUrl,
    logoPlacement: kit.chrome.logoPlacement,
    logoSizePx: kit.chrome.logoSizePx,
    siteUrl: kit.chrome.siteUrl,
    pageNumberFormat: kit.chrome.pageNumberFormat,
    coverFontFamily: coverRole.fontFamily || t.header.fontFamily || '',
    headerFontFamily: t.header.fontFamily || '',
    bodyFontFamily: t.body.fontFamily || '',
    baseBodySizePx: t.body.sizePx ?? 30,
    coverSizePx: coverRole.sizePx,
    headerSizePx: t.header.sizePx,
    bodySizePx: t.body.sizePx ?? 30,
    typographyRoles: {
      cover: coverRole,
      header: t.header,
      body: t.body,
      tag: t.tag ?? t.body,
      chrome: t.chrome ?? t.body,
      cta: t.cta ?? t.header,
    },
    colors,
  };
}

async function main() {
  const kit = brandKit();
  const slides = [slideCover(), slideContent(), slideCta()];
  const doc: SduiDocument = {
    aspectRatio: '1:1',
    theme: buildTheme(kit),
    spacing: { canvas_padding: 78, macro_gap: 40, meso_gap: 22, micro_gap: 12 },
    slides,
  };

  const brandFonts: BrandFontRef[] = [];
  const renderer = new SatoriRenderer();
  const rootDir = path.resolve(process.cwd(), '..');
  await mkdir(rootDir, { recursive: true });

  for (const slide of slides) {
    const png = await renderer.renderSlide(slide, doc, brandFonts);
    const label = slide.slide_type === 'cover' ? 'cover' : slide.layout_variant_id;
    const filename = `Result-Carrousel-${String(slide.slide_number).padStart(2, '0')}-${label}.png`;
    await writeFile(path.join(rootDir, filename), png);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    outputPrefix: 'Result-Carrousel',
    aspectRatio: doc.aspectRatio,
    slides: slides.map((slide) => ({
      slide_number: slide.slide_number,
      layout_variant_id: slide.layout_variant_id,
      slide_type: slide.slide_type,
    })),
    brandAssetChecks: {
      logoUrl: kit.logoUrl,
      logoPlacement: kit.chrome.logoPlacement,
      logoSizePx: kit.chrome.logoSizePx,
      siteUrl: kit.chrome.siteUrl,
      pageNumberFormat: kit.chrome.pageNumberFormat,
      colors: kit.colors,
      typography: kit.typography,
    },
  };

  await writeFile(
    path.join(rootDir, 'Result-Carrousel-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  console.log('QA carousel render selesai. Output disimpan di root folder dengan prefix Result-Carrousel');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
