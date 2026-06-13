/**
 * Repository for the `visual_reference` table (Fase 3).
 * All methods are tenant-scoped.
 */

import type { VisualDna, VisualReference } from '@leads-generator/shared';
import { query, type DbExecutor } from './types.js';

interface VisualReferenceRow {
  id: string;
  team_id: string;
  name: string;
  image_url: string;
  component_sequence: string[] | string;
  header_to_body_ratio: number | string;
  layout_archetype: string;
  typography_scale: string;
  tags: string[] | string;
  created_at: Date | string;
}

function parseJson<T>(v: T | string | null | undefined, fb: T): T {
  if (v === null || v === undefined) return fb;
  if (typeof v === 'string') return JSON.parse(v) as T;
  return v;
}

function mapRow(row: VisualReferenceRow): VisualReference {
  const layoutArchetype = (['text_dominant', 'split_screen', 'background_overlay'] as const).includes(row.layout_archetype as 'text_dominant')
    ? row.layout_archetype as VisualDna['layoutArchetype']
    : 'text_dominant';
  const typographyScale = (['editorial_bold', 'balanced_classic', 'information_dense'] as const).includes(row.typography_scale as 'editorial_bold')
    ? row.typography_scale as VisualDna['typographyScale']
    : 'balanced_classic';

  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    imageUrl: row.image_url,
    dna: {
      componentSequence: parseJson<string[]>(row.component_sequence, []),
      headerToBodyRatio: Number(row.header_to_body_ratio),
      layoutArchetype,
      typographyScale,
    },
    tags: parseJson<string[]>(row.tags, []),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

export class VisualReferenceRepository {
  constructor(private readonly db: DbExecutor) {}

  async insert(
    teamId: string,
    input: { name: string; imageUrl: string; dna: VisualDna; tags: string[] },
  ): Promise<VisualReference> {
    const rows = await query<VisualReferenceRow>(
      this.db,
      `INSERT INTO visual_reference
         (team_id, name, image_url, component_sequence, header_to_body_ratio, layout_archetype, typography_scale, tags)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb)
       RETURNING *`,
      [
        teamId,
        input.name,
        input.imageUrl,
        JSON.stringify(input.dna.componentSequence),
        input.dna.headerToBodyRatio,
        input.dna.layoutArchetype,
        input.dna.typographyScale,
        JSON.stringify(input.tags),
      ],
    );
    return mapRow(rows[0]!);
  }

  async listByTeam(teamId: string): Promise<VisualReference[]> {
    const rows = await query<VisualReferenceRow>(
      this.db,
      `SELECT * FROM visual_reference WHERE team_id = $1 ORDER BY created_at DESC`,
      [teamId],
    );
    return rows.map(mapRow);
  }

  async findById(teamId: string, id: string): Promise<VisualReference | null> {
    const rows = await query<VisualReferenceRow>(
      this.db,
      `SELECT * FROM visual_reference WHERE team_id = $1 AND id = $2`,
      [teamId, id],
    );
    return rows.length > 0 ? mapRow(rows[0]!) : null;
  }

  async delete(teamId: string, id: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      this.db,
      `DELETE FROM visual_reference WHERE team_id = $1 AND id = $2 RETURNING id`,
      [teamId, id],
    );
    return rows.length > 0;
  }
}
