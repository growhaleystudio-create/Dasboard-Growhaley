/**
 * Tenant-scoped repository for the `content_generation_job` table.
 *
 * Design references:
 * - design.md → Components and Interfaces → Content_Generator_Service (R10, R16)
 * - design.md → Desain Keamanan dan Privasi → Tenant Guard
 *
 * All methods accept `teamId` as first argument and scope every query to
 * `team_id`. No cross-team access is possible (R16.2).
 *
 * Requirements: 16.1, 16.2
 */

import type { AspectRatio, FailureReason, JobStatus } from '@leads-generator/shared';

import { query, type DbExecutor } from './types.js';

// ---------------------------------------------------------------------------
// Internal DB row shapes
// ---------------------------------------------------------------------------

interface ContentGenerationJobRow {
  id: string;
  team_id: string;
  master_template_id: string | null;
  prompt: string;
  aspect_ratio: AspectRatio;
  status: JobStatus;
  reason: FailureReason | null;
  inputs: Record<string, unknown> | string;
  created_at: Date | string;
  finished_at: Date | string | null;
}

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

/** Full job result returned from insert / findById. */
export interface JobInsertResult {
  id: string;
  teamId: string;
  masterTemplateId: string | null;
  prompt: string;
  aspectRatio: AspectRatio;
  status: JobStatus;
  reason: FailureReason | null;
  inputs: Record<string, unknown>;
  createdAt: Date;
  finishedAt: Date | null;
}

/** Alias used by queries that return a single full row. */
export type JobFullRow = JobInsertResult;

/** Lighter shape for list queries. */
export interface JobListItem {
  id: string;
  teamId: string;
  aspectRatio: AspectRatio;
  status: JobStatus;
  reason: FailureReason | null;
  createdAt: Date;
  finishedAt: Date | null;
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

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(value);
}

function mapJobRow(row: ContentGenerationJobRow): JobFullRow {
  return {
    id: row.id,
    teamId: row.team_id,
    masterTemplateId: row.master_template_id,
    prompt: row.prompt,
    aspectRatio: row.aspect_ratio,
    status: row.status,
    reason: row.reason,
    inputs: parseJson<Record<string, unknown>>(row.inputs, {}),
    createdAt: toDate(row.created_at),
    finishedAt: toDateOrNull(row.finished_at),
  };
}

const JOB_COLUMNS = `id, team_id, master_template_id, prompt, aspect_ratio,
  status, reason, inputs, created_at, finished_at`;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Repository for the `content_generation_job` table.
 * All methods are team-scoped (Tenant Guard, R16.2).
 */
export class ContentGenerationJobRepository {
  constructor(private readonly db: DbExecutor) {}

  /** Insert a new generation job in `pending` status. */
  async insert(data: {
    teamId: string;
    masterTemplateId?: string | null;
    prompt: string;
    aspectRatio: AspectRatio;
    inputs?: Record<string, unknown>;
  }): Promise<JobInsertResult> {
    const rows = await query<ContentGenerationJobRow>(
      this.db,
      `INSERT INTO content_generation_job
           (team_id, master_template_id, prompt, aspect_ratio, status, inputs)
           VALUES ($1, $2, $3, $4, 'pending', $5::jsonb)
       RETURNING ${JOB_COLUMNS}`,
      [
        data.teamId,
        data.masterTemplateId ?? null,
        data.prompt,
        data.aspectRatio,
        JSON.stringify(data.inputs ?? {}),
      ],
    );
    return mapJobRow(rows[0]!);
  }

  /** Look up a job by id, scoped to the Team. Returns `null` when not found. */
  async findById(teamId: string, jobId: string): Promise<JobFullRow | null> {
    const rows = await query<ContentGenerationJobRow>(
      this.db,
      `SELECT ${JOB_COLUMNS}
         FROM content_generation_job
        WHERE team_id = $1 AND id = $2`,
      [teamId, jobId],
    );
    if (rows.length === 0) return null;
    return mapJobRow(rows[0]!);
  }

  /**
   * List generation jobs for a Team, most recent first.
   * `limit` defaults to 50 when not supplied.
   */
  async listForTeam(teamId: string, limit = 50): Promise<JobListItem[]> {
    const rows = await query<ContentGenerationJobRow>(
      this.db,
      `SELECT id, team_id, aspect_ratio, status, reason, created_at, finished_at
         FROM content_generation_job
        WHERE team_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [teamId, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      aspectRatio: row.aspect_ratio,
      status: row.status,
      reason: row.reason,
      createdAt: toDate(row.created_at),
      finishedAt: toDateOrNull(row.finished_at),
    }));
  }

  /**
   * Update the lifecycle status of a job.
   * Optionally sets a `reason` when transitioning to `failed`.
   */
  async setStatus(
    teamId: string,
    jobId: string,
    status: JobStatus,
    reason?: FailureReason | null,
  ): Promise<void> {
    await query(
      this.db,
      `UPDATE content_generation_job
          SET status = $3,
              reason = $4
        WHERE team_id = $1 AND id = $2`,
      [teamId, jobId, status, reason ?? null],
    );
  }

  /** Replace the JSON inputs payload for a job, scoped to its Team. */
  async updateInputs(teamId: string, jobId: string, inputs: Record<string, unknown>): Promise<void> {
    await query(
      this.db,
      `UPDATE content_generation_job
          SET inputs = $3::jsonb
        WHERE team_id = $1 AND id = $2`,
      [teamId, jobId, JSON.stringify(inputs)],
    );
  }

  /** Mark a job as finished at the given timestamp. */
  async setFinishedAt(teamId: string, jobId: string, at: Date): Promise<void> {
    await query(
      this.db,
      `UPDATE content_generation_job
          SET finished_at = $3
        WHERE team_id = $1 AND id = $2`,
      [teamId, jobId, at],
    );
  }
}
