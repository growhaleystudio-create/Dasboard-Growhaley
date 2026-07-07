import type { SduiComponent, SduiSlide } from '@leads-generator/shared';

const GROUP_ORDER = ['core_content', 'action_footer', 'top_meta'] as const;

export function find(slide: SduiSlide, type: string): SduiComponent | undefined {
  for (const g of GROUP_ORDER) {
    const c = (slide.nested_groups[g] ?? []).find((x) => x.type === type);
    if (c) return c;
  }
  return undefined;
}

export function findAll(slide: SduiSlide, type: string): SduiComponent[] {
  return GROUP_ORDER
    .flatMap((g) => slide.nested_groups[g] ?? [])
    .filter((x) => x.type === type);
}

export function tagText(slide: SduiSlide): string {
  const t = find(slide, 'tag');
  return (t?.text ?? '').toUpperCase();
}

export function componentText(slide: SduiSlide, type: string): string {
  const component = find(slide, type);
  if (type === 'button_cta') return component?.label ?? '';
  return component?.text ?? '';
}

export function checklistItems(slide: SduiSlide): string[] {
  return find(slide, 'checklist')?.items ?? [];
}
