import type { LayoutStylePreference } from './content.js';

export interface LayoutStyleGroup {
  id: Exclude<LayoutStylePreference, 'auto'>;
  label: string;
  description: string;
  variantIds: string[];
  supportsAllSlidesImage: boolean;
  fallbackStyle: LayoutStylePreference;
}

/**
 * Growhaley archetype groups — one group per template family.
 * Every id here must exist in LAYOUT_CATALOG / the renderer registry.
 */
export const LAYOUT_STYLE_GROUPS: readonly LayoutStyleGroup[] = [
  {
    id: 'poster',
    label: 'Poster',
    description:
      'Tipografi display raksasa di atas warna brand (lime/cream/blue) — 100% grafis tanpa foto.',
    variantIds: [
      'gw_poster_cover',
      'gw_poster_statement',
      'gw_poster_list',
      'gw_poster_stat',
      'gw_poster_quote',
      'gw_poster_cta',
      'gw_poster_cards',
    ],
    supportsAllSlidesImage: false,
    fallbackStyle: 'photo',
  },
  {
    id: 'photo',
    label: 'Photo',
    description:
      'Foto full-bleed dengan tipografi lime dramatis — teks rotasi di tepi atau statement di atas scrim.',
    variantIds: ['gw_photo_rotated', 'gw_photo_statement', 'gw_collage_showcase'],
    supportsAllSlidesImage: true,
    fallbackStyle: 'collage',
  },
  {
    id: 'collage',
    label: 'Collage',
    description:
      'Kanvas Blue Sea dengan teks lime raksasa dan kartu foto/proyek yang saling tumpang tindih.',
    variantIds: ['gw_collage_showcase', 'gw_photo_statement', 'gw_photo_rotated'],
    supportsAllSlidesImage: true,
    fallbackStyle: 'photo',
  },
] as const;

export function layoutStyleGroupById(
  id: LayoutStylePreference | undefined,
): LayoutStyleGroup | undefined {
  if (!id || id === 'auto') return undefined;
  return LAYOUT_STYLE_GROUPS.find((group) => group.id === id);
}
