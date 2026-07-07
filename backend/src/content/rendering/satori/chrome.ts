import type { SduiDocument, SduiSlide } from '@leads-generator/shared';

import { tagText } from './accessors.js';
import { el } from './primitives.js';
import type { Node } from './primitives.js';
import { clamp, type Tokens } from './tokens.js';

export function urlPill(tk: Tokens, doc: SduiDocument): Node {
  // Growhaley chrome: flat, no pill background — small mark + site url in the
  // per-slide contrast color (tk.role.chrome.color is set by the renderer).
  const fs = tk.role.chrome.size;
  const fg = tk.role.chrome.color;
  const text = (doc.theme.siteUrl || 'www.brand.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return el('div', {
    display: 'flex', alignItems: 'center', gap: `${Math.round(fs * 0.45)}px`,
    color: fg,
    fontSize: `${fs}px`, fontWeight: 700, fontFamily: tk.role.chrome.fam,
    letterSpacing: '0.5px',
  }, [
    el('div', { display: 'flex', width: `${fs}px`, height: `${fs}px`, borderRadius: '50%', border: `2.5px solid ${fg}` }),
    el('div', { display: 'flex' }, text),
  ]);
}

export async function logoPill(tk: Tokens, doc: SduiDocument): Promise<Node> {
  const logoUrl = doc.theme.logoUrl;
  if (!logoUrl) return urlPill(tk, doc);

  const logoH = clamp(Math.round(doc.theme.logoSizePx ?? tk.small * 1.8), 12, 180);
  const buildImgNode = (src: string): Node => {
    const imgNode = el('img', { height: `${logoH}px`, objectFit: 'contain', maxWidth: `${Math.round(tk.W * 0.35)}px` });
    (imgNode.props as Record<string, unknown>).src = src;
    return el('div', { display: 'flex', alignItems: 'center' }, [imgNode]);
  };

  // Bundled logos (growhaley-brand.ts) are already inlined as data: URIs —
  // use directly, no network round-trip.
  if (logoUrl.startsWith('data:')) return buildImgNode(logoUrl);

  if (!logoUrl.startsWith('http')) return urlPill(tk, doc);
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return urlPill(tk, doc);
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    const ct = res.headers.get('content-type') ?? 'image/png';
    return buildImgNode(`data:${ct};base64,${b64}`);
  } catch {
    return urlPill(tk, doc);
  }
}

export function emptyChromeSlot(): Node {
  return el('div', { display: 'flex' });
}

export function isLogoPlacement(doc: SduiDocument, placement: NonNullable<SduiDocument['theme']['logoPlacement']>): boolean {
  return (doc.theme.logoPlacement ?? 'top-left') === placement;
}

export async function topChrome(slide: SduiSlide, tk: Tokens, doc: SduiDocument): Promise<Node> {
  const tag = tagText(slide);
  const tagNode = tag
    ? el('div', { display: 'flex', color: tk.role.tag.color, fontSize: `${tk.role.tag.size}px`, fontWeight: 700, fontFamily: tk.role.tag.fam, letterSpacing: '1px', maxWidth: '45%', justifyContent: 'flex-end' }, tag)
    : emptyChromeSlot();
  const hasTopLeftLogo = isLogoPlacement(doc, 'top-left');
  const hasTopRightLogo = isLogoPlacement(doc, 'top-right');
  const left = hasTopLeftLogo ? await logoPill(tk, doc) : emptyChromeSlot();
  const right = hasTopRightLogo ? await logoPill(tk, doc) : tagNode;
  return el('div', {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexGrow: 0, flexShrink: 0,
  }, [
    left,
    right,
  ]);
}

export function swipeButton(tk: Tokens): Node {
  // Growhaley style: flat ink block, lime type, square corners, {→} accent —
  // legible on lime/cream/blue/photo backgrounds alike.
  const fs = tk.role.chrome.size;
  return el('div', {
    display: 'flex', alignItems: 'center', gap: `${Math.round(fs * 0.55)}px`,
    backgroundColor: '#232326', color: '#e8ff03',
    padding: `${Math.round(fs * 0.55)}px ${Math.round(fs * 0.9)}px`,
    fontSize: `${fs}px`, fontWeight: 700, fontFamily: tk.coverFam,
    letterSpacing: '0.5px',
  }, [
    el('div', { display: 'flex' }, 'Swipe'),
    el('div', { display: 'flex', fontFamily: tk.role.chrome.fam }, '{→}'),
  ]);
}

export async function bottomChrome(slide: SduiSlide, tk: Tokens, doc: SduiDocument, isLast: boolean): Promise<Node> {
  const pageNode = el('div', { display: 'flex', color: tk.role.chrome.color, fontSize: `${tk.role.chrome.size}px`, fontWeight: 700, fontFamily: tk.role.chrome.fam, letterSpacing: '1px' },
    `${String(slide.slide_number).padStart(2, '0')} / ${String(doc.slides.length).padStart(2, '0')}`);
  const actionNode = isLast ? emptyChromeSlot() : swipeButton(tk);
  const left = isLogoPlacement(doc, 'bottom-left') ? await logoPill(tk, doc) : pageNode;
  const right = isLogoPlacement(doc, 'bottom-right') ? await logoPill(tk, doc) : actionNode;
  return el('div', {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexGrow: 0, flexShrink: 0,
  }, [
    left,
    right,
  ]);
}
