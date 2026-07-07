import type {
  AspectRatio,
  AppErrorCode,
  LayoutStylePreference,
  ImagePreferenceMode,
  GwPaletteChoice,
  GwAccentChoice,
  GwHeaderComposition,
} from '@leads-generator/shared';
import {
  CONTENT_JOB_REAPER_DEADLINE_MS,
  GW_PALETTE_HEX,
  GW_ACCENT_HEX,
} from '@leads-generator/shared';
import type { LayoutStyleOption } from './content-generator-types';

export const ASPECT_RATIOS: AspectRatio[] = ['1:1', '4:5', '9:16'];

export const FAILURE_LABEL: Record<string, string> = {
  validation_error: 'Konten perlu diperbaiki',
  budget_exceeded: 'Budget AI habis',
  endpoint_mismatch: 'Endpoint tidak sesuai',
  insecure_transport: 'Koneksi tidak aman',
  privacy_violation: 'Terdeteksi data pribadi',
  background_unclean: 'Background tidak bersih',
  missing_chart_data: 'Data chart hilang',
  missing_mockup: 'Berkas mockup hilang',
  upload_failed: 'Gagal upload gambar',
  off_brand: 'Tidak sesuai brand',
  provider_error: 'Error provider AI',
  timeout: 'Waktu pemrosesan habis',
  layout_unsatisfiable: 'Layout tidak dapat diterapkan',
};

export const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
/**
 * Client stops polling this long after a job starts. Derived from the server
 * lazy-reaper deadline (+30s slack) so the server virtually always reports a
 * terminal status (`failed`/`timeout`) before the client gives up — the
 * client cap is a pure backstop.
 */
export const CLIENT_POLL_CAP_MS = CONTENT_JOB_REAPER_DEADLINE_MS + 30_000;
/** Poll every 2s for the first 90s of a job, then back off to 5s. */
export const POLL_FAST_INTERVAL_MS = 2_000;
export const POLL_SLOW_INTERVAL_MS = 5_000;
export const POLL_FAST_WINDOW_MS = 90_000;

export const LAYOUT_STYLE_OPTIONS: LayoutStyleOption[] = [
  { value: 'auto', label: 'Auto', description: 'Biarkan planner pilih arketipe terbaik.' },
  { value: 'poster', label: 'Poster', description: 'Tipografi display raksasa di warna brand — 100% grafis.' },
  { value: 'photo', label: 'Photo', description: 'Foto full-bleed dengan tipografi lime dramatis.' },
  { value: 'collage', label: 'Collage', description: 'Kanvas biru + teks raksasa + kartu foto tumpang tindih.' },
];

export const IMAGE_PREFERENCE_OPTIONS: { value: ImagePreferenceMode; label: string; description: string }[] = [
  { value: 'auto', label: 'Auto', description: 'Planner bebas pakai gambar saat perlu.' },
  { value: 'all_slides_image', label: 'All Slides Image', description: 'Semua slide wajib image.' },
];

export const ASPECT_RATIO_CLASS: Record<AspectRatio, string> = {
  '1:1': 'aspect-square',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]',
};

// ---------------------------------------------------------------------------
// Visual layout preview (Planning Mode)
// ---------------------------------------------------------------------------

/** Debounce before re-rendering a slide preview after a control change. */
export const PREVIEW_DEBOUNCE_MS = 400;

/** Swatch hex per palette/accent — sourced from shared so the picker matches
 *  the renderer exactly. */
export const GW_SWATCH_PALETTE_HEX = GW_PALETTE_HEX;
export const GW_SWATCH_ACCENT_HEX = GW_ACCENT_HEX;

export const PALETTE_OPTIONS: { value: GwPaletteChoice; label: string }[] = [
  { value: 'lime', label: 'Lime' },
  { value: 'cream', label: 'Cream' },
  { value: 'blue', label: 'Blue Sea' },
  { value: 'ink', label: 'Ink' },
];

export const ACCENT_OPTIONS: { value: GwAccentChoice; label: string }[] = [
  { value: 'magenta', label: 'Magenta' },
  { value: 'blue', label: 'Blue' },
  { value: 'lime', label: 'Lime' },
  { value: 'cream', label: 'Cream' },
];

export const HEADER_COMPOSITION_OPTIONS: { value: GwHeaderComposition; label: string }[] = [
  { value: 'staggered', label: 'Bertingkat' },
  { value: 'left', label: 'Kiri' },
  { value: 'center', label: 'Tengah' },
  { value: 'right', label: 'Kanan' },
];

/** Bahasa Indonesia microcopy for the preview UI. */
export const PREVIEW_LABELS = {
  title: 'Pratinjau Layout',
  subtitle: 'Atur layout & warna tiap slide. Foto dibuat saat render final.',
  updating: 'Memperbarui pratinjau…',
  layout: 'Layout',
  palette: 'Warna kanvas',
  accent: 'Aksen',
  headerComposition: 'Komposisi judul',
  more: 'Opsi lain',
  editText: 'Edit teks',
  aiRegen: 'AI perbaiki slide',
  aiRewriteForLayout: 'AI tulis ulang untuk layout ini',
  textAdjusted: 'Teks disesuaikan agar muat',
  photoNote: 'Foto dibuat saat render final',
  zoom: 'Klik untuk perbesar',
  retry: 'Coba lagi',
  renderFinal: 'Terapkan & Render Final',
  draftNote: 'Perubahan disimpan di draft — belum di-render final',
} as const;
