/**
 * Tenant-scoped repository for the `content_generation_slide` table.
 *
 * Design references:
 * - design.md → Components and Interfaces → Content_Generator_Service (R5, R10, R11, R16)
 * - design.md → Desain Keamanan dan Privasi → Tenant Guard
 *
 * Slides are scoped via a JOIN on `content_generation_job.team_id` so that
 * every slide query is still filtered by `team_id` (Tenant Guard, R16.2).
 * The PRIMARY KEY on `content_generation_slide` is `(job_id, index)`.
 *
 * Requirements: 16.1, 16.2
 */

import type { BlockType, FailureReason, SlideStatus } from '@leads-generator/shared';

import { query, type DbExecutor } from './types.js';

// ---------------------------------------------------------------------------
// Internal DB row shape
// ---------------------------------------------------------------------------

interface ContentGenerationSlideRow {
  job_id: string;
  index: number;
  status: SlideStatus;
  image_url: string | null;
  reason: FailureReason | null;
  used_fallback: boolean;
  block_composition: BlockType[] | string;
}

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export interface SlideResult {
  jobId: string;
  index: number;
  status: SlideStatus;
  imageUrl: string | null;
  reason: FailureReason | null;
  usedFallback: boolean;
  blockComposition: BlockType[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson<T>(value: T | string | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value;
}

function mapSlideRow(row: ContentGenerationSlideRow): SlideResult {
  return {
    jobId: row.job_id,
    index: row.index,
    status: row.status,
    imageUrl: row.image_url,
    reason: row.reason,
    usedFallback: row.used_fallback,
    blockComposition: parseJson<BlockType[]>(row.block_composition, []),
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Repository for the `content_generation_slide` table.
 * All methods are team-scoped via a JOIN on `content_generation_job.team_id`
 * (Tenant Guard, R16.2).
 */
export class ContentGenerationSlideRepository {
  constructor(private readonly db: DbExecutor) {}

  /**
   * Insert a new slide record for a job.
   * Caller must have already verified the job belongs to the Team.
   */
  async insertSlide(data: {
    teamId: string;
    jobId: string;
    index: number;
    status?: SlideStatus;
    blockComposition?: BlockType[];
  }): Promise<SlideResult> {
    const rows = await query<ContentGenerationSlideRow>(
      this.db,
      `INSERT INTO content_generation_slide
           (job_id, index, status, block_composition)
       SELECT $2, $3, $4, $5::jsonb
         FROM content_generation_job j
        WHERE j.id = $2 AND j.team_id = $1
       RETURNING job_id, index, status, image_url, reason, used_fallback, block_composition`,
      [
        data.teamId,
        data.jobId,
        data.index,
        data.status ?? 'pending',
        JSON.stringify(data.blockComposition ?? []),
      ],
    );
    return mapSlideRow(rows[0]!);
  }

  /**
   * Update a slide's status and optional image URL / reason / fallback flag.
   * Scoped via the job's `team_id`.
   */
  async updateSlide(
    teamId: string,
    jobId: string,
    index: number,
    fields: {
      status: SlideStatus;
      imageUrl?: string | null;
      reason?: FailureReason | null;
      usedFallback?: boolean;
    },
  ): Promise<void> {
    await query(
      this.db,
      `UPDATE content_generation_slide s
          SET status        = $4,
              image_url     = $5,
              reason        = $6,
              used_fallback = $7
         FROM content_generation_job j
        WHERE j.id = s.job_id
          AND j.team_id = $1
          AND s.job_id  = $2
          AND s.index   = $3`,
      [
        teamId,
        jobId,
        index,
        fields.status,
        fields.imageUrl ?? null,
        fields.reason ?? null,
        fields.usedFallback ?? false,
      ],
    );
  }

  /**
   * List all slides for a job, ordered by slide index.
   * Scoped via the job's `team_id`.
   */
  async listSlides(teamId: string, jobId: string): Promise<SlideResult[]> {
    const rows = await query<ContentGenerationSlideRow>(
      this.db,
      `SELECT s.job_id, s.index, s.status, s.image_url, s.reason,
              s.used_fallback, s.block_composition
         FROM content_generation_slide s
         JOIN content_generation_job j ON j.id = s.job_id
        WHERE j.team_id = $1 AND s.job_id = $2
        ORDER BY s.index ASC`,
      [teamId, jobId],
    );
    return rows.map(mapSlideRow);
  }
}
