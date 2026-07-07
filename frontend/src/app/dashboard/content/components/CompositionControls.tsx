import React from 'react';
import type {
  GwComposition,
  GwPaletteChoice,
  GwAccentChoice,
  GwHeaderComposition,
  GwBlobPosition,
  GwOrnamentLevel,
  GwCollageScatter,
} from '@leads-generator/shared';
import {
  GW_ACCENT_ALLOWED,
  GW_BLOB_POSITIONS,
  GW_ORNAMENT_LEVELS,
  GW_COLLAGE_SCATTERS,
} from '@leads-generator/shared';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui/Select';
import {
  PALETTE_OPTIONS,
  ACCENT_OPTIONS,
  HEADER_COMPOSITION_OPTIONS,
  GW_SWATCH_PALETTE_HEX,
  GW_SWATCH_ACCENT_HEX,
  PREVIEW_LABELS,
} from '../content-generator-constants';

interface CompositionControlsProps {
  composition: GwComposition;
  layoutVariantId?: string | undefined;
  disabled?: boolean | undefined;
  onChange: (next: GwComposition) => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-[12px] font-medium text-text-sub-600">{label}</span>
      <div className="flex flex-wrap items-center justify-end gap-1.5">{children}</div>
    </div>
  );
}

function Swatch({
  hex,
  active,
  disabled,
  title,
  onClick,
}: {
  hex: string;
  active: boolean;
  disabled?: boolean | undefined;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'size-6 rounded-full border transition',
        active
          ? 'ring-2 ring-primary-base ring-offset-1 ring-offset-bg-white-0 border-transparent'
          : 'border-stroke-soft-200 hover:scale-110',
        disabled && 'cursor-not-allowed opacity-25 hover:scale-100',
      )}
      style={{ backgroundColor: hex }}
      aria-pressed={active}
    />
  );
}

function Segmented<T extends string>({
  options,
  value,
  disabled,
  onSelect,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  disabled?: boolean | undefined;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-ui border border-stroke-soft-200">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(opt.value)}
          className={cn(
            'px-2 py-1 text-[11px] font-medium transition',
            value === opt.value
              ? 'bg-primary-base text-bg-white-0'
              : 'bg-bg-white-0 text-text-sub-600 hover:bg-bg-weak-50',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function CompositionControls({
  composition,
  layoutVariantId,
  disabled,
  onChange,
}: CompositionControlsProps) {
  const patch = (next: Partial<GwComposition>) => onChange({ ...composition, ...next });

  const palette: GwPaletteChoice = composition.palette ?? 'lime';
  const allowedAccents = GW_ACCENT_ALLOWED[palette];
  const isCollage = layoutVariantId === 'gw_collage_showcase';

  return (
    <div className="flex flex-col gap-2.5">
      <Row label={PREVIEW_LABELS.palette}>
        {PALETTE_OPTIONS.map((opt) => (
          <Swatch
            key={opt.value}
            hex={GW_SWATCH_PALETTE_HEX[opt.value]}
            title={opt.label}
            active={palette === opt.value}
            disabled={disabled}
            onClick={() => {
              // If the new palette makes the current accent illegal, drop it.
              const accentStillOk =
                composition.accent && GW_ACCENT_ALLOWED[opt.value].includes(composition.accent);
              const next: GwComposition = { ...composition, palette: opt.value };
              if (!accentStillOk) delete next.accent;
              onChange(next);
            }}
          />
        ))}
      </Row>

      <Row label={PREVIEW_LABELS.accent}>
        {ACCENT_OPTIONS.map((opt) => {
          const allowed = allowedAccents.includes(opt.value);
          return (
            <Swatch
              key={opt.value}
              hex={GW_SWATCH_ACCENT_HEX[opt.value]}
              title={allowed ? opt.label : `${opt.label} (kontras kurang untuk ${palette})`}
              active={composition.accent === opt.value}
              disabled={disabled || !allowed}
              onClick={() => patch({ accent: opt.value })}
            />
          );
        })}
      </Row>

      <Row label={PREVIEW_LABELS.headerComposition}>
        <Segmented<GwHeaderComposition>
          options={HEADER_COMPOSITION_OPTIONS}
          value={composition.headerComposition}
          disabled={disabled}
          onSelect={(v) => patch({ headerComposition: v })}
        />
      </Row>

      <Row label="Blob">
        <Select
          wrapperClassName="min-w-[120px]"
          value={composition.blob ?? 'top-left'}
          disabled={disabled}
          options={GW_BLOB_POSITIONS.map((b: GwBlobPosition) => ({ value: b, label: b }))}
          onChange={(e) => patch({ blob: e.target.value as GwBlobPosition })}
        />
      </Row>

      <Row label="Ornamen">
        <Segmented<GwOrnamentLevel>
          options={GW_ORNAMENT_LEVELS.map((o: GwOrnamentLevel) => ({ value: o, label: o }))}
          value={composition.ornaments ?? 'minimal'}
          disabled={disabled}
          onSelect={(v) => patch({ ornaments: v })}
        />
      </Row>

      {isCollage && (
        <Row label="Scatter">
          <Segmented<GwCollageScatter>
            options={GW_COLLAGE_SCATTERS.map((s: GwCollageScatter) => ({ value: s, label: s }))}
            value={composition.scatter ?? 'cascade'}
            disabled={disabled}
            onSelect={(v) => patch({ scatter: v })}
          />
        </Row>
      )}
    </div>
  );
}
