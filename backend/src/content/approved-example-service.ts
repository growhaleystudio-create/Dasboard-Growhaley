/**
 * ApprovedExampleService — manages the Example_Library of approved carousel
 * layout structures for a Team.
 *
 * Design references:
 * - design.md → Components and Interfaces → ApprovedExampleService & ExampleRetriever
 *
 * `approve` snapshots the layout structure (blocks per slide + aspect_ratio)
 * from a completed generation job WITHOUT any brand data (no colors/fonts/logo).
 * The persisted structure can later be used as a few-shot reference for the AI
 * content planner.
 *
 * All mutations are team-scoped and emit a `content_manage` audit entry so
 * the audit trail remains complete (R11.8).
 *
 * Requirements: 8.1, 8.5, 8.6
 */

import type { ApprovedExampleStructure } from '@leads-generator/shared';
import { err, ok, type Result } from '@leads-generator/shared';

import type { AuditLog } from '../privacy/audit-log.js';
import type { ApprovedExampleRepository } from '../repository/approved-example-repository.js';
import type { ContentGenerationJobRepository } from '../repository/content-generation-job-repository.js';
import type { ContentGenerationSlideRepository } from '../repository/content-generation-slide-repository.js';

// ---------------------------------------------------------------------------
// Public domain type
// ---------------------------------------------------------------------------

export interface ApprovedExample {
  id: string;
  teamId: string;
  structure: ApprovedExampleStructure;
  sourceJobId: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ApprovedExampleService {
  constructor(
    private readonly approvedExampleRepo: ApprovedExampleRepository,
    private readonly jobRepo: ContentGenerationJobRepository,
    private readonly slideRepo: ContentGenerationSlideRepository,
    private readonly audit: AuditLog,
  ) {}

  /**
   * Approve a completed generation job: snapshot the layout structure
   * (slide blocks + aspect_ratio, no brand data) into the Example_Library
   * and emit a `content_manage` audit entry.
   *
   * Returns NOT_FOUND when the job does not exist or does not belong to the team.
   */
  async approve(
    teamId: string,
    actorId: string,
    jobId: string,
  ): Promise<Result<ApprovedExample>> {
    // 1. Fetch the job (scoped to team)
    const job = await this.jobRepo.findById(teamId, jobId);
    if (!job) {
      return err({ code: 'NOT_FOUND', message: `Job ${jobId} not found` });
    }

    // 2. Fetch slides to extract layout structure (blocks only — no brand)
    const slides = await this.slideRepo.listSlides(teamId, jobId);

    // 3. Build the layout structure — structure only, no brand colors/fonts/logo
    const structure: ApprovedExampleStructure = {
      aspectRatio: job.aspectRatio,
      tags: [],
      slides: slides.map((s) => ({ blocks: s.blockComposition })),
    };

    // 4. Persist to the Example_Library
    const row = await this.approvedExampleRepo.insert(teamId, {
      layoutStructure: structure,
      tags: [],
      aspectRatio: job.aspectRatio,
      sourceJobId: jobId,
    });

    // 5. Audit
    await this.audit.record({
      teamId,
      actorId,
      action: 'content_manage',
      objectType: 'approved_example',
      objectId: row.id,
      metadata: { op: 'approve', jobId },
    });

    // 6. Return domain object
    const example: ApprovedExample = {
      id: row.id,
      teamId: row.teamId,
      structure: row.layoutStructure,
      sourceJobId: row.sourceJobId ?? jobId,
      createdAt: row.createdAt,
    };

    return ok(example);
  }

  /**
   * Remove an approved example from the Example_Library and emit an audit entry.
   *
   * Returns NOT_FOUND when the example does not exist or does not belong to the team.
   */
  async unapprove(
    teamId: string,
    actorId: string,
    exampleId: string,
  ): Promise<Result<void>> {
    // 1. Delete (returns false when not found)
    const deleted = await this.approvedExampleRepo.delete(teamId, exampleId);
    if (!deleted) {
      return err({ code: 'NOT_FOUND', message: `Approved example ${exampleId} not found` });
    }

    // 2. Audit
    await this.audit.record({
      teamId,
      actorId,
      action: 'content_manage',
      objectType: 'approved_example',
      objectId: exampleId,
      metadata: { op: 'unapprove', exampleId },
    });

    return ok(undefined);
  }

  /**
   * List all approved examples for a Team, most recently created first.
   * Always succeeds (empty array when none exist).
   */
  async list(teamId: string): Promise<Result<ApprovedExample[]>> {
    const rows = await this.approvedExampleRepo.listForTeam(teamId);

    const examples: ApprovedExample[] = rows.map((row) => ({
      id: row.id,
      teamId: row.teamId,
      structure: row.layoutStructure,
      sourceJobId: row.sourceJobId ?? '',
      createdAt: row.createdAt,
    }));

    return ok(examples);
  }
}
