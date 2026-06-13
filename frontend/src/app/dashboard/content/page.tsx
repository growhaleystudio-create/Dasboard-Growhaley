'use client';

/**
 * Content Generator (Carousel) — clean replacement of the legacy ad-hoc
 * content page. Talks to the new carousel backend:
 *   PUT/GET  /api/teams/:id/content/brand-kit
 *   PUT/GET  /api/teams/:id/content/master-template
 *   POST     /api/teams/:id/content/carousel/generate      -> { jobId, status }
 *   GET      /api/teams/:id/content/carousel/jobs/:jobId    -> JobView
 *   POST     /api/teams/:id/content/carousel/jobs/:jobId/approve
 *   GET      /api/teams/:id/content/carousel/examples
 *   DELETE   /api/teams/:id/content/carousel/examples/:exampleId/approve
 *
 * Reuses the existing UI library and Tailwind design tokens so the styling
 * matches the rest of the dashboard.
 */

import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Sparkles,
  Palette,
  Images,
  Plus,
  Trash2,
  Loader2,
  Upload,
  Download,
  AlertTriangle,
  ArrowUp,
  ChevronRight,
  Save,
  Star,
  MessageSquare,
  RotateCcw,
  Check,
  History,
  Pencil,
  Library,
  Cpu,
  MousePointerClick,
  Minus,
  X,
  Maximize2,
} from 'lucide-react';
import type {
  ApprovedExampleStructure,
  AspectRatio,
  AppErrorCode,
  BlockType,
  BrandKit,
  JobView,
  ImageRequirement,
  ImageStatus,
  LayoutFamily,
  LayoutSource,
  LayoutVariantId,
  MasterTemplate,
} from '@leads-generator/shared';
import { useSession } from '@/lib/useSession';
import { AppError, fetchApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

type ActiveTab = 'generate' | 'brand' | 'examples' | 'references';

const BLOCK_TYPES: BlockType[] = [
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

const ASPECT_RATIOS: AspectRatio[] = ['1:1', '4:5', '9:16'];

const LOGO_PLACEMENT_OPTIONS = [
  { label: 'Top Left', value: 'top-left' },
  { label: 'Top Right', value: 'top-right' },
  { label: 'Bottom Left', value: 'bottom-left' },
  { label: 'Bottom Right', value: 'bottom-right' },
  { label: 'No Logo', value: 'none' },
];

const BRAND_COLOR_PRESETS = [
  { label: 'Clean', colors: ['#111827', '#F8FAFC', '#2563EB'] },
  { label: 'Warm', colors: ['#18181B', '#FFF7ED', '#F97316'] },
  { label: 'Fresh', colors: ['#0F172A', '#F0FDFA', '#14B8A6'] },
  { label: 'Bold', colors: ['#0A0D14', '#F5F3FF', '#7C3AED'] },
] as const;

const FAILURE_LABEL: Record<string, string> = {
  validation_error: 'Konten perlu diperbaiki',
  budget_exceeded: 'Budget AI habis',
  endpoint_mismatch: 'Endpoint tidak sesuai',
  insecure_transport: 'Koneksi tidak aman',
  privacy_violation: 'Terdeteksi data pribadi',
  background_unclean: 'Background tidak bersih',
  missing_chart_data: 'Data chart hilang',
  missing_mockup: 'Berkas mockup hilang',
  upload_failed: 'Gagal upload gambar',
  off_brand: 'Tidak sesuai brand',
  provider_error: 'Error provider AI',
  timeout: 'Waktu pemrosesan habis',
  layout_unsatisfiable: 'Layout tidak dapat diterapkan',
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

const isHex = (value: string) => HEX_RE.test(value);
const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof AppError ? err.message : err instanceof Error ? err.message : fallback;
const failureLabel = (reason?: string) =>
  reason ? FAILURE_LABEL[reason] ?? reason : undefined;
const failureDisplay = (reason?: string, errorCode?: AppErrorCode) => {
  const label = failureLabel(reason) ?? 'Tidak diketahui';
  return errorCode ? `${label} (${errorCode})` : label;
};

/** Read a File into raw base64 (without the `data:...;base64,` prefix). */
const readFileAsBase64 = (file: File) =>
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

interface ExampleItem {
  id: string;
  sourceJobId?: string | null;
  createdAt?: string;
  structure?: ApprovedExampleStructure;
}

interface FontDraft {
  base64: string;
  family: string;
  format: 'ttf' | 'otf';
  fileName: string;
  weight?: number;
  style?: 'normal' | 'italic';
}

// ---------------------------------------------------------------------------
// SDUI types (Fase 2)
// ---------------------------------------------------------------------------

interface SduiComponent {
  type: string;
  text?: string;
  highlight?: string;
  label?: string;
  items?: string[];
  style?: 'primary' | 'secondary';
  requires_generation?: boolean;
  asset_type?: string;
  image_object_context?: string;
  imageUrl?: string;
  heightPercent?: number;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'center' | 'bottom';
  textTransform?: 'uppercase' | 'none';
}

interface SduiSlide {
  slide_number: number;
  slide_type: 'cover' | 'content';
  container_layout: 'text_dominant' | 'split_screen' | 'background_overlay';
  layout_variant_id?: LayoutVariantId;
  layout_family?: LayoutFamily;
  image_requirement?: ImageRequirement;
  layout_source?: LayoutSource;
  image_status?: ImageStatus;
  typography_scale?: 'editorial_bold' | 'balanced_classic' | 'information_dense';
  contentDirection?: 'column' | 'row';
  nested_groups: {
    top_meta?: SduiComponent[];
    core_content?: SduiComponent[];
    action_footer?: SduiComponent[];
  };
}

interface DraftResponse {
  slides: SduiSlide[];
  aspectRatio: AspectRatio;
  chosenReferenceId?: string | null;
}

interface VisualDna {
  componentSequence: string[];
  headerToBodyRatio: number;
  layoutArchetype: string;
  typographyScale: string;
}

interface VisualRef {
  id: string;
  name: string;
  imageUrl: string;
  dna: VisualDna;
  tags: string[];
  createdAt: string;
}

type RefMode = 'no_reference' | 'auto_match' | 'manual';

interface GeneratorConfig {
  headerSize: string;
  bodySize: string;
  aspectRatio: AspectRatio;
  slideCount: string;
  referenceMode: RefMode;
  chosenReferenceId: string | null;
}

interface TypographyOverridePayload {
  coverSizePx?: number;
  headerSizePx?: number;
  bodySizePx?: number;
}

const parseConfigSize = (value: string, min: number, max: number): number | undefined => {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return undefined;
  return rounded;
};

const typographyOverrideFromConfig = (config: GeneratorConfig): TypographyOverridePayload | undefined => {
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

interface ChatHistoryItem {
  id: string;
  prompt: string;
  title: string;
  createdAt: string;
  planning: boolean;
  config: GeneratorConfig;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

interface GeneratorRequestInput {
  prompt: string;
  config: GeneratorConfig;
}

type GeneratorStage = 'active' | 'filled' | 'processing';
type ProcessingKind = 'draft' | 'generate' | 'revise' | 'render' | 'slide-revise' | 'preview-revise';
type JobSlide = JobView['slides'][number];

interface PreviewSelection {
  slide: JobSlide;
  draftSlide?: SduiSlide;
}

const ASPECT_RATIO_CLASS: Record<AspectRatio, string> = {
  '1:1': 'aspect-square',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ContentGeneratorPage() {
  const { data: sessionData, isLoading: isSessionLoading } = useSession();
  const teamId = sessionData?.session.teamId;
  const role = sessionData?.session.role ?? 'viewer';
  const canManage = role === 'admin';
  const canGenerate = role === 'admin' || role === 'member';
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ActiveTab>('generate');

  // -- Brand Kit form state -------------------------------------------------
  const [logoFile, setLogoFile] = useState<{ base64: string; name: string } | null>(null);
  const [fonts, setFonts] = useState<FontDraft[]>([]);
  const [colors, setColors] = useState<string[]>(['#187DB4', '#0A0D14']);
  const [logoPlacement, setLogoPlacement] = useState<string>('bottom-left');
  const [pageNumberFormat, setPageNumberFormat] = useState<string>('{current}/{total}');
  const [siteUrl, setSiteUrl] = useState<string>('');
  // -- Typography & color roles (Brand Kit v2) ------------------------------
  const [coverFont, setCoverFont] = useState<string>('');
  const [headerFont, setHeaderFont] = useState<string>('');
  const [bodyFont, setBodyFont] = useState<string>('');
  const [coverSize, setCoverSize] = useState<string>('72');
  const [headerSize, setHeaderSize] = useState<string>('48');
  const [bodySize, setBodySize] = useState<string>('22');
  const [headerColor, setHeaderColor] = useState<string>('#1a1d24');
  const [bodyColor, setBodyColor] = useState<string>('#5b626e');
  const [highlightColor, setHighlightColor] = useState<string>('#187DB4');
  const [bgColor, setBgColor] = useState<string>('#F4F3EF');
  const [paginationColor, setPaginationColor] = useState<string>('#5b626e');
  const [metaColor, setMetaColor] = useState<string>('#5b626e');
  const [accentColor, setAccentColor] = useState<string>('#187DB4');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);

  // -- Master template form state -------------------------------------------
  const [allowedBlocks, setAllowedBlocks] = useState<BlockType[]>(['heading', 'body', 'cta']);
  const [templateRatios, setTemplateRatios] = useState<AspectRatio[]>(['1:1', '4:5']);
  const [maxSlides, setMaxSlides] = useState<string>('5');
  const [defaultTone, setDefaultTone] = useState<string>('professional');
  const [textLimits, setTextLimits] = useState<Record<string, string>>({});

  // -- Generate state -------------------------------------------------------
  const [prompt, setPrompt] = useState<string>('');
  const [isPromptFocused, setIsPromptFocused] = useState(false);
  const [genRatio, setGenRatio] = useState<AspectRatio>('1:1');
  const [activeRatio, setActiveRatio] = useState<AspectRatio>('1:1');
  const [slideCount, setSlideCount] = useState<string>('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // -- Fase 2: Draft + chat feedback + inline edit + regen ------------------
  // Step: 'idle' | 'draft_ready' | 'done'
  type Phase = 'idle' | 'draft_ready' | 'done';
  const [phase, setPhase] = useState<Phase>('idle');
  const [activePrompt, setActivePrompt] = useState('');
  const [draftSlides, setDraftSlides] = useState<SduiSlide[]>([]);
  const [draftRatio, setDraftRatio] = useState<AspectRatio>('4:5');
  const [chatFeedback, setChatFeedback] = useState<string>('');
  // inline edit: { slideIdx → { group → compIdx → text } }
  const [editingCell, setEditingCell] = useState<{ slideIdx: number; group: string; compIdx: number } | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  // per-slide regen
  const [regenFeedback, setRegenFeedback] = useState<Record<number, string>>({});
  const [regenning, setRegenning] = useState<Set<number>>(new Set());
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState<number | null>(null);
  const [previewFeedback, setPreviewFeedback] = useState<string>('');

  // -- Fase 3: Reference mode -----------------------------------------------
  const [refMode, setRefMode] = useState<RefMode>('no_reference');
  const [chosenRefId, setChosenRefId] = useState<string | null>(null);
  const [refName, setRefName] = useState('');
  const [refTags, setRefTags] = useState('');
  const refInputRef = useRef<HTMLInputElement>(null);

  // -- Chat + config UX ------------------------------------------------------
  const [planningEnabled, setPlanningEnabled] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [configSavedAt, setConfigSavedAt] = useState<string | null>(null);

  // -- Queries --------------------------------------------------------------
  const brandKitQuery = useQuery({
    queryKey: ['brand-kit', teamId],
    queryFn: () => fetchApi<BrandKit | null>(`/api/teams/${teamId}/content/brand-kit`),
    enabled: !!teamId,
  });

  const masterTemplateQuery = useQuery({
    queryKey: ['master-template', teamId],
    queryFn: () => fetchApi<MasterTemplate | null>(`/api/teams/${teamId}/content/master-template`),
    enabled: !!teamId,
  });

  const examplesQuery = useQuery({
    queryKey: ['carousel-examples', teamId],
    queryFn: () => fetchApi<ExampleItem[]>(`/api/teams/${teamId}/content/carousel/examples`),
    enabled: !!teamId && activeTab === 'examples',
  });

  const visualRefsQuery = useQuery({
    queryKey: ['visual-references', teamId],
    queryFn: () => fetchApi<VisualRef[]>(`/api/teams/${teamId}/content/carousel/references`),
    enabled: !!teamId,
  });

  const jobQuery = useQuery({
    queryKey: ['carousel-job', teamId, activeJobId],
    queryFn: () => fetchApi<JobView>(`/api/teams/${teamId}/content/carousel/jobs/${activeJobId}`),
    enabled: !!teamId && !!activeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' ? 2000 : false;
    },
  });

  const brandKit = brandKitQuery.data ?? null;
  const masterTemplate = masterTemplateQuery.data ?? null;
  const job = jobQuery.data ?? null;

  // Prefill master template / provider forms once data arrives.
  React.useEffect(() => {
    if (masterTemplate) {
      setAllowedBlocks(masterTemplate.allowedBlocks);
      setTemplateRatios(masterTemplate.aspectRatios);
      setMaxSlides(String(masterTemplate.maxSlides));
      setDefaultTone(masterTemplate.defaultTone);
      setTextLimits(
        Object.fromEntries(masterTemplate.textLimits.map((l) => [l.blockType, String(l.maxChars)])),
      );
    }
  }, [masterTemplate]);

  React.useEffect(() => {
    if (brandKit?.colors?.length) setColors(brandKit.colors);
    if (brandKit?.chrome) {
      setLogoPlacement(brandKit.chrome.logoPlacement);
      setPageNumberFormat(brandKit.chrome.pageNumberFormat);
      setSiteUrl(brandKit.chrome.siteUrl);
    }
    const t = brandKit?.typography;
    const firstFam = brandKit?.fonts?.[0]?.family ?? '';
    const secondFam = brandKit?.fonts?.[1]?.family ?? firstFam;
    setCoverFont(t?.cover?.fontFamily ?? t?.header?.fontFamily ?? firstFam);
    setHeaderFont(t?.header?.fontFamily ?? firstFam);
    setBodyFont(t?.body?.fontFamily ?? secondFam);
    setCoverSize(String(t?.cover?.sizePx ?? t?.header?.sizePx ?? 72));
    setHeaderSize(String(t?.header?.sizePx ?? 48));
    setBodySize(String(t?.body?.sizePx ?? 22));
    if (t) {
      setHeaderColor(t.header?.color ?? '#1a1d24');
      setBodyColor(t.body?.color ?? '#5b626e');
      setHighlightColor(t.highlightColor ?? '#187DB4');
      setBgColor(t.background ?? '#F4F3EF');
      setPaginationColor(t.paginationColor ?? '#5b626e');
      setMetaColor(t.metaTextColor ?? '#5b626e');
      setAccentColor(t.accent ?? brandKit?.colors?.[0] ?? '#187DB4');
    } else if (brandKit?.colors?.[0]) {
      setAccentColor(brandKit.colors[0]);
      setHighlightColor(brandKit.colors[0]);
    }
  }, [brandKit]);

  const currentGeneratorConfig = useMemo<GeneratorConfig>(() => ({
    headerSize,
    bodySize,
    aspectRatio: genRatio,
    slideCount: slideCount.trim() || String(Math.min(5, masterTemplate?.maxSlides ?? 7)),
    referenceMode: refMode,
    chosenReferenceId: chosenRefId,
  }), [bodySize, chosenRefId, genRatio, headerSize, masterTemplate?.maxSlides, refMode, slideCount]);

  React.useEffect(() => {
    if (!teamId || typeof window === 'undefined') return;
    const configRaw = window.localStorage.getItem(`content-generator-config:${teamId}`);
    if (configRaw) {
      try {
        const parsed = JSON.parse(configRaw) as Partial<GeneratorConfig>;
        if (parsed.headerSize) setHeaderSize(parsed.headerSize);
        if (parsed.bodySize) setBodySize(parsed.bodySize);
        if (parsed.aspectRatio && ASPECT_RATIOS.includes(parsed.aspectRatio)) setGenRatio(parsed.aspectRatio);
        if (parsed.slideCount) setSlideCount(parsed.slideCount);
        if (parsed.referenceMode) setRefMode(parsed.referenceMode);
        setChosenRefId(parsed.chosenReferenceId ?? null);
        setConfigSavedAt('Loaded');
      } catch {
        window.localStorage.removeItem(`content-generator-config:${teamId}`);
      }
    }

    const historyRaw = window.localStorage.getItem(`content-generator-history:${teamId}`);
    if (historyRaw) {
      try {
        const parsed = JSON.parse(historyRaw) as ChatHistoryItem[];
        setChatHistory(parsed.slice(0, 5));
      } catch {
        window.localStorage.removeItem(`content-generator-history:${teamId}`);
      }
    }
  }, [teamId]);

  // -- Mutations ------------------------------------------------------------
  const saveBrandKitMutation = useMutation({
    mutationFn: () => {
      if (!logoFile && !brandKit?.logoUrl) throw new Error('Logo PNG wajib diunggah');
      if (fonts.length === 0 && (brandKit?.fonts.length ?? 0) === 0) {
        throw new Error('Minimal satu Brand Font wajib diunggah');
      }
      const parseSize = (value: string): number | undefined => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
      };
      const body: Record<string, unknown> = {
        fonts: fonts.map((f) => ({
          base64: f.base64,
          family: f.family,
          format: f.format,
          ...(f.weight !== undefined ? { weight: f.weight } : {}),
          ...(f.style !== undefined ? { style: f.style } : {}),
        })),
        colors,
        chrome: { logoPlacement, pageNumberFormat, siteUrl },
        typography: {
          cover: { fontFamily: coverFont, color: headerColor, sizePx: parseSize(coverSize) },
          header: { fontFamily: headerFont, color: headerColor, sizePx: parseSize(headerSize) },
          body: { fontFamily: bodyFont, color: bodyColor, sizePx: parseSize(bodySize) },
          highlightColor,
          background: bgColor,
          paginationColor,
          metaTextColor: metaColor,
          accent: accentColor,
        },
      };
      if (logoFile) {
        body.logo = { base64: logoFile.base64, contentType: 'image/png' };
      }
      return fetchApi<BrandKit>(`/api/teams/${teamId}/content/brand-kit`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success('Brand Kit berhasil disimpan');
      setLogoFile(null);
      setFonts([]);
      void queryClient.invalidateQueries({ queryKey: ['brand-kit', teamId] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Gagal menyimpan Brand Kit')),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: () => {
      if (!brandKit) throw new Error('Buat Brand Kit terlebih dahulu');
      const limits = Object.entries(textLimits)
        .filter(([blockType, raw]) => allowedBlocks.includes(blockType as BlockType) && raw.trim() !== '')
        .map(([blockType, raw]) => ({ blockType: blockType as BlockType, maxChars: Number(raw) }))
        .filter((l) => Number.isInteger(l.maxChars) && l.maxChars > 0);
      return fetchApi<MasterTemplate>(`/api/teams/${teamId}/content/master-template`, {
        method: 'PUT',
        body: JSON.stringify({
          brandKitId: brandKit.id,
          allowedBlocks,
          maxSlides: Number(maxSlides),
          textLimits: limits,
          aspectRatios: templateRatios,
          defaultTone: defaultTone.trim() || 'professional',
        }),
      });
    },
    onSuccess: () => {
      toast.success('Master Template berhasil disimpan');
      void queryClient.invalidateQueries({ queryKey: ['master-template', teamId] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Gagal menyimpan Master Template')),
  });

	  const generateMutation = useMutation({
	    mutationFn: ({ prompt: submittedPrompt, config }: GeneratorRequestInput) => {
      const body: Record<string, unknown> = { prompt: submittedPrompt, aspectRatio: config.aspectRatio };
      const typographyOverride = typographyOverrideFromConfig(config);
      if (typographyOverride) body.typographyOverride = typographyOverride;
      const count = Number(config.slideCount);
      if (config.slideCount.trim() !== '' && Number.isInteger(count) && count >= 1 && count <= 10) {
        body.requestedSlideCount = count;
      }
	      return fetchApi<{ jobId: string; status?: JobView['status'] }>(
	        `/api/teams/${teamId}/content/carousel/generate`,
	        { method: 'POST', body: JSON.stringify(body) },
	      );
	    },
	    onMutate: ({ config }) => {
	      setActiveRatio(config.aspectRatio);
	    },
	    onSuccess: (res) => {
	      setActiveJobId(res.jobId);
	      toast.success('Carousel sedang diproses di background');
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Gagal memicu generate')),
  });

  // Fase 2 mutations
  const draftMutation = useMutation({
    mutationFn: ({ prompt: submittedPrompt, config }: GeneratorRequestInput) => {
      const count = Number(config.slideCount);
      const body: Record<string, unknown> = {
        prompt: submittedPrompt,
        aspectRatio: config.aspectRatio,
        referenceMode: config.referenceMode,
      };
      const typographyOverride = typographyOverrideFromConfig(config);
      if (typographyOverride) body.typographyOverride = typographyOverride;
      if (config.slideCount.trim() !== '' && Number.isInteger(count) && count >= 1) body.slideCount = count;
      if (config.referenceMode === 'manual' && config.chosenReferenceId) {
        body.chosenReferenceId = config.chosenReferenceId;
      }
      return fetchApi<DraftResponse>(`/api/teams/${teamId}/content/carousel/draft`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: (res) => {
      setDraftSlides(res.slides);
      setDraftRatio(res.aspectRatio);
      setPhase('draft_ready');
      setChatFeedback('');
      toast.success('Draft siap — review dan revisi teks sebelum generate');
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Gagal membuat draft')),
  });

  const reviseMutation = useMutation({
    mutationFn: (feedback: string) =>
      fetchApi<DraftResponse>(`/api/teams/${teamId}/content/carousel/draft/revise`, {
        method: 'POST',
        body: JSON.stringify({
          prompt: activePrompt || prompt.trim(),
          aspectRatio: draftRatio,
          slides: draftSlides,
          feedback,
          typographyOverride: typographyOverrideFromConfig(currentGeneratorConfig),
        }),
      }),
    onSuccess: (res) => {
      setDraftSlides(res.slides);
      setChatFeedback('');
      toast.success('Draft diperbarui');
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Gagal merevisi draft')),
  });

	  const executeRenderMutation = useMutation({
	    mutationFn: () => {
      const body: Record<string, unknown> = {
        prompt: activePrompt || prompt.trim(),
        aspectRatio: draftRatio,
        requestedSlideCount: draftSlides.length,
        typographyOverride: typographyOverrideFromConfig(currentGeneratorConfig),
        // Send the reviewed/edited SDUI draft as-is so the worker renders
        // exactly this (including each slide's image_object_context).
        sduiSlides: draftSlides,
      };
	      return fetchApi<{ jobId: string }>(`/api/teams/${teamId}/content/carousel/generate`, {
	        method: 'POST',
	        body: JSON.stringify(body),
	      });
	    },
	    onMutate: () => {
	      setActiveRatio(draftRatio);
	    },
	    onSuccess: (res) => {
	      setActiveJobId(res.jobId);
	      setPhase('done');
      toast.success('Carousel sedang dirender…');
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Gagal memicu render')),
  });

  const previewReviseMutation = useMutation({
    mutationFn: async ({ slideIdx, feedback }: { slideIdx: number; feedback: string }) => {
      if (draftSlides.length === 0) {
        throw new Error('Revisi preview membutuhkan draft source. Generate dengan Planning aktif untuk revisi per slide.');
	      }
	      const regenerated = await fetchApi<{ slide: SduiSlide }>(
	        `/api/teams/${teamId}/content/carousel/jobs/${activeJobId ?? 'draft'}/slides/${slideIdx}/regenerate`,
	        {
	          method: 'POST',
          body: JSON.stringify({
            prompt: activePrompt || prompt.trim(),
            aspectRatio: draftRatio,
            feedback,
            totalSlides: draftSlides.length,
            typographyOverride: typographyOverrideFromConfig(currentGeneratorConfig),
          }),
        },
      );
      const nextSlides = draftSlides.map((slide, index) => (index === slideIdx ? regenerated.slide : slide));
      const rendered = await fetchApi<{ jobId: string }>(`/api/teams/${teamId}/content/carousel/generate`, {
        method: 'POST',
        body: JSON.stringify({
          prompt: activePrompt || prompt.trim(),
          aspectRatio: draftRatio,
          requestedSlideCount: nextSlides.length,
          typographyOverride: typographyOverrideFromConfig(currentGeneratorConfig),
          sduiSlides: nextSlides,
        }),
      });
      return { jobId: rendered.jobId, nextSlides };
	    },
	    onMutate: ({ slideIdx }) => {
	      setActiveRatio(draftRatio);
	      setRegenning((prev) => new Set(prev).add(slideIdx));
	    },
    onSuccess: ({ jobId, nextSlides }) => {
      setDraftSlides(nextSlides);
      setActiveJobId(jobId);
      setPhase('done');
      setSelectedPreviewIndex(null);
      setPreviewFeedback('');
      setChatMessages((prev) => [
        ...prev,
        {
          id: makeClientId(),
          role: 'assistant',
          text: 'Revisi slide diterapkan. Aku render ulang carousel dengan perubahan terbaru.',
          createdAt: new Date().toISOString(),
        },
      ]);
      toast.success('Revisi slide diterapkan dan carousel dirender ulang');
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Gagal merevisi preview')),
    onSettled: (_data, _error, vars) => {
      if (!vars) return;
      setRegenning((prev) => {
        const next = new Set(prev);
        next.delete(vars.slideIdx);
        return next;
      });
    },
  });

  const regenSlideMutation = async (slideIdx: number) => {
    const fb = regenFeedback[slideIdx]?.trim();
    if (!fb) { toast.error('Tulis arahan untuk slide ini dulu'); return; }
    setRegenning(prev => new Set(prev).add(slideIdx));
    try {
      const res = await fetchApi<{ slide: SduiSlide }>(
        `/api/teams/${teamId}/content/carousel/jobs/draft/slides/${slideIdx}/regenerate`,
        {
          method: 'POST',
          body: JSON.stringify({
            prompt: activePrompt || prompt.trim(),
            aspectRatio: draftRatio,
            feedback: fb,
            totalSlides: draftSlides.length,
            typographyOverride: typographyOverrideFromConfig(currentGeneratorConfig),
          }),
        },
      );
      setDraftSlides(prev => prev.map((s, i) => (i === slideIdx ? res.slide : s)));
      setRegenFeedback(prev => { const n = { ...prev }; delete n[slideIdx]; return n; });
      toast.success(`Slide ${slideIdx + 1} diperbarui`);
    } catch (e) {
      toast.error(getErrorMessage(e, `Gagal regen slide ${slideIdx + 1}`));
    } finally {
      setRegenning(prev => { const n = new Set(prev); n.delete(slideIdx); return n; });
    }
  };

  // Inline-edit helpers
  const startEdit = (slideIdx: number, group: string, compIdx: number, text: string) => {
    setEditingCell({ slideIdx, group, compIdx });
    setEditingText(text);
  };
  const commitEdit = () => {
    if (!editingCell) return;
    const { slideIdx, group, compIdx } = editingCell;
    setDraftSlides(prev => prev.map((s, si) => {
      if (si !== slideIdx) return s;
      const g = (s.nested_groups[group as keyof typeof s.nested_groups] ?? []).map((c, ci) => {
        if (ci !== compIdx) return c;
        if (c.type === 'checklist') {
          const items = editingText
            .split(/\n|·|,/)
            .map((item) => item.trim())
            .filter(Boolean);
          return { ...c, items };
        }
        if (c.label !== undefined) return { ...c, label: editingText };
        return { ...c, text: editingText };
      });
      return { ...s, nested_groups: { ...s.nested_groups, [group]: g } };
    }));
    setEditingCell(null);
  };

  const approveMutation = useMutation({
    mutationFn: (jobId: string) =>
      fetchApi(`/api/teams/${teamId}/content/carousel/jobs/${jobId}/approve`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Carousel disimpan sebagai contoh');
      void queryClient.invalidateQueries({ queryKey: ['carousel-examples', teamId] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Gagal menyimpan contoh')),
  });

  const unapproveMutation = useMutation({
    mutationFn: (exampleId: string) =>
      fetchApi(`/api/teams/${teamId}/content/carousel/examples/${exampleId}/approve`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Contoh dihapus dari library');
      void queryClient.invalidateQueries({ queryKey: ['carousel-examples', teamId] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Gagal menghapus contoh')),
  });

  const uploadRefMutation = useMutation({
    mutationFn: async (input: { name: string; base64: string; contentType: string; tags: string[] }) =>
      fetchApi(`/api/teams/${teamId}/content/carousel/references`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success('Referensi berhasil diunggah');
      void queryClient.invalidateQueries({ queryKey: ['visual-references', teamId] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Gagal unggah referensi')),
  });

  const deleteRefMutation = useMutation({
    mutationFn: (refId: string) =>
      fetchApi(`/api/teams/${teamId}/content/carousel/references/${refId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Referensi dihapus');
      void queryClient.invalidateQueries({ queryKey: ['visual-references', teamId] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Gagal menghapus referensi')),
  });

  // -- File handlers --------------------------------------------------------
  const handleLogoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'image/png') {
      toast.error('Logo harus berformat PNG');
      return;
    }
    if (file.size > MAX_ASSET_BYTES) {
      toast.error('Ukuran logo maksimal 5 MB');
      return;
    }
    try {
      const base64 = await readFileAsBase64(file);
      setLogoFile({ base64, name: file.name });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Gagal membaca file logo'));
    }
  };

  const handleFontPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const file of files) {
      const lower = file.name.toLowerCase();
      const format: 'ttf' | 'otf' | null = lower.endsWith('.ttf')
        ? 'ttf'
        : lower.endsWith('.otf')
          ? 'otf'
          : null;
      if (!format) {
        toast.error(`${file.name} harus .ttf atau .otf`);
        continue;
      }
      if (file.size > MAX_ASSET_BYTES) {
        toast.error(`${file.name} melebihi 5 MB`);
        continue;
      }
      try {
        const base64 = await readFileAsBase64(file);
        const family = file.name.replace(/\.(ttf|otf)$/i, '');
        setFonts((prev) => [...prev, { base64, family, format, fileName: file.name }]);
      } catch (err) {
        toast.error(getErrorMessage(err, `Gagal membaca ${file.name}`));
      }
    }
  };

  const toggleBlock = (block: BlockType) =>
    setAllowedBlocks((prev) =>
      prev.includes(block) ? prev.filter((b) => b !== block) : [...prev, block],
    );

  const toggleRatio = (ratio: AspectRatio) =>
    setTemplateRatios((prev) =>
      prev.includes(ratio) ? prev.filter((r) => r !== ratio) : [...prev, ratio],
    );

  const handleDownload = async (url: string, index: number) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `carousel-slide-${index + 1}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const makeClientId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const persistHistory = (items: ChatHistoryItem[]) => {
    if (!teamId || typeof window === 'undefined') return;
    window.localStorage.setItem(`content-generator-history:${teamId}`, JSON.stringify(items.slice(0, 5)));
  };

  const saveCurrentConfig = () => {
    if (!teamId || typeof window === 'undefined') return;
    window.localStorage.setItem(`content-generator-config:${teamId}`, JSON.stringify(currentGeneratorConfig));
    const savedLabel = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
    setConfigSavedAt(savedLabel);
    toast.success('Config tersimpan');
  };

  const applyHistoryItem = (item: ChatHistoryItem) => {
    setPrompt(item.prompt);
    setActivePrompt(item.prompt);
    setPlanningEnabled(item.planning);
    setHeaderSize(item.config.headerSize);
    setBodySize(item.config.bodySize);
    setGenRatio(item.config.aspectRatio);
    setSlideCount(item.config.slideCount);
    setRefMode(item.config.referenceMode);
    setChosenRefId(item.config.chosenReferenceId);
    setIsHistoryOpen(false);
    setActiveJobId(null);
    setDraftSlides([]);
    setChatMessages([]);
    setChatFeedback('');
    setRegenFeedback({});
    setEditingCell(null);
    setSelectedPreviewIndex(null);
    setPreviewFeedback('');
    setPhase('idle');
  };

  const handleSubmitChat = () => {
    const text = prompt.trim();
    if (!text || !canGenerate || !readyToGenerate || isGeneratorProcessing) return;
    const createdAt = new Date().toISOString();
    const submittedConfig = currentGeneratorConfig;
    const historyItem: ChatHistoryItem = {
      id: makeClientId(),
      prompt: text,
      title: text.length > 44 ? `${text.slice(0, 44)}...` : text,
      createdAt,
      planning: planningEnabled,
      config: submittedConfig,
    };
    const nextHistory = [historyItem, ...chatHistory.filter((item) => item.prompt !== text)].slice(0, 5);
    setChatHistory(nextHistory);
    persistHistory(nextHistory);
    setChatMessages((prev) => [
      ...prev,
      { id: makeClientId(), role: 'user', text, createdAt },
      {
        id: makeClientId(),
        role: 'assistant',
        text: planningEnabled
          ? 'Planning aktif. Aku susun draft dulu untuk direview.'
          : 'Planning nonaktif. Aku langsung render carousel dari prompt ini.',
        createdAt,
      },
    ]);
    setActivePrompt(text);
    setPrompt('');
    setActiveRatio(submittedConfig.aspectRatio);
    setIsPromptFocused(false);
    setIsHistoryOpen(false);
    setActiveJobId(null);
    setDraftSlides([]);
    setChatFeedback('');
    setRegenFeedback({});
    setEditingCell(null);
    setSelectedPreviewIndex(null);
    setPreviewFeedback('');
    setPhase('idle');
    if (planningEnabled) {
      draftMutation.mutate({ prompt: text, config: submittedConfig });
    } else {
      generateMutation.mutate({ prompt: text, config: submittedConfig });
    }
  };

  // -- Derived --------------------------------------------------------------
  const promptLen = prompt.trim().length;
  const generateRatioOptions = useMemo(() => {
    const available = masterTemplate?.aspectRatios?.length ? masterTemplate.aspectRatios : ASPECT_RATIOS;
    return available.map((r) => ({ label: r, value: r }));
  }, [masterTemplate]);

  const readyToGenerate = !!brandKit;
  const processingKind: ProcessingKind | null = previewReviseMutation.isPending
    ? 'preview-revise'
    : executeRenderMutation.isPending
      ? 'render'
      : reviseMutation.isPending
        ? 'revise'
        : draftMutation.isPending
          ? 'draft'
          : generateMutation.isPending
            ? 'generate'
            : regenning.size > 0
              ? 'slide-revise'
              : activeJobId && (!job || job.status === 'pending')
                ? 'render'
                : null;
  const isGeneratorProcessing = processingKind !== null;
  const generatorStage: GeneratorStage = processingKind
    ? 'processing'
    : promptLen > 0 || chatMessages.length > 0 || draftSlides.length > 0 || activeJobId
      ? 'filled'
      : 'active';
  const generatorStageLabel: Record<GeneratorStage, string> = {
    active: 'Siap',
    filled: 'Terisi',
    processing: 'Diproses',
  };
  const processingLabels: Record<ProcessingKind, string> = {
    draft: 'Menyusun draft',
    generate: 'Generate konten',
    revise: 'Merevisi draft',
    render: 'Render carousel',
    'slide-revise': 'Merevisi slide',
    'preview-revise': 'Merevisi preview',
  };
  const typingLabel = processingKind ? processingLabels[processingKind] : null;
  const selectedPreviewSlide =
    selectedPreviewIndex === null
      ? null
      : job?.slides.find((slide) => slide.index === selectedPreviewIndex) ?? null;
  const selectedDraftSlide =
    selectedPreviewIndex === null ? undefined : draftSlides[selectedPreviewIndex];
  const selectedPreview: PreviewSelection | null = selectedPreviewSlide
    ? selectedDraftSlide
      ? { slide: selectedPreviewSlide, draftSlide: selectedDraftSlide }
      : { slide: selectedPreviewSlide }
    : null;

  const openPreview = (slide: JobSlide) => {
    if (slide.status !== 'success' || !slide.imageUrl) return;
    setSelectedPreviewIndex(slide.index);
    setPreviewFeedback('');
  };

  const closePreview = () => {
    if (previewReviseMutation.isPending) return;
    setSelectedPreviewIndex(null);
    setPreviewFeedback('');
  };

  const submitPreviewRevision = () => {
    const feedback = previewFeedback.trim();
    if (!selectedPreview || feedback.length < 3 || isGeneratorProcessing) return;
    previewReviseMutation.mutate({ slideIdx: selectedPreview.slide.index, feedback });
  };

  // -- Early states ---------------------------------------------------------
  if (isSessionLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-72 w-full max-w-[1104px] rounded-panel" />
      </div>
    );
  }
  if (!teamId) return <div className="p-4 text-state-danger-base">Error: Sesi tim tidak aktif.</div>;

  // -----------------------------------------------------------------------
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)} className="w-full">
          <TabsList className="h-9 w-full max-w-[760px] rounded-[10px] bg-bg-weak-50 p-1">
            <TabsTrigger value="generate" className="flex-1 gap-1.5 rounded-md px-3 py-1.5">
              <Sparkles size={14} /> Generate
            </TabsTrigger>
            <TabsTrigger value="brand" className="flex-1 gap-1.5 rounded-md px-3 py-1.5">
              <Palette size={14} /> Brand Kit
            </TabsTrigger>
            <TabsTrigger value="references" className="flex-1 gap-1.5 rounded-md px-3 py-1.5">
              <Library size={14} /> Referensi
            </TabsTrigger>
            <TabsTrigger value="examples" className="flex-1 gap-1.5 rounded-md px-3 py-1.5">
              <History size={14} /> History
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

	      {activeTab === 'generate' ? (
	        renderGenerateTab()
	      ) : (
	        <div className="min-h-0 flex-1 overflow-y-auto pb-1 pt-6">
	          {activeTab === 'brand' && renderBrandTab()}
	          {activeTab === 'references' && renderReferencesTab()}
	          {activeTab === 'examples' && renderExamplesTab()}
	        </div>
	      )}
	      {renderPreviewModal()}
	    </div>
	  );

  // =======================================================================
  // Tab renderers (closures over component state)
  // =======================================================================

  function renderSetupWarning() {
    if (brandKitQuery.isLoading) return null;
    if (brandKit) return null;
    return (
      <div className="flex items-start gap-3 rounded-panel border border-state-warning-border bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-state-warning-base" />
        <div className="text-sm text-text-sub-600">
          <p className="font-medium">Lengkapi setup dulu</p>
          <p className="mt-0.5">
            Brand Kit belum dikonfigurasi. Carousel bisa di-generate setelah logo, font, warna, dan chrome brand siap.
          </p>
        </div>
      </div>
    );
  }

  function renderGenerateTab() {
    const maxSlidesAllowed = masterTemplate?.maxSlides ?? 7;
    const displayedSlideCount = slideCount.trim() || String(Math.min(5, maxSlidesAllowed));
    const canSubmitPrompt = canGenerate && readyToGenerate && promptLen > 0 && !isGeneratorProcessing;
    const configLocked = !canGenerate || isGeneratorProcessing;
    const promptDisabled = !canGenerate || isGeneratorProcessing;
    const promptPlaceholder = isGeneratorProcessing
      ? 'Sedang memproses...'
      : chatMessages.length > 0 || activeJobId || draftSlides.length > 0
        ? 'Tulis prompt baru untuk memulai carousel lain'
        : 'Write content context';
    const referenceModes = [
      { mode: 'no_reference' as const, icon: <Sparkles size={14} />, label: 'Otonom' },
      { mode: 'auto_match' as const, icon: <Cpu size={14} />, label: 'Auto' },
      { mode: 'manual' as const, icon: <MousePointerClick size={14} />, label: 'Manual' },
    ];
    const setNumberValue = (
      value: string,
      setter: (value: string) => void,
      delta: number,
      min: number,
      max: number,
    ) => {
      const current = Number(value || min);
      const next = Math.min(max, Math.max(min, Number.isFinite(current) ? current + delta : min));
      setter(String(next));
    };
    const renderCounter = (
      label: string,
      value: string,
      setter: (value: string) => void,
      min: number,
      max: number,
      disabled = false,
    ) => (
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium leading-5 text-text-sub-600">{label}</label>
        <div className="flex h-9 items-center justify-between rounded-lg border border-stroke-soft-200 bg-bg-white-0 p-1 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
          <button
            type="button"
            disabled={disabled}
            className="flex size-7 items-center justify-center rounded-md text-text-sub-600 hover:bg-bg-weak-50 disabled:text-text-disabled-300"
            onClick={() => setNumberValue(value, setter, -1, min, max)}
            aria-label={`Decrease ${label}`}
          >
            <Minus size={16} />
          </button>
          <input
            value={value}
            onChange={(event) => setter(event.target.value)}
            disabled={disabled}
            inputMode="numeric"
            className="min-w-0 flex-1 bg-transparent text-center text-sm leading-5 text-text-soft-400 outline-none disabled:text-text-disabled-300"
          />
          <button
            type="button"
            disabled={disabled}
            className="flex size-7 items-center justify-center rounded-md text-text-sub-600 hover:bg-bg-weak-50 disabled:text-text-disabled-300"
            onClick={() => setNumberValue(value, setter, 1, min, max)}
            aria-label={`Increase ${label}`}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    );

    return (
      <div className="flex min-h-0 flex-1 pt-6">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 rounded-panel bg-stroke-soft-200 p-4 lg:min-h-[640px] lg:grid-cols-[minmax(0,1fr)_235px] xl:min-h-[681px]">
          <div className="flex min-h-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative w-full max-w-[296px]">
                <button
                  type="button"
                  disabled={isGeneratorProcessing}
                  className="flex h-9 w-full items-center gap-2 rounded-ui border border-stroke-soft-200 bg-bg-white-0 px-3 text-sm text-text-strong-950 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] transition-all hover:bg-bg-weak-50 disabled:cursor-not-allowed disabled:bg-bg-weak-50 disabled:text-text-disabled-300"
                  onClick={() => setIsHistoryOpen((current) => !current)}
                >
                  <History size={18} className="text-text-sub-600" />
                  <span className="min-w-0 flex-1 truncate">History Chat</span>
                  <ChevronRight size={16} className={`text-text-sub-600 transition-transform ${isHistoryOpen ? '-rotate-90' : 'rotate-90'}`} />
                </button>
                {isHistoryOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-1 shadow-card">
                    {chatHistory.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-text-soft-400">Belum ada chat.</p>
                    ) : (
                      chatHistory.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={isGeneratorProcessing}
                          className="flex w-full flex-col gap-0.5 rounded-ui px-3 py-2 text-left transition-colors hover:bg-bg-weak-50 disabled:cursor-not-allowed disabled:text-text-disabled-300"
                          onClick={() => applyHistoryItem(item)}
                        >
                          <span className="w-full truncate text-sm font-medium text-text-strong-950">{item.title}</span>
                          <span className="text-xs text-text-soft-400">
                            {item.planning ? 'Planning on' : 'Planning off'} · {item.config.aspectRatio} · {item.config.slideCount} slide
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <Badge
                variant={generatorStage === 'processing' ? 'warning' : generatorStage === 'filled' ? 'success' : 'active'}
                showDot
              >
                {generatorStageLabel[generatorStage]}
              </Badge>
            </div>

            <div className="min-h-0 flex-1 overflow-visible md:overflow-y-auto">
              <div className="flex min-h-full flex-col gap-4 pb-3">
                {renderSetupWarning()}

                {(chatMessages.length > 0 || typingLabel) && (
                  <div className="flex flex-col gap-3">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[78%] rounded-panel px-4 py-3 text-sm leading-5 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] ${
                            message.role === 'user'
                              ? 'bg-primary-accent text-bg-white-0'
                              : 'border border-stroke-soft-200 bg-bg-white-0 text-text-sub-600'
                          }`}
                        >
                          {message.text}
                        </div>
                      </div>
                    ))}
                    {typingLabel && (
                      <div className="flex justify-start">
                        <div className="flex max-w-[78%] items-center gap-2 rounded-panel border border-stroke-soft-200 bg-bg-white-0 px-4 py-3 text-sm leading-5 text-text-sub-600 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
                          <span className="shrink-0">{typingLabel}</span>
                          <span className="flex items-center gap-1" aria-label="AI sedang typing">
                            {[0, 1, 2].map((dot) => (
                              <span
                                key={dot}
                                className="size-1.5 rounded-full bg-text-soft-400 animate-bounce"
                                style={{ animationDelay: `${dot * 120}ms` }}
                              />
                            ))}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!activeJobId && phase !== 'draft_ready' && chatMessages.length === 0 && (
                  <div className="flex min-h-[220px] flex-1 items-center justify-center rounded-panel">
                    <div className="flex size-12 items-center justify-center rounded-full bg-bg-white-0 text-text-soft-400 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
                      <Sparkles size={22} />
                    </div>
                  </div>
                )}

                {activeJobId && renderJobPanel()}

                {phase === 'draft_ready' && draftSlides.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-text-strong-950">Review Draft Konten</p>
                      <Badge variant="warning">{draftSlides.length} slide</Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                      {draftSlides.map((slide, si) => (
                        <div key={si} className="rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-3 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
                          <div className="mb-3 flex items-center gap-2">
                            <span className="rounded-full bg-primary-base px-2 py-0.5 text-[11px] font-semibold text-bg-white-0">
                              {slide.slide_type === 'cover' ? 'COVER' : `SLIDE ${si + 1}`}
                            </span>
                            <span className="truncate text-xs text-text-soft-400">
                              {(slide.layout_variant_id ?? slide.container_layout).replaceAll('_', ' ')}
                            </span>
                            {slide.layout_family && (
                              <span className="rounded-full bg-bg-weak-50 px-2 py-0.5 text-[10px] font-semibold text-text-sub-600">
                                {slide.layout_family.replaceAll('_', ' ')}
                              </span>
                            )}
                            {slide.image_requirement && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  slide.image_requirement === 'required'
                                    ? 'bg-alpha-primary-10 text-primary-base'
                                    : slide.image_requirement === 'optional'
                                      ? 'bg-bg-weak-50 text-state-warning-base'
                                      : 'bg-bg-weak-50 text-text-soft-400'
                                }`}
                              >
                                image {slide.image_requirement}
                              </span>
                            )}
                          </div>
                          {(['top_meta', 'core_content', 'action_footer'] as const).map((group) => {
                            const comps = slide.nested_groups[group];
                            if (!comps || comps.length === 0) return null;
                            return (
                              <div key={group} className="mb-2">
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-soft-400">{group.replace('_', ' ')}</p>
                                {comps.map((comp, ci) => {
                                  const isEditing = editingCell?.slideIdx === si && editingCell.group === group && editingCell.compIdx === ci;
                                  const hasText = Boolean(comp.text ?? comp.label ?? (comp.items?.length ? comp.items : undefined));
                                  return (
                                    <div key={ci} className="group flex items-start gap-2 rounded-ui p-1.5 hover:bg-bg-weak-50">
                                      <span className="mt-0.5 shrink-0 rounded bg-bg-weak-50 px-1 py-0.5 text-[10px] font-semibold uppercase text-text-soft-400">{comp.type}</span>
                                      <div className="min-w-0 flex-1">
                                        {isEditing ? (
                                          <div className="flex items-center gap-1">
                                            <input
                                              autoFocus
                                              className="min-w-0 flex-1 rounded-ui border border-primary-base bg-bg-white-0 px-2 py-1 text-sm text-text-strong-950 outline-none ring-2 ring-primary-base/20"
                                              value={editingText}
                                              onChange={(event) => setEditingText(event.target.value)}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') commitEdit();
                                                if (event.key === 'Escape') setEditingCell(null);
                                              }}
                                            />
                                            <button onClick={commitEdit} className="text-state-success-base hover:text-state-success-dark" aria-label="Save edit"><Check size={14} /></button>
                                          </div>
                                        ) : (
                                          <div className="flex items-start gap-1">
                                            <span className="min-w-0 flex-1 break-words text-sm leading-5 text-text-sub-600">
                                              {comp.text ?? comp.label ?? (comp.items ? comp.items.join(' · ') : comp.image_object_context ?? '-')}
                                            </span>
                                            {hasText && comp.type !== 'image_placeholder' && comp.type !== 'button_cta' && (
                                              <button
                                                className="mt-0.5 shrink-0 text-text-soft-400 opacity-0 group-hover:opacity-100 hover:text-primary-base"
                                                onClick={() => startEdit(si, group, ci, comp.text ?? comp.label ?? comp.items?.join('\n') ?? '')}
                                                aria-label="Edit text"
                                              >
                                                <Pencil size={12} />
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                          <div className="mt-3 flex items-center gap-2 border-t border-stroke-soft-200 pt-3">
	                            <input
	                              className="min-w-0 flex-1 rounded-ui border border-stroke-soft-200 bg-bg-white-0 px-3 py-1.5 text-sm text-text-strong-950 outline-none transition-all placeholder:text-text-soft-400 focus:border-primary-base focus:ring-2 focus:ring-primary-base/20 disabled:cursor-not-allowed disabled:bg-bg-weak-50 disabled:text-text-disabled-300"
	                              placeholder={`Arahan regen slide ${si + 1}`}
	                              value={regenFeedback[si] ?? ''}
	                              onChange={(event) => setRegenFeedback((prev) => ({ ...prev, [si]: event.target.value }))}
	                              onKeyDown={(event) => { if (event.key === 'Enter') void regenSlideMutation(si); }}
	                              disabled={isGeneratorProcessing}
	                            />
	                            <button
	                              className="flex items-center gap-1 rounded-ui border border-stroke-soft-200 bg-bg-white-0 px-2 py-1.5 text-xs text-text-sub-600 transition-all hover:border-primary-base hover:text-primary-base disabled:cursor-not-allowed disabled:bg-bg-weak-50 disabled:text-text-disabled-300"
	                              disabled={isGeneratorProcessing}
	                              onClick={() => void regenSlideMutation(si)}
	                            >
                              {regenning.has(si) ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                              Regen
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
                      <p className="mb-2 text-sm font-medium text-text-strong-950">Revisi via Chat</p>
	                      <Textarea
	                        value={chatFeedback}
	                        onChange={(event) => setChatFeedback(event.target.value)}
	                        placeholder="Contoh: ubah nada semua slide jadi lebih formal"
	                        className="h-20 resize-none"
	                        disabled={isGeneratorProcessing}
	                      />
	                      <div className="mt-3 flex justify-end gap-2">
	                        <Button
	                          variant="secondary"
	                          disabled={chatFeedback.trim().length < 3 || isGeneratorProcessing}
                          leftIcon={reviseMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <MessageSquare size={14} />}
                          onClick={() => reviseMutation.mutate(chatFeedback.trim())}
                        >
                          {reviseMutation.isPending ? 'Merevisi' : 'Kirim Revisi'}
                        </Button>
	                        <Button
	                          variant="primary"
	                          disabled={isGeneratorProcessing}
                          leftIcon={executeRenderMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                          onClick={() => executeRenderMutation.mutate()}
                        >
                          {executeRenderMutation.isPending ? 'Mengirim' : 'Eksekusi Render'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`rounded-[20px] border bg-bg-white-0 p-3 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] transition-all ${
                isPromptFocused && !promptDisabled
                  ? 'border-primary-base ring-2 ring-primary-base/20'
                  : 'border-stroke-soft-200'
              } ${promptDisabled ? 'bg-bg-weak-50' : ''}`}
            >
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onFocus={() => setIsPromptFocused(true)}
                onBlur={() => setIsPromptFocused(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSubmitChat();
                  }
                }}
                maxLength={2000}
                placeholder={promptPlaceholder}
                disabled={promptDisabled}
                className="min-h-[76px] w-full resize-none bg-transparent font-inter text-[14px] font-normal leading-5 text-text-strong-950 outline-none placeholder:text-text-soft-400 disabled:cursor-not-allowed disabled:text-text-disabled-300 disabled:placeholder:text-text-disabled-300"
              />
              <div className="mt-3 flex items-center gap-2 border-t border-stroke-soft-200 pt-3">
                  <div className="flex flex-1 items-center gap-2 text-[15px] leading-6 text-text-soft-400">
	                    <button
	                      type="button"
		                      disabled={configLocked}
	                      className={`relative h-5 w-8 rounded-full transition-colors disabled:opacity-60 ${
                          planningEnabled ? 'bg-primary-accent' : 'bg-bg-weak-50'
                        }`}
	                      onClick={() => setPlanningEnabled((current) => !current)}
	                      aria-label="Toggle planning"
	                    >
	                      <span
                          className={`absolute top-1 size-3 rounded-full bg-bg-white-0 shadow-[0px_1px_2px_rgba(10,13,20,0.12)] transition-all ${
                            planningEnabled ? 'left-[16px]' : 'left-1'
                          }`}
                        />
	                    </button>
	                    <span>Planning</span>
                  </div>
                  <span className="shrink-0 text-xs leading-4 text-text-soft-400">{promptLen}/2000</span>
                  <button
	                    type="button"
		                    disabled={!canSubmitPrompt}
	                    className="flex size-8 items-center justify-center rounded-ui border border-stroke-soft-200 bg-bg-white-0 text-text-sub-600 transition-all hover:bg-bg-weak-50 hover:text-text-strong-950 disabled:cursor-not-allowed disabled:bg-bg-weak-50 disabled:text-text-disabled-300"
	                    onClick={handleSubmitChat}
	                    aria-label="Send prompt"
	                  >
		                    {isGeneratorProcessing ? <Loader2 className="animate-spin" size={18} /> : <ArrowUp size={18} />}
	                  </button>
              </div>
            </div>
            {!canGenerate && (
              <p className="text-xs text-text-soft-400">
                Peran Viewer hanya dapat melihat. Hubungi Admin untuk men-generate konten.
              </p>
            )}
          </div>

          <aside className="flex min-h-0 flex-col justify-between gap-5 overflow-visible rounded-[20px] bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] md:overflow-y-auto">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium leading-5 text-text-strong-950">Config</p>
                <p className="text-xs leading-4 text-text-sub-600">Pengaturan generate</p>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium leading-5 text-text-strong-950">Text Size</p>
                  {renderCounter('Header', headerSize, setHeaderSize, 12, 180, configLocked)}
                  {renderCounter('Body', bodySize, setBodySize, 8, 96, configLocked)}
                </div>
                <div className="h-px bg-stroke-soft-200" />
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium leading-5 text-text-strong-950">Output</p>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium leading-5 text-text-sub-600">Aspek Rasio</label>
                    <Select
                      value={genRatio}
                      onChange={(event) => setGenRatio(event.target.value as AspectRatio)}
                      options={generateRatioOptions}
                      disabled={configLocked}
                    />
                  </div>
                  {renderCounter('Slide Count', displayedSlideCount, setSlideCount, 1, maxSlidesAllowed, configLocked)}
                </div>
                <div className="h-px bg-stroke-soft-200" />
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium leading-5 text-text-strong-950">Layout</p>
                  <div className="grid grid-cols-3 gap-1">
                    {referenceModes.map(({ mode, icon, label }) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={configLocked || (mode !== 'no_reference' && (visualRefsQuery.data?.length ?? 0) === 0)}
                        onClick={() => { setRefMode(mode); if (mode !== 'manual') setChosenRefId(null); }}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                          refMode === mode ? 'border-primary-base bg-primary-base/5 text-primary-base' : 'border-stroke-soft-200 text-text-sub-600'
                        }`}
                      >
                        {icon}
                        {label}
                      </button>
                    ))}
                  </div>
                  {refMode === 'manual' && (
                    <div className="grid max-h-[160px] grid-cols-2 gap-2 overflow-y-auto">
                      {(visualRefsQuery.data ?? []).map((ref) => (
                        <button
                          key={ref.id}
                          type="button"
                          disabled={configLocked}
                          onClick={() => setChosenRefId(ref.id)}
                          className={`relative overflow-hidden rounded-lg border-2 ${
                            chosenRefId === ref.id ? 'border-primary-base' : 'border-stroke-soft-200'
                          }`}
                        >
                          <img src={ref.imageUrl} alt={ref.name} className="aspect-square w-full object-cover" />
                          <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 py-0.5 text-[10px] text-white">{ref.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col gap-2 border-t border-stroke-soft-200 bg-bg-white-0 p-4">
              {configSavedAt && (
                <p className="text-center text-xs text-text-soft-400">
                  Config {configSavedAt === 'Loaded' ? 'loaded' : `saved ${configSavedAt}`}
                </p>
              )}
              <Button
                variant="primary"
                disabled={configLocked}
                leftIcon={<Save size={16} />}
                onClick={saveCurrentConfig}
                className="w-full"
              >
                Save
              </Button>
            </div>
          </aside>
        </div>
      </div>
    );
  }

	  function renderJobPanel() {
    if (!activeJobId) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Preview Hasil</CardTitle>
            <CardDescription>
              Hasil render per slide akan muncul di sini setelah kamu menekan Generate.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    const isPending = !job || job.status === 'pending';
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle>Hasil Carousel</CardTitle>
            <CardDescription className="break-all">Job: {activeJobId}</CardDescription>
          </div>
          {job && (
            <Badge
              variant={job.status === 'success' ? 'success' : job.status === 'failed' ? 'error' : 'warning'}
            >
              {job.status === 'pending' ? 'Diproses' : job.status === 'success' ? 'Selesai' : 'Gagal'}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isPending && (
            <div className="flex items-center gap-3 rounded-panel border border-stroke-soft-200 bg-bg-weak-50 p-4">
              <Loader2 className="animate-spin text-primary-base" size={18} />
              <p className="text-sm text-text-sub-600">
                AI sedang menyusun rencana dan me-render tiap slide…
              </p>
            </div>
          )}

          {job?.status === 'failed' && (
            <div className="flex items-start gap-2 rounded-panel border border-state-danger-border bg-state-danger-light p-4 text-sm text-state-danger-dark">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>Job gagal: {failureDisplay(job.reason, job.errorCode)}</span>
            </div>
          )}

	          {job && job.slides.length > 0 && (
	            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
	              {job.slides.map((slide) => {
	                const audit = job.layoutAudit?.find((item) => item.slide_number === slide.index + 1);
	                const canOpenSlide = slide.status === 'success' && Boolean(slide.imageUrl);
	                return (
	                  <div
	                    key={slide.index}
	                    className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-stroke-soft-200 bg-bg-white-0 p-1.5"
	                  >
	                    <button
	                      type="button"
	                      disabled={!canOpenSlide}
	                      onClick={() => openPreview(slide)}
	                      className={`group relative flex w-full ${ASPECT_RATIO_CLASS[activeRatio]} items-center justify-center overflow-hidden rounded-md bg-bg-weak-50 outline-none transition disabled:cursor-default focus:ring-2 focus:ring-primary-base/20`}
	                      aria-label={`Preview slide ${slide.index + 1}`}
	                    >
	                      {slide.status === 'success' && slide.imageUrl ? (
	                        <>
	                          <img
	                            src={slide.imageUrl}
	                            alt={`Slide ${slide.index + 1}`}
	                            className="size-full object-cover"
	                          />
	                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/28 group-hover:opacity-100">
	                            <Maximize2 size={18} />
	                          </span>
	                        </>
	                      ) : slide.status === 'pending' ? (
	                        <Loader2 className="animate-spin text-text-soft-400" size={18} />
                      ) : (
                        <div className="flex flex-col items-center gap-1 p-2 text-center">
                          <AlertTriangle size={16} className="text-state-danger-base" />
                          <span className="text-[10px] text-text-soft-400">
                            {failureDisplay(slide.reason, slide.errorCode)}
	                          </span>
	                        </div>
	                      )}
	                    </button>
	                    <div className="flex items-center justify-between px-0.5">
	                      <span className="min-w-0 truncate text-[11px] text-text-sub-600">
	                        Slide {slide.index + 1}
	                        {slide.usedFallbackLayout && (
	                          <span className="ml-1 text-[10px] text-state-warning-base">(adjusted)</span>
                        )}
                      </span>
	                      {slide.status === 'success' && slide.imageUrl && (
	                        <button
	                          type="button"
	                          className="shrink-0 text-text-soft-400 hover:text-primary-base"
	                          onClick={(event) => {
	                            event.stopPropagation();
	                            void handleDownload(slide.imageUrl!, slide.index);
	                          }}
	                          aria-label="Download slide"
	                        >
	                          <Download size={14} />
                        </button>
                      )}
                    </div>
	                    {audit && (
	                      <div className="flex min-w-0 items-center gap-1 px-0.5">
	                        <span className="truncate rounded-full bg-bg-weak-50 px-1.5 py-0.5 text-[9px] font-semibold text-text-soft-400">
	                          {audit.image_status.replaceAll('_', ' ')}
	                        </span>
	                        {audit.layout_family && (
	                          <span className="truncate rounded-full bg-bg-weak-50 px-1.5 py-0.5 text-[9px] font-semibold text-text-sub-600">
	                            {audit.layout_family.replaceAll('_', ' ')}
	                          </span>
	                        )}
	                      </div>
	                    )}
	                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        {job?.status === 'success' && canManage && (
          <CardFooter className="justify-end border-t border-stroke-soft-200 bg-bg-weak-50 pt-4">
            <Button
              variant="secondary"
              leftIcon={<Star size={16} />}
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate(activeJobId)}
            >
              {approveMutation.isPending ? 'Menyimpan…' : 'Simpan sebagai Contoh'}
            </Button>
          </CardFooter>
        )}
      </Card>
	    );
	  }

	  function renderPreviewModal() {
	    if (!selectedPreview?.slide.imageUrl) return null;
	    const canRevisePreview = Boolean(selectedPreview.draftSlide);
	    const reviseDisabled =
	      !canRevisePreview || previewFeedback.trim().length < 3 || isGeneratorProcessing;

	    return (
	      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
	        <div className="flex max-h-[92vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-panel border border-stroke-soft-200 bg-bg-white-0 shadow-card lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
	          <div className="flex min-h-0 flex-col bg-bg-weak-50 p-4">
	            <div className="mb-3 flex items-center justify-between gap-3">
	              <div className="min-w-0">
	                <p className="truncate text-sm font-semibold text-text-strong-950">
	                  Slide {selectedPreview.slide.index + 1}
	                </p>
	                <p className="text-xs text-text-soft-400">{activeRatio}</p>
	              </div>
	              <div className="flex items-center gap-2">
	                <Button
	                  variant="icon"
	                  size="icon"
	                  className="size-8"
	                  onClick={() => void handleDownload(selectedPreview.slide.imageUrl!, selectedPreview.slide.index)}
	                  aria-label="Download slide"
	                >
	                  <Download size={16} />
	                </Button>
	                <Button
	                  variant="icon"
	                  size="icon"
	                  className="size-8"
	                  disabled={previewReviseMutation.isPending}
	                  onClick={closePreview}
	                  aria-label="Close preview"
	                >
	                  <X size={16} />
	                </Button>
	              </div>
	            </div>
	            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
	              <div className={`max-h-[70vh] w-full max-w-[560px] ${ASPECT_RATIO_CLASS[activeRatio]} overflow-hidden rounded-lg bg-bg-white-0 shadow-[0px_1px_2px_rgba(10,13,20,0.06)]`}>
	                <img
	                  src={selectedPreview.slide.imageUrl}
	                  alt={`Slide ${selectedPreview.slide.index + 1}`}
	                  className="size-full object-contain"
	                />
	              </div>
	            </div>
	          </div>
	          <div className="flex min-h-0 flex-col gap-4 border-t border-stroke-soft-200 p-4 lg:border-l lg:border-t-0">
	            <div>
	              <p className="text-sm font-semibold text-text-strong-950">Revise Preview</p>
	              <p className="mt-1 text-xs leading-5 text-text-soft-400">
	                {canRevisePreview
	                  ? 'Tulis perubahan untuk slide ini.'
	                  : 'Generate dengan Planning aktif untuk revisi per slide.'}
	              </p>
	            </div>
	            <Textarea
	              value={previewFeedback}
	              onChange={(event) => setPreviewFeedback(event.target.value)}
	              placeholder="Contoh: headline dibuat lebih pendek, CTA lebih tegas"
	              className="min-h-[160px] resize-none"
	              disabled={!canRevisePreview || isGeneratorProcessing}
	            />
	            <div className="mt-auto flex flex-col gap-2">
	              {selectedPreview.slide.usedFallbackLayout && (
	                <Badge variant="warning" className="self-start">layout adjusted</Badge>
	              )}
	              <Button
	                variant="primary"
	                disabled={reviseDisabled}
	                leftIcon={
	                  previewReviseMutation.isPending ? (
	                    <Loader2 className="animate-spin" size={14} />
	                  ) : (
	                    <RotateCcw size={14} />
	                  )
	                }
	                onClick={submitPreviewRevision}
	                className="w-full"
	              >
	                {previewReviseMutation.isPending ? 'Merevisi' : 'Apply Revisi'}
	              </Button>
	            </div>
	          </div>
	        </div>
	      </div>
	    );
	  }

	  function renderBrandTab() {
    if (brandKitQuery.isLoading) {
      return <Skeleton className="h-96 w-full max-w-[760px] rounded-panel" />;
    }
    const fontFamilyOptions = Array.from(
      new Set([...fonts.map((f) => f.family), ...((brandKit?.fonts ?? []).map((f) => f.family))].filter(Boolean)),
    ).map((f) => ({ label: f, value: f }));
    const brandKitNeedsLogo = !brandKit?.logoUrl && !logoFile;
    const brandKitNeedsFont = (brandKit?.fonts.length ?? 0) === 0 && fonts.length === 0;
    const brandKitSaveDisabled =
      !canManage || brandKitNeedsLogo || brandKitNeedsFont || saveBrandKitMutation.isPending;
    const colorRow = (
      label: string,
      value: string,
      setter: (v: string) => void,
    ) => (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-text-strong-950">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={isHex(value) ? value : '#000000'}
            onChange={(e) => setter(e.target.value)}
            disabled={!canManage}
            className="size-9 shrink-0 cursor-pointer rounded-lg border border-stroke-soft-200 bg-bg-white-0"
          />
          <Input
            value={value}
            onChange={(e) => setter(e.target.value)}
            wrapperClassName={`flex-1 ${!isHex(value) ? '!border-state-danger-base' : ''}`}
          />
        </div>
      </div>
    );
    return (
      <div className="flex max-w-[760px] flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Brand Kit</CardTitle>
            <CardDescription>
              Setup identitas utama untuk logo, warna, font pairing, dan chrome carousel.
              {!canManage && ' Hanya Admin yang dapat mengubah.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {brandKit && (
              <div className="flex items-center gap-3 rounded-panel border border-stroke-soft-200 bg-bg-weak-50 p-3">
                <img src={brandKit.logoUrl} alt="Logo" className="size-12 rounded-lg object-contain" />
                <div className="text-sm">
                  <p className="font-medium text-text-strong-950">Brand Kit aktif</p>
                  <p className="text-text-soft-400">
                    {brandKit.fonts.length} font · {brandKit.colors.length} warna
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Logo */}
              <div className="flex flex-col gap-2 rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-4">
                <label className="text-sm font-medium text-text-strong-950">Logo</label>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={handleLogoPick}
                />
                <div className="flex items-center gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-stroke-soft-200 bg-bg-weak-50">
                    {brandKit?.logoUrl ? (
                      <img src={brandKit.logoUrl} alt="Logo" className="max-h-9 max-w-9 object-contain" />
                    ) : (
                      <Images size={18} className="text-text-soft-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Button
                      variant="outline"
                      leftIcon={<Upload size={16} />}
                      disabled={!canManage}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {brandKit ? 'Ganti Logo' : 'Pilih Logo'}
                    </Button>
                    <p className="mt-1 truncate text-xs text-text-soft-400">
                      {logoFile?.name ?? (brandKit ? 'Logo lama dipertahankan' : 'PNG, maks 5 MB')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Fonts */}
              <div className="flex flex-col gap-2 rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-4">
                <label className="text-sm font-medium text-text-strong-950">Font Pairing</label>
                <input
                  ref={fontInputRef}
                  type="file"
                  accept=".ttf,.otf"
                  multiple
                  className="hidden"
                  onChange={handleFontPick}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-sm text-text-sub-600">
                    <p className="truncate">
                      {fonts.length > 0
                        ? `${fonts.length} font baru`
                        : brandKit?.fonts.length
                          ? `${brandKit.fonts.length} font aktif`
                          : 'Belum ada font'}
                    </p>
                    <p className="text-xs text-text-soft-400">.ttf/.otf</p>
                  </div>
                  <Button
                    variant="outline"
                    leftIcon={<Plus size={16} />}
                    disabled={!canManage}
                    onClick={() => fontInputRef.current?.click()}
                  >
                    Tambah
                  </Button>
                </div>
                {fonts.length > 0 && (
                  <div className="flex flex-col gap-2 pt-2">
                    {fonts.map((font, idx) => (
                      <div
                        key={`${font.fileName}-${idx}`}
                        className="flex items-center gap-2 rounded-lg border border-stroke-soft-200 p-2"
                      >
                        <Input
                          value={font.family}
                          onChange={(e) =>
                            setFonts((prev) =>
                              prev.map((f, i) => (i === idx ? { ...f, family: e.target.value } : f)),
                            )
                          }
                          wrapperClassName="flex-1"
                        />
                        <Badge variant="neutral" className="uppercase">{font.format}</Badge>
                        <button
                          className="text-text-soft-400 hover:text-state-danger-base"
                          onClick={() => setFonts((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="Hapus font"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Colors */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-strong-950">Brand Colors</label>
              <div className="flex flex-wrap gap-2">
                {BRAND_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={!canManage}
                    onClick={() => {
                      const nextColors = [...preset.colors];
                      setColors(nextColors);
                      setHeaderColor(nextColors[0]!);
                      setBodyColor(nextColors[0]!);
                      setBgColor(nextColors[1]!);
                      setAccentColor(nextColors[2]!);
                      setHighlightColor(nextColors[2]!);
                      setPaginationColor(nextColors[0]!);
                      setMetaColor(nextColors[0]!);
                    }}
                    className="flex h-8 items-center gap-2 rounded-lg border border-stroke-soft-200 bg-bg-white-0 px-2 text-xs font-medium text-text-sub-600 transition-colors hover:bg-bg-weak-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex -space-x-1">
                      {preset.colors.map((color) => (
                        <span
                          key={color}
                          className="size-4 rounded-full border border-bg-white-0"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                {colors.map((color, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={isHex(color) ? color : '#000000'}
                      onChange={(e) =>
                        setColors((prev) => prev.map((c, i) => (i === idx ? e.target.value : c)))
                      }
                      disabled={!canManage}
                      className="size-9 shrink-0 cursor-pointer rounded-lg border border-stroke-soft-200 bg-bg-white-0"
                    />
                    <Input
                      value={color}
                      onChange={(e) =>
                        setColors((prev) => prev.map((c, i) => (i === idx ? e.target.value : c)))
                      }
                      wrapperClassName={`flex-1 ${!isHex(color) ? '!border-state-danger-base' : ''}`}
                    />
                    {colors.length > 1 && (
                      <button
                        className="text-text-soft-400 hover:text-state-danger-base"
                        onClick={() => setColors((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Hapus warna"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Plus size={14} />}
                disabled={!canManage}
                onClick={() => setColors((prev) => [...prev, '#000000'])}
                className="self-start"
              >
                Tambah Warna
              </Button>
            </div>

            <div className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50 p-4">
              <div
                className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-[18px] border border-stroke-soft-200 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]"
                style={{ backgroundColor: isHex(bgColor) ? bgColor : '#F4F3EF' }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase"
                    style={{
                      backgroundColor: isHex(accentColor) ? accentColor : '#187DB4',
                      color: isHex(metaColor) ? metaColor : '#FFFFFF',
                    }}
                  >
                    TAG
                  </span>
                  {brandKit?.logoUrl && logoPlacement !== 'none' && (
                    <img src={brandKit.logoUrl} alt="Logo preview" className="h-6 w-14 object-contain" />
                  )}
                </div>
                <div className="mt-10">
                  <p
                    className="text-[26px] font-semibold leading-[1.05]"
                    style={{ color: isHex(headerColor) ? headerColor : '#1a1d24' }}
                  >
                    Brand chrome preview
                  </p>
                  <p
                    className="mt-2 text-xs leading-5"
                    style={{ color: isHex(bodyColor) ? bodyColor : '#5b626e' }}
                  >
                    Logo, tag, footer, pagination, dan tombol swipe tetap terkunci di semua slide.
                  </p>
                </div>
                <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-medium" style={{ color: isHex(metaColor) ? metaColor : '#5b626e' }}>
                    {siteUrl || 'Footer Brand Text'}
                  </span>
                  <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: isHex(paginationColor) ? paginationColor : '#5b626e' }}>
                    {pageNumberFormat || '{current}/{total}'}
                  </span>
                </div>
              </div>
            </div>

            {/* Chrome */}
            <div className="grid grid-cols-1 gap-4 border-t border-stroke-soft-200 pt-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-strong-950">Posisi Logo</label>
                <Select
                  value={logoPlacement}
                  onChange={(e) => setLogoPlacement(e.target.value)}
                  options={LOGO_PLACEMENT_OPTIONS}
                  disabled={!canManage}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-strong-950">Pagination</label>
                <Input
                  value={pageNumberFormat}
                  onChange={(e) => setPageNumberFormat(e.target.value)}
                  placeholder="{current}/{total}"
                  disabled={!canManage}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-strong-950">Footer Brand Text</label>
                <Input
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  placeholder="growhaley.com"
                  disabled={!canManage}
                />
              </div>
            </div>

            {/* Typography & color roles (Brand Kit v2) */}
            <details className="group rounded-panel border border-stroke-soft-200 bg-bg-white-0">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-text-strong-950">
                Advanced
                <ChevronRight size={16} className="text-text-soft-400 transition-transform group-open:rotate-90" />
              </summary>
              <div className="flex flex-col gap-4 border-t border-stroke-soft-200 p-4">
                <div>
                  <p className="text-sm font-medium text-text-strong-950">Typography & Color Roles</p>
                  <p className="text-xs text-text-soft-400">
                    Role detail tetap tersedia untuk fine-tuning, tapi tidak wajib disentuh untuk generate.
                  </p>
                </div>

              {/* Cover role */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-strong-950">Font Cover</label>
                  <Select
                    value={coverFont}
                    onChange={(e) => setCoverFont(e.target.value)}
                    options={fontFamilyOptions.length ? fontFamilyOptions : [{ label: 'Unggah font dulu', value: '' }]}
                    disabled={!canManage}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-strong-950">Ukuran Cover</label>
                  <Input
                    type="number"
                    min="12"
                    max="180"
                    value={coverSize}
                    onChange={(e) => setCoverSize(e.target.value)}
                    disabled={!canManage}
                  />
                </div>
              </div>

              {/* Header role */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)]">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-strong-950">Font Header</label>
                  <Select
                    value={headerFont}
                    onChange={(e) => setHeaderFont(e.target.value)}
                    options={fontFamilyOptions.length ? fontFamilyOptions : [{ label: 'Unggah font dulu', value: '' }]}
                    disabled={!canManage}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-strong-950">Ukuran Header</label>
                  <Input
                    type="number"
                    min="12"
                    max="180"
                    value={headerSize}
                    onChange={(e) => setHeaderSize(e.target.value)}
                    disabled={!canManage}
                  />
                </div>
                {colorRow('Warna Header', headerColor, setHeaderColor)}
              </div>

              {/* Body role */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)]">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-strong-950">Font Body</label>
                  <Select
                    value={bodyFont}
                    onChange={(e) => setBodyFont(e.target.value)}
                    options={fontFamilyOptions.length ? fontFamilyOptions : [{ label: 'Unggah font dulu', value: '' }]}
                    disabled={!canManage}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-strong-950">Ukuran Body</label>
                  <Input
                    type="number"
                    min="8"
                    max="96"
                    value={bodySize}
                    onChange={(e) => setBodySize(e.target.value)}
                    disabled={!canManage}
                  />
                </div>
                {colorRow('Warna Body', bodyColor, setBodyColor)}
              </div>

              {/* Highlight + accent + chrome colors */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {colorRow('Warna Highlight', highlightColor, setHighlightColor)}
                {colorRow('Accent / Button', accentColor, setAccentColor)}
                {colorRow('Warna Background', bgColor, setBgColor)}
                {colorRow('Warna Pagination', paginationColor, setPaginationColor)}
                {colorRow('Tag/Footer Text', metaColor, setMetaColor)}
              </div>
              </div>
            </details>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2 border-t border-stroke-soft-200 bg-bg-weak-50 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-text-soft-400">
              Logo/font lama akan dipertahankan jika tidak ada upload baru.
            </p>
            <Button
              disabled={brandKitSaveDisabled}
              onClick={() => saveBrandKitMutation.mutate()}
            >
              {saveBrandKitMutation.isPending ? 'Menyimpan…' : 'Simpan Brand Kit'}
            </Button>
          </CardFooter>
        </Card>

      </div>
    );
  }

  function renderTemplateTab() {
    if (masterTemplateQuery.isLoading) {
      return <Skeleton className="h-96 w-full max-w-[760px] rounded-panel" />;
    }
    const maxSlidesNum = Number(maxSlides);
    const maxSlidesValid = Number.isInteger(maxSlidesNum) && maxSlidesNum >= 1 && maxSlidesNum <= 10;
    return (
      <div className="flex max-w-[760px] flex-col gap-6">
        {!brandKit && (
          <div className="flex items-start gap-3 rounded-panel border border-state-warning-border bg-bg-white-0 p-4 text-sm text-text-sub-600 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-state-warning-base" />
            <span>Buat Brand Kit terlebih dahulu sebelum menyusun Master Template.</span>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Master Template</CardTitle>
            <CardDescription>
              Aturan keras carousel: blok yang diizinkan, jumlah slide, rasio, dan batas teks.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-strong-950">Blok yang Diizinkan</label>
              <div className="flex flex-wrap gap-2">
                {BLOCK_TYPES.map((block) => {
                  const selected = allowedBlocks.includes(block);
                  return (
                    <button
                      key={block}
                      type="button"
                      disabled={!canManage}
                      onClick={() => toggleBlock(block)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed ${
                        selected
                          ? 'border-primary-base bg-primary-base/10 text-primary-base'
                          : 'border-stroke-soft-200 text-text-sub-600 hover:bg-bg-weak-50'
                      }`}
                    >
                      {block}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-strong-950">Rasio Aspek</label>
              <div className="flex flex-wrap gap-2">
                {ASPECT_RATIOS.map((ratio) => {
                  const selected = templateRatios.includes(ratio);
                  return (
                    <button
                      key={ratio}
                      type="button"
                      disabled={!canManage}
                      onClick={() => toggleRatio(ratio)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                        selected
                          ? 'border-primary-base bg-primary-base/10 text-primary-base'
                          : 'border-stroke-soft-200 text-text-sub-600 hover:bg-bg-weak-50'
                      }`}
                    >
                      {ratio}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-strong-950">Maks Slide (1–10)</label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={maxSlides}
                  onChange={(e) => setMaxSlides(e.target.value)}
                  wrapperClassName={maxSlides !== '' && !maxSlidesValid ? '!border-state-danger-base' : ''}
                  disabled={!canManage}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-strong-950">Default Tone</label>
                <Input
                  value={defaultTone}
                  onChange={(e) => setDefaultTone(e.target.value)}
                  placeholder="professional"
                  disabled={!canManage}
                />
              </div>
            </div>

            {allowedBlocks.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-stroke-soft-200 pt-4">
                <label className="text-sm font-medium text-text-strong-950">
                  Batas Teks per Blok (opsional)
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {allowedBlocks.map((block) => (
                    <div key={block} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-xs capitalize text-text-sub-600">{block}</span>
                      <Input
                        type="number"
                        min={1}
                        placeholder="tanpa batas"
                        value={textLimits[block] ?? ''}
                        onChange={(e) =>
                          setTextLimits((prev) => ({ ...prev, [block]: e.target.value }))
                        }
                        disabled={!canManage}
                        wrapperClassName="flex-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-end border-t border-stroke-soft-200 bg-bg-weak-50 pt-4">
            <Button
              disabled={
                !canManage ||
                !brandKit ||
                allowedBlocks.length === 0 ||
                templateRatios.length === 0 ||
                !maxSlidesValid ||
                saveTemplateMutation.isPending
              }
              onClick={() => saveTemplateMutation.mutate()}
            >
              {saveTemplateMutation.isPending ? 'Menyimpan…' : 'Simpan Master Template'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  function renderReferencesTab() {
    const refs = visualRefsQuery.data ?? [];

    const handleRefPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        toast.error('Format harus PNG, JPEG, atau WebP'); return;
      }
      if (file.size > 5 * 1024 * 1024) { toast.error('Maks 5 MB'); return; }
      const name = refName.trim() || file.name.replace(/\.[^.]+$/, '');
      const tags = refTags.trim() ? refTags.split(',').map(t => t.trim()).filter(Boolean) : [];
      try {
        const base64 = await readFileAsBase64(file);
        uploadRefMutation.mutate({ name, base64, contentType: file.type, tags });
        setRefName(''); setRefTags('');
      } catch (err) { toast.error(getErrorMessage(err, 'Gagal membaca file')); }
    };

    return (
      <div className="flex max-w-[760px] flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Library Referensi Visual</CardTitle>
            <CardDescription>
              Unggah contoh carousel yang sudah bagus. Vision AI akan mengekstrak struktur layout-nya (Visual DNA) — warna & font brand tidak ikut diekstrak.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {canManage && (
              <div className="flex flex-col gap-3 rounded-panel border border-stroke-soft-200 bg-bg-weak-50 p-4">
                <p className="text-sm font-medium text-text-strong-950">Unggah Referensi Baru</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Nama referensi (mis. Editorial Bold)"
                    value={refName}
                    onChange={e => setRefName(e.target.value)}
                  />
                  <Input
                    placeholder="Tags (koma-pisah, mis. cover, checklist)"
                    value={refTags}
                    onChange={e => setRefTags(e.target.value)}
                  />
                </div>
                <input ref={refInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleRefPick} />
                <Button
                  variant="outline"
                  leftIcon={uploadRefMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                  disabled={uploadRefMutation.isPending}
                  onClick={() => refInputRef.current?.click()}
                  className="self-start"
                >
                  {uploadRefMutation.isPending ? 'Mengunggah & menganalisis…' : 'Pilih Gambar'}
                </Button>
                <p className="text-xs text-text-soft-400">PNG/JPEG/WebP, maks 5 MB. Vision AI mengekstrak struktur dalam ~5 detik.</p>
              </div>
            )}

            {visualRefsQuery.isLoading && <Skeleton className="h-40 w-full rounded-panel" />}

            {refs.length === 0 && !visualRefsQuery.isLoading && (
              <div className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50 p-8 text-center">
                <Library size={32} className="mx-auto mb-2 text-text-soft-400" />
                <p className="text-sm text-text-soft-400">Belum ada referensi. Unggah carousel pertama kamu.</p>
              </div>
            )}

            {refs.length > 0 && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {refs.map(ref => (
                  <div key={ref.id} className="flex flex-col gap-2 rounded-panel border border-stroke-soft-200 p-2">
                    <div className="relative overflow-hidden rounded-lg bg-bg-weak-50">
                      <img src={ref.imageUrl} alt={ref.name} className="aspect-[4/5] w-full object-cover" />
                    </div>
                    <div className="px-0.5">
                      <p className="truncate text-sm font-medium text-text-strong-950">{ref.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="rounded bg-primary-base/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary-base">
                          {ref.dna.typographyScale.replace('_', ' ')}
                        </span>
                        <span className="rounded bg-bg-weak-50 px-1.5 py-0.5 text-[10px] text-text-soft-400">
                          ratio {ref.dna.headerToBodyRatio.toFixed(1)}x
                        </span>
                        {ref.tags.map(t => (
                          <span key={t} className="rounded bg-bg-weak-50 px-1.5 py-0.5 text-[10px] text-text-soft-400">{t}</span>
                        ))}
                      </div>
                      <p className="mt-1 text-[10px] text-text-soft-400">[{ref.dna.componentSequence.join(' → ')}]</p>
                    </div>
                    {canManage && (
                      <button
                        className="mt-auto flex items-center gap-1 self-end text-[11px] text-text-soft-400 hover:text-state-danger-base"
                        onClick={() => deleteRefMutation.mutate(ref.id)}
                        disabled={deleteRefMutation.isPending}
                      >
                        <Trash2 size={11} /> Hapus
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderExamplesTab() {
    const examples = examplesQuery.data ?? [];
    return (
      <div className="flex max-w-[1104px] flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Approved Examples</CardTitle>
            <CardDescription>
              Struktur carousel yang disetujui dipakai AI sebagai referensi gaya (tanpa menimpa brand).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {examplesQuery.isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-28 rounded-panel" />
                <Skeleton className="h-28 rounded-panel" />
                <Skeleton className="h-28 rounded-panel" />
              </div>
            ) : examples.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Images size={28} className="text-text-soft-400" />
                <p className="text-sm text-text-sub-600">Belum ada contoh tersimpan.</p>
                <p className="text-xs text-text-soft-400">
                  Generate carousel lalu klik “Simpan sebagai Contoh” untuk menambah referensi.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {examples.map((ex) => (
                  <div
                    key={ex.id}
                    className="flex flex-col gap-3 rounded-panel border border-stroke-soft-200 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="neutral">{ex.structure?.aspectRatio ?? '—'}</Badge>
                      <span className="text-xs text-text-soft-400">
                        {ex.structure?.slides.length ?? 0} slide
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(ex.structure?.slides ?? []).slice(0, 4).map((slide, i) => (
                        <span
                          key={i}
                          className="rounded-md bg-bg-weak-50 px-1.5 py-0.5 text-[10px] text-text-sub-600"
                        >
                          {slide.blocks.length} blok
                        </span>
                      ))}
                    </div>
                    {ex.createdAt && (
                      <span className="text-xs text-text-soft-400">
                        {new Date(ex.createdAt).toLocaleDateString('id-ID')}
                      </span>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 size={14} />}
                        disabled={unapproveMutation.isPending}
                        onClick={() => unapproveMutation.mutate(ex.id)}
                        className="self-start text-state-danger-base hover:bg-state-danger-light"
                      >
                        Hapus
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
}
