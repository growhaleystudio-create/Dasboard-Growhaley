import { getLayoutCatalogItem } from '@leads-generator/shared';
import type {
  LayoutCatalogItem,
  SduiComponent,
  SduiLayoutTextLimits,
  SduiSlide,
  SduiTypographyOverride,
} from '@leads-generator/shared';

const DEFAULT_TEXT_LIMITS: SduiLayoutTextLimits = {
  tag: 16,
  header: 40,
  body: 110,
  quote: 90,
  ctaLabel: 24,
  checklistItem: 42,
  checklistItems: 4,
};

const BASELINE_TEXT_SIZE = {
  cover: 72,
  header: 48,
  body: 22,
} as const;

const MAX_SCALE_UP = 1.25;
const MIN_SCALE_DOWN = 0.55;

export interface SduiTextGuardrailOptions {
  typography?: SduiTypographyOverride | undefined;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function cleanSize(size: number | undefined): number | undefined {
  return Number.isFinite(size) && size !== undefined && size > 0 ? size : undefined;
}

function sizeScale(size: number | undefined, baseline: number): number {
  const clean = cleanSize(size);
  if (!clean) return 1;
  return clamp(baseline / clean, MIN_SCALE_DOWN, MAX_SCALE_UP);
}

function scaledLimit(value: number, scale: number, min: number): number {
  return Math.max(min, Math.round(value * scale));
}

function headerSizeFor(layout: LayoutCatalogItem | undefined, slide: SduiSlide | undefined, typography: SduiTypographyOverride | undefined): number | undefined {
  const useCoverRole =
    slide?.slide_type === 'cover' ||
    layout?.family === 'cover' ||
    layout?.id === 'cover_image_full' ||
    layout?.id === 'cover_with_cta';
  if (useCoverRole) return cleanSize(typography?.coverSizePx) ?? cleanSize(typography?.headerSizePx);
  return cleanSize(typography?.headerSizePx);
}

function bodySizeFor(typography: SduiTypographyOverride | undefined): number | undefined {
  return cleanSize(typography?.bodySizePx);
}

function checklistCountFor(value: number, bodySize: number | undefined): number {
  if (!bodySize) return value;
  if (bodySize >= 44) return Math.max(2, value - 2);
  if (bodySize >= 34) return Math.max(2, value - 1);
  if (bodySize <= 18) return Math.min(6, value + 1);
  return value;
}

export function resolveSduiTextLimits(
  layoutId: SduiSlide['layout_variant_id'],
  options: SduiTextGuardrailOptions = {},
  slide?: SduiSlide,
): SduiLayoutTextLimits {
  const layout = getLayoutCatalogItem(layoutId);
  const base: SduiLayoutTextLimits = {
    ...DEFAULT_TEXT_LIMITS,
    ...(layout?.textLimits ?? undefined),
  };
  const headerScale = sizeScale(headerSizeFor(layout, slide, options.typography), BASELINE_TEXT_SIZE.header);
  const bodyScale = sizeScale(bodySizeFor(options.typography), BASELINE_TEXT_SIZE.body);

  return {
    tag: base.tag,
    ...(base.header !== undefined ? { header: scaledLimit(base.header, headerScale, 8) } : {}),
    ...(base.body !== undefined ? { body: scaledLimit(base.body, bodyScale, 32) } : {}),
    ...(base.quote !== undefined ? { quote: scaledLimit(base.quote, headerScale, 28) } : {}),
    ...(base.ctaLabel !== undefined ? { ctaLabel: scaledLimit(base.ctaLabel, bodyScale, 10) } : {}),
    ...(base.checklistItem !== undefined ? { checklistItem: scaledLimit(base.checklistItem, bodyScale, 16) } : {}),
    ...(base.checklistItems !== undefined ? { checklistItems: checklistCountFor(base.checklistItems, bodySizeFor(options.typography)) } : {}),
  };
}

function limitFor(slide: SduiSlide, options: SduiTextGuardrailOptions): SduiLayoutTextLimits {
  return {
    ...DEFAULT_TEXT_LIMITS,
    ...resolveSduiTextLimits(slide.layout_variant_id, options, slide),
  };
}

const DANGLING_FINAL_WORDS = new Set([
  'agar',
  'akan',
  'atau',
  'by',
  'dalam',
  'dan',
  'dari',
  'dengan',
  'di',
  'for',
  'from',
  'in',
  'karena',
  'ke',
  'of',
  'on',
  'pada',
  'sebagai',
  'sehingga',
  'seperti',
  'serta',
  'that',
  'the',
  'to',
  'untuk',
  'with',
  'yang',
]);

const DANGLING_FINAL_MODIFIERS = new Set([
  'cukup',
  'kurang',
  'lebih',
  'makin',
  'paling',
  'sangat',
  'semakin',
  'tetap',
]);

const DANGLING_FINAL_PRONOUNS = new Set([
  'anda',
  'dia',
  'ia',
  'kamu',
  'kita',
  'mereka',
]);

const DANGLING_FINAL_ACTIONS = new Set([
  'bangun',
  'buat',
  'ciptakan',
  'dorong',
  'gunakan',
  'jadwalkan',
  'kembangkan',
  'optimalkan',
  'pahami',
  'pantau',
  'pilih',
  'rancang',
  'sesuaikan',
  'susun',
  'tentukan',
  'tingkatkan',
]);

export type SduiTextCompletenessIssue =
  | 'ellipsis'
  | 'trailing_punctuation'
  | 'unbalanced_pairs'
  | 'dangling_connector'
  | 'dangling_modifier'
  | 'dangling_relative_pronoun'
  | 'dangling_action_verb';

export interface SduiTextCompletenessAnalysis {
  incomplete: boolean;
  issue?: SduiTextCompletenessIssue;
}

function lastWord(value: string): string {
  const match = value.toLowerCase().match(/[\p{L}\p{N}]+$/u);
  return match?.[0] ?? '';
}

function hasUnbalancedPairs(value: string): boolean {
  const pairs = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ] as const;
  return pairs.some(([open, close]) => value.split(open).length !== value.split(close).length);
}

