import type { CaptureItem } from '../scrape-session.js';

const NAME_SELECTORS = [
  'div.qBF1Pd',
  'div[role="heading"]',
  'h3',
  '.dbg0pd',
  '.rllt__details div:first-child',
];

const ADDRESS_SELECTORS = [
  'div.W4Efsd:nth-child(2)',
  '.rllt__details div:nth-child(2)',
  '[data-local-attribute="d3adr"]',
  'button[data-item-id="address"]',
];

const PHONE_SELECTORS = [
  'span.UsdlK',
  '[data-local-attribute="d3ph"]',
  'button[data-item-id*="phone"]',
];

function clean(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\ue000-\uf8ff]/g, '')
    .replace(/[\u202a\u202c]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(root: Element, selectors: string[]): string {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    const value = clean(node?.textContent ?? '');
    if (value) return value;
  }
  return '';
}

function pickHref(root: Element, selectors: string[]): string {
  for (const selector of selectors) {
    const href = root.querySelector(selector)?.getAttribute('href')?.trim();
    if (href && !href.includes('google.com/maps') && !href.startsWith('/maps/')) return href;
  }
  return '';
}

const PHONE_PART_RE = /^\+?[\d][\d\s().-]{5,30}$/;
const PHONE_MAX_LEN = 30;

function normalizePhone(value: string): string {
  if (!value) return '';
  return value.length <= PHONE_MAX_LEN ? value : '';
}

export function extractItems(limit = 20): CaptureItem[] {
  if (typeof document === 'undefined') return [];
  const candidateSelectors = ['div.Nv2PK', 'div[role="article"]', '[data-local-attribute]'];
  let rawCards: Element[] = [];
  for (const sel of candidateSelectors) {
    const found = Array.from(document.querySelectorAll(sel));
    if (found.length > rawCards.length) {
      rawCards = found;
    }
  }

  const cards = rawCards.slice(0, limit);
  if (cards.length === 0) return [];

  return cards
    .map((card) => {
      const fullText = clean(card.textContent ?? '');
      const parts = fullText
        .split('·')
        .map((part) => clean(part))
        .filter(Boolean);
      const phoneFromParts = parts.find((part) => PHONE_PART_RE.test(part)) ?? '';
      const address =
        parts.find(
          (part) =>
            /\d/.test(part) || /(street|st\b|road|rd\b|avenue|ave\b|jalan|jl\b)/i.test(part),
        ) ?? '';
      const phoneFromSelector = pick(card, PHONE_SELECTORS);
      const phone = normalizePhone(phoneFromSelector) || normalizePhone(phoneFromParts);
      const nameFromAnchor = card.querySelector('a.hfpxzc')?.getAttribute('aria-label') || '';
      return {
        name: clean(pick(card, NAME_SELECTORS) || nameFromAnchor),
        address: clean(pick(card, ADDRESS_SELECTORS) || address),
        phone,
        website: pickHref(card, [
          'a[data-value="Website"]',
          'a[aria-label*="Website"]',
          'a[aria-label*="Situs"]',
          'a[href^="http"]:not([href*="google.com"])',
        ]),
      } satisfies CaptureItem;
    })
    .filter((item) => item.name);
}
