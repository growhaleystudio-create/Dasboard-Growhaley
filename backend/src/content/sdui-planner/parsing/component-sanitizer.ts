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
import { trimText } from '../../sdui-text-guardrails.js';

/**
 * Word-boundary cap for human-readable prose fields. Raw `.slice()` is kept
 * only for machine-ish fields (icon, value, urls, briefs) where a hard cut
 * can't produce a visibly broken word on the canvas.
 */
function capProse(value: string, max: number): string {
  return trimText(value, max) ?? '';
}

export function sanitizeComponent(raw: unknown): SduiComponent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const type = r.type;
  if (typeof type !== 'string' || !COMPONENT_TYPES.has(type)) return null;

  const comp: SduiComponent = { type: type as SduiComponent['type'] };
  if (typeof r.text === 'string') {
    comp.text =
      type === 'header'
        ? capProse(r.text, HEADER_HARD_MAX)
        : type === 'body' || type === 'callout'
          ? capProse(r.text, BODY_HARD_MAX)
          : type === 'quote' || type === 'pull_quote'
            ? capProse(r.text, QUOTE_HARD_MAX)
            : type === 'caption'
              ? capProse(r.text, 140)
              : capProse(r.text, HEADER_HARD_MAX);
  }
  if (typeof r.highlight === 'string' && r.highlight.trim().length > 0)
    comp.highlight = capProse(r.highlight, 60);
  // 60 keeps stat/CTA labels intact — the renderer wraps them to 2 lines;
  // tighter caps kept producing dangling phrases ("... saat elemen brand").
  if (typeof r.label === 'string') comp.label = capProse(r.label, 60);
  if (Array.isArray(r.items))
    comp.items = r.items
      .filter((i): i is string => typeof i === 'string')
      .map((i) => capProse(i, CHECKLIST_ITEM_HARD_MAX))
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
        title: typeof c.title === 'string' ? capProse(c.title, 32) : '',
        ...(typeof c.description === 'string' ? { description: capProse(c.description, 70) } : {}),
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
        label: typeof c.label === 'string' ? capProse(c.label, 20) : '',
        ...(c.sentiment === 'positive' || c.sentiment === 'negative' || c.sentiment === 'neutral'
          ? { sentiment: c.sentiment as 'positive' | 'negative' | 'neutral' }
          : {}),
        items: Array.isArray(c.items)
          ? c.items
              .filter((i): i is string => typeof i === 'string')
              .map((i) => capProse(i, 56))
              .slice(0, 4)
          : [],
      }))
      .filter((c) => c.label.trim().length > 0 && c.items.length >= 1);
  }

  // ---- New rich components ----
  if (typeof r.role === 'string') comp.role = capProse(r.role, 48);
  if (typeof r.avatarUrl === 'string') comp.avatarUrl = r.avatarUrl.slice(0, 500);
  if (typeof r.attribution === 'string') comp.attribution = capProse(r.attribution, 48);
  if (typeof r.attributionRole === 'string') comp.attributionRole = capProse(r.attributionRole, 48);
  if (
    r.variant === 'info' ||
    r.variant === 'tip' ||
    r.variant === 'warning' ||
    r.variant === 'success'
  )
    comp.variant = r.variant;
  if (typeof r.icon === 'string' && r.icon.trim().length > 0) comp.icon = r.icon.slice(0, 4);
  if (typeof r.credit === 'string') comp.credit = capProse(r.credit, 80);
  if (typeof r.value === 'string') comp.value = r.value.slice(0, 14);
  if (typeof r.delta === 'string') comp.delta = r.delta.slice(0, 24);
  if (r.trend === 'up' || r.trend === 'down' || r.trend === 'flat') comp.trend = r.trend;

  // key_value_list: rows of {label, value}
  if (type === 'key_value_list' && Array.isArray(r.rows)) {
    comp.rows = r.rows
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({
        label: typeof c.label === 'string' ? capProse(c.label, 28) : '',
        value: typeof c.value === 'string' ? capProse(c.value, 44) : '',
      }))
      .filter((c) => c.label.trim().length > 0 || c.value.trim().length > 0)
      .slice(0, 6);
  }

  // data_table: headers + rows
  if (type === 'data_table') {
    if (Array.isArray(r.tableHeaders)) {
      comp.tableHeaders = r.tableHeaders
        .filter((h): h is string => typeof h === 'string')
        .map((h) => capProse(h, 24))
        .slice(0, 4);
    }
    if (Array.isArray(r.tableRows)) {
      comp.tableRows = r.tableRows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) =>
          row
            .filter((cell): cell is string => typeof cell === 'string')
            .map((cell) => capProse(cell, 28))
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
        label: typeof c.label === 'string' ? capProse(c.label, 26) : '',
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
        text: typeof c.text === 'string' ? capProse(c.text, 90) : '',
      }))
      .filter((c) => c.text.trim().length > 0)
      .slice(0, 5);
  }

  // progress_bar: labeled bars
  if (type === 'progress_bar' && Array.isArray(r.progress)) {
    comp.progress = r.progress
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({
        label: typeof c.label === 'string' ? capProse(c.label, 30) : '',
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
