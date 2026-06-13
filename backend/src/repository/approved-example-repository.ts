/**
 * Tenant-scoped repository for the `approved_example` table.
 *
 * Design references:
 * - design.md → Components and Interfaces → ApprovedExampleService (R8, R16)
 * - design.md → Desain Keamanan dan Privasi → Tenant Guard
 *
 * All methods accept `teamId` as first argument and scope every query to
 * `team_id`. No cross-team access is possible (R16.2).
 *
 * Requirements: 16.1, 16.2
 */

import type { ApprovedExampleStructure, AspectRatio } from '@leads-generator/shared';

import { query, type DbExecutor } from './types.js';

// ---------------------------------------------------------------------------
// Internal DB row shape
// ---------------------------------------------------------------------------

interface ApprovedExampleRow {
  id: string;
  team_id: string;
  layout_structure: ApprovedExampleStructure | string;
  tags: string[] | string;
  aspect_ratio: AspectRatio;
  source_job_id: string | null;
  created_at: Date | string;
}

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export interface ApprovedExampleResult {
  id: string;
  teamId: string;
  layoutStructure: ApprovedExampleStructure;
  tags: string[];
  aspectRatio: AspectRatio;
  sourceJobId: string | null;
  createdAt: Date;
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

function mapRow(row: ApprovedExampleRow): ApprovedExampleResult {
  return {
    id: row.id,
    teamId: row.team_id,
    layoutStructure: parseJson<ApprovedExampleStructure>(row.layout_structure, {
      aspectRatio: row.aspect_ratio,
      tags: [],
      slides: [],
    }),
    tags: parseJson<string[]>(row.tags, []),
    aspectRatio: row.aspect_ratio,
    sourceJobId: row.source_job_id,
    createdAt: toDate(row.created_at),
  };
}

const COLUMNS = `id, team_id, layout_structure, tags, aspect_ratio, source_job_id, created_at`;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Repository for the `approved_example` table.
 * All methods are team-scoped (Tenant Guard, R16.2).
 */
export class ApprovedExampleRepository {
  constructor(private readonly db: DbExecutor) {}

  /** Insert a new approved example for a Team. */
  async insert(
    teamId: string,
    data: {
      layoutStructure: ApprovedExampleStructure;
      tags: string[];
      aspectRatio: AspectRatio;
      sourceJobId?: string | null;
    },
  ): Promise<ApprovedExampleResult> {
    const rows = await query<ApprovedExampleRow>(
      this.db,
      `INSERT INTO approved_example
           (team_id, layout_structure, tags, aspect_ratio, source_job_id)
           VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
       RETURNING ${COLUMNS}`,
      [
        teamId,
        JSON.stringify(data.layoutStructure),
        JSON.stringify(data.tags),
        data.aspectRatio,
        data.sourceJobId ?? null,
      ],
    );
    return mapRow(rows[0]!);
  }

  /**
   * Delete an approved example by id, scoped to the Team.
   * Returns `true` when a row was deleted, `false` when not found.
   */
  async delete(teamId: string, exampleId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      this.db,
      `DELETE FROM approved_example
        WHERE team_id = $1 AND id = $2
       RETURNING id`,
      [teamId, exampleId],
    );
    return rows.length > 0;
  }

  /** List all approved examples for a Team, most recently created first. */
  async listForTeam(teamId: string): Promise<ApprovedExampleResult[]> {
    const rows = await query<ApprovedExampleRow>(
      this.db,
      `SELECT ${COLUMNS}
         FROM approved_example
        WHERE team_id = $1
        ORDER BY created_at DESC`,
      [teamId],
    );
    return rows.map(mapRow);
  }

  /** Look up a single approved example by id, scoped to the Team. */
  async findById(teamId: string, id: string): Promise<ApprovedExampleResult | null> {
    const rows = await query<ApprovedExampleRow>(
      this.db,
      `SELECT ${COLUMNS}
         FROM approved_example
        WHERE team_id = $1 AND id = $2`,
      [teamId, id],
    );
    if (rows.length === 0) return null;
    return mapRow(rows[0]!);
  }
}
