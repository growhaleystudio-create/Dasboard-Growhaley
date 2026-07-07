import React, { useState } from 'react';
import Image from 'next/image';
import { Loader2, Maximize2, Sparkles, Wand2, AlertTriangle } from 'lucide-react';
import type { AspectRatio, GwComposition, SduiSlide } from '@leads-generator/shared';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui/Select';
import { ASPECT_RATIO_CLASS, PREVIEW_LABELS } from '../content-generator-constants';
import { filterCompatibleVariants } from '../content-generator-helpers';
import { CompositionControls } from './CompositionControls';

interface SlidePreviewCardProps {
  slide: SduiSlide;
  index: number;
  ratio: AspectRatio;
  previewPng?: string | undefined;
  updating?: boolean | undefined;
  adjusted?: boolean | undefined;
  error?: boolean | undefined;
  disabled?: boolean | undefined;
  onChange: (next: SduiSlide) => void;
  onZoom: (png: string) => void;
  onAiRegen: (feedback: string) => void;
  onRetry: () => void;
}

/** Immutably set a component's primary text/label at a group+index. */
function editText(
  slide: SduiSlide,
  group: 'top_meta' | 'core_content' | 'action_footer',
  compIdx: number,
  value: string,
): SduiSlide {
  const comps = slide.nested_groups[group] ?? [];
  const next = comps.map((c, i) => {
    if (i !== compIdx) return c;
    if (c.type === 'button_cta') return { ...c, label: value };
    if (c.items) return { ...c, items: value.split('\n').map((s) => s.trim()).filter(Boolean) };
    return { ...c, text: value };
  });
  return { ...slide, nested_groups: { ...slide.nested_groups, [group]: next } };
}

const TEXT_GROUPS = ['top_meta', 'core_content', 'action_footer'] as const;

