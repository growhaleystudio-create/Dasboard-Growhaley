/**
 * Tenant-scoped repository for `brand_kit` and `brand_font` rows.
 *
 * Design references:
 * - design.md → Components and Interfaces → BrandKitService (R1, R16)
 * - design.md → Desain Keamanan dan Privasi → Tenant Guard
 *
 * All methods accept `teamId` as first argument and scope every query to
 * `team_id`. No cross-team access is possible (R16.2).
 *
 * Requirements: 16.1, 16.2
 */

import type { BrandFont, BrandKit, BrandTypography } from '@leads-generator/shared';

import { query, type DbExecutor } from './types.js';

// ---------------------------------------------------------------------------
// Internal DB row shapes
// ---------------------------------------------------------------------------

/** Raw row from `brand_kit` table. */
export interface BrandKitRow {
  id: string;
  team_id: string;
  logo_url: string;
  /** pg returns jsonb as parsed object; may arrive as string in tests. */
  colors: string[] | string;
  chrome: BrandKit['chrome'] | string;
  typography?: BrandTypography | string | null;
  updated_at: Date | string;
}

/** Raw row from `brand_font` table. */
export interface BrandFontRow {
  id: string;
  brand_kit_id: string;
  url: string;
  family: string;
  weight: number | null;
  style: 'normal' | 'italic' | null;
  format: 'ttf' | 'otf';
  created_at: Date | string;
}

/** A `brand_kit` row joined with its fonts (result type exposed to callers). */
export interface BrandKitWithFonts extends BrandKit {}

/** Public row type alias for callers that only need raw DB fields. */
export interface BrandKitRow_Public extends BrandKitRow {}

/** Font result type returned by font-level methods. */
export interface BrandFontResult extends BrandFont {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson<T>(value: T | string | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapBrandFontRow(row: BrandFontRow): BrandFont {
  const font: BrandFont = {
    id: row.id,
    url: row.url,
    family: row.family,
  };
  if (row.weight !== null) font.weight = row.weight;
  if (row.style !== null) font.style = row.style;
  return font;
}

function mapBrandKitRow(row: BrandKitRow, fonts: BrandFontRow[]): BrandKit {
  const kit: BrandKit = {
    id: row.id,
    teamId: row.team_id,
    logoUrl: row.logo_url,
    fonts: fonts.map(mapBrandFontRow),
    colors: parseJson<string[]>(row.colors, []),
    chrome: parseJson<BrandKit['chrome']>(row.chrome, {
      logoPlacement: 'none',
      pageNumberFormat: '',
      siteUrl: '',
    }),
    updatedAt: toDate(row.updated_at),
  };
  const typography = parseJson<BrandTypography | null>(row.typography ?? null, null);
  if (typography) kit.typography = typography;
  return kit;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Repository for the `brand_kit` and `brand_font` tables.
 * All methods are team-scoped (Tenant Guard, R16.2).
 */
export class BrandKitRepository {
  constructor(private readonly db: DbExecutor) {}

  /**
   * Return the single `BrandKit` row for a Team (with fonts joined), or
   * `null` when no Brand_Kit has been saved yet.
   */
  async findByTeam(teamId: string): Promise<BrandKit | null> {
    const kits = await query<BrandKitRow>(
      this.db,
      `SELECT id, team_id, logo_url, colors, chrome, typography, updated_at
         FROM brand_kit
        WHERE team_id = $1`,
      [teamId],
    );
    if (kits.length === 0) return null;

    const kit = kits[0]!;
    const fonts = await query<BrandFontRow>(
      this.db,
      `SELECT id, brand_kit_id, url, family, weight, style, format, created_at
         FROM brand_font
        WHERE brand_kit_id = $1
        ORDER BY created_at ASC`,
      [kit.id],
    );
    return mapBrandKitRow(kit, fonts);
  }

  /**
   * Upsert the `brand_kit` row for a Team.
   * ON CONFLICT (team_id) updates all mutable columns.
   * Returns the persisted row (without fonts — call `findByTeam` for the
   * full view or use `insertFont` afterwards).
   */
  async insert(
    teamId: string,
    input: { logoUrl: string; colors: string[]; chrome: BrandKit['chrome']; typography?: BrandTypography },
  ): Promise<BrandKit> {
    const rows = await query<BrandKitRow>(
      this.db,
      `INSERT INTO brand_kit (team_id, logo_url, colors, chrome, typography, updated_at)
            VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, now())
       ON CONFLICT (team_id)
       DO UPDATE SET
           logo_url   = EXCLUDED.logo_url,
           colors     = EXCLUDED.colors,
           chrome     = EXCLUDED.chrome,
           typography = EXCLUDED.typography,
           updated_at = now()
       RETURNING id, team_id, logo_url, colors, chrome, typography, updated_at`,
      [
        teamId,
        input.logoUrl,
        JSON.stringify(input.colors),
        JSON.stringify(input.chrome),
        input.typography ? JSON.stringify(input.typography) : null,
      ],
    );
    return mapBrandKitRow(rows[0]!, []);
  }

  /**
   * Append a font record to the `brand_font` table for a given Brand_Kit.
   * Does NOT validate ownership of `brandKitId` against `teamId` — callers
   * must use `findByTeam` first to resolve the `id` safely.
   */
  async insertFont(
    brandKitId: string,
    font: {
      url: string;
      family: string;
      weight?: number;
      style?: 'normal' | 'italic';
      format: 'ttf' | 'otf';
    },
  ): Promise<void> {
    await query(
      this.db,
      `INSERT INTO brand_font (brand_kit_id, url, family, weight, style, format)
            VALUES ($1, $2, $3, $4, $5, $6)`,
      [brandKitId, font.url, font.family, font.weight ?? null, font.style ?? null, font.format],
    );
  }

  /**
   * Delete all font rows for a given Brand_Kit (before replacing them on an
   * update). Does NOT validate ownership — callers are responsible.
   */
  async deleteFonts(brandKitId: string): Promise<void> {
    await query(this.db, `DELETE FROM brand_font WHERE brand_kit_id = $1`, [brandKitId]);
  }
}
