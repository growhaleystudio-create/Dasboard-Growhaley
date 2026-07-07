/**
 * types.ts — Core types for SDUI Planner
 */

import type {
  AspectRatio,
  SduiSlide,
  SduiTypographyOverride,
  ContentConversationContextMessage,
  VisualReference,
  Result,
  LayoutStylePreference,
  ImagePreferenceMode,
  ApprovedExampleStructure,
} from '@leads-generator/shared';
import type { AiCallWrapper } from '../ai-call-wrapper.js';
import type { TeamAiSettingsService } from '../../auth/team-ai-settings-service.js';
import type { ExampleRetriever } from '../example-retriever.js';

export interface SduiPlannerInput {
  teamId: string;
  jobId: string;
  actorId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  /** Exact number of slides requested by the user (already clamped to maxSlides). */
  slideCount: number;
  /** Maximum slides allowed by the master template. */
  maxSlides: number;
  /** Default tone for copywriting. */
  tone: string;
  /** Optional pre-render chat feedback (Fase A revision). */
  feedback?: string;
  /** Optional previous draft to revise (paired with feedback). */
  previousSlides?: SduiSlide[];
  /** Special worker repair pass after image generation failed. */
  repairMode?: 'image_failure_no_image';
  /** Slide numbers affected by image provider failure during repair mode. */
  failedImageSlideNumbers?: number[];
  /** Effective font sizes from Brand Kit or generator config, used for adaptive text limits. */
  typographyOverride?: SduiTypographyOverride | undefined;
  /** User-supplied visual tags for the top_meta tag component. */
  contentTags?: string[] | undefined;
  /** Recent browser chat messages from the same content window. */
  conversationContext?: ContentConversationContextMessage[] | undefined;
  /** User-selected high-level layout style target. */
  layoutStyle?: LayoutStylePreference | undefined;
  /** User-selected image preference mode. */
  imagePreference?: ImagePreferenceMode | undefined;
  /**
   * Fase 3: reference mode.
   * 'no_reference' = AI autonomous (default)
   * 'auto_match'   = AI picks best from catalog
   * 'manual'       = user picked a specific reference
   */
  referenceMode?: 'no_reference' | 'auto_match' | 'manual';
  /** Catalog of available references (for auto_match mode). */
  referenceCatalog?: Pick<VisualReference, 'id' | 'name' | 'dna' | 'tags'>[];
  /** The manually chosen reference (for manual mode). */
  chosenReference?: Pick<VisualReference, 'id' | 'name' | 'dna'>;
  /**
   * Team-approved carousel structures used as few-shot structural templates.
   * Resolved asynchronously by DefaultSduiPlanner.plan() (via ExampleRetriever)
   * before buildPrompt is called — buildPrompt itself stays synchronous.
   */
  approvedExamples?: ApprovedExampleStructure[] | undefined;
}

export type SduiPlannerError =
  | { kind: 'non_json' }
  | { kind: 'validation_error'; message: string }
  | { kind: 'budget_exceeded' }
  | { kind: 'endpoint_mismatch' }
  | { kind: 'insecure_transport' }
  | { kind: 'privacy_violation' }
  | { kind: 'timeout' }
  | { kind: 'provider_error'; message: string };

export interface SduiPlanResult {
  slides: SduiSlide[];
  /** Non-terminal issues that the worker should repair or audit before render. */
  qualityWarnings?: string[];
  /** Populated when AI chose a reference automatically (auto_match mode). */
  chosenReferenceId?: string;
}

export interface SduiPlanner {
  plan(
    input: SduiPlannerInput,
    signal: AbortSignal,
  ): Promise<Result<SduiPlanResult, SduiPlannerError>>;
}

export interface SduiPlannerDeps {
  wrapper: AiCallWrapper;
  settings: TeamAiSettingsService;
  /**
   * Optional retriever for team-approved example structures. When present,
   * the planner injects the most relevant approved examples into the prompt
   * as structural few-shot templates. Absent (e.g. in tests) → no examples.
   */
  exampleRetriever?: ExampleRetriever;
}

// Re-export from shared for convenience
export type { SduiSlide, AspectRatio, SduiTypographyOverride };
