import type { AspectRatio, AppErrorCode, LayoutStylePreference, ImagePreferenceMode } from '@leads-generator/shared';
import type { ExtraTypographyRole, LayoutStyleOption } from './content-generator-types';

export const ASPECT_RATIOS: AspectRatio[] = ['1:1', '4:5', '9:16'];

export const LOGO_PLACEMENT_OPTIONS = [
  { label: 'Top Left', value: 'top-left' },
  { label: 'Top Right', value: 'top-right' },
  { label: 'Bottom Left', value: 'bottom-left' },
  { label: 'Bottom Right', value: 'bottom-right' },
  { label: 'No Logo', value: 'none' },
];

export const BRAND_COLOR_PRESETS = [
  { label: 'Clean', colors: ['#111827', '#F8FAFC', '#2563EB'] },
  { label: 'Warm', colors: ['#18181B', '#FFF7ED', '#F97316'] },
  { label: 'Fresh', colors: ['#0F172A', '#F0FDFA', '#14B8A6'] },
  { label: 'Bold', colors: ['#0A0D14', '#F5F3FF', '#7C3AED'] },
] as const;

export const EXTRA_TYPOGRAPHY_ROLE_CONFIG: {
  role: ExtraTypographyRole;
  label: string;
  defaultColor: string;
  defaultSize: string;
}[] = [
  { role: 'tag', label: 'Tag', defaultColor: '#5b626e', defaultSize: '16' },
  { role: 'quote', label: 'Quote', defaultColor: '#1a1d24', defaultSize: '44' },
  { role: 'list', label: 'List', defaultColor: '#5b626e', defaultSize: '22' },
  { role: 'cta', label: 'CTA', defaultColor: '#FFFFFF', defaultSize: '20' },
  { role: 'card', label: 'Card', defaultColor: '#1a1d24', defaultSize: '20' },
  { role: 'stat', label: 'Stat', defaultColor: '#1a1d24', defaultSize: '52' },
  { role: 'caption', label: 'Caption', defaultColor: '#5b626e', defaultSize: '14' },
  { role: 'chrome', label: 'Chrome', defaultColor: '#5b626e', defaultSize: '15' },
];

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
export const CLIENT_POLL_CAP_MS = 270_000;

export const LAYOUT_STYLE_OPTIONS: LayoutStyleOption[] = [
  { value: 'auto', label: 'Auto', description: 'Biarkan planner pilih style terbaik.' },
  { value: 'scrapbook', label: 'Scrapbook', description: 'Kolase visual, layered, image-led.' },
  { value: 'editorial', label: 'Editorial', description: 'Rasa majalah, naratif, premium.' },
  { value: 'bento', label: 'Bento', description: 'Modular blocks untuk info dan fitur.' },
  { value: 'timeline', label: 'Timeline', description: 'Cocok untuk urutan, tahapan, roadmap.' },
  { value: 'comparison', label: 'Comparison', description: 'Side-by-side, before/after, pro-kontra.' },
  { value: 'ui_mockup', label: 'UI Mockup', description: 'Cocok untuk app, screen, product UI.' },
  { value: 'chart', label: 'Chart', description: 'Data-led, metrik, analitis.' },
  { value: 'seamless', label: 'Seamless', description: 'Swipe flow menyambung, visual continuity.' },
  { value: 'alternating_contrast', label: 'Alt Contrast', description: 'Ritme kontras kuat antar slide.' },
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
