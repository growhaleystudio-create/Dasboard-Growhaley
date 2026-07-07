/**
 * Tenant-scoped repository for the `master_template` table.
 *
 * Design references:
 * - design.md → Components and Interfaces → MasterTemplateService (R2, R9, R16)
 * - design.md → Desain Keamanan dan Privasi → Tenant Guard
 *
 * All methods accept `teamId` as first argument and scope every query to
 * `team_id`. No cross-team access is possible (R16.2).
 *
 * Requirements: 16.1, 16.2
 */

import type { AspectRatio, BlockType, MasterTemplate, TextLengthLimit } from '@leads-generator/shared';

import { query, type DbExecutor } from './types.js';

// ---------------------------------------------------------------------------
// Internal DB row shape
// ---------------------------------------------------------------------------

interface MasterTemplateRow {
  id: string;
  team_id: string;
  allowed_blocks: BlockType[] | string;
  max_slides: number;
  text_limits: TextLengthLimit[] | string;
  aspect_ratios: AspectRatio[] | string;
  default_tone: string;
  updated_at: Date | string;
}

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

function mapRow(row: MasterTemplateRow): MasterTemplate {
  return {
    id: row.id,
    teamId: row.team_id,
    allowedBlocks: parseJson<BlockType[]>(row.allowed_blocks, []),
    maxSlides: row.max_slides,
    textLimits: parseJson<TextLengthLimit[]>(row.text_limits, []),
    aspectRatios: parseJson<AspectRatio[]>(row.aspect_ratios, []),
    defaultTone: row.default_tone,
    updatedAt: toDate(row.updated_at),
  };
}

const COLUMNS = `id, team_id, allowed_blocks, max_slides,
  text_limits, aspect_ratios, default_tone, updated_at`;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Repository for the `master_template` table.
 * All methods are team-scoped (Tenant Guard, R16.2).
 */
export class MasterTemplateRepository {
  constructor(private readonly db: DbExecutor) {}

  /** Return the single Master_Template for a Team, or `null` if none saved. */
  async findByTeam(teamId: string): Promise<MasterTemplate | null> {
    const rows = await query<MasterTemplateRow>(
      this.db,
      `SELECT ${COLUMNS}
         FROM master_template
        WHERE team_id = $1`,
      [teamId],
    );
    if (rows.length === 0) return null;
    return mapRow(rows[0]!);
  }

  /**
   * Upsert the `master_template` row for a Team.
   * ON CONFLICT (team_id) updates all mutable columns.
   */
  async upsert(
    teamId: string,
    data: {
      allowedBlocks: BlockType[];
      maxSlides: number;
      textLimits: TextLengthLimit[];
      aspectRatios: AspectRatio[];
      defaultTone: string;
    },
  ): Promise<MasterTemplate> {
    const rows = await query<MasterTemplateRow>(
      this.db,
      `INSERT INTO master_template
           (team_id, allowed_blocks, max_slides, text_limits, aspect_ratios, default_tone, updated_at)
           VALUES ($1, $2::jsonb, $3, $4::jsonb, $5::jsonb, $6, now())
       ON CONFLICT (team_id)
       DO UPDATE SET
           allowed_blocks = EXCLUDED.allowed_blocks,
           max_slides     = EXCLUDED.max_slides,
           text_limits    = EXCLUDED.text_limits,
           aspect_ratios  = EXCLUDED.aspect_ratios,
           default_tone   = EXCLUDED.default_tone,
           updated_at     = now()
       RETURNING ${COLUMNS}`,
      [
        teamId,
        JSON.stringify(data.allowedBlocks),
        data.maxSlides,
        JSON.stringify(data.textLimits),
        JSON.stringify(data.aspectRatios),
        data.defaultTone,
      ],
    );
    return mapRow(rows[0]!);
  }
}