function isLikelyDanglingIndonesianAction(word: string): boolean {
  return /^(mem|men|meng|meny)[\p{L}\p{N}]{4,}$/u.test(word);
}

export function analyzeSduiTextCompleteness(value: string | undefined): SduiTextCompletenessAnalysis {
  if (typeof value !== 'string') return { incomplete: false };
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length === 0) return { incomplete: false };
  if (hasUnbalancedPairs(text)) return { incomplete: true, issue: 'unbalanced_pairs' };
  if (/[.?!…]\s*$/u.test(text) && !/\.\.\.\s*$/u.test(text)) return { incomplete: false };
  if (/\.\.\.\s*$/u.test(text)) return { incomplete: true, issue: 'ellipsis' };
  if (/[,;:–-]\s*$/u.test(text)) return { incomplete: true, issue: 'trailing_punctuation' };

  const finalWord = lastWord(text);
  if (DANGLING_FINAL_WORDS.has(finalWord)) return { incomplete: true, issue: 'dangling_connector' };
  if (DANGLING_FINAL_MODIFIERS.has(finalWord)) return { incomplete: true, issue: 'dangling_modifier' };
  if (DANGLING_FINAL_ACTIONS.has(finalWord) || isLikelyDanglingIndonesianAction(finalWord)) {
    return { incomplete: true, issue: 'dangling_action_verb' };
  }

  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const prevWord = words.at(-2) ?? '';
  if (prevWord === 'yang' && DANGLING_FINAL_PRONOUNS.has(finalWord)) {
    return { incomplete: true, issue: 'dangling_relative_pronoun' };
  }

  return { incomplete: false };
}

function stripUnsafeEnding(value: string): string {
  let out = value.trim().replace(/[,;:–-]+$/u, '').trimEnd();
  while (out.length > 0 && analyzeSduiTextCompleteness(out).incomplete) {
    const next = out.replace(/\s+[\p{L}\p{N}]+$/u, '').trimEnd();
    if (next === out || next.length < 8) break;
    out = next.replace(/[,;:–-]+$/u, '').trimEnd();
  }
  return out;
}

export function appearsIncompleteSduiText(value: string | undefined): boolean {
  return analyzeSduiTextCompleteness(value).incomplete;
}

function hasTerminalPunctuation(value: string): boolean {
  return /[.!?)]\s*$/u.test(value);
}

function finishReadableSentence(value: string, shouldFinish: boolean): string {
  const clean = stripUnsafeEnding(value);
  if (!shouldFinish || clean.length === 0 || hasTerminalPunctuation(clean)) return clean;
  return `${clean}.`;
}

function trimText(
  value: string | undefined,
  max: number | undefined,
  options: { finishSentence?: boolean } = {},
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= (max ?? normalized.length)) return normalized;
  if (max === undefined || max <= 0) return undefined;
  const effectiveMax = options.finishSentence === true && max > 1 ? max - 1 : max;
  const sliced = normalized.slice(0, effectiveMax).trimEnd();
  const minBoundary = Math.max(8, Math.floor(effectiveMax * 0.55));
  const boundaryMatches = [...sliced.matchAll(/[.!?;:](?:\s+|$)/gu)];
  const sentenceBoundary = boundaryMatches
    .map((match) => (match.index ?? -1) + match[0].trimEnd().length)
    .filter((index) => index >= minBoundary)
    .at(-1);
  if (sentenceBoundary !== undefined) {
    return finishReadableSentence(sliced.slice(0, sentenceBoundary), options.finishSentence === true);
  }
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace >= minBoundary) {
    return finishReadableSentence(sliced.slice(0, lastSpace), options.finishSentence === true);
  }
  return finishReadableSentence(sliced, options.finishSentence === true);
}