export function SlidePreviewCard({
  slide,
  index,
  ratio,
  previewPng,
  updating,
  adjusted,
  error,
  disabled,
  onChange,
  onZoom,
  onAiRegen,
  onRetry,
}: SlidePreviewCardProps) {
  const [showText, setShowText] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [regenText, setRegenText] = useState('');
  const [showRegen, setShowRegen] = useState(false);

  const compatible = filterCompatibleVariants(slide);
  const layoutLabel = (slide.layout_variant_id ?? slide.container_layout).replaceAll('_', ' ');
  const hasPhoto = slide.image_requirement !== 'none';

  const setComposition = (composition: GwComposition) => onChange({ ...slide, composition });

  return (
    <div className="flex flex-col rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-2.5">
      {/* header */}
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full bg-primary-base px-2 py-0.5 text-[11px] font-semibold text-bg-white-0">
          {slide.slide_type === 'cover' ? 'COVER' : `SLIDE ${index + 1}`}
        </span>
        <span className="truncate text-[11px] text-text-soft-400">{layoutLabel}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowRegen((v) => !v)}
          title={PREVIEW_LABELS.aiRegen}
          className="ml-auto flex items-center gap-1 rounded-ui border border-stroke-soft-200 px-1.5 py-1 text-[11px] text-text-sub-600 transition hover:border-primary-base hover:text-primary-base disabled:opacity-50"
        >
          <Sparkles size={12} /> AI
        </button>
      </div>

      {/* thumbnail */}
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-ui bg-bg-weak-50',
          ASPECT_RATIO_CLASS[ratio],
        )}
      >
        {previewPng ? (
          <button
            type="button"
            onClick={() => onZoom(previewPng)}
            className="group absolute inset-0"
            title={PREVIEW_LABELS.zoom}
          >
            <Image src={previewPng} alt={`Slide ${index + 1}`} fill className="object-contain" unoptimized />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent transition group-hover:bg-black/40 group-hover:text-white">
              <Maximize2 size={22} />
            </span>
          </button>
        ) : !error ? (
          <div className="absolute inset-0 animate-pulse bg-bg-weak-50" />
        ) : null}

        {updating && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/30 text-[12px] font-medium text-white backdrop-blur-[2px]">
            <Loader2 size={16} className="animate-spin" /> {PREVIEW_LABELS.updating}
          </div>
        )}
        {error && !updating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-state-danger-light/80 text-state-danger-dark">
            <AlertTriangle size={20} />
            <button
              type="button"
              onClick={onRetry}
              className="rounded-ui border border-state-danger-base px-2 py-1 text-[12px] font-medium hover:bg-state-danger-light"
            >
              {PREVIEW_LABELS.retry}
            </button>
          </div>
        )}
      </div>

      {/* adjusted / photo hints */}
      {(adjusted || hasPhoto) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {adjusted && (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7e8] px-2 py-0.5 text-[10px] font-semibold text-state-warning-base">
                <AlertTriangle size={10} /> {PREVIEW_LABELS.textAdjusted}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAiRegen(`Tulis ulang teks slide ini agar pas untuk layout ${layoutLabel}.`)}
                className="inline-flex items-center gap-1 rounded-full border border-stroke-soft-200 px-2 py-0.5 text-[10px] font-medium text-text-sub-600 hover:border-primary-base hover:text-primary-base disabled:opacity-50"
              >
                <Wand2 size={10} /> {PREVIEW_LABELS.aiRewriteForLayout}
              </button>
            </>
          )}
          {hasPhoto && (
            <span className="rounded-full bg-bg-weak-50 px-2 py-0.5 text-[10px] font-medium text-text-soft-400">
              {PREVIEW_LABELS.photoNote}
            </span>
          )}
        </div>
      )}

      {/* AI regen input */}
      {showRegen && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            autoFocus
            value={regenText}
            onChange={(e) => setRegenText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && regenText.trim()) {
                onAiRegen(regenText.trim());
                setRegenText('');
                setShowRegen(false);
              }
            }}
            placeholder={`Arahan AI untuk slide ${index + 1}`}
            disabled={disabled}
            className="min-w-0 flex-1 rounded-ui border border-stroke-soft-200 bg-bg-white-0 px-2 py-1.5 text-[13px] outline-none focus:border-primary-base focus:ring-2 focus:ring-primary-base/20"
          />
        </div>
      )}

      {/* layout select */}
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-text-sub-600">{PREVIEW_LABELS.layout}</span>
        <Select
          wrapperClassName="min-w-[150px]"
          value={slide.layout_variant_id ?? compatible[0]?.id}
          disabled={disabled}
          options={compatible.map((item) => ({
            value: item.id,
            label: item.id.replace('gw_', '').replaceAll('_', ' '),
          }))}
          onChange={(e) =>
            onChange({
              ...slide,
              layout_variant_id: e.target.value as NonNullable<SduiSlide['layout_variant_id']>,
            })
          }
        />
      </div>

      {/* composition controls */}
      <div className="mt-2.5 border-t border-stroke-soft-200 pt-2.5">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="mb-2 text-[12px] font-medium text-primary-base hover:underline"
        >
          {showMore ? 'Sembunyikan warna & komposisi' : 'Warna & komposisi'}
        </button>
        {showMore && (
          <CompositionControls
            composition={slide.composition ?? {}}
            layoutVariantId={slide.layout_variant_id}
            disabled={disabled}
            onChange={setComposition}
          />
        )}
      </div>

      {/* text editor */}
      <div className="mt-2 border-t border-stroke-soft-200 pt-2">
        <button
          type="button"
          onClick={() => setShowText((v) => !v)}
          className="text-[12px] font-medium text-primary-base hover:underline"
        >
          {showText ? `Sembunyikan ${PREVIEW_LABELS.editText.toLowerCase()}` : PREVIEW_LABELS.editText}
        </button>
        {showText && (
          <div className="mt-2 flex flex-col gap-2">
            {TEXT_GROUPS.flatMap((group) =>
              (slide.nested_groups[group] ?? []).map((comp, ci) => {
                if (comp.type === 'image_placeholder') return null;
                const value = comp.text ?? comp.label ?? comp.items?.join('\n') ?? '';
                const multiline = Boolean(comp.items) || (comp.text?.length ?? 0) > 60;
                return (
                  <label key={`${group}-${ci}`} className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-text-soft-400">
                      {comp.type.replaceAll('_', ' ')}
                    </span>
                    {multiline ? (
                      <textarea
                        value={value}
                        disabled={disabled}
                        onChange={(e) => onChange(editText(slide, group, ci, e.target.value))}
                        className="min-h-[54px] resize-none rounded-ui border border-stroke-soft-200 bg-bg-white-0 px-2 py-1.5 text-[13px] outline-none focus:border-primary-base focus:ring-2 focus:ring-primary-base/20"
                      />
                    ) : (
                      <input
                        value={value}
                        disabled={disabled}
                        onChange={(e) => onChange(editText(slide, group, ci, e.target.value))}
                        className="rounded-ui border border-stroke-soft-200 bg-bg-white-0 px-2 py-1.5 text-[13px] outline-none focus:border-primary-base focus:ring-2 focus:ring-primary-base/20"
                      />
                    )}
                  </label>
                );
              }),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
