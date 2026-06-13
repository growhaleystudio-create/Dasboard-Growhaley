/**
 * MockupRenderer — deterministic image compositing via sharp.
 *
 * Implements Requirement 7.2: renders each `mockup` Content_Block from the
 * user-supplied image file deterministically by code.  No AI image model is
 * called.  Same input → same output (deterministic / idempotent).
 *
 * Three frame presets are supported:
 *  - 'phone':   SVG phone outline (rounded rect + notch) composited over the
 *               user image, which is resized to fit the screen area.
 *  - 'browser': SVG browser chrome (address-bar strip + traffic-light dots)
 *               placed above the user image.
 *  - 'plain':   User image simply resized / fit to target size — no frame.
 */

import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MockupFrame = 'phone' | 'browser' | 'plain';

export interface MockupSize {
  w: number;
  h: number;
}

export interface MockupRenderer {
  /**
   * Composite `image` (raw PNG/JPEG/WebP buffer supplied by the user) into the
   * requested device `frame` at the given `size`.
   *
   * Returns a PNG Buffer.  Always deterministic — never calls an AI provider.
   */
  render(image: Buffer, frame: MockupFrame, size: MockupSize): Promise<Buffer>;
}

// ---------------------------------------------------------------------------
// SVG frame generators
// ---------------------------------------------------------------------------

/**
 * Generates a minimal phone frame SVG:
 *  - Outer rounded rectangle outline.
 *  - Top notch (centered pill).
 *  - Screen area left open so the user image shows through underneath.
 *
 * The screen area starts at (padX, padTop) and fills the rest of the rect.
 * Padding: ~10 % sides, ~15 % top, ~10 % bottom for the chrome bar.
 */
function buildPhoneSvg(w: number, h: number): { svg: string; screenX: number; screenY: number; screenW: number; screenH: number } {
  const padX = Math.round(w * 0.10);
  const padTop = Math.round(h * 0.15);
  const padBottom = Math.round(h * 0.10);

  // Outer frame dimensions
  const frameX = padX;
  const frameY = Math.round(h * 0.04);
  const frameW = w - padX * 2;
  const frameH = h - frameY * 2;
  const radius = Math.round(frameW * 0.12);

  // Screen area (inside the frame)
  const screenX = frameX + 4;
  const screenY = frameY + padTop;
  const screenW = frameW - 8;
  const screenH = frameH - padTop - padBottom;

  // Notch (centered at top of frame)
  const notchW = Math.round(frameW * 0.30);
  const notchH = Math.round(padTop * 0.35);
  const notchX = frameX + (frameW - notchW) / 2;
  const notchY = frameY + Math.round(padTop * 0.15);
  const notchR = Math.round(notchH / 2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <!-- Phone outer frame -->
  <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}"
        rx="${radius}" ry="${radius}"
        fill="none" stroke="#1a1a2e" stroke-width="5"/>
  <!-- Inner screen border -->
  <rect x="${screenX}" y="${screenY}" width="${screenW}" height="${screenH}"
        fill="none" stroke="#1a1a2e" stroke-width="2" opacity="0.4"/>
  <!-- Top notch -->
  <rect x="${notchX}" y="${notchY}" width="${notchW}" height="${notchH}"
        rx="${notchR}" ry="${notchR}"
        fill="#1a1a2e"/>
</svg>`;

  return { svg, screenX, screenY, screenW, screenH };
}

/**
 * Generates a minimal browser-chrome SVG:
 *  - Address bar strip at the top (height = ~12 % of total height).
 *  - Three traffic-light circles on the left.
 *  - A rounded address-bar input area.
 *
 * The content area starts below the strip.
 */
function buildBrowserSvg(w: number, h: number): { svg: string; contentX: number; contentY: number; contentW: number; contentH: number } {
  const barH = Math.round(h * 0.12);
  const barY = 0;

  // Traffic-light dots
  const dotR = Math.round(barH * 0.18);
  const dotY = barH / 2;
  const dot1X = Math.round(barH * 0.35);
  const dot2X = dot1X + dotR * 3;
  const dot3X = dot2X + dotR * 3;

  // Address bar input
  const inputX = dot3X + dotR * 3;
  const inputW = w - inputX - Math.round(barH * 0.3);
  const inputH = Math.round(barH * 0.5);
  const inputY = (barH - inputH) / 2;
  const inputR = Math.round(inputH / 2);

  // Content area below the bar
  const contentX = 0;
  const contentY = barH;
  const contentW = w;
  const contentH = h - barH;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <!-- Browser chrome bar background -->
  <rect x="0" y="${barY}" width="${w}" height="${barH}" fill="#e8e8e8"/>
  <!-- Bottom border of bar -->
  <line x1="0" y1="${barH}" x2="${w}" y2="${barH}" stroke="#c0c0c0" stroke-width="1"/>
  <!-- Traffic-light dots -->
  <circle cx="${dot1X}" cy="${dotY}" r="${dotR}" fill="#ff5f57"/>
  <circle cx="${dot2X}" cy="${dotY}" r="${dotR}" fill="#ffbd2e"/>
  <circle cx="${dot3X}" cy="${dotY}" r="${dotR}" fill="#28c840"/>
  <!-- Address bar -->
  <rect x="${inputX}" y="${inputY}" width="${inputW}" height="${inputH}"
        rx="${inputR}" ry="${inputR}"
        fill="white" stroke="#c0c0c0" stroke-width="1"/>
</svg>`;

  return { svg, contentX, contentY, contentW, contentH };
}

