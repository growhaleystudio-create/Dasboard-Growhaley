import { slideLayoutCatalog, SLIDE_LAYOUT_VARIANTS, getLayoutCatalogItem } from '@leads-generator/shared';
import type {
  AspectRatio,
  BlockType,
  LayoutFamily,
  SduiComponent,
  SduiComponentType,
  SduiLayoutTextLimits,
  SduiSlide,
} from '@leads-generator/shared';

const DEFAULT_TEXT_LIMITS: SduiLayoutTextLimits = {
  tag: 24,
  header: 55,
  body: 160,
  quote: 120,
  ctaLabel: 28,
  checklistItem: 45,
  checklistItems: 6,
};

/**
 * Growhaley catalog uses ONE id space across planner, catalog, and renderer.
 * Family per variant comes straight from the shared LAYOUT_CATALOG.
 */
const LAYOUT_FAMILY_MAP: Record<string, LayoutFamily> = {
  gw_poster_cover: 'poster',
  gw_poster_statement: 'poster',
  gw_poster_list: 'poster',
  gw_poster_stat: 'poster',
  gw_poster_quote: 'poster',
  gw_poster_cta: 'poster',
  gw_poster_cards: 'poster',
  gw_photo_rotated: 'photo',
  gw_photo_statement: 'photo',
  gw_collage_showcase: 'collage',
};

// Min values are the density floor: below them a poster canvas reads as
// underfilled dead space, so the quality check sends the slide to repair for
// richer copy (never for padding with filler).
const TEXT_LIMITS_MAP: Record<string, Partial<SduiLayoutTextLimits>> = {
  // Header caps sized so fitTitle's font shrink absorbs the length — hard
  // trims on headlines kept inverting meaning ("bikin bisnis kecil ...").
  gw_poster_cover: { header: 64, body: 120, headerMin: 14, bodyMin: 40 },
  gw_poster_statement: { header: 70, body: 160, headerMin: 20, bodyMin: 60 },
  gw_poster_list: { header: 45, body: 100, checklistItem: 45, checklistItems: 6, headerMin: 12, checklistItemsMin: 3 },
  gw_poster_stat: { header: 40, body: 120, bodyMin: 40 },
  gw_poster_quote: { quote: 120, body: 60, quoteMin: 40 },
  gw_poster_cta: { header: 60, body: 110, ctaLabel: 28, headerMin: 14, bodyMin: 40 },
  gw_poster_cards: { header: 40, body: 80, headerMin: 12 },
  gw_photo_rotated: { header: 36, body: 130, headerMin: 10 },
  gw_photo_statement: { header: 55, body: 140, ctaLabel: 28, headerMin: 14 },
  gw_collage_showcase: { header: 30, body: 100, headerMin: 8 },
};

function allComponents(slide: SduiSlide): SduiComponent[] {
  return (['top_meta', 'core_content', 'action_footer'] as const).flatMap(
    (group) => slide.nested_groups[group] ?? [],
  );
}

function toBlockType(component: SduiComponent): BlockType[] {
  switch (component.type) {
    case 'header':
      return ['heading'];
    case 'body':
      return ['body'];
    case 'quote':
      return ['quote'];
    case 'button_cta':
      return ['cta'];
    case 'checklist':
      return ['bullet'];
    case 'image_placeholder':
      return ['image'];
    case 'stat_block':
    case 'stat_row':
      return ['stat'];
    default:
      return [];
  }
}

export function slideBlockTypes(slide: SduiSlide): BlockType[] {
  return [...new Set(allComponents(slide).flatMap(toBlockType))];
}

export interface MigratedLayoutCandidate {
  id: string;
  family: LayoutFamily;
  supportsImage: boolean;
  requiredComponents: SduiComponentType[];
  textLimits: SduiLayoutTextLimits;
  bestFor: string[];
}

export function inferLayoutVariant(slide: SduiSlide, aspectRatio: AspectRatio): string {
  const blocks = slideBlockTypes(slide);
  if (blocks.length === 0) return slideLayoutCatalog.defaultFor(['heading'], aspectRatio).id;
  return slideLayoutCatalog.defaultFor(blocks, aspectRatio).id;
}

export function layoutFamilyForVariant(id: string | undefined): LayoutFamily | undefined {
  if (!id) return undefined;
  return LAYOUT_FAMILY_MAP[id] ?? 'poster';
}

export function layoutSupportsImageVariant(id: string | undefined): boolean {
  if (!id) return false;
  const family = layoutFamilyForVariant(id);
  return family === 'photo' || family === 'collage';
}

export function getTextLimitsForVariant(id: string | undefined): SduiLayoutTextLimits {
  return {
    ...DEFAULT_TEXT_LIMITS,
    ...(id ? (TEXT_LIMITS_MAP[id] ?? undefined) : undefined),
  };
}

export function migratedLayoutCatalog(): MigratedLayoutCandidate[] {
  // SLIDE_LAYOUT_VARIANTS may repeat an id across composition signatures —
  // dedupe so the prompt catalog lists each variant exactly once.
  const seen = new Set<string>();
  const candidates: MigratedLayoutCandidate[] = [];

  for (const variant of SLIDE_LAYOUT_VARIANTS) {
    if (seen.has(variant.id)) continue;
    seen.add(variant.id);

    const catalogItem = getLayoutCatalogItem(variant.id);
    const blocks = [...new Set(variant.regions.map((region) => region.blockType))];
    const requiredComponents: SduiComponentType[] =
      catalogItem?.requiredComponents ??
      [
        ...new Set(
          blocks.flatMap((block): SduiComponentType[] => {
            switch (block) {
              case 'heading':
                return ['header'];
              case 'body':
                return ['body'];
              case 'bullet':
                return ['checklist'];
              case 'quote':
                return ['quote'];
              case 'cta':
                return ['button_cta'];
              case 'image':
                return ['image_placeholder'];
              case 'stat':
                return ['stat_block'];
              default:
                return [];
            }
          }),
        ),
      ];

    candidates.push({
      id: variant.id,
      family: layoutFamilyForVariant(variant.id) ?? 'poster',
      supportsImage: layoutSupportsImageVariant(variant.id),
      requiredComponents,
      textLimits: getTextLimitsForVariant(variant.id),
      bestFor: catalogItem ? [catalogItem.bestFor] : ['general content'],
    });
  }

  return candidates;
}

export function migratedNoImageLayoutCatalog(): MigratedLayoutCandidate[] {
  return migratedLayoutCatalog().filter((layout) => !layout.supportsImage);
}

export function preferredImageLayoutVariant(slide: SduiSlide): string {
  const imageCount = allComponents(slide).filter(
    (component) => component.type === 'image_placeholder',
  ).length;
  if (imageCount >= 2) return 'gw_collage_showcase';
  return 'gw_photo_statement';
}
