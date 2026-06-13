/**
 * ImageBoard.tsx — Kaku, anti-offside image container untuk carousel renderer.
 *
 * Arsitektur:
 * - Rasio dikunci via padding-bottom trick (aspect-ratio CSS / padding hack).
 * - `overflow: hidden` pada wrapper → aset TIDAK PERNAH keluar frame.
 * - `object-fit: cover` + `object-position: center` pada <img> →
 *   auto-crop proporsional seperti Auto-Layout Figma, apapun rasio sumber.
 * - Status "Async White Placeholder" saat imageUrl belum ada.
 * - Tidak ada prop layout / spacing yang bisa di-override dari luar.
 *   Semua dikontrol oleh `ratio` prop (dikunci oleh Registry).
 */

'use client';

import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// Types — kontrak kaku, sesuai Registry
// ---------------------------------------------------------------------------

export type ImageBoardRatio = '4:5' | '1:1' | '16:9';

export interface ImageBoardProps {
  /** Locked aspect ratio dari Registry. AI tidak boleh menentukan ini. */
  ratio: ImageBoardRatio;
  /**
   * URL gambar yang sudah di-generate.
   * Undefined = gambar masih di-generate di background → tampilkan white placeholder.
   * Null = generate gagal → tampilkan placeholder dengan error state.
   */
  imageUrl?: string | null;
  /** Alt text untuk aksesibilitas. */
  alt?: string;
  /** Optional className tambahan untuk sizing dari parent. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Ratio → CSS padding-bottom (fallback untuk browser lama)
// Untuk browser modern, kita gunakan `aspect-ratio` CSS.
// ---------------------------------------------------------------------------

const RATIO_CSS: Record<ImageBoardRatio, { aspectRatio: string }> = {
  '4:5': { aspectRatio: '4 / 5' },
  '1:1': { aspectRatio: '1 / 1' },
  '16:9': { aspectRatio: '16 / 9' },
};

// ---------------------------------------------------------------------------
// ImageBoard Component
// ---------------------------------------------------------------------------

export function ImageBoard({ ratio, imageUrl, alt = '', className = '' }: ImageBoardProps) {
  const [imgError, setImgError] = useState(false);
  const { aspectRatio } = RATIO_CSS[ratio];
  const isPending = imageUrl === undefined;
  const isFailed = imageUrl === null || imgError;
  const hasImage = !isPending && !isFailed && !!imageUrl;

  return (
    /*
     * WRAPPER — Kaku, anti-offside:
     * - position: relative untuk stacking context
     * - overflow: hidden → aset TIDAK PERNAH jebol keluar frame
     * - aspect-ratio dikunci dari prop `ratio`
     * - width: 100% mengikuti container parent
     */
    <div
      className={`relative w-full overflow-hidden rounded-2xl ${className}`}
      style={{ aspectRatio }}
    >
      {/* ---- STATE 1: ASYNC WHITE PLACEHOLDER (gambar masih di-generate) ---- */}
      {isPending && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white">
          {/* Subtle pulsing skeleton to indicate async loading */}
          <div className="h-full w-full animate-pulse bg-gray-100" />
          <span className="absolute text-[11px] font-medium text-gray-400 select-none">
            Generating…
          </span>
        </div>
      )}

      {/* ---- STATE 2: IMAGE LOAD FAILED ---- */}
      {isFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <span className="text-[11px] text-gray-400 select-none">Image unavailable</span>
        </div>
      )}

      {/* ---- STATE 3: IMAGE LOADED ---- */}
      {hasImage && (
        /*
         * <img> rules — Figma Auto-Layout equivalent:
         * - position: absolute + inset-0 → fill 100% of the locked container
         * - object-fit: cover → scale and CENTER-CROP proportionally
         * - object-position: center → anchor crop to center (not top-left)
         * Result: apapun rasio gambar dari AI, tampil rapi tanpa distorsi.
         */
        <img
          src={imageUrl!}
          alt={alt}
          onError={() => setImgError(true)}
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typed export for external use
// ---------------------------------------------------------------------------

export default ImageBoard;
