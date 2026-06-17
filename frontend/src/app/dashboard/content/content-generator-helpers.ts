import type {
  AppErrorCode,
  BrandKit,
  CarouselWorkflowArtifact,
  ContentConversationContextMessage,
  SduiSlide,
} from '@leads-generator/shared';
import { AppError } from '@/lib/api';
import { FAILURE_LABEL, HEX_RE } from './content-generator-constants';
import type {
  ChatMessage,
  ExtraTypographyRole,
  GeneratorConfig,
  TypographyOverridePayload,
  TypographyRoleDraft,
} from './content-generator-types';
import { EXTRA_TYPOGRAPHY_ROLE_CONFIG } from './content-generator-constants';

export const createDefaultExtraTypography = (): Record<ExtraTypographyRole, TypographyRoleDraft> =>
  EXTRA_TYPOGRAPHY_ROLE_CONFIG.reduce(
    (acc, config) => ({
      ...acc,
      [config.role]: { fontFamily: '', color: config.defaultColor, sizePx: config.defaultSize },
    }),
    {} as Record<ExtraTypographyRole, TypographyRoleDraft>,
  );

export const extraTypographyFromBrandKit = (
  typography?: BrandKit['typography'],
): Record<ExtraTypographyRole, TypographyRoleDraft> => {
  const next = createDefaultExtraTypography();
  for (const config of EXTRA_TYPOGRAPHY_ROLE_CONFIG) {
    const source = typography?.[config.role];
    next[config.role] = {
      fontFamily: source?.fontFamily ?? '',
      color: source?.color ?? config.defaultColor,
      sizePx: source?.sizePx !== undefined ? String(source.sizePx) : config.defaultSize,
    };
  }
  return next;
};

export const parsePositiveInt = (value: string, min: number, max: number): number | undefined => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) return undefined;
  return rounded;
};

export const isHex = (value: string) => HEX_RE.test(value);
export const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof AppError ? err.message : err instanceof Error ? err.message : fallback;
export const failureLabel = (reason?: string) =>
  reason ? FAILURE_LABEL[reason] ?? reason : undefined;
export const failureDisplay = (reason?: string, errorCode?: AppErrorCode) => {
  const label = failureLabel(reason) ?? 'Tidak diketahui';
  return errorCode ? `${label} (${errorCode})` : label;
};

export const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FILE_READ_EMPTY'));
        return;
      }
      resolve(result.includes(',') ? result.split(',')[1] ?? '' : result);
    };
    reader.readAsDataURL(file);
  });

export const parseConfigSize = (value: string, min: number, max: number): number | undefined => {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return undefined;
  return rounded;
};

export const typographyOverrideFromConfig = (config: GeneratorConfig): TypographyOverridePayload | undefined => {
  const headerSizePx = parseConfigSize(config.headerSize, 12, 180);
  const bodySizePx = parseConfigSize(config.bodySize, 8, 96);
  const override: TypographyOverridePayload = {};
  if (headerSizePx !== undefined) {
    override.headerSizePx = headerSizePx;
    override.coverSizePx = headerSizePx;
  }
  if (bodySizePx !== undefined) override.bodySizePx = bodySizePx;
  return Object.keys(override).length > 0 ? override : undefined;
};

export const contentTagsFromConfig = (config: GeneratorConfig): string[] => {
  return config.tags
    .split(/[,;\n]/)
    .map((tag) => tag.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((tag) => tag.split(/\s+/).slice(0, 3).join(' ').slice(0, 48))
    .slice(0, 10);
};

export const conversationContextFromMessages = (
  messages: ChatMessage[],
  pendingText?: string,
): ContentConversationContextMessage[] => {
  const baseMessages = messages.map(({ role, text, createdAt }) => ({
    role,
    text: text.replace(/\s+/g, ' ').trim(),
    createdAt,
  }));
  const normalizedPendingText = pendingText?.replace(/\s+/g, ' ').trim();
  if (normalizedPendingText) {
    baseMessages.push({
      role: 'user',
      text: normalizedPendingText,
      createdAt: new Date().toISOString(),
    });
  }

  const context: ContentConversationContextMessage[] = [];
  let totalChars = 0;
  for (const message of baseMessages.slice(-10).reverse()) {
    if (!message.text) continue;
    const remaining = 5000 - totalChars;
    if (remaining <= 0) break;
    const text = message.text.slice(0, Math.min(800, remaining));
    context.unshift({ ...message, text });
    totalChars += text.length;
  }
  return context;
};

export function promptTextFromSlide(slide: SduiSlide): string {
  const components = (['top_meta', 'core_content', 'action_footer'] as const)
    .flatMap((group) => slide.nested_groups[group] ?? []);
  const headline = components.find((component) => component.type === 'header' || component.type === 'quote')?.text;
  const body = components.find((component) => component.type === 'body')?.text;
  const visual = components.find((component) => component.type === 'image_placeholder')?.image_object_context;
  return [
    `Slide ${slide.slide_number}.`,
    headline ? `Exact headline text rendered separately: "${headline}".` : '',
    body ? `Exact body text rendered separately: "${body}".` : '',
    visual ? `Visual: ${visual}.` : 'Visual: no generated image needed.',
    'Do not render text inside the generated image.',
  ].filter(Boolean).join(' ');
}

export function withWorkflowSlide(workflow: CarouselWorkflowArtifact, slide: SduiSlide): CarouselWorkflowArtifact {
  const updatedAt = new Date().toISOString();
  return {
    ...workflow,
    workflowStage: 'prompts',
    updatedAt,
    slidePrompts: workflow.slidePrompts.map((prompt) => prompt.slide_number === slide.slide_number
      ? { ...prompt, prompt: promptTextFromSlide(slide), visualBrief: slide.nested_groups.core_content?.find((c) => c.type === 'image_placeholder')?.image_object_context }
      : prompt),
    slides: workflow.slides.map((item) => item.slide_number === slide.slide_number
      ? { ...item, reviewStatus: 'needs_revision', sduiSlide: slide }
      : item),
  };
}

export function withWorkflowSlides(workflow: CarouselWorkflowArtifact, slides: SduiSlide[]): CarouselWorkflowArtifact {
  return slides.reduce((next, slide) => withWorkflowSlide(next, slide), workflow);
}