// ---------------------------------------------------------------------------
// SharpMockupRenderer implementation
// ---------------------------------------------------------------------------

export class SharpMockupRenderer implements MockupRenderer {
  async render(image: Buffer, frame: MockupFrame, size: MockupSize): Promise<Buffer> {
    const { w, h } = size;

    switch (frame) {
      case 'plain':
        return this._renderPlain(image, w, h);
      case 'phone':
        return this._renderPhone(image, w, h);
      case 'browser':
        return this._renderBrowser(image, w, h);
    }
  }

  // -------------------------------------------------------------------------
  // Plain: resize/fit user image to target size, no frame overlay.
  // -------------------------------------------------------------------------
  private async _renderPlain(image: Buffer, w: number, h: number): Promise<Buffer> {
    return sharp(image)
      .resize(w, h, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
  }

  // -------------------------------------------------------------------------
  // Phone: user image in screen area, SVG frame overlay on top.
  // -------------------------------------------------------------------------
  private async _renderPhone(image: Buffer, w: number, h: number): Promise<Buffer> {
    const { svg, screenX, screenY, screenW, screenH } = buildPhoneSvg(w, h);

    // 1. Resize user image to fit within the screen area.
    const userResized = await sharp(image)
      .resize(screenW, screenH, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();

    // 2. Build blank canvas at target size.
    const canvas = sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    });

    // 3. Rasterize the SVG frame.
    const framePng = await sharp(Buffer.from(svg)).png().toBuffer();

    // 4. Composite: user image first (at screen position), frame overlay on top.
    return canvas
      .composite([
        { input: userResized, top: screenY, left: screenX },
        { input: framePng, top: 0, left: 0 },
      ])
      .png()
      .toBuffer();
  }

  // -------------------------------------------------------------------------
  // Browser: browser chrome on top, user image fills content area below.
  // -------------------------------------------------------------------------
  private async _renderBrowser(image: Buffer, w: number, h: number): Promise<Buffer> {
    const { svg, contentX, contentY, contentW, contentH } = buildBrowserSvg(w, h);

    // 1. Resize user image to fill the content area.
    const userResized = await sharp(image)
      .resize(contentW, contentH, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();

    // 2. Rasterize the SVG chrome overlay.
    const framePng = await sharp(Buffer.from(svg)).png().toBuffer();

    // 3. Build blank canvas.
    const canvas = sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    });

    // 4. Composite: user image in content area, chrome bar overlay on top.
    return canvas
      .composite([
        { input: userResized, top: contentY, left: contentX },
        { input: framePng, top: 0, left: 0 },
      ])
      .png()
      .toBuffer();
  }
}
