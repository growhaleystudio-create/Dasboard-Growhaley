import type {
  ApprovedExampleStructure,
  AspectRatio,
  BlockType,
  BrandKit,
  BrandTypographyRole,
  CarouselWorkflowArtifact,
  ContentConversationContextMessage,
  JobView,
  LayoutStylePreference,
  ImagePreferenceMode,
  SduiSlide,
} from '@leads-generator/shared';

export type ActiveTab = 'generate' | 'brand' | 'examples' | 'references';
export type Phase = 'idle' | 'draft_ready' | 'done';

export type ExtraTypographyRole = Exclude<BrandTypographyRole, 'cover' | 'header' | 'body'>;
export type TypographyRoleDraft = { fontFamily: string; color: string; sizePx: string };

export interface ExampleItem {
  id: string;
  sourceJobId?: string | null;
  createdAt?: string;
  structure?: ApprovedExampleStructure;
}

export interface FontDraft {
  base64: string;
  family: string;
  format: 'ttf' | 'otf';
  fileName: string;
  weight?: number;
  style?: 'normal' | 'italic';
}

export interface DraftResponse {
  slides: SduiSlide[];
  workflow?: CarouselWorkflowArtifact;
  aspectRatio: AspectRatio;
  chosenReferenceId?: string | null;
}

export interface VisualDna {
  componentSequence: string[];
  headerToBodyRatio: number;
  layoutArchetype: string;
  typographyScale: string;
}

export interface VisualRef {
  id: string;
  name: string;
  imageUrl: string;
  dna: VisualDna;
  tags: string[];
  createdAt: string;
}

export type RefMode = 'no_reference' | 'auto_match' | 'manual';

export type LayoutStyleOption = {
  value: LayoutStylePreference;
  label: string;
  description: string;
};

export interface GeneratorConfig {
  headerSize: string;
  bodySize: string;
  aspectRatio: AspectRatio;
  slideCount: string;
  tags: string;
  referenceMode: RefMode;
  chosenReferenceId: string | null;
  layoutStyle: LayoutStylePreference;
  imagePreference: ImagePreferenceMode;
}

export interface TypographyOverridePayload {
  coverSizePx?: number;
  headerSizePx?: number;
  bodySizePx?: number;
}

export interface ChatHistoryItem {
  id: string;
  prompt: string;
  title: string;
  createdAt: string;
  planning: boolean;
  config: GeneratorConfig;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

export interface ChatSessionCache {
  messages?: ChatMessage[];
  activePrompt?: string;
  phase?: Phase;
  activeConfig?: Partial<GeneratorConfig>;
  activeJobId?: string | null;
}

export interface GeneratorRequestInput {
  prompt: string;
  config: GeneratorConfig;
  conversationContext: ContentConversationContextMessage[];
}

export type GeneratorStage = 'active' | 'filled' | 'processing';
export type ProcessingKind = 'draft' | 'generate' | 'revise' | 'render' | 'slide-revise' | 'preview-revise';
export type JobSlide = JobView['slides'][number];

export interface PreviewSelection {
  slide: JobSlide;
  draftSlide?: SduiSlide;
}

export const BLOCK_TYPES: BlockType[] = [
  'heading',
  'body',
  'mockup',
  'chart',
  'quote',
  'stat',
  'bullet',
  'cta',
  'image',
];
