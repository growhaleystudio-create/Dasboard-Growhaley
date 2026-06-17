import type {
  BrandKit,
  CarouselWorkflowArtifact,
  CarouselWorkflowCaption,
  CarouselWorkflowDesignSystemSnapshot,
  CarouselWorkflowOutlineItem,
  CarouselWorkflowSlidePrompt,
  CarouselWorkflowSlideState,
  SduiComponent,
  SduiSlide,
} from '@leads-generator/shared';

function components(slide: SduiSlide): SduiComponent[] {
  return (['top_meta', 'core_content', 'action_footer'] as const).flatMap(
    (group) => slide.nested_groups[group] ?? [],
  );
}

function firstText(slide: SduiSlide, type: SduiComponent['type']): string | undefined {
  const component = components(slide).find((candidate) => candidate.type === type);
  if (!component) return undefined;
  if (typeof component.text === 'string' && component.text.trim()) return component.text.trim();
  if (typeof component.label === 'string' && component.label.trim()) return component.label.trim();
  if (Array.isArray(component.items) && component.items.length > 0)
    return component.items.join(' · ');
  return undefined;
}

function visualBrief(slide: SduiSlide): string | undefined {
  const image = components(slide).find(
    (component) => component.type === 'image_placeholder' && component.image_object_context?.trim(),
  );
  if (image?.image_object_context?.trim()) return image.image_object_context.trim();
  const visual = components(slide).find(
    (component) => component.type === 'visual_layer' && component.visual_brief?.trim(),
  );
  return visual?.visual_brief?.trim();
}

function designSystemSnapshot(brandKit: BrandKit): CarouselWorkflowDesignSystemSnapshot {
  return {
    colors: brandKit.colors,
    fonts: brandKit.fonts.map((font) => font.family),
    chrome: brandKit.chrome,
    ...(brandKit.typography ? { typography: brandKit.typography } : {}),
  };
}

function outlineFromSlides(slides: SduiSlide[]): CarouselWorkflowOutlineItem[] {
  return slides.map((slide, index) => {
    const cta = firstText(slide, 'button_cta');
    const item: CarouselWorkflowOutlineItem = {
      slide_number: slide.slide_number,
      role:
        slide.slide_type === 'cover'
          ? 'cover'
          : index === slides.length - 1 || cta
            ? 'cta'
            : 'content',
      headline:
        firstText(slide, 'header') ?? firstText(slide, 'quote') ?? `Slide ${slide.slide_number}`,
    };
    const body =
      firstText(slide, 'body') ??
      (firstText(slide, 'checklist') ? firstText(slide, 'checklist') : undefined);
    const visual = visualBrief(slide);
    if (body) item.body = body;
    if (visual) item.visualBrief = visual;
    if (cta) item.cta = cta;
    return item;
  });
}

function promptForSlide(
  slide: SduiSlide,
  totalSlides: number,
  prompt: string,
): CarouselWorkflowSlidePrompt {
  const headline = firstText(slide, 'header') ?? firstText(slide, 'quote');
  const body = firstText(slide, 'body') ?? firstText(slide, 'checklist');
  const visual = visualBrief(slide);
  const promptText = [
    'Create one Instagram carousel slide visual asset for the existing renderer.',
    `Slide: ${slide.slide_number} of ${totalSlides}.`,
    `Type: ${slide.slide_type}.`,
    `Topic: ${prompt.replace(/\s+/g, ' ').trim().slice(0, 240)}.`,
    headline ? `Exact headline text rendered separately: "${headline}".` : '',
    body ? `Exact body text rendered separately: "${body}".` : '',
    visual
      ? `Visual: ${visual}.`
      : 'Visual: no generated image needed; typography/layout carries this slide.',
    'Do not render text inside the generated image. No words, letters, numbers, watermark, or logo.',
  ]
    .filter(Boolean)
    .join(' ');
  const out: CarouselWorkflowSlidePrompt = {
    slide_number: slide.slide_number,
    prompt: promptText,
  };
  if (headline) out.exactHeadline = headline;
  if (body) out.exactBody = body;
  if (visual) out.visualBrief = visual;
  return out;
}

/**
 * Enrich workflow slide prompts with render instructions.
 * Used during the render phase to update workflow artifact with detailed prompts.
 */
export function enrichWorkflowSlidePrompts(
  slides: SduiSlide[],
  prompt: string,
): CarouselWorkflowSlidePrompt[] {
  return slides.map((slide) => promptForSlide(slide, slides.length, prompt));
}

function captionFromOutline(
  outline: CarouselWorkflowOutlineItem[],
  prompt: string,
): CarouselWorkflowCaption {
  const hookSource = outline[0]?.headline || prompt.replace(/\s+/g, ' ').trim();
  const bodySlides = outline.slice(1, -1).filter((slide) => slide.headline || slide.body);
  const body =
    bodySlides.length > 0
      ? bodySlides
          .slice(0, 3)
          .map((slide) => `${slide.headline}${slide.body ? `: ${slide.body}` : ''}`)
          .join('\n\n')
      : prompt.replace(/\s+/g, ' ').trim().slice(0, 280);
  const cta =
    [...outline].reverse().find((slide) => slide.cta)?.cta ?? 'Save dan share kalau ini relevan.';
  return {
    hook: hookSource.slice(0, 180),
    body: body.slice(0, 1200),
    cta: cta.slice(0, 180),
    hashtags: ['#carousel', '#konten', '#branding'],
  };
}

export function buildCarouselWorkflowArtifact(params: {
  prompt: string;
  slides: SduiSlide[];
  brandKit: BrandKit;
  source: CarouselWorkflowArtifact['source'];
  previous?: CarouselWorkflowArtifact | undefined;
  stage?: CarouselWorkflowArtifact['workflowStage'] | undefined;
}): CarouselWorkflowArtifact {
  const now = new Date().toISOString();
  const outline = outlineFromSlides(params.slides);
  const previousBySlide = new Map(
    (params.previous?.slides ?? []).map((slide) => [slide.slide_number, slide]),
  );
  const workflowSlides: CarouselWorkflowSlideState[] = params.slides.map((slide) => ({
    slide_number: slide.slide_number,
    reviewStatus: previousBySlide.get(slide.slide_number)?.reviewStatus ?? 'draft',
    sduiSlide: slide,
    ...(previousBySlide.get(slide.slide_number)?.renderedImageUrl
      ? { renderedImageUrl: previousBySlide.get(slide.slide_number)!.renderedImageUrl }
      : {}),
    ...(previousBySlide.get(slide.slide_number)?.failedReason
      ? { failedReason: previousBySlide.get(slide.slide_number)!.failedReason }
      : {}),
  }));
  return {
    version: 1,
    workflowStage: params.stage ?? 'prompts',
    source: params.source,
    outline,
    designSystemSnapshot: designSystemSnapshot(params.brandKit),
    slidePrompts: params.slides.map((slide) =>
      promptForSlide(slide, params.slides.length, params.prompt),
    ),
    slides: workflowSlides,
    caption: captionFromOutline(outline, params.prompt),
    createdAt: params.previous?.createdAt ?? now,
    updatedAt: now,
  };
}

export function workflowSlides(
  workflow: CarouselWorkflowArtifact | undefined,
): SduiSlide[] | undefined {
  if (!workflow) return undefined;
  return workflow.slides.map((slide) => slide.sduiSlide);
}
