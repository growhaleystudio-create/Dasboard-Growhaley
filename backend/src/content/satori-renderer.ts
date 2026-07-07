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
import { growhaleyChromeColors, gwSafeArea, isLightChrome } from './rendering/satori/templates/growhaley.js';
import { fitContentTokens, makeTokens, scaleTypographyTokens } from './rendering/satori/tokens.js';
import type { Tokens } from './rendering/satori/tokens.js';
import { measureSvgContent } from './rendering/satori/svg-measure.js';
import type { SvgContentMetrics } from './rendering/satori/svg-measure.js';
import { GROWHALEY_LOGO_BLUE, GROWHALEY_LOGO_WHITE } from './growhaley-brand.js';

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

/** Post-render quality metrics for one slide (see svg-measure.ts). */
export interface SlideRenderMetrics extends SvgContentMetrics {
  /** 1 = estimator tokens were fine; 2 = a measured correction pass ran. */
  passes: 1 | 2;
  /** Token scale applied on the second pass (1 when passes === 1). */
  appliedScale: number;
}

/** Below this share of the content zone the canvas reads as underfilled. */
const UNDERFILL_RATIO = 0.55;
/** Grow cap for the measured second pass — brand type may not balloon. */
const MAX_GROW_SCALE = 1.25;
/** Shrink applied when the measured pass finds a real overflow. */
const OVERFLOW_SHRINK = 0.9;

export class SatoriRenderer {
  async renderSlide(
    slide: SduiSlide,
    doc: SduiDocument,
    brandFonts: BrandFontRef[],
  ): Promise<Buffer> {
    const { png } = await this.renderSlideWithMetrics(slide, doc, brandFonts);
    return png;
  }

  /**
   * Two-pass render: pass 1 uses the estimator-fitted tokens, then the
   * REAL SVG bounding boxes are measured. Severe underfill or overflow
   * triggers exactly one corrective re-render with rescaled tokens.
   */
  async renderSlideWithMetrics(
    slide: SduiSlide,
    doc: SduiDocument,
    brandFonts: BrandFontRef[],
  ): Promise<{ png: Buffer; metrics: SlideRenderMetrics }> {
    const dims = canvasSize(doc.aspectRatio);
    const { fonts, availableFamilies } = await loadFonts(brandFonts);
    if (fonts.length === 0) throw new Error('no_fonts_available');

    const baseTk = makeTokens(doc, dims, availableFamilies);
    const templateId = pickTemplate(slide, doc.aspectRatio);
    const tk = fitContentTokens(slide, templateId, baseTk);

    const satoriFonts = fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style }));
    const renderSvg = async (contentTk: Tokens): Promise<string> => {
      const root = await this.buildRoot(slide, doc, dims, contentTk, baseTk, templateId);
      return satori(root as unknown as Parameters<typeof satori>[0], {
        width: dims.width,
        height: dims.height,
        fonts: satoriFonts,
      });
    };

    const zone = gwSafeArea(baseTk);
    let svg = await renderSvg(tk);
    let measured = measureSvgContent(svg, dims, zone);
    let passes: 1 | 2 = 1;
    let appliedScale = 1;

    // Photo/collage templates anchor text at the bottom over a full-bleed
    // image — a low vertical usage there is the design, not a defect.
    const underfillExempt =
      templateId.startsWith('gw_photo_') || templateId === 'gw_collage_showcase';

    if (measured.contentBoxCount > 0) {
      if (!underfillExempt && measured.contentUsageRatio < UNDERFILL_RATIO) {
        // Grow toward ~80% zone usage, capped so brand type stays sane.
        appliedScale = Math.min(
          MAX_GROW_SCALE,
          0.8 / Math.max(measured.contentUsageRatio, 0.2),
        );
      } else if (measured.overflow) {
        appliedScale = OVERFLOW_SHRINK;
      }
      if (appliedScale !== 1) {
        svg = await renderSvg(scaleTypographyTokens(tk, appliedScale));
        measured = measureSvgContent(svg, dims, zone);
        passes = 2;
      }
    }

    const png = new Resvg(svg, { fitTo: { mode: 'width', value: dims.width } }).render().asPng();
    return { png: Buffer.from(png), metrics: { ...measured, passes, appliedScale } };
  }

  private async buildRoot(
    slide: SduiSlide,
    doc: SduiDocument,
    dims: { width: number; height: number },
    tk: Tokens,
    baseTk: Tokens,
    templateId: ReturnType<typeof pickTemplate>,
  ) {
    const isLast = slide.slide_number >= doc.slides.length;

    // Chrome contrast follows the per-slide template background (lime/cream/
    // blue/photo), not the static theme, so logo/tag/pagination stay legible.
    const chromeFg = growhaleyChromeColors(slide, templateId).fg;
    const chromeTk = {
      ...baseTk,
      role: {
        ...baseTk.role,
        chrome: { ...baseTk.role.chrome, color: chromeFg },
        tag: { ...baseTk.role.tag, color: chromeFg },
      },
    };

    // Logo color follows the same contrast rule: blue mark on light (lime/
    // cream) backgrounds, white mark on dark/saturated (blue/ink/photo) ones.
    const chromeDoc: SduiDocument = doc.theme.logoUrl
      ? { ...doc, theme: { ...doc.theme, logoUrl: isLightChrome(chromeFg) ? GROWHALEY_LOGO_BLUE : GROWHALEY_LOGO_WHITE } }
      : doc;

    const middle = await renderTemplate(templateId, slide, tk);
    const topChromeNode = await topChrome(slide, chromeTk, chromeDoc);
    const bottomChromeNode = await bottomChrome(slide, chromeTk, chromeDoc, isLast);

    // Growhaley templates are all full-bleed: each template paints its own
    // canvas (background/blob/scrim/padding); chrome overlays on top.
    const isFullBleed = templateId.startsWith('gw_');

    return isFullBleed
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
  }
}
