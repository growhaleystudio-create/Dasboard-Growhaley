"use strict";
// Inlined scraper — chrome.scripting.executeScript with `files` runs in the
// isolated world as a CLASSIC script, so we cannot use `import` here. The
// dashboard bundler still produces a separate `lib/scraper.js` for any other
// caller, but content.ts must be self-contained.
const NAME_SELECTORS = [
    'div[role="heading"]',
    'h3',
    '.dbg0pd',
    '.rllt__details div:first-child',
];
const ADDRESS_SELECTORS = [
    '.rllt__details div:nth-child(2)',
    '[data-local-attribute="d3adr"]',
];
const PHONE_SELECTORS = [
    '[data-local-attribute="d3ph"]',
];
const RATING_SELECTORS = [
    '[aria-label*="stars"]',
    '.yi40Hd',
];
function clean(value) {
    if (typeof value !== 'string')
        return '';
    return value.replace(/\s+/g, ' ').trim();
}
function pick(root, selectors) {
    for (const selector of selectors) {
        const node = root.querySelector(selector);
        const value = clean(node && node.textContent);
        if (value)
            return value;
    }
    return '';
}
function pickHref(root, selectors) {
    for (const selector of selectors) {
        const node = root.querySelector(selector);
        const href = node ? node.getAttribute('href') : null;
        if (href)
            return href.trim();
    }
    return '';
}
function extractItems(limit) {
    if (typeof document === 'undefined')
        return [];
    const cards = Array.from(document.querySelectorAll('[data-local-attribute]')).slice(0, limit);
    if (cards.length === 0)
        return [];
    return cards
        .map((card) => {
        const fullText = clean(card.textContent);
        const parts = fullText.split('·').map((p) => clean(p)).filter(Boolean);
        const phone = parts.find((p) => /\+?\d[\d\s().-]{6,}/.test(p)) ?? '';
        const address = parts.find((p) => /\d/.test(p) || /(street|st\b|road|rd\b|avenue|ave\b|jalan|jl\b)/i.test(p)) ?? '';
        const rating = parts.find((p) => /^\d(?:[.,]\d)?(?:\s*\(.*\))?$/.test(p)) ?? '';
        return {
            name: pick(card, NAME_SELECTORS),
            address: pick(card, ADDRESS_SELECTORS) || address,
            phone: pick(card, PHONE_SELECTORS) || phone,
            website: pickHref(card, ['a[data-value="Website"]', 'a[href^="http"]']),
            rating: pick(card, RATING_SELECTORS) || rating,
        };
    })
        .filter((item) => Boolean(item.name));
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
    }
    catch (error) {
        chrome.runtime.sendMessage({
            type: 'leadsgen:content-result',
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
})();
