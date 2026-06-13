/**
 * Public API surface for the content module.
 *
 * Exports the ObjectStorage interface, implementation, and factory so the
 * rest of the application can depend on the abstraction without importing
 * the concrete Supabase module directly.
 *
 * Also exports ApprovedExampleService and its domain type for the
 * Example_Library feature (R8.1, R8.5, R8.6).
 *
 * Also exports BrandKitService for the Brand_Kit feature (R1).
 */

export type { ObjectStorage, ObjectStorageConfig, SupabaseObjectStorageConfig } from './object-storage.js';
export { SupabaseObjectStorage, createObjectStorage, createObjectStorageFromEnv } from './object-storage.js';

export type { ApprovedExample } from './approved-example-service.js';
export { ApprovedExampleService } from './approved-example-service.js';

export type { MasterTemplateInput } from './master-template-service.js';
export { MasterTemplateService, VALID_BLOCKS, VALID_RATIOS } from './master-template-service.js';

export { BrandKitService } from './brand-kit-service.js';

export type { AiPayload, PrivacyGuard } from './privacy-guard.js';
export { PrivacyGuardImpl, DefaultPrivacyGuard, LEAD_PII_KEYS, privacyGuardInstance } from './privacy-guard.js';

export { ContentProviderSettingService } from './content-provider-setting-service.js';

export type { ValidationOutcome, ContentPlanValidator } from './content-plan-validator.js';
export {
  DefaultContentPlanValidator,
  defaultContentPlanValidator,
  parseContentPlan,
} from './content-plan-validator.js';

export type { ResolvedEndpoint, ProviderEndpointResolver } from './provider-endpoint-resolver.js';
export { DefaultProviderEndpointResolver } from './provider-endpoint-resolver.js';

export type { RetrievalQuery, ExampleRetriever } from './example-retriever.js';
export { DefaultExampleRetriever } from './example-retriever.js';

export type { AiCallContext, AiCallWrapperDeps } from './ai-call-wrapper.js';
export { AiCallWrapper } from './ai-call-wrapper.js';

export type { PlannerInput, PlannerError, Planner, DefaultPlannerDeps } from './planner.js';
export { DefaultPlanner } from './planner.js';

export type {
  BackgroundRequest,
  BackgroundImageClient,
  BackgroundImageClientDeps,
} from './background-image-client.js';
export { DefaultBackgroundImageClient } from './background-image-client.js';

export type { ScanResult, BackgroundScanner } from './background-scanner.js';
export {
  DefaultBackgroundScanner,
  ANALYSIS_WIDTH,
  EDGE_THRESHOLD,
  TEXT_EDGE_RATIO,
  TILE_SIZE,
  LOW_VAR_THRESH,
  CONTRAST_THRESH,
  LOGO_TILE_COUNT,
} from './background-scanner.js';

export type { RenderContext, RenderedSlide, Renderer, DefaultRendererDeps } from './renderer.js';
export { DefaultRenderer, luminanceContrast } from './renderer.js';

export type {
  GenerateRequest,
  FailingSlide,
  ContentGenerationJobPayload,
  ContentGeneratorServiceDeps,
} from './content-generator-service.js';
export {
  CONTENT_GENERATION_QUEUE_NAME,
  ContentGeneratorService,
  checkRequiredData,
} from './content-generator-service.js';

export type { CarouselWorkerDeps } from './carousel-worker.js';
export { createCarouselWorker, mapPlannerErrToFailureReason } from './carousel-worker.js';
