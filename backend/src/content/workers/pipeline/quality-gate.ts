/**
 * quality-gate.ts — Quality gate orchestration for slide validation & repair
 *
 * Runs content-quality validation gates at key pipeline checkpoints.
 * If issues detected → attempts AI or deterministic repair.
 * If repair fails → marks job failed with diagnostics.
 */

import type { SduiSlide } from '@leads-generator/shared';
import type { MinimalPipelineContext } from './job-pipeline-context.js';
import type { SduiPlanner } from '../../sdui-planner/index.js';
import type { ContentGenerationJobRepository } from '../../../repository/content-generation-job-repository.js';
import type { SduiCarouselWorkerDeps } from '../../sdui-carousel-worker.js';
import { SlideQualityValidator } from '../validators/slide-quality-validator.js';
import { SlideRepair } from '../processors/slide-repair.js';
import {
  applySduiTextGuardrails,
  sduiTextFitIssues,
  sduiContentQualityIssues,
} from '../../sdui-text-guardrails.js';
import { applyContentTags } from '../utils/content-sanitizer.js';

export interface QualityGateResult {
  /** Whether the job should terminate (failed status written) */
  terminal: boolean;
  /** Repaired or original slides */
  slides: SduiSlide[];
  /** Remaining issues after repair (empty if passed) */
  issues: string[];
}

export interface QualityGateOptions {
  label: string;
  deps: Pick<SduiCarouselWorkerDeps, 'planner'>;
  jobRepo: ContentGenerationJobRepository;
  currentInputs: Record<string, unknown>;
}

/**
 * Run one content-quality gate at a pipeline checkpoint.
 *
 * Flow:
 * 1. Validate slides for quality issues
 * 2. If issues found → attempt repair (AI + deterministic)
 * 3. If repair succeeds → return repaired slides
 * 4. If repair fails → mark job failed, return terminal=true
 */
export async function runQualityGate(
  ctx: MinimalPipelineContext,
  slides: SduiSlide[],
  options: QualityGateOptions,
): Promise<QualityGateResult> {
  const { label, deps, jobRepo, currentInputs } = options;

  // Validate current slides using all validators
  const textFitIssues = sduiTextFitIssues(slides, ctx.textGuardrailOptions);
  const contentIssues = sduiContentQualityIssues(slides);
  const visualIssues = SlideQualityValidator.visualIntegrityIssues(ctx.prompt, slides);
  const issues = [...textFitIssues, ...contentIssues, ...visualIssues];

  // No issues → gate passed
  if (issues.length === 0) {
    return { terminal: false, slides, issues: [] };
  }

  console.warn(`[quality-gate] ${label} failed with ${issues.length} issues:`, issues);

  // Attempt repair
  const repairResult = await SlideRepair.repairSlidesForQuality(deps as SduiCarouselWorkerDeps, {
    teamId: ctx.teamId,
    jobId: ctx.jobId,
    prompt: ctx.prompt,
    aspectRatio: ctx.aspectRatio,
    maxSlides: ctx.maxSlides,
    tone: ctx.defaultTone,
    slides,
    issues,
    textGuardrailOptions: ctx.textGuardrailOptions,
    signal: ctx.signal,
    contentTags: ctx.contentTags,
    conversationContext: ctx.conversationContext,
    layoutStyle: ctx.layoutStyle,
    imagePreference: ctx.imagePreference,
  });

  // Apply text guardrails & tags after repair
  const repairedSlides = applyContentTags(repairResult.slides, ctx.contentTags).map((slide) =>
    applySduiTextGuardrails(slide, ctx.textGuardrailOptions),
  );

  // Repair succeeded → continue pipeline
  if (repairResult.issues.length === 0) {
    console.log(`[quality-gate] ${label} repair succeeded via ${repairResult.source}`);
    return { terminal: false, slides: repairedSlides, issues: [] };
  }

  // Repair failed → mark job failed with diagnostics
  console.error(
    `[quality-gate] ${label} repair failed with ${repairResult.issues.length} remaining issues`,
  );

  await jobRepo.updateInputs(ctx.teamId, ctx.jobId, {
    ...currentInputs,
    sduiSlides: repairedSlides.map(stripInlineImages),
    contentQualityIssues: repairResult.issues,
    contentQualityRepairSource: repairResult.source,
    qualityGateLabel: label,
    ...(ctx.textGuardrailOptions.typography
      ? { typographyOverride: ctx.textGuardrailOptions.typography }
      : {}),
  });

  await jobRepo.setStatus(ctx.teamId, ctx.jobId, 'failed', 'layout_unsatisfiable');

  return { terminal: true, slides: repairedSlides, issues: repairResult.issues };
}

/**
 * Strip inline base64 images from slides before persisting to DB.
 * Generated PNGs are uploaded to storage; base64 in inputs serves no reader.
 */
function stripInlineImages(slide: SduiSlide): SduiSlide {
  const isInlineImage = (url: string | undefined): boolean =>
    typeof url === 'string' && url.startsWith('data:');

  const stripGroup = (comps: typeof slide.nested_groups.core_content) =>
    comps?.map((c) => {
      if (!isInlineImage(c.imageUrl)) return c;
      const { imageUrl, ...rest } = c;
      return rest;
    });

  const g = slide.nested_groups;
  const hasInline =
    isInlineImage(g.top_meta?.find((c) => c.imageUrl)?.imageUrl) ||
    isInlineImage(g.core_content?.find((c) => c.imageUrl)?.imageUrl) ||
    isInlineImage(g.action_footer?.find((c) => c.imageUrl)?.imageUrl);

  if (!hasInline) return slide;

  return {
    ...slide,
    nested_groups: {
      top_meta: stripGroup(g.top_meta) ?? [],
      core_content: stripGroup(g.core_content) ?? [],
      action_footer: stripGroup(g.action_footer) ?? [],
    },
  };
}
