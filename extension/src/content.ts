// Inlined scraper — chrome.scripting.executeScript with `files` runs in the
// isolated world as a CLASSIC script, so we cannot use `import` here. The
// dashboard bundler still produces a separate `lib/scraper.js` for any other
// caller, but content.ts must be self-contained.
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

const RATING_SELECTORS = [
  'span.MW4etd',
  '[aria-label*="stars"]',
  '[aria-label*="bintang"]',
  '.yi40Hd',
];

function clean(value: unknown): string {
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
    const value = clean(node && node.textContent);
    if (value) return value;
  }
  return '';
}

function pickHref(root: Element, selectors: string[]): string {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    const href = node ? node.getAttribute('href') : null;
    if (href && !href.includes('google.com/maps') && !href.startsWith('/maps/')) return href.trim();
  }
  return '';
}

function extractItems(limit: number): Array<{name: string; address: string; phone: string; website: string; rating: string}> {
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
    .map((card: Element) => {
      const fullText = clean(card.textContent);
      const parts = fullText.split('·').map((p) => clean(p)).filter(Boolean);
      const phone = parts.find((p: string) => /\+?\d[\d\s().-]{6,}/.test(p)) ?? '';
      const address = parts.find((p: string) =>
        /\d/.test(p) || /(street|st\b|road|rd\b|avenue|ave\b|jalan|jl\b)/i.test(p),
      ) ?? '';
      const rating = parts.find((p: string) => /^\d(?:[.,]\d)?(?:\s*\(.*\))?$/.test(p)) ?? '';
      const nameFromAnchor = card.querySelector('a.hfpxzc')?.getAttribute('aria-label') || '';
      return {
        name: clean(pick(card, NAME_SELECTORS) || nameFromAnchor),
        address: clean(pick(card, ADDRESS_SELECTORS) || address),
        phone: clean(pick(card, PHONE_SELECTORS) || phone),
        website: pickHref(card, [
          'a[data-value="Website"]',
          'a[aria-label*="Website"]',
          'a[aria-label*="Situs"]',
          'a[href^="http"]:not([href*="google.com"])',
        ]),
        rating: clean(pick(card, RATING_SELECTORS) || rating),
      };
    })
    .filter((item: { name: string }) => Boolean(item.name));
}

(async function () {
  try {
    const items = extractItems(20);
    if (items.length === 0) {
      chrome.runtime.sendMessage({
        type: 'leadsgen:content-result',
        ok: false,
        error: 'no_results',
      });
      return;
    }
    chrome.runtime.sendMessage({
      type: 'leadsgen:content-result',
      ok: true,
      items: items,
    });
  } catch (error) {
    chrome.runtime.sendMessage({
      type: 'leadsgen:content-result',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
})();
