'use client';

import Link from 'next/link';
import {
  SLIDE_LAYOUT_VARIANTS,
  type BlockType,
  type SlideLayoutVariant,
} from '@leads-generator/shared';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

type PreviewVariant = {
  id: string;
  compositionType: string;
  category: string;
  blocks: BlockType[];
  regions: { blockType: BlockType; y: number; h: number }[];
  mappedReference?: 'reference-1' | 'reference-2' | undefined;
  note?: string | undefined;
};

type ReferenceMapping = {
  id: 'reference-1' | 'reference-2';
  title: string;
  description: string;
  archetype: string;
  why: string[];
  primaryVariants: string[];
  secondaryVariants: string[];
};

const REFERENCE_MAPPINGS: ReferenceMapping[] = [
  {
    id: 'reference-1',
    title: 'Reference 1 - Friction list slide',
    description:
      'Headline editorial besar di atas, lalu area isi dibagi untuk intro singkat dan list pertanyaan berulang.',
    archetype: 'editorial-list-story',
    why: [
      'Hero headline mengambil area atas yang dominan.',
      'Bagian bawah dipakai untuk body intro + bullet/list scanning cepat.',
      'Cocok untuk carousel edukasi dengan ritme teks besar lalu poin-poin friction.',
    ],
    primaryVariants: ['multi-text-list', 'list-standard', 'list-spacious'],
    secondaryVariants: ['text-heading-hero', 'text-traditional'],
  },
  {
    id: 'reference-2',
    title: 'Reference 2 - Editorial statement slide',
    description:
      'Statement besar di section atas lalu statement pendukung pendek di area bawah kanan. Nuansanya clean dan magazine-like.',
    archetype: 'editorial-dual-statement',
    why: [
      'Pernyataan utama perlu box heading yang besar dan lega.',
      'Pernyataan kedua lebih cocok sebagai quote/callout pendek pada section bawah.',
      'Transisi antar section lebih penting daripada elemen visual berat.',
    ],
    primaryVariants: ['cover-top', 'quote-bottom', 'text-heading-hero'],
    secondaryVariants: ['quote-top', 'cover-bottom'],
  },
];

const VARIANT_CATEGORY_LABELS: Record<string, string> = {
  heading: 'Cover',
  'body+heading': 'Text',
  'bullet+heading': 'List',
  'chart+heading': 'Data',
  'body+heading+stat': 'Data',
  'body+chart+heading': 'Data',
  'body+mockup': 'Mockup',
  quote: 'Quote',
  cta: 'CTA',
  'heading+image': 'Image',
  'body+heading+image': 'Rich',
  body: 'Body',
  'body+bullet+heading': 'Multi',
  'bullet+heading+image': 'Multi',
  'body+heading+mockup': 'Multi',
  'body+heading+quote': 'Multi',
  'body+cta+heading': 'Multi',
  stat: 'Stat',
  'heading+stat': 'Stat',
  'body+stat': 'Stat',
  'body+chart': 'Chart',
  chart: 'Chart',
  'heading+mockup': 'Mockup',
  mockup: 'Mockup',
  bullet: 'Bullet',
  'body+bullet': 'Bullet',
  image: 'Image',
  default: 'Fallback',
};

const VARIANT_NOTES: Partial<Record<string, string>> = {
  'cover-centered': 'Default cover.',
  'cover-top': 'Best fit for the second image opening statement.',
  'text-heading-hero': 'Strong editorial rhythm for large top statement.',
  'quote-bottom': 'Good fit for lower-right supporting statement.',
  'multi-text-list': 'Closest structural match to image one.',
};

const VARIANT_REFERENCE_MAP: Partial<Record<string, 'reference-1' | 'reference-2'>> = {
  'cover-top': 'reference-2',
  'cover-bottom': 'reference-2',
  'text-heading-hero': 'reference-2',
  'list-standard': 'reference-1',
  'list-spacious': 'reference-1',
  'quote-bottom': 'reference-2',
  'multi-text-list': 'reference-1',
};

function variantBlocks(variant: SlideLayoutVariant): BlockType[] {
  return Array.from(new Set(variant.regions.map((region) => region.blockType)));
}

function toPreviewVariant(variant: SlideLayoutVariant): PreviewVariant {
  const mappedReference = VARIANT_REFERENCE_MAP[variant.id];
  const note = VARIANT_NOTES[variant.id];

  return {
    id: variant.id,
    compositionType: variant.compositionType,
    category: VARIANT_CATEGORY_LABELS[variant.compositionType] ?? 'Other',
    blocks: variantBlocks(variant),
    regions: variant.regions.map((region: SlideLayoutVariant['regions'][number]) => ({
      blockType: region.blockType,
      y: region.box.y - 100,
      h: region.box.h,
    })),
    mappedReference,
    note,
  };
}

