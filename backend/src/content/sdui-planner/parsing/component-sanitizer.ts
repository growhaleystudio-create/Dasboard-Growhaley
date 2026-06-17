/**
 * component-sanitizer.ts — Sanitizes raw component data from LLM output
 *
 * Extracted from sdui-planner.ts:669-852 (184 lines)
 * Status: ✅ Full implementation extracted
 */

import type { SduiComponent } from '@leads-generator/shared';
import {
  COMPONENT_TYPES,
  HEADER_HARD_MAX,
  BODY_HARD_MAX,
  QUOTE_HARD_MAX,
  CHECKLIST_ITEM_HARD_MAX,
} from '../config.js';

export function sanitizeComponent(raw: unknown): SduiComponent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const type = r.type;
  if (typeof type !== 'string' || !COMPONENT_TYPES.has(type)) return null;

  const comp: SduiComponent = { type: type as SduiComponent['type'] };
  if (typeof r.text === 'string') {
    comp.text =
      type === 'header'
        ? r.text.slice(0, HEADER_HARD_MAX)
        : type === 'body' || type === 'callout'
          ? r.text.slice(0, BODY_HARD_MAX)
          : type === 'quote' || type === 'pull_quote'
            ? r.text.slice(0, QUOTE_HARD_MAX)
            : type === 'caption'
              ? r.text.slice(0, 140)
              : r.text.slice(0, HEADER_HARD_MAX);
  }
  if (typeof r.highlight === 'string' && r.highlight.trim().length > 0)
    comp.highlight = r.highlight.slice(0, 60);
  if (typeof r.label === 'string') comp.label = r.label.slice(0, 30);
  if (Array.isArray(r.items))
    comp.items = r.items
      .filter((i): i is string => typeof i === 'string')
      .map((i) => i.slice(0, CHECKLIST_ITEM_HARD_MAX))
      .slice(0, 6);
  if (r.style === 'primary' || r.style === 'secondary') comp.style = r.style;
  if (r.requires_generation === true) comp.requires_generation = true;
  if (typeof r.asset_type === 'string') comp.asset_type = r.asset_type;
  if (typeof r.image_object_context === 'string')
    comp.image_object_context = r.image_object_context.slice(0, 500);
  if (
    r.visual_treatment === 'boxed_image' ||
    r.visual_treatment === 'circle_asset' ||
    r.visual_treatment === 'transparent_cutout' ||
    r.visual_treatment === 'full_bleed_background' ||
    r.visual_treatment === 'floating_object' ||
    r.visual_treatment === 'pattern_layer' ||
    r.visual_treatment === 'editorial_collage' ||
    r.visual_treatment === 'ui_mockup_board' ||
    r.visual_treatment === 'callout_card' ||
    r.visual_treatment === 'connector_line'
  ) {
    comp.visual_treatment = r.visual_treatment;
  }
  if (typeof r.visual_brief === 'string') comp.visual_brief = r.visual_brief.slice(0, 300);
  if (
    r.anchor === 'center' ||
    r.anchor === 'top' ||
    r.anchor === 'bottom' ||
    r.anchor === 'left' ||
    r.anchor === 'right' ||
    r.anchor === 'top-left' ||
    r.anchor === 'top-right' ||
    r.anchor === 'bottom-left' ||
    r.anchor === 'bottom-right'
  ) {
    comp.anchor = r.anchor;
  }
  if (typeof r.allowedOverflow === 'boolean') comp.allowedOverflow = r.allowedOverflow;
  if (
    r.mask === 'none' ||
    r.mask === 'circle' ||
    r.mask === 'rounded' ||
    r.mask === 'squircle' ||
    r.mask === 'organic'
  ) {
    comp.mask = r.mask;
  }
  if (Array.isArray(r.safeTextZones)) {
    const zones = r.safeTextZones.filter(
      (zone): zone is 'top' | 'bottom' | 'left' | 'right' | 'center' =>
        zone === 'top' ||
        zone === 'bottom' ||
        zone === 'left' ||
        zone === 'right' ||
        zone === 'center',
    );
    if (zones.length > 0) comp.safeTextZones = [...new Set(zones)].slice(0, 5);
  }
  if (typeof r.targetId === 'string') comp.targetId = r.targetId.slice(0, 80);
  // Layout properties (Level 2)
  if (typeof r.heightPercent === 'number')
    comp.heightPercent = Math.max(5, Math.min(100, r.heightPercent));
  if (r.align === 'left' || r.align === 'center' || r.align === 'right') comp.align = r.align;
  if (r.verticalAlign === 'top' || r.verticalAlign === 'center' || r.verticalAlign === 'bottom')
    comp.verticalAlign = r.verticalAlign;
  if (r.textTransform === 'uppercase' || r.textTransform === 'none')
    comp.textTransform = r.textTransform;

  // feature_cards: parse items_cards array
  if (type === 'feature_cards' && Array.isArray(r.items_cards)) {
    comp.items_cards = r.items_cards
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({
        icon: typeof c.icon === 'string' ? c.icon.slice(0, 4) : '',
        title: typeof c.title === 'string' ? c.title.slice(0, 32) : '',
        ...(typeof c.description === 'string' ? { description: c.description.slice(0, 70) } : {}),
      }))
      .filter((c) => c.title.trim().length > 0)
      .slice(0, 6);
  }

  // comparison: parse columns array
  if (type === 'comparison' && Array.isArray(r.columns)) {
    comp.columns = r.columns
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .slice(0, 2)
      .map((c) => ({
        label: typeof c.label === 'string' ? c.label.slice(0, 20) : '',
        ...(c.sentiment === 'positive' || c.sentiment === 'negative' || c.sentiment === 'neutral'
          ? { sentiment: c.sentiment as 'positive' | 'negative' | 'neutral' }
          : {}),
        items: Array.isArray(c.items)
          ? c.items
              .filter((i): i is string => typeof i === 'string')
              .map((i) => i.slice(0, 56))
              .slice(0, 4)
          : [],
      }))
      .filter((c) => c.label.trim().length > 0 && c.items.length >= 1);
  }

  // ---- New rich components ----
  if (typeof r.role === 'string') comp.role = r.role.slice(0, 48);
  if (typeof r.avatarUrl === 'string') comp.avatarUrl = r.avatarUrl.slice(0, 500);
  if (typeof r.attribution === 'string') comp.attribution = r.attribution.slice(0, 48);
  if (typeof r.attributionRole === 'string') comp.attributionRole = r.attributionRole.slice(0, 48);
  if (
    r.variant === 'info' ||
    r.variant === 'tip' ||
    r.variant === 'warning' ||
    r.variant === 'success'
  )
    comp.variant = r.variant;
  if (typeof r.icon === 'string' && r.icon.trim().length > 0) comp.icon = r.icon.slice(0, 4);
  if (typeof r.credit === 'string') comp.credit = r.credit.slice(0, 80);
  if (typeof r.value === 'string') comp.value = r.value.slice(0, 14);
  if (typeof r.delta === 'string') comp.delta = r.delta.slice(0, 24);
  if (r.trend === 'up' || r.trend === 'down' || r.trend === 'flat') comp.trend = r.trend;

  // key_value_list: rows of {label, value}
  if (type === 'key_value_list' && Array.isArray(r.rows)) {
    comp.rows = r.rows
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({
        label: typeof c.label === 'string' ? c.label.slice(0, 28) : '',
        value: typeof c.value === 'string' ? c.value.slice(0, 44) : '',
      }))
      .filter((c) => c.label.trim().length > 0 || c.value.trim().length > 0)
      .slice(0, 6);
  }

  // data_table: headers + rows
  if (type === 'data_table') {
    if (Array.isArray(r.tableHeaders)) {
      comp.tableHeaders = r.tableHeaders
        .filter((h): h is string => typeof h === 'string')
        .map((h) => h.slice(0, 24))
        .slice(0, 4);
    }
    if (Array.isArray(r.tableRows)) {
      comp.tableRows = r.tableRows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) =>
          row
            .filter((cell): cell is string => typeof cell === 'string')
            .map((cell) => cell.slice(0, 28))
            .slice(0, 4),
        )
        .filter((row) => row.length > 0)
        .slice(0, 6);
    }
  }

  // stat_row: array of mini KPIs
  if (type === 'stat_row' && Array.isArray(r.stats)) {
    comp.stats = r.stats
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({
        ...(typeof c.icon === 'string' && c.icon.trim().length > 0
          ? { icon: c.icon.slice(0, 4) }
          : {}),
        value: typeof c.value === 'string' ? c.value.slice(0, 10) : '',
        label: typeof c.label === 'string' ? c.label.slice(0, 26) : '',
      }))
      .filter((c) => c.value.trim().length > 0)
      .slice(0, 4);
  }

  // timeline: time+event entries
  if (type === 'timeline' && Array.isArray(r.timeline)) {
    comp.timeline = r.timeline
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({
        time: typeof c.time === 'string' ? c.time.slice(0, 20) : '',
        text: typeof c.text === 'string' ? c.text.slice(0, 90) : '',
      }))
      .filter((c) => c.text.trim().length > 0)
      .slice(0, 5);
  }

  // progress_bar: labeled bars
  if (type === 'progress_bar' && Array.isArray(r.progress)) {
    comp.progress = r.progress
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({
        label: typeof c.label === 'string' ? c.label.slice(0, 30) : '',
        percent:
          typeof c.percent === 'number' && Number.isFinite(c.percent)
            ? Math.max(0, Math.min(100, Math.round(c.percent)))
            : 0,
      }))
      .filter((c) => c.label.trim().length > 0)
      .slice(0, 5);
  }

  return comp;
}

// Re-export for convenience
export { COMPONENT_TYPES };
