/**
 * satori-renderer.ts — fixed-template "Worker" engine for the SDUI carousel.
 *
 * Layout is NOT freely controlled by the AI. Instead we provide 15 hand-tuned
 * templates (spacing, sizes, image areas are designed once, here). The AI only
 * picks a `layout_variant_id` and fills text/image slots. This makes output
 * consistent and predictable.
 *
 * Brand fonts/colors/chrome are locked via the Brand Kit theme.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { SduiDocument, SduiSlide } from '@leads-generator/shared';

import { find } from './rendering/satori/accessors.js';
import { canvasSize } from './rendering/satori/canvas.js';
import { bottomChrome, topChrome } from './rendering/satori/chrome.js';
import { loadFonts } from './rendering/satori/fonts.js';
import type { BrandFontRef } from './rendering/satori/fonts.js';
import { el } from './rendering/satori/primitives.js';
import { pickTemplate, has } from './rendering/satori/template-picker.js';
import { renderTemplate } from './rendering/satori/templates/index.js';
import { fitContentTokens, makeTokens } from './rendering/satori/tokens.js';

// ---------------------------------------------------------------------------
// Shared helpers moved to rendering/satori/*
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fonts moved to rendering/satori/fonts.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Rich text + rich component renderers moved to rendering/satori/rich-renderers.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Content accessors moved to rendering/satori/accessors.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Token sizing helpers moved to rendering/satori/tokens.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Template selection moved to rendering/satori/template-picker.ts
// Template families + registry moved to rendering/satori/templates/*
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public renderer
// ---------------------------------------------------------------------------

export type { BrandFontRef } from './rendering/satori/fonts.js';

export class SatoriRenderer {
  async renderSlide(
    slide: SduiSlide,
    doc: SduiDocument,
    brandFonts: BrandFontRef[],
  ): Promise<Buffer> {
    const dims = canvasSize(doc.aspectRatio);
    const { fonts, availableFamilies } = await loadFonts(brandFonts);
    if (fonts.length === 0) throw new Error('no_fonts_available');

    const chromeTk = makeTokens(doc, dims, availableFamilies);
    const templateId = pickTemplate(slide, doc.aspectRatio);
    const tk = fitContentTokens(slide, templateId, chromeTk);
    const isLast = slide.slide_number >= doc.slides.length;

    const middle = await renderTemplate(templateId, slide, tk);
    const topChromeNode = await topChrome(slide, chromeTk, doc);
    const bottomChromeNode = await bottomChrome(slide, chromeTk, doc, isLast);

    // cover_image_full is full-bleed: render without padding/chrome gaps overlaying
    const isFullBleed =
      templateId === 'cover_image_full' &&
      has(slide, 'image_placeholder') &&
      !!find(slide, 'image_placeholder')?.imageUrl;

    const root = isFullBleed
      ? el(
          'div',
          {
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            position: 'relative',
            backgroundColor: tk.c.background,
          },
          [
            middle,
            el(
              'div',
              {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${dims.width}px`,
                height: `${dims.height}px`,
                padding: `${chromeTk.pad}px`,
              },
              [topChromeNode, el('div', { display: 'flex', flexGrow: 1 }), bottomChromeNode],
            ),
          ],
        )
      : el(
          'div',
          {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: `${chromeTk.pad}px`,
            backgroundColor: chromeTk.c.background,
            fontFamily: tk.bodyFam,
          },
          [
            topChromeNode,
            el(
              'div',
              {
                display: 'flex',
                flexGrow: 1,
                width: '100%',
                marginTop: `${chromeTk.gMacro}px`,
                marginBottom: `${chromeTk.gMacro}px`,
                overflow: 'hidden',
              },
              [middle],
            ),
            bottomChromeNode,
          ],
        );

    const svg = await satori(root as unknown as Parameters<typeof satori>[0], {
      width: dims.width,
      height: dims.height,
      fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
    });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: dims.width } }).render().asPng();
    return Buffer.from(png);
  }
}