function constrainHighlight(text: string | undefined, highlight: string | undefined): string | undefined {
  const clean = trimText(highlight, 60);
  if (!clean) return undefined;
  if (!text) return clean;
  return text.toLowerCase().includes(clean.toLowerCase()) ? clean : undefined;
}

function applyComponentTextLimits(component: SduiComponent, limits: SduiLayoutTextLimits): SduiComponent {
  if (component.type === 'tag') {
    const text = trimText(component.text, limits.tag);
    const { text: _text, ...rest } = component;
    return {
      ...rest,
      ...(text ? { text } : {}),
      textTransform: component.textTransform ?? 'uppercase',
    };
  }

  if (component.type === 'header') {
    const text = trimText(component.text, limits.header);
    const highlight = constrainHighlight(text, component.highlight);
    const { text: _text, highlight: _highlight, ...rest } = component;
    return {
      ...rest,
      ...(text ? { text } : {}),
      ...(highlight ? { highlight } : {}),
    };
  }

  if (component.type === 'body') {
    const text = trimText(component.text, limits.body, { finishSentence: true });
    const highlight = constrainHighlight(text, component.highlight);
    const { text: _text, highlight: _highlight, ...rest } = component;
    return {
      ...rest,
      ...(text ? { text } : {}),
      ...(highlight ? { highlight } : {}),
    };
  }

  if (component.type === 'quote') {
    const text = trimText(component.text, limits.quote, { finishSentence: true });
    const highlight = constrainHighlight(text, component.highlight);
    const { text: _text, highlight: _highlight, ...rest } = component;
    return {
      ...rest,
      ...(text ? { text } : {}),
      ...(highlight ? { highlight } : {}),
    };
  }

  if (component.type === 'button_cta') {
    const label = trimText(component.label, limits.ctaLabel);
    const { label: _label, ...rest } = component;
    return {
      ...rest,
      ...(label ? { label } : {}),
    };
  }

  if (component.type === 'checklist') {
    const itemLimit = limits.checklistItem ?? DEFAULT_TEXT_LIMITS.checklistItem!;
    const itemCount = limits.checklistItems ?? DEFAULT_TEXT_LIMITS.checklistItems!;
    const items = (component.items ?? [])
      .map((item) => trimText(item, itemLimit))
      .filter((item): item is string => Boolean(item))
      .slice(0, itemCount);
    const { items: _items, ...rest } = component;
    return {
      ...rest,
      items,
    };
  }

  return component;
}

export function isRenderableSduiComponent(component: SduiComponent): boolean {
  switch (component.type) {
    case 'tag':
    case 'header':
    case 'body':
    case 'quote':
      return typeof component.text === 'string' && component.text.trim().length > 0;
    case 'button_cta':
      return typeof component.label === 'string' && component.label.trim().length > 0;
    case 'checklist':
      return Array.isArray(component.items) && component.items.some((item) => item.trim().length > 0);
    case 'image_placeholder':
    case 'visual_layer':
      return true;
  }
}

function qualityComponents(slide: SduiSlide): SduiComponent[] {
  return (['top_meta', 'core_content', 'action_footer'] as const)
    .flatMap((group) => slide.nested_groups[group] ?? []);
}

