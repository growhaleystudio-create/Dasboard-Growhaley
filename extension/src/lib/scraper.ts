import type { CaptureItem } from '../scrape-session.js';

const NAME_SELECTORS = ['div[role="heading"]', 'h3', '.dbg0pd', '.rllt__details div:first-child'];

const ADDRESS_SELECTORS = ['.rllt__details div:nth-child(2)', '[data-local-attribute="d3adr"]'];

const PHONE_SELECTORS = ['[data-local-attribute="d3ph"]'];

function clean(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
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
    if (href) return href;
  }
  return '';
}

// Anchored phone pattern: starts with +/digit, only phone chars, bounded length.
// Google Maps often merges phone+address+hours into a single "·" segment, so a
// loose regex would pick up the whole blob and break the 100-char backend cap.
const PHONE_PART_RE = /^\+?[\d][\d\s().-]{5,30}$/;
const PHONE_MAX_LEN = 30; // E.164 + separators fit comfortably; longer is a mis-merged blob

function normalizePhone(value: string): string {
  if (!value) return '';
  return value.length <= PHONE_MAX_LEN ? value : '';
}

export function extractItems(limit = 20): CaptureItem[] {
  if (typeof document === 'undefined') return [];
  const cards = Array.from(document.querySelectorAll('[data-local-attribute]')).slice(0, limit);
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
      return {
        name: pick(card, NAME_SELECTORS),
        address: pick(card, ADDRESS_SELECTORS) || address,
        phone,
        website: pickHref(card, ['a[data-value="Website"]', 'a[href^="http"]']),
      } satisfies CaptureItem;
    })
    .filter((item) => item.name);
}
