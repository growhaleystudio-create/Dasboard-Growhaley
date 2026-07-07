import type {
  ApprovedExampleStructure,
  AspectRatio,
  BlockType,
  CarouselWorkflowArtifact,
  ContentConversationContextMessage,
  JobView,
  LayoutStylePreference,
  ImagePreferenceMode,
  SduiSlide,
} from '@leads-generator/shared';

export type ActiveTab = 'generate' | 'examples' | 'references';
export type Phase = 'idle' | 'draft_ready' | 'done';

export interface ExampleItem {
  id: string;
  sourceJobId?: string | null;
  createdAt?: string;
  structure?: ApprovedExampleStructure;
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
export type ProcessingKind =
  | 'draft'
  | 'generate'
  | 'revise'
  | 'render'
  | 'slide-revise'
  | 'preview-revise'
  | 'preview';
export type JobSlide = JobView['slides'][number];

/** One rendered draft slide from POST /carousel/draft/preview. */
export interface DraftPreviewItem {
  slide_number: number;
  png: string; // data:image/png;base64,...
  adjusted: boolean;
  metrics: { contentUsageRatio: number; overflow: boolean };
}

export interface DraftPreviewResponse {
  aspectRatio: AspectRatio;
  items: DraftPreviewItem[];
}

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
