/**
 * job-pipeline-context.ts — Shared context for carousel job pipeline
 * 
 * Immutable context passed through all pipeline phases. Built once after
 * loading brand kit, master template, and job inputs. Each phase receives
 * exactly what it needs without re-deriving values.
 */

import type {
  AspectRatio,
  BrandKit,
  SduiThemeConfig,
  ContentConversationContextMessage,
  LayoutStylePreference,
  ImagePreferenceMode,
} from '@leads-generator/shared';
import type { SduiTextGuardrailOptions } from '../../sdui-text-guardrails.js';
import type { SduiPlanner } from '../../sdui-planner/index.js';
import type { SatoriRenderer } from '../../satori-renderer.js';
import type { BackgroundImageClient } from '../../background-image-client.js';
import type { ObjectStorage } from '../../object-storage.js';
import type { ContentGenerationJobRepository } from '../../../repository/content-generation-job-repository.js';
import type { ContentGenerationSlideRepository } from '../../../repository/content-generation-slide-repository.js';

/**
 * External dependencies injected into the pipeline.
 */
export interface PipelineDependencies {
  planner: SduiPlanner;
  renderer: SatoriRenderer;
  imageClient: BackgroundImageClient;
  storage: ObjectStorage;
  jobRepo: ContentGenerationJobRepository;
  slideRepo: ContentGenerationSlideRepository;
}

/**
 * Read-only context threaded through all pipeline phases.
 * Built once in the job processor after brand/template/theme resolution.
 */
export interface JobPipelineContext {
  // Identity
  teamId: string;
  jobId: string;
  
  // Input data
  prompt: string;
  jobInputs: Record<string, unknown>;
  aspectRatio: AspectRatio;
  
  // Configuration
  width: number;
  maxSlides: number;
  defaultTone: string;
  
  // Brand & styling
  brandKit: BrandKit;
  theme: SduiThemeConfig;
  textGuardrailOptions: SduiTextGuardrailOptions;
  
  // Feature flags
  layoutStyle: LayoutStylePreference;
  imagePreference: ImagePreferenceMode;
  
  // Optional metadata
  contentTags: string[];
  conversationContext: ContentConversationContextMessage[];
  
  // Cancellation
  signal: AbortSignal;
  
  // Dependencies
  deps: PipelineDependencies;
  
  // Timing
  logTiming: (stage: string, ms: number, extra?: Record<string, unknown>) => void;
}

/**
 * Minimal context for phases that don't need full job context.
 */
export interface MinimalPipelineContext {
  teamId: string;
  jobId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  maxSlides: number;
  defaultTone: string;
  textGuardrailOptions: SduiTextGuardrailOptions;
  signal: AbortSignal;
  layoutStyle: LayoutStylePreference;
  imagePreference: ImagePreferenceMode;
  contentTags: string[];
  conversationContext: ContentConversationContextMessage[];
}

/**
 * Extract minimal context from full job context.
 */
export function extractMinimalContext(ctx: JobPipelineContext): MinimalPipelineContext {
  return {
    teamId: ctx.teamId,
    jobId: ctx.jobId,
    prompt: ctx.prompt,
    aspectRatio: ctx.aspectRatio,
    maxSlides: ctx.maxSlides,
    defaultTone: ctx.defaultTone,
    textGuardrailOptions: ctx.textGuardrailOptions,
    signal: ctx.signal,
    layoutStyle: ctx.layoutStyle,
    imagePreference: ctx.imagePreference,
    contentTags: ctx.contentTags,
    conversationContext: ctx.conversationContext,
  };
}
