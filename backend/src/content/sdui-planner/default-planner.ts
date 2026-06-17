/**
 * default-planner.ts — Main SDUI Planner orchestrator
 *
 * Coordinates: prompt building → LLM call → parsing → quality check → repair
 *
 * Extracted from sdui-planner.ts DefaultSduiPlanner class (135 lines)
 * Status: ✅ Full implementation extracted
 */

import type { Result } from '@leads-generator/shared';
import { err, ok } from '@leads-generator/shared';
import type {
  SduiPlanner,
  SduiPlannerDeps,
  SduiPlannerInput,
  SduiPlanResult,
  SduiPlannerError,
} from './types.js';

import { buildPrompt } from './prompt/prompt-builder.js';
import { parseSlides } from './parsing/slide-parser.js';
import { ensureExplicitImageRequest } from './image/image-enforcer.js';
import { sduiImageRequirementIssues } from './quality/quality-checker.js';
import { buildCompletenessRepairPrompt } from './quality/repair-builder.js';
import { executeLlmRequest } from './llm/llm-executor.js';
import { extractErrorMessage, mapWrapperError } from './parsing/parsing-utils.js';
import {
  applySduiTextGuardrails,
  sduiContentQualityIssues,
  sduiTextFitIssues,
} from '../sdui-text-guardrails.js';

/**
 * Default implementation of SduiPlanner.
 */
export class DefaultSduiPlanner implements SduiPlanner {
  constructor(private readonly deps: SduiPlannerDeps) {}

  async plan(
    input: SduiPlannerInput,
    signal: AbortSignal,
  ): Promise<Result<SduiPlanResult, SduiPlannerError>> {
    const fullPrompt = buildPrompt(input);
    const textBaseUrl = await this.deps.settings.loadApiBaseUrl(input.teamId, 'content_suggestion');

    const settings = await this.deps.settings.getSettings(input.teamId);
    const textModel = settings.textModel || 'gemini-2.5-flash-lite';

    const executePlannerPrompt = (promptText: string) =>
      executeLlmRequest(promptText, {
        teamId: input.teamId,
        jobId: input.jobId,
        actorId: input.actorId,
        textModel,
        textBaseUrl,
        signal,
        deps: this.deps,
      });

    const parsePlannerResult = (text: string): SduiPlanResult | null => {
      const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
          parsed = JSON.parse(cleaned.slice(start, end + 1));
        } catch {
          return null;
        }
      }

      return parseSlides(parsed, input.typographyOverride);
    };

    const wrapperResult = await executePlannerPrompt(fullPrompt);

    if (!wrapperResult.ok) {
      return err(mapWrapperError(extractErrorMessage(wrapperResult.error)));
    }

    const result = parsePlannerResult(wrapperResult.value);
    if (!result) return err({ kind: 'non_json' });
    if (input.repairMode !== 'image_failure_no_image') {
      result.slides = ensureExplicitImageRequest(input.prompt, result.slides);
    }

    const qualityIssues = [
      ...sduiTextFitIssues(result.slides, { typography: input.typographyOverride }),
      ...sduiContentQualityIssues(result.slides),
      ...sduiImageRequirementIssues(input, result.slides),
    ];
    if (qualityIssues.length > 0) {
      const repairPrompt = buildCompletenessRepairPrompt(input, result.slides, qualityIssues);
      const repairWrapperResult = await executePlannerPrompt(repairPrompt);
      if (!repairWrapperResult.ok) {
        return err(mapWrapperError(extractErrorMessage(repairWrapperResult.error)));
      }
      const repaired = parsePlannerResult(repairWrapperResult.value);
      if (!repaired) return err({ kind: 'non_json' });
      if (input.repairMode !== 'image_failure_no_image') {
        repaired.slides = ensureExplicitImageRequest(input.prompt, repaired.slides);
      }
      repaired.slides = repaired.slides.map((slide) =>
        applySduiTextGuardrails(slide, { typography: input.typographyOverride }),
      );
      const remainingIssues = [
        ...sduiTextFitIssues(repaired.slides, { typography: input.typographyOverride }),
        ...sduiContentQualityIssues(repaired.slides),
        ...sduiImageRequirementIssues(input, repaired.slides),
      ];
      if (remainingIssues.length > 0) {
        return ok({
          ...repaired,
          qualityWarnings: remainingIssues,
        }) as Result<SduiPlanResult, SduiPlannerError>;
      }
      return ok(repaired) as Result<SduiPlanResult, SduiPlannerError>;
    }

    result.slides = result.slides.map((slide) =>
      applySduiTextGuardrails(slide, { typography: input.typographyOverride }),
    );
    return ok(result) as Result<SduiPlanResult, SduiPlannerError>;
  }
}
