import type { SduiComponent } from '@leads-generator/shared';

import { el } from './primitives.js';
import type { Node } from './primitives.js';
import { clamp, fitTitle, type Tokens } from './tokens.js';

/** Helper for rich text rendering with per-word highlighting */
interface RichOpts {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  highlightColor: string;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  letterSpacing?: number;
}

function normWord(w: string): string {
  return w.toLowerCase().replace(/[.,!?;:"'()]/g, '');
}

function highlightIdx(words: string[], highlight: string | undefined): Set<number> {
  const set = new Set<number>();
  if (!highlight || !highlight.trim()) return set;
  const hl = highlight.trim().split(/\s+/).map(normWord).filter(Boolean);
  if (!hl.length) return set;
  const norm = words.map(normWord);
  for (let i = 0; i + hl.length <= words.length; i++) {
    let match = true;
    for (let j = 0; j < hl.length; j++) {
      if (!norm[i + j] || !norm[i + j]!.includes(hl[j]!)) {
        match = false;
        break;
      }
    }
    if (match) {
      for (let j = 0; j < hl.length; j++) set.add(i + j);
      break;
    }
  }
  return set;
}

export function richText(text: string, highlight: string | undefined, o: RichOpts): Node {
  const words = text.split(/\s+/).filter(Boolean);
  const hlSet = highlightIdx(words, highlight);
  const gap = Math.round(o.fontSize * 0.26);
  const justify = o.align === 'center' ? 'center' : o.align === 'right' ? 'flex-end' : 'flex-start';
  const children = words.map((w, i) =>
    el(
      'div',
      {
        display: 'flex',
        fontFamily: o.fontFamily,
        fontSize: `${o.fontSize}px`,
        fontWeight: o.fontWeight,
        lineHeight: o.lineHeight,
        color: hlSet.has(i) ? o.highlightColor : o.color,
        marginRight: `${gap}px`,
        ...(o.letterSpacing ? { letterSpacing: `${o.letterSpacing}px` } : {}),
      },
      w,
    ),
  );
  return el('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: justify }, children);
}

export function richStatBlock(c: SduiComponent, tk: Tokens): Node {
  const value = (c.value ?? c.text ?? '').trim();
  const nodes: Node[] = [];
  const row: Node[] = [
    el('div', { display: 'flex', fontFamily: tk.coverFam, fontSize: `${Math.round(tk.huge * 0.62)}px`, fontWeight: 800, color: tk.c.highlight, lineHeight: 1 }, value),
  ];
  if (c.delta) {
    const up = c.trend === 'up',
      down = c.trend === 'down';
    row.push(
      el(
        'div',
        {
          display: 'flex',
          alignItems: 'center',
          marginLeft: `${tk.gMeso}px`,
          fontFamily: tk.bodyFam,
          fontSize: `${Math.round(tk.body * 0.8)}px`,
          fontWeight: 700,
          color: up ? '#15a34a' : down ? '#dc2626' : tk.c.meta,
        },
        `${up ? '▲ ' : down ? '▼ ' : ''}${c.delta}`,
      ),
    );
  }
  nodes.push(el('div', { display: 'flex', flexDirection: 'row', alignItems: 'flex-end' }, row));
  if (c.label) nodes.push(el('div', { display: 'flex', fontFamily: tk.bodyFam, fontSize: `${Math.round(tk.body * 0.92)}px`, fontWeight: 600, color: tk.c.body, lineHeight: 1.3 }, c.label));
  return el('div', { display: 'flex', flexDirection: 'column', gap: `${tk.gMicro}px`, width: '100%' }, nodes);
}

export function richStatRow(c: SduiComponent, tk: Tokens): Node {
  const stats = (c.stats ?? []).slice(0, 4);
  const cells = stats.map((s) =>
    el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, flexBasis: 0, alignItems: 'flex-start', gap: `${tk.gMicro}px` }, [
      el('div', { display: 'flex', fontFamily: tk.coverFam, fontSize: `${Math.round(tk.titleM * 0.92)}px`, fontWeight: 800, color: tk.c.highlight, lineHeight: 1 }, s.value),
      el('div', { display: 'flex', fontFamily: tk.bodyFam, fontSize: `${Math.round(tk.small * 1.0)}px`, fontWeight: 600, color: tk.c.body, lineHeight: 1.25 }, s.label),
    ]),
  );
  return el('div', { display: 'flex', flexDirection: 'row', gap: `${tk.gMeso}px`, width: '100%' }, cells);
}

export function richKeyValueList(c: SduiComponent, tk: Tokens): Node {
  const rows = (c.rows ?? []).slice(0, 6);
  const rowNodes = rows.map((kv, i) =>
    el(
      'div',
      {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        width: '100%',
        paddingTop: `${Math.round(tk.gMicro * 0.8)}px`,
        paddingBottom: `${Math.round(tk.gMicro * 0.8)}px`,
        ...(i > 0 ? { borderTop: `1px solid ${tk.c.meta}33` } : {}),
      },
      [
        el('div', { display: 'flex', fontFamily: tk.bodyFam, fontSize: `${Math.round(tk.body * 0.86)}px`, fontWeight: 600, color: tk.c.meta }, kv.label),
        el('div', { display: 'flex', fontFamily: tk.bodyFam, fontSize: `${Math.round(tk.body * 0.9)}px`, fontWeight: 700, color: tk.c.header, textAlign: 'right' }, kv.value),
      ],
    ),
  );
  return el('div', { display: 'flex', flexDirection: 'column', width: '100%' }, rowNodes);
}

export function richDataTable(c: SduiComponent, tk: Tokens): Node {
  const headers = (c.tableHeaders ?? []).slice(0, 4);
  const rows = (c.tableRows ?? []).slice(0, 6);
  const cols = Math.max(
    headers.length,
    ...rows.map((r) => r.length),
    1,
  );
  const fs = Math.round(tk.body * 0.82);
  const cellPadV = Math.round(tk.gMicro * 0.7);
  const cellPadH = tk.gMicro;
  const cell = (text: string, opts: { head?: boolean } = {}): Node =>
    el(
      'div',
      {
        display: 'flex',
        flexGrow: 1,
        flexBasis: 0,
        paddingTop: `${cellPadV}px`,
        paddingBottom: `${cellPadV}px`,
        paddingLeft: `${cellPadH}px`,
        paddingRight: `${cellPadH}px`,
        fontFamily: tk.bodyFam,
        fontSize: `${fs}px`,
        fontWeight: opts.head ? 800 : 500,
        color: opts.head ? tk.c.onAccent : tk.c.header,
        lineHeight: 1.25,
      },
      text,
    );
  const nodes: Node[] = [];
  if (headers.length > 0) {
    nodes.push(
      el(
        'div',
        { display: 'flex', flexDirection: 'row', width: '100%', backgroundColor: tk.c.accent, borderRadius: `${Math.round(tk.radius * 0.4)}px` },
        Array.from({ length: cols }, (_, i) => cell(headers[i] ?? '', { head: true })),
      ),
    );
  }
  rows.forEach((r, ri) => {
    nodes.push(
      el(
        'div',
        { display: 'flex', flexDirection: 'row', width: '100%', ...(ri % 2 === 1 ? { backgroundColor: `${tk.c.meta}14` } : {}) },
        Array.from({ length: cols }, (_, i) => cell(r[i] ?? '')),
      ),
    );
  });
  return el('div', { display: 'flex', flexDirection: 'column', width: '100%' }, nodes);
}

export function richTimeline(c: SduiComponent, tk: Tokens): Node {
  const items = (c.timeline ?? []).slice(0, 5);
  const nodes = items.map((it) =>
    el('div', { display: 'flex', flexDirection: 'row', gap: `${tk.gMeso}px`, alignItems: 'flex-start', width: '100%' }, [
      el('div', { display: 'flex', flexShrink: 0, width: `${Math.round(tk.W * 0.16)}px`, fontFamily: tk.headerFam, fontSize: `${Math.round(tk.body * 0.92)}px`, fontWeight: 800, color: tk.c.accent }, it.time),
      el('div', { display: 'flex', flexGrow: 1, fontFamily: tk.bodyFam, fontSize: `${Math.round(tk.body * 0.9)}px`, fontWeight: 500, color: tk.c.body, lineHeight: 1.35 }, it.text),
    ]),
  );
  return el('div', { display: 'flex', flexDirection: 'column', gap: `${tk.gMeso}px`, width: '100%' }, nodes);
}

export function richNumberedList(c: SduiComponent, tk: Tokens): Node {
  const items = (c.items ?? []).filter((i) => i.trim().length > 0).slice(0, 6);
  const nodes = items.map((item, i) =>
    el('div', { display: 'flex', flexDirection: 'row', gap: `${tk.gMeso}px`, alignItems: 'flex-start', width: '100%' }, [
      el(
        'div',
        {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          width: `${Math.round(tk.body * 1.5)}px`,
          height: `${Math.round(tk.body * 1.5)}px`,
          borderRadius: '999px',
          backgroundColor: tk.c.accent,
          color: tk.c.onAccent,
          fontFamily: tk.headerFam,
          fontSize: `${Math.round(tk.body * 0.7)}px`,
          fontWeight: 800,
        },
        String(i + 1),
      ),
      el('div', { display: 'flex', flexGrow: 1, fontFamily: tk.bodyFam, fontSize: `${Math.round(tk.body * 0.92)}px`, fontWeight: 500, color: tk.c.header, lineHeight: 1.35 }, item),
    ]),
  );
  return el('div', { display: 'flex', flexDirection: 'column', gap: `${Math.round(tk.gMeso * 0.9)}px`, width: '100%' }, nodes);
}

export function richProgressBar(c: SduiComponent, tk: Tokens): Node {
  const items = (c.progress ?? []).slice(0, 5);
  const nodes = items.map((p) =>
    el('div', { display: 'flex', flexDirection: 'column', gap: `${tk.gMicro}px`, width: '100%' }, [
      el('div', { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', width: '100%' }, [
        el('div', { display: 'flex', fontFamily: tk.bodyFam, fontSize: `${Math.round(tk.body * 0.85)}px`, fontWeight: 600, color: tk.c.header }, p.label),
        el('div', { display: 'flex', fontFamily: tk.headerFam, fontSize: `${Math.round(tk.body * 0.85)}px`, fontWeight: 800, color: tk.c.accent }, `${p.percent}%`),
      ]),
      el('div', { display: 'flex', width: '100%', height: `${Math.round(tk.body * 0.55)}px`, borderRadius: '999px', backgroundColor: `${tk.c.meta}26` }, [
        el('div', { display: 'flex', width: `${clamp(p.percent, 0, 100)}%`, height: '100%', borderRadius: '999px', backgroundColor: tk.c.accent }, undefined),
      ]),
    ]),
  );
  return el('div', { display: 'flex', flexDirection: 'column', gap: `${tk.gMeso}px`, width: '100%' }, nodes);
}

export function richCallout(c: SduiComponent, tk: Tokens): Node {
  const palette: Record<string, { bg: string; bar: string; badge: string }> = {
    info: { bg: `${tk.c.accent}14`, bar: tk.c.accent, badge: 'i' },
    tip: { bg: '#15a34a14', bar: '#15a34a', badge: '+' },
    warning: { bg: '#f59e0b1a', bar: '#f59e0b', badge: '!' },
    success: { bg: '#15a34a14', bar: '#15a34a', badge: '✓' },
  };
  const v = palette[c.variant ?? 'info'] ?? palette.info!;
  const badgeSize = Math.round(tk.body * 1.3);
  const borderW = Math.max(3, Math.round(tk.gMicro * 0.35));
  return el(
    'div',
    {
      display: 'flex',
      flexDirection: 'row',
      gap: `${tk.gMeso}px`,
      width: '100%',
      alignItems: 'flex-start',
      backgroundColor: v.bg,
      borderRadius: `${Math.round(tk.radius * 0.5)}px`,
      borderLeft: `${borderW}px solid ${v.bar}`,
      padding: `${tk.gMeso}px`,
    },
    [
      el(
        'div',
        {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          width: `${badgeSize}px`,
          height: `${badgeSize}px`,
          borderRadius: '50%',
          backgroundColor: v.bar,
          color: '#ffffff',
          fontFamily: tk.headerFam,
          fontSize: `${Math.round(tk.body * 0.72)}px`,
          fontWeight: 800,
        },
        v.badge,
      ),
      el('div', { display: 'flex', flexGrow: 1, fontFamily: tk.bodyFam, fontSize: `${Math.round(tk.body * 0.9)}px`, fontWeight: 500, color: tk.c.header, lineHeight: 1.4 }, c.text ?? ''),
    ],
  );
}

export function richPullQuote(c: SduiComponent, tk: Tokens): Node {
  const nodes: Node[] = [el('div', { display: 'flex', fontFamily: tk.coverFam, fontSize: `${Math.round(tk.titleXL * 1.1)}px`, fontWeight: 800, color: tk.c.accent, lineHeight: 0.7 }, '"')];
  if (c.text) nodes.push(richText(c.text, c.highlight, { fontFamily: tk.coverFam, fontSize: fitTitle(Math.round(tk.titleL * 0.82), c.text), fontWeight: 700, color: tk.c.header, highlightColor: tk.c.highlight, lineHeight: 1.16, align: 'left' }));
  if (c.attribution) {
    nodes.push(
      el('div', { display: 'flex', flexDirection: 'column', marginTop: `${tk.gMicro}px` }, [
        el('div', { display: 'flex', fontFamily: tk.headerFam, fontSize: `${Math.round(tk.body * 0.92)}px`, fontWeight: 800, color: tk.c.header }, `— ${c.attribution}`),
        ...(c.attributionRole ? [el('div', { display: 'flex', fontFamily: tk.bodyFam, fontSize: `${Math.round(tk.small)}px`, fontWeight: 600, color: tk.c.meta }, c.attributionRole)] : []),
      ]),
    );
  }
  return el('div', { display: 'flex', flexDirection: 'column', gap: `${tk.gMicro}px`, width: '100%' }, nodes);
}

export async function richByline(c: SduiComponent, tk: Tokens): Promise<Node> {
  const row: Node[] = [];
  if (c.avatarUrl) {
    const avatarSize = Math.round(tk.body * 2.4);
    const avatarImg = el('img', { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' });
    (avatarImg.props as Record<string, unknown>).src = c.avatarUrl;
    const avatar = el(
      'div',
      {
        display: 'flex',
        flexShrink: 0,
        width: `${avatarSize}px`,
        height: `${avatarSize}px`,
        borderRadius: '999px',
        overflow: 'hidden',
      },
      [avatarImg],
    );
    row.push(avatar);
  }
  row.push(
    el('div', { display: 'flex', flexDirection: 'column', gap: `${tk.gMicro}px` }, [
      el('div', { display: 'flex', fontFamily: tk.headerFam, fontSize: `${Math.round(tk.body * 0.95)}px`, fontWeight: 800, color: tk.c.header }, c.text ?? ''),
      ...(c.role ? [el('div', { display: 'flex', fontFamily: tk.bodyFam, fontSize: `${Math.round(tk.small)}px`, fontWeight: 600, color: tk.c.meta }, c.role)] : []),
    ]),
  );
  return el('div', { display: 'flex', flexDirection: 'row', gap: `${tk.gMeso}px`, alignItems: 'center', width: '100%' }, row);
}

export function richCaption(c: SduiComponent, tk: Tokens): Node {
  const parts = [c.text ?? '', c.credit ? `(${c.credit})` : ''].filter(Boolean).join('  ');
  return el('div', { display: 'flex', fontFamily: tk.bodyFam, fontSize: `${Math.round(tk.small * 0.95)}px`, fontWeight: 500, fontStyle: 'italic', color: tk.c.meta, lineHeight: 1.3, width: '100%' }, parts);
}

export function richDivider(c: SduiComponent, tk: Tokens): Node {
  const line = el('div', { display: 'flex', flexGrow: 1, height: '2px', backgroundColor: `${tk.c.meta}40` }, undefined);
  if (!c.text) return el('div', { display: 'flex', width: '100%', alignItems: 'center', paddingTop: `${tk.gMicro}px`, paddingBottom: `${tk.gMicro}px` }, [line]);
  return el('div', { display: 'flex', flexDirection: 'row', gap: `${tk.gMeso}px`, alignItems: 'center', width: '100%', paddingTop: `${tk.gMicro}px`, paddingBottom: `${tk.gMicro}px` }, [
    el('div', { display: 'flex', fontFamily: tk.headerFam, fontSize: `${Math.round(tk.small)}px`, fontWeight: 800, color: tk.c.meta, letterSpacing: '1px' }, c.text.toUpperCase()),
    line,
  ]);
}

export async function renderRichComponent(c: SduiComponent, tk: Tokens): Promise<Node | null> {
  switch (c.type) {
    case 'header':
      return c.text ? richText(c.text, c.highlight, { fontFamily: tk.coverFam, fontSize: fitTitle(tk.titleL, c.text), fontWeight: 700, color: tk.c.header, highlightColor: tk.c.highlight, lineHeight: 1.12, align: 'left' }) : null;
    case 'body':
      return c.text ? richText(c.text, c.highlight, { fontFamily: tk.bodyFam, fontSize: tk.body, fontWeight: 400, color: tk.c.body, highlightColor: tk.c.highlight, lineHeight: 1.42, align: 'left' }) : null;
    case 'checklist':
      return (c.items ?? []).length > 0 ? richNumberedList(c, tk) : null;
    case 'quote':
      return c.text ? richPullQuote(c, tk) : null;
    case 'stat_block':
      return richStatBlock(c, tk);
    case 'stat_row':
      return (c.stats ?? []).length > 0 ? richStatRow(c, tk) : null;
    case 'key_value_list':
      return (c.rows ?? []).length > 0 ? richKeyValueList(c, tk) : null;
    case 'data_table':
      return (c.tableRows ?? []).length > 0 || (c.tableHeaders ?? []).length > 0 ? richDataTable(c, tk) : null;
    case 'timeline':
      return (c.timeline ?? []).length > 0 ? richTimeline(c, tk) : null;
    case 'numbered_list':
      return (c.items ?? []).length > 0 ? richNumberedList(c, tk) : null;
    case 'progress_bar':
      return (c.progress ?? []).length > 0 ? richProgressBar(c, tk) : null;
    case 'callout':
      return c.text ? richCallout(c, tk) : null;
    case 'pull_quote':
      return c.text ? richPullQuote(c, tk) : null;
    case 'byline':
      return c.text ? await richByline(c, tk) : null;
    case 'caption':
      return c.text ? richCaption(c, tk) : null;
    case 'divider':
      return richDivider(c, tk);
    default:
      return null;
  }
}

export const RICH_STACK_TYPES = new Set<string>(['header', 'body', 'checklist', 'quote', 'stat_block', 'stat_row', 'key_value_list', 'data_table', 'timeline', 'numbered_list', 'progress_bar', 'callout', 'pull_quote', 'byline', 'caption', 'divider']);
