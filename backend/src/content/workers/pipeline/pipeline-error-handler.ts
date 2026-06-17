/**
 * pipeline-error-handler.ts — Error handling for pipeline failures
 *
 * Handles planner errors, persists failure diagnostics, and marks jobs failed.
 */

import type { SduiPlannerError } from '../../sdui-planner/index.js';
import type { ContentGenerationJobRepository } from '../../../repository/content-generation-job-repository.js';
import { SlideUtils } from '../utils/slide-utils.js';

/**
 * Mark a job as failed due to planner error at a specific stage.
 * Persists planner error details and maps error kind to failure reason.
 */
export async function failJobForPlannerError(
  jobRepo: ContentGenerationJobRepository,
  teamId: string,
  jobId: string,
  currentInputs: Record<string, unknown>,
  stage: string,
  plannerError: SduiPlannerError,
): Promise<void> {
  await jobRepo.updateInputs(teamId, jobId, {
    ...currentInputs,
    plannerFailureStage: stage,
    plannerError,
  });

  const failureReason = SlideUtils.mapPlannerErr(plannerError);
  await jobRepo.setStatus(teamId, jobId, 'failed', failureReason);

  console.error(
    `[pipeline-error] Job ${jobId} failed at stage '${stage}' with planner error: ${plannerError.kind}`,
  );
}