const PREVIEW_VARIANTS: PreviewVariant[] = SLIDE_LAYOUT_VARIANTS.filter(
  (variant: SlideLayoutVariant) => variant.compositionType !== 'default',
).map(toPreviewVariant);

const BLOCK_COLORS: Record<BlockType, string> = {
  heading: 'bg-sky-100 text-sky-900 border-sky-300',
  body: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  mockup: 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300',
  chart: 'bg-amber-100 text-amber-900 border-amber-300',
  quote: 'bg-violet-100 text-violet-900 border-violet-300',
  stat: 'bg-rose-100 text-rose-900 border-rose-300',
  bullet: 'bg-cyan-100 text-cyan-900 border-cyan-300',
  cta: 'bg-orange-100 text-orange-900 border-orange-300',
  image: 'bg-slate-200 text-slate-900 border-slate-400',
};

function LayoutMiniPreview({ variant }: { variant: PreviewVariant }) {
  return (
    <div className="rounded-2xl border border-stroke-soft-200 bg-[#101214] p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/60">
        <span>Safe Area</span>
        <span>1000 x 800</span>
      </div>
      <div className="relative h-[220px] overflow-hidden rounded-xl bg-[#1a1d24]">
        <div className="absolute inset-x-0 top-0 h-[18px] bg-white/5" />
        <div className="absolute inset-x-0 bottom-0 h-[18px] bg-white/5" />
        {variant.regions.map((region, index) => (
          <div
            key={`${variant.id}-${region.blockType}-${index}`}
            className={`absolute left-[10px] right-[10px] rounded-lg border px-2 py-1 ${BLOCK_COLORS[region.blockType]}`}
            style={{ top: `${(region.y / 800) * 220}px`, height: `${(region.h / 800) * 220}px` }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide">{region.blockType}</div>
            <div className="text-[10px] opacity-70">y {region.y} / h {region.h}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LayoutCatalogDebugPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-sub-600">Layout Debug</p>
          <h1 className="text-3xl font-semibold text-text-strong-950">Rebuilt Slide Layout Catalog</h1>
          <p className="mt-2 max-w-3xl text-sm text-text-sub-600">
            Ini page debug buat lihat mapping referensi gambar ke archetype layout baru sekaligus preview struktur
            region dari catalog yang baru dibangun ulang dari nol.
          </p>
        </div>
        <Link href="/dashboard/catalog">
          <Button variant="outline" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {REFERENCE_MAPPINGS.map((mapping) => (
          <Card key={mapping.id}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant="active">{mapping.id}</Badge>
                <Badge variant="neutral">{mapping.archetype}</Badge>
              </div>
              <CardTitle>{mapping.title}</CardTitle>
              <CardDescription>{mapping.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft-400">
                  Why this mapping
                </p>
                <div className="space-y-2 text-sm text-text-sub-600">
                  {mapping.why.map((item) => (
                    <p key={item}>- {item}</p>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft-400">
                  Primary variants
                </p>
                <div className="flex flex-wrap gap-2">
                  {mapping.primaryVariants.map((variantId) => (
                    <Badge key={variantId} variant="success">
                      {variantId}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft-400">
                  Secondary variants
                </p>
                <div className="flex flex-wrap gap-2">
                  {mapping.secondaryVariants.map((variantId) => (
                    <Badge key={variantId} variant="neutral">
                      {variantId}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text-strong-950">Variant Preview Grid</h2>
          <p className="text-sm text-text-sub-600">{PREVIEW_VARIANTS.length} variants yang sekarang aktif di shared catalog.</p>
        </div>
        <Badge variant="active">{PREVIEW_VARIANTS.length} variants</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PREVIEW_VARIANTS.map((variant) => (
          <Card key={variant.id} className="overflow-hidden">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="active">{variant.category}</Badge>
                {variant.mappedReference ? (
                  <Badge variant="warning">{variant.mappedReference}</Badge>
                ) : (
                  <Badge variant="neutral">unmapped</Badge>
                )}
              </div>
              <div>
                <CardTitle>{variant.id}</CardTitle>
                <CardDescription>{variant.compositionType}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {variant.blocks.map((block) => (
                  <Badge key={`${variant.id}-${block}`} variant="neutral">
                    {block}
                  </Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <LayoutMiniPreview variant={variant} />
              {variant.note ? <p className="text-sm text-text-sub-600">{variant.note}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
