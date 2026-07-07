import type { SduiComponent, SduiSlide } from '@leads-generator/shared';

import { find } from '../accessors.js';
import { el } from '../primitives.js';
import type { Node, Style } from '../primitives.js';
import { richText } from '../rich-renderers.js';
import { clamp, fitTitle, type Tokens } from '../tokens.js';

export function hasStatSignalText(text: string): boolean {
  const tokens = text.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
  const statWords = new Set(['rp', 'juta', 'ribu', 'miliar', 'kali', 'persen', 'score', 'skor', 'rate', 'rasio', 'data', 'angka', 'metrik', 'statistik']);
  return tokens.some((token) =>
    /\d/.test(token) ||
    token.includes('%') ||
    /^\d+x$/.test(token) ||
    statWords.has(token)
  );
}

export function titleNode(slide: SduiSlide, tk: Tokens, size: number, family: string, align: 'left' | 'center' | 'right'): Node | null {
  const h = find(slide, 'header') ?? find(slide, 'quote');
  if (!h?.text) return null;
  return richText(h.text, h.highlight, {
    fontFamily: family, fontSize: fitTitle(size, h.text), fontWeight: 700,
    color: tk.c.header, highlightColor: tk.c.highlight, lineHeight: 1.07, align, letterSpacing: 0,
  });
}

export function bodyNode(slide: SduiSlide, tk: Tokens, align: 'left' | 'center' | 'right'): Node | null {
  const b = find(slide, 'body');
  if (!b?.text) return null;
  return richText(b.text, b.highlight, {
    fontFamily: tk.bodyFam, fontSize: tk.body, fontWeight: 400,
    color: tk.c.body, highlightColor: tk.c.highlight, lineHeight: 1.4, align,
  });
}

function pxNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const match = value.match(/^(\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : undefined;
}

function squareImageSide(tk: Tokens, style: Style): number {
  const availableW = Math.max(120, tk.W - tk.pad * 2);
  const availableH = Math.max(120, tk.H - tk.pad * 2);
  const widthPx = style.width === '100%' ? availableW : pxNumber(style.width);
  const heightPx = pxNumber(style.height);
  const fallback = Math.round(Math.min(availableW * 0.45, availableH * 0.62));
  const side = Math.min(widthPx ?? fallback, heightPx ?? fallback);
  return Math.max(120, Math.round(side));
}

export async function roundedImage(comp: SduiComponent | undefined, tk: Tokens, style: Style): Promise<Node> {
  const side = squareImageSide(tk, style);
  const imageBoxStyle: Style = {
    width: `${side}px`,
    height: `${side}px`,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: `${tk.radius}px`,
    display: 'flex',
    backgroundColor: 'rgba(0,0,0,0)',
  };

  const imageBox = comp?.imageUrl
    ? el('div', imageBoxStyle, [
        el('img', { width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center' }),
      ])
    : el('div', imageBoxStyle);

  if (comp?.imageUrl) {
    (((imageBox.props.children as Node[])[0]!).props as Record<string, unknown>).src = comp.imageUrl;
  }

  return el('div', {
    ...style,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0)',
  }, [imageBox]);
}

export function checklistNode(slide: SduiSlide, tk: Tokens, numbered: boolean): Node {
  const c = find(slide, 'checklist');
  const items = (c?.items ?? []).slice(0, 6);
  const fs = clamp(Math.round(tk.body * 0.95), 18, 32);
  const box = Math.round(fs * 1.5);
  return el('div', { display: 'flex', flexDirection: 'column', gap: `${tk.gMeso}px`, width: '100%' },
    items.map((item, i) =>
      el('div', { display: 'flex', alignItems: 'center', gap: `${Math.round(fs * 0.55)}px` }, [
        el('div', {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: `${box}px`, height: `${box}px`, flexShrink: 0,
          backgroundColor: tk.c.accent, color: tk.c.onAccent, borderRadius: numbered ? '50%' : '8px',
          fontSize: `${Math.round(box * (numbered ? 0.5 : 0.6))}px`, fontWeight: 700, fontFamily: tk.bodyFam,
        }, numbered ? String(i + 1) : '✓'),
        el('div', { display: 'flex', flexShrink: 1, color: tk.c.header, fontSize: `${fs}px`, fontWeight: 600, fontFamily: tk.bodyFam, lineHeight: 1.3 }, item),
      ]),
    ),
  );
}

export function ctaButton(slide: SduiSlide, tk: Tokens): Node {
  const c = find(slide, 'button_cta');
  const label = c?.label ?? 'Get Started';
  return el('div', {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: tk.c.accent, color: tk.c.onAccent, borderRadius: '12px',
    padding: `${Math.round(tk.body * 0.8)}px ${Math.round(tk.body * 1.5)}px`,
    fontSize: `${Math.round(tk.body * 0.95)}px`, fontWeight: 700, fontFamily: tk.bodyFam,
  }, label);
}

export function colCenter(children: Node[], tk: Tokens, gap = tk.gMeso): Node {
  return el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: `${gap}px`, width: '100%' }, children);
}

export function colLeft(children: Node[], tk: Tokens, gap = tk.gMeso, justify = 'center'): Node {
  return el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, alignItems: 'flex-start', justifyContent: justify, gap: `${gap}px`, width: '100%' }, children);
}
