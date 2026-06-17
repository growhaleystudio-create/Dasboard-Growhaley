/**
 * render-phase-handler.ts — Terminal render & upload phase
 *
 * Handles slide-by-slide rendering (Satori), upload to object storage, and
 * final job status marking. Fail-fast on first render/upload error.
 */

import type { SduiSlide, SduiDocument, CarouselWorkflowArtifact } from '@leads-generator/shared';
import type { SatoriRenderer, BrandFontRef } from '../../satori-renderer.js';
import type { ObjectStorage } from '../../object-storage.js';
import type { ContentGenerationJobRepository } from '../../../repository/content-generation-job-repository.js';
import type { ContentGenerationSlideRepository } from '../../../repository/content-generation-slide-repository.js';
import { SlideUtils } from '../utils/slide-utils.js';
import { enrichWorkflowSlidePrompts } from '../../carousel-workflow.js';

export interface RenderPhaseContext {
  teamId: string;
  jobId: string;
  prompt: string;
  slides: SduiSlide[];
  doc: SduiDocument;
  brandFonts: BrandFontRef[];
  jobT0: number;
  logTiming: (stage: string, ms: number, extra?: Record<string, unknown>) => void;
  finalInputs: Record<string, unknown>;
}

export interface RenderPhaseDependencies {
  renderer: SatoriRenderer;
  storage: ObjectStorage;
  jobRepo: ContentGenerationJobRepository;
  slideRepo: ContentGenerationSlideRepository;
}

/**
 * Terminal phase of a job: render each slide to PNG, upload it, and finalize the job.
 *
 * Flow per slide:
 * 1. Insert pending slide row
 * 2. Render slide → PNG (Satori)
 * 3. Upload PNG → object storage
 * 4. Mark slide success + record imageUrl
 * 5. Update workflow artifact (if present)
 *
 * Fail-fast: first render or upload error → mark slide + job failed, return immediately.
 *
 * Success path: all slides rendered → mark job success, set finishedAt, log total timing.
 */
export async function renderAndUploadSlides(
  deps: RenderPhaseDependencies,
  ctx: RenderPhaseContext,
): Promise<void> {
  const { teamId, jobId, slides, doc, brandFonts, jobT0, logTiming, finalInputs } = ctx;

  console.log(`[render-phase] job=${jobId} starting ${slides.length} slides`);
  const renderT0 = Date.now();

  for (const slide of slides) {
    const index = slide.slide_number - 1;

    // Insert pending slide row
    await deps.slideRepo.insertSlide({
      teamId,
      jobId,
      index,
      status: 'pending',
      blockComposition: SlideUtils.blockComposition(slide),
    });

    // Render slide → PNG
    const renderSlideT0 = Date.now();
    let png: Buffer;
    try {
      png = await deps.renderer.renderSlide(slide, doc, brandFonts);
    } catch (e) {
      console.error(`[render-phase] render failed slide ${index}:`, e);
      logTiming('render_slide', Date.now() - renderSlideT0, { slide: index, ok: false });
      await deps.slideRepo.updateSlide(teamId, jobId, index, {
        status: 'failed',
        reason: 'provider_error',
      });
      await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'provider_error');
      return; // Fail-fast
    }
    const renderMs = Date.now() - renderSlideT0;

    // Upload PNG → object storage
    const uploadT0 = Date.now();
    const uploadResult = await deps.storage.upload(
      teamId,
      `jobs/${jobId}/slide-${index}.png`,
      png,
      'image/png',
    );
    const uploadMs = Date.now() - uploadT0;

    logTiming('render_slide', renderMs, { slide: index, ok: true, pngBytes: png.length });
    logTiming('upload_slide', uploadMs, { slide: index, ok: uploadResult.ok });

    if (!uploadResult.ok) {
      await deps.slideRepo.updateSlide(teamId, jobId, index, {
        status: 'failed',
        reason: 'upload_failed',
      });
      await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'upload_failed');
      return; // Fail-fast
    }

    // Mark slide success + record imageUrl
    await deps.slideRepo.updateSlide(teamId, jobId, index, {
      status: 'success',
      imageUrl: uploadResult.value,
      usedFallback:
        slide.image_status === 'provider_failed_repaired' ||
        slide.layout_source === 'worker_adjusted',
    });

    // Update workflow artifact (if present)
    const workflow = finalInputs.workflow as CarouselWorkflowArtifact | undefined;
    if (workflow) {
      const workflowSlide = workflow.slides.find(
        (item) => item.slide_number === slide.slide_number,
      );
      if (workflowSlide) {
        workflowSlide.renderedImageUrl = uploadResult.value;
      }
    }
  }

  logTiming('render_total', Date.now() - renderT0, { slides: slides.length });

  // Finalize workflow artifact
  const workflow = finalInputs.workflow as CarouselWorkflowArtifact | undefined;
  if (workflow) {
    // Enrich slide prompts with render instructions
    workflow.slidePrompts = enrichWorkflowSlidePrompts(slides, ctx.prompt);
    workflow.workflowStage = 'rendered';
    workflow.updatedAt = new Date().toISOString();
    await deps.jobRepo.updateInputs(teamId, jobId, finalInputs);
  }

  // Mark job success
  await deps.jobRepo.setStatus(teamId, jobId, 'success');
  await deps.jobRepo.setFinishedAt(teamId, jobId, new Date());

  logTiming('total', Date.now() - jobT0, { status: 'success', slides: slides.length });
  console.log(`[render-phase] job=${jobId} completed successfully`);
}