export function sduiContentQualityIssues(slides: SduiSlide[]): string[] {
  const issues: string[] = [];
  for (const slide of slides) {
    const components = qualityComponents(slide);
    const hasHeader = components.some((component) => component.type === 'header' && isRenderableSduiComponent(component));
    const hasBody = components.some((component) => component.type === 'body' && isRenderableSduiComponent(component));
    const hasQuote = components.some((component) => component.type === 'quote' && isRenderableSduiComponent(component));
    const hasChecklist = components.some((component) => component.type === 'checklist' && isRenderableSduiComponent(component));
    const hasButton = components.some((component) => component.type === 'button_cta' && isRenderableSduiComponent(component));
    const layout = getLayoutCatalogItem(slide.layout_variant_id);

    if (!hasHeader && !hasQuote && slide.slide_type !== 'cover') {
      issues.push(`slide ${slide.slide_number}: missing headline/quote`);
    }

    if (layout?.requiredComponents.includes('body') && !hasBody) {
      issues.push(`slide ${slide.slide_number}: layout ${layout.id} requires non-empty body`);
    }
    if (layout?.requiredComponents.includes('quote') && !hasQuote) {
      issues.push(`slide ${slide.slide_number}: layout ${layout.id} requires non-empty quote`);
    }
    if (layout?.requiredComponents.includes('checklist') && !hasChecklist) {
      issues.push(`slide ${slide.slide_number}: layout ${layout.id} requires non-empty checklist items`);
    }
    if (layout?.requiredComponents.includes('button_cta') && !hasButton) {
      issues.push(`slide ${slide.slide_number}: layout ${layout.id} requires non-empty CTA label`);
    }

    const hasSupportingContent = hasBody || hasQuote || hasChecklist || hasButton;
    if (slide.slide_type === 'content' && !hasSupportingContent) {
      issues.push(`slide ${slide.slide_number}: content slide cannot be headline-only`);
    }

    for (const component of components) {
      if (component.type === 'body' || component.type === 'quote') {
        const analysis = analyzeSduiTextCompleteness(component.text);
        if (analysis.incomplete) {
          issues.push(`slide ${slide.slide_number}: ${component.type} appears incomplete (${analysis.issue})`);
        }
      }
      if (component.type === 'checklist') {
        (component.items ?? []).forEach((item, index) => {
          const analysis = analyzeSduiTextCompleteness(item);
          if (analysis.incomplete) {
            issues.push(`slide ${slide.slide_number}: checklist item ${index + 1} appears incomplete (${analysis.issue})`);
          }
        });
      }
    }
  }
  return issues;
}

export function sduiTextFitIssues(
  slides: SduiSlide[],
  options: SduiTextGuardrailOptions = {},
): string[] {
  const issues: string[] = [];
  for (const slide of slides) {
    const limits = limitFor(slide, options);
    const components = qualityComponents(slide);

    for (const component of components) {
      if (component.type === 'tag' && typeof component.text === 'string' && component.text.trim().length > limits.tag) {
        issues.push(`slide ${slide.slide_number}: tag exceeds text limit (${component.text.trim().length}/${limits.tag})`);
      }
      if (component.type === 'header' && typeof component.text === 'string' && limits.header !== undefined && component.text.trim().length > limits.header) {
        issues.push(`slide ${slide.slide_number}: header exceeds text limit (${component.text.trim().length}/${limits.header})`);
      }
      if (component.type === 'body' && typeof component.text === 'string' && limits.body !== undefined && component.text.trim().length > limits.body) {
        issues.push(`slide ${slide.slide_number}: body exceeds text limit (${component.text.trim().length}/${limits.body})`);
      }
      if (component.type === 'quote' && typeof component.text === 'string' && limits.quote !== undefined && component.text.trim().length > limits.quote) {
        issues.push(`slide ${slide.slide_number}: quote exceeds text limit (${component.text.trim().length}/${limits.quote})`);
      }
      if (component.type === 'button_cta' && typeof component.label === 'string' && limits.ctaLabel !== undefined && component.label.trim().length > limits.ctaLabel) {
        issues.push(`slide ${slide.slide_number}: CTA label exceeds text limit (${component.label.trim().length}/${limits.ctaLabel})`);
      }
      if (component.type === 'checklist') {
        const itemLimit = limits.checklistItem ?? DEFAULT_TEXT_LIMITS.checklistItem!;
        const itemCount = limits.checklistItems ?? DEFAULT_TEXT_LIMITS.checklistItems!;
        const items = component.items ?? [];
        if (items.length > itemCount) {
          issues.push(`slide ${slide.slide_number}: checklist has too many items (${items.length}/${itemCount})`);
        }
        items.forEach((item, index) => {
          const length = item.trim().length;
          if (length > itemLimit) {
            issues.push(`slide ${slide.slide_number}: checklist item ${index + 1} exceeds text limit (${length}/${itemLimit})`);
          }
        });
      }
    }
  }
  return issues;
}

export function applySduiTextGuardrails(slide: SduiSlide, options: SduiTextGuardrailOptions = {}): SduiSlide {
  const limits = limitFor(slide, options);
  const mapComponents = (components: SduiComponent[] | undefined): SduiComponent[] | undefined => {
    if (!components) return undefined;
    return components
      .map((component) => applyComponentTextLimits(component, limits))
      .filter(isRenderableSduiComponent);
  };

  const topMeta = mapComponents(slide.nested_groups.top_meta);
  const coreContent = mapComponents(slide.nested_groups.core_content);
  const actionFooter = mapComponents(slide.nested_groups.action_footer);

  return {
    ...slide,
    nested_groups: {
      ...(topMeta ? { top_meta: topMeta } : {}),
      ...(coreContent ? { core_content: coreContent } : {}),
      ...(actionFooter ? { action_footer: actionFooter } : {}),
    },
  };
}
