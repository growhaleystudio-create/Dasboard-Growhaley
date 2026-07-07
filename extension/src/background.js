const STORAGE_KEY = 'leadsgen:pending-session';
const STATUS_KEY = 'leadsgen:last-status';
const DEBUG_KEY = 'leadsgen:last-debug';
// Capture tuning. Raising the list/detail limit from 20 -> 50 has ripple
// effects: we need more auto-scroll depth to hydrate enough cards, and the
// click-each-card enrichment loop runs longer. These constants keep the
// behavior explicit and make future tuning safer.
const DEFAULT_MAX_CAPTURE_ITEMS = 50;
// Detail-panel sync timeout. We intentionally budget a bit more here
// because the panel must now do more than merely exist: it must visibly
// switch to the card we just clicked (heading / phone / website changes).
const DETAIL_SCRAPE_TIMEOUT_MS = 8000;
const DETAIL_PANEL_POLL_MS = 300;
const DETAIL_PANEL_STABLE_POLLS = 4;
const DETAIL_PRE_CLICK_SETTLE_MS = 350;
const DETAIL_POST_CLICK_SETTLE_MS = 700;
const DETAIL_POST_READY_DWELL_MS = 1200;
const DETAIL_BETWEEN_CARDS_MS = 450;
const MAX_CAPTURE_ITEMS_STORAGE_KEY = 'leadsgen:max-capture-items';
async function setStatus(status) {
    await chrome.storage.session.set({ [STATUS_KEY]: status });
}
async function setDebug(step, detail) {
    const log = { ts: Date.now(), step, detail };
    await chrome.storage.session.set({ [DEBUG_KEY]: log });
    // Also log to service-worker console for ad-hoc inspection.
    // eslint-disable-next-line no-console
    console.log(`[leadsgen] ${step}: ${detail}`);
}
async function getStatus() {
    const result = await chrome.storage.session.get(STATUS_KEY);
    return result[STATUS_KEY];
}
async function getPendingSession() {
    const result = await chrome.storage.session.get(STORAGE_KEY);
    return result[STORAGE_KEY];
}
async function clearPendingSession() {
    await chrome.storage.session.remove(STORAGE_KEY);
}
async function postToBackend(url, token, body) {
    const headers = {
        'X-Google-Maps-Capture-Token': token,
    };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }
    return fetch(url, {
        method: 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}
async function isGoogleMapsTab(tab) {
    if (!tab?.id || !tab.url)
        return false;
    return /^https:\/\/www\.google\.com\/maps\//.test(tab.url);
}
// Distinguishes a Maps URL that shows the list of result cards (`/maps/search/...`)
// or a `/place/` place-detail page (which has no card list to scrape). We only
// re-navigate when the active tab is something else (e.g. a landing/about page
// that came back with `?entry=ttu` or `&g_ep=...` query params, or a directions
// page). Local search URLs always start with `/maps/search/`.
function isSearchResultsUrl(urlString) {
    if (!urlString)
        return false;
    try {
        const u = new URL(urlString);
        if (u.host !== 'www.google.com' || !u.pathname.startsWith('/maps/'))
            return false;
        // /maps/search/... OR /maps/place/... (still possible to scrape the
        // side panel, but rare; we only handle the explicit search list here).
        return u.pathname.startsWith('/maps/search/');
    }
    catch {
        return false;
    }
}
function waitForTabComplete(tabId, timeoutMs) {
    return new Promise((resolve) => {
        let resolved = false;
        const finish = () => {
            if (resolved)
                return;
            resolved = true;
            clearTimeout(timer);
            try {
                chrome.tabs.onUpdated.removeListener(onUpdated);
            }
            catch {
                // listener may already be detached; ignore.
            }
            resolve();
        };
        const onUpdated = (id, info) => {
            if (id !== tabId)
                return;
            if (info.status === 'complete')
                finish();
        };
        const timer = setTimeout(finish, timeoutMs);
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
}
async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
async function inspectGoogleMapsReadiness(tabId) {
    const injection = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const cardsTotal = document.querySelectorAll('[data-local-attribute], div[role="article"], a[href*="/maps/place/"], div.Nv2PK').length;
            const hasFeed = Boolean(document.querySelector('[role="feed"], div.m6QErb'));
            const hasResultsLabel = Boolean(document.querySelector('div[aria-label*="Results"], div[aria-label*="results"]'));
            const placeLinks = document.querySelectorAll('a[href*="/maps/place/"]').length;
            const readyState = document.readyState;
            const url = window.location.href;
            return {
                url,
                readyState,
                cardsTotal,
                hasFeed,
                hasResultsLabel,
                placeLinks,
                ready: readyState === 'complete' &&
                    /https:\/\/www\.google\.com\/maps\//.test(url) &&
                    (cardsTotal > 0 || placeLinks > 0 || hasFeed || hasResultsLabel),
            };
        },
    });
    const first = injection.find((entry) => Boolean(entry?.result));
    return first?.result ?? null;
}
async function waitForGoogleMapsReady(tabId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastState = null;
    while (Date.now() < deadline) {
        try {
            lastState = await inspectGoogleMapsReadiness(tabId);
            if (lastState?.ready) {
                return lastState;
            }
        }
        catch {
            // Ignore transient injection errors while Maps is still transitioning.
        }
        await sleep(700);
    }
    return lastState;
}
async function autoScrollGoogleMapsResults(tabId, steps) {
    const injection = await chrome.scripting.executeScript({
        target: { tabId },
        args: [steps],
        func: async (maxSteps) => {
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const findScroller = () => document.querySelector('[role="feed"]') ||
                document.querySelector('div.m6QErb[aria-label]') ||
                document.querySelector('div[aria-label*="Results"]') ||
                document.querySelector('div[aria-label*="results"]') ||
                document.querySelector('div.m6QErb');
            const scroller = findScroller();
            if (!scroller) {
                return {
                    url: window.location.href,
                    cardsTotal: document.querySelectorAll('[data-local-attribute], div[role="article"], a[href*="/maps/place/"], div.Nv2PK').length,
                };
            }
            for (let index = 0; index < maxSteps; index += 1) {
                scroller.scrollBy({ top: 1400, behavior: 'auto' });
                await wait(1200);
            }
            return {
                url: window.location.href,
                cardsTotal: document.querySelectorAll('[data-local-attribute], div[role="article"], a[href*="/maps/place/"], div.Nv2PK').length,
            };
        },
    });
    const first = injection.find((entry) => Boolean(entry?.result));
    return first?.result ?? null;
}
function normalizePhoneForDebug(value) {
    return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}
function summarizeItemsForDebug(items) {
    const phones = new Set(items.map((item) => normalizePhoneForDebug(item.phone)).filter((value) => value.length > 0));
    const websites = new Set(items
        .map((item) => item.website?.trim().toLowerCase() ?? '')
        .filter((value) => value.length > 0));
    const phoneCounts = new Map();
    for (const item of items) {
        const phone = normalizePhoneForDebug(item.phone);
        if (!phone)
            continue;
        phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
    }
    const duplicatePhoneGroups = Array.from(phoneCounts.values()).filter((count) => count > 1).length;
    const sample = items
        .slice(0, 5)
        .map((item, index) => {
        const name = item.name?.trim() || '-';
        const phone = normalizePhoneForDebug(item.phone) || '-';
        const website = item.website?.trim() || '-';
        return `${index + 1}:${name}|${phone}|${website}`;
    })
        .join(', ');
    return {
        count: items.length,
        uniquePhones: phones.size,
        uniqueWebsites: websites.size,
        duplicatePhoneGroups,
        sample,
    };
}
async function clickAndScrapeDetail(tabId, cardIndex, timeoutMs) {
    // Injected function: click the n-th card in the [role="feed"] and scrape
    // the resulting detail panel for phone + website. Runs in the page's main
    // world; DOM access is unrestricted.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inPageDetailScraper = async function clickAndScrape(idx, timeout, pollMs, stablePolls, preClickSettleMs, postClickSettleMs, postReadyDwellMs) {
        const clean = (v) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        // Try several selectors to find the n-th result card. Different Maps
        // layouts use different containers; the card is the anchor wrapping
        // the place link. We try in order of specificity.
        const pickCardLabel = (root) => clean((root.querySelector('div[role="heading"], h3, .dbg0pd')?.textContent ||
            root.getAttribute('aria-label') ||
            root.textContent ||
            '').split('·')[0] || '');
        const findCard = () => {
            const lists = [
                '[role="feed"]',
                'div[aria-label*="Results"]',
                'div[aria-label*="results"]',
                'div.m6QErb',
            ];
            for (const listSelector of lists) {
                const list = document.querySelector(listSelector);
                if (!list)
                    continue;
                // Prefer `a[href*="/maps/place/"]` (modern layout) — it is the
                // clickable card anchor itself. Fall back to `div[role="article"]`
                // and `[data-result-index]`.
                const placeLinks = list.querySelectorAll('a[href*="/maps/place/"]');
                if (placeLinks[idx])
                    return {
                        card: placeLinks[idx],
                        selector: `${listSelector} -> a[href*="/maps/place/"]`,
                    };
                const articles = list.querySelectorAll('div[role="article"]');
                if (articles[idx])
                    return {
                        card: articles[idx],
                        selector: `${listSelector} -> div[role="article"]`,
                    };
                const indexed = list.querySelectorAll(`[data-result-index="${idx}"]`);
                if (indexed.length > 0)
                    return {
                        card: indexed[0],
                        selector: `${listSelector} -> [data-result-index]`,
                    };
            }
            return { card: null, selector: 'not-found' };
        };
        const readPanelState = () => {
            const heading = clean(document.querySelector('h1, div[role="heading"][aria-level="1"], div[role="heading"][aria-level="2"]')?.textContent || '');
            const phoneHref = clean(document.querySelector('a[href^="tel:"]')?.getAttribute('href') || '');
            const websiteHref = clean((document.querySelector('a[data-item-id="authority"]') ||
                document.querySelector('a[data-value="Website"]'))?.getAttribute('href') || '');
            const actionButtonText = Array.from(document.querySelectorAll('button[aria-label*="Phone" i], button[aria-label*="Telepon" i], button[aria-label*="Website" i], button[aria-label*="Situs" i]'))
                .map((node) => clean(node.getAttribute('aria-label') || node.textContent || ''))
                .filter(Boolean)
                .slice(0, 4)
                .join('|');
            const panelFingerprint = [heading, phoneHref, websiteHref, actionButtonText].join('||');
            return { heading, phoneHref, websiteHref, panelFingerprint };
        };
        const beforeClick = readPanelState();
        const found = findCard();
        const card = found.card;
        if (!card) {
            return {
                phone: '',
                website: '',
                hadDetail: false,
                cardLabel: '',
                clickedSelector: found.selector,
                detailReason: 'card-not-found',
                phoneSource: '',
                websiteSource: '',
            };
        }
        const cardLabel = pickCardLabel(card);
        // Scroll the card into view (Maps lazy-renders far-down cards) and
        // click it. A real user click dispatches both `mousedown` + `mouseup`
        // + `click`; Maps' framework listens for `click` on these anchors.
        try {
            card.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
        catch {
            /* older browsers — ignore */
        }
        // Small settle delay so Maps finishes any in-flight layout work
        // before the click lands.
        await sleep(preClickSettleMs);
        try {
            card.click();
        }
        catch {
            return {
                phone: '',
                website: '',
                hadDetail: false,
                cardLabel,
                clickedSelector: found.selector,
                detailReason: 'click-failed',
                phoneSource: '',
                websiteSource: '',
            };
        }
        // Give Maps time to begin the panel transition before the first DOM poll.
        await sleep(postClickSettleMs);
        // Wait for the detail panel to switch to the clicked card — not just
        // to exist. False positives here were the root cause of mass duplicate
        // merges: after card #1, the panel is already "ready", so a naive check
        // can scrape stale phone/website from the previous card before the UI
        // finishes swapping to the new place.
        const deadline = Date.now() + timeout;
        let detailReady = false;
        let lastHasPhoneBtn = false;
        let lastHasWebsiteBtn = false;
        let lastHasHeading = false;
        let matchedByHeading = false;
        let panelChanged = false;
        let sawTransientPanelChange = false;
        let stableReadyPolls = 0;
        let readySinceMs = 0;
        let afterClick = beforeClick;
        while (Date.now() < deadline) {
            lastHasPhoneBtn = Boolean(document.querySelector('button[aria-label*="Phone" i], button[aria-label*="Telepon" i], a[href^="tel:"]'));
            lastHasWebsiteBtn = Boolean(document.querySelector('button[aria-label*="Website" i], button[aria-label*="Situs" i], a[data-value="Website"], a[data-item-id="authority"]'));
            afterClick = readPanelState();
            lastHasHeading = afterClick.heading.length > 0;
            matchedByHeading =
                cardLabel.length > 0 && afterClick.heading.toLowerCase().includes(cardLabel.toLowerCase());
            panelChanged = afterClick.panelFingerprint !== beforeClick.panelFingerprint;
            if (panelChanged)
                sawTransientPanelChange = true;
            // Ready when:
            // 1) panel has a heading and at least one actionable contact/website control
            // 2) AND the panel definitely switched away from the previous fingerprint
            //    (or the heading explicitly matches the clicked card)
            // 3) AND that state stays stable for a few polls, so we don't race past
            //    the visual transition and scrape mid-animation / stale data.
            const candidateReady = (lastHasPhoneBtn || lastHasWebsiteBtn) &&
                lastHasHeading &&
                (matchedByHeading || panelChanged || sawTransientPanelChange) &&
                (matchedByHeading || afterClick.panelFingerprint !== beforeClick.panelFingerprint);
            if (candidateReady) {
                stableReadyPolls += 1;
                if (readySinceMs === 0)
                    readySinceMs = Date.now();
                if (stableReadyPolls >= Math.max(1, stablePolls)) {
                    detailReady = true;
                    break;
                }
            }
            else {
                stableReadyPolls = 0;
                readySinceMs = 0;
            }
            await wait(pollMs);
        }
        if (!detailReady) {
            return {
                phone: '',
                website: '',
                hadDetail: false,
                cardLabel,
                clickedSelector: found.selector,
                detailReason: `timeout heading=${lastHasHeading ? '1' : '0'} phoneBtn=${lastHasPhoneBtn ? '1' : '0'} websiteBtn=${lastHasWebsiteBtn ? '1' : '0'} ` +
                    `panelChanged=${panelChanged ? '1' : '0'} sawTransient=${sawTransientPanelChange ? '1' : '0'} matchedHeading=${matchedByHeading ? '1' : '0'} stablePolls=${stableReadyPolls}/${Math.max(1, stablePolls)} ` +
                    `beforeHeading=${beforeClick.heading || '-'} afterHeading=${afterClick.heading || '-'}`,
                phoneSource: '',
                websiteSource: '',
            };
        }
        // Even after the panel looks ready, keep dwelling a bit longer so the
        // human-visible transition and any late-updating contact controls finish.
        await sleep(postReadyDwellMs);
        // Scrape phone. Sources (in priority order):
        //   1. `a[href^="tel:"]` — canonical, machine-readable
        //   2. button with Phone/Telepon aria-label → its data-phone-number
        //      attribute (Maps stores the raw number here) or aria-label
        //      itself (Maps sometimes uses "Phone: +62 ...")
        //   3. The button's textContent (rarely populated but possible)
        const phoneSources = [
            () => {
                const tel = document.querySelector('a[href^="tel:"]');
                if (!tel)
                    return '';
                // Strip "tel:" prefix and any non-phone trailing chars
                const raw = tel.getAttribute('href') || tel.textContent || '';
                return clean(raw.replace(/^tel:/i, ''));
            },
            () => {
                const btn = document.querySelector('button[aria-label*="Phone" i], button[aria-label*="Telepon" i]');
                if (!btn)
                    return '';
                const dataNum = btn.getAttribute('data-phone-number') || btn.getAttribute('data-number') || '';
                const aria = btn.getAttribute('aria-label') || '';
                // Maps' aria-label often reads "Phone: +62 ..." or just the number.
                const ariaNum = aria.replace(/^(phone|telepon)\s*[:\-]?\s*/i, '').trim();
                return clean(dataNum) || clean(ariaNum) || clean(btn.textContent || '');
            },
        ];
        let phone = '';
        let phoneSource = '';
        for (let i = 0; i < phoneSources.length; i += 1) {
            const candidate = phoneSources[i]();
            if (candidate && candidate.length <= 30) {
                phone = candidate;
                phoneSource = i === 0 ? 'tel-link' : 'phone-button';
                break;
            }
        }
        // Scrape website. Sources (in priority order):
        //   1. `a[data-item-id="authority"]` — Maps' structured attribute
        //   2. `a[data-value="Website"]` — Maps' older attribute
        //   3. button with Website/Situs aria-label whose `data-href` or
        //      `aria-label` contains an http(s) URL
        // Always filter Google-owned hosts.
        const isOwnedByGoogle = (href) => {
            try {
                const host = new URL(href, window.location.href).hostname.toLowerCase();
                return (host === 'google.com' ||
                    host.endsWith('.google.com') ||
                    host === 'google.co.id' ||
                    host.endsWith('.google.co.id') ||
                    host === 'maps.google.com' ||
                    host === 'g.page' ||
                    host.endsWith('.g.page'));
            }
            catch {
                return true;
            }
        };
        const websiteSources = [
            () => {
                const a = document.querySelector('a[data-item-id="authority"]');
                const href = a ? a.getAttribute('href') || '' : '';
                return href && !isOwnedByGoogle(href) ? clean(href) : '';
            },
            () => {
                const a = document.querySelector('a[data-value="Website"]');
                const href = a ? a.getAttribute('href') || '' : '';
                return href && !isOwnedByGoogle(href) ? clean(href) : '';
            },
            () => {
                const btn = document.querySelector('button[aria-label*="Website" i], button[aria-label*="Situs" i]');
                if (!btn)
                    return '';
                const dataHref = btn.getAttribute('data-href') ||
                    btn.getAttribute('data-url') ||
                    btn.getAttribute('href') ||
                    '';
                const aria = btn.getAttribute('aria-label') || '';
                const ariaMatch = aria.match(/https?:\/\/\S+/i);
                const candidate = clean(dataHref) || clean(ariaMatch ? ariaMatch[0] : '');
                return candidate && !isOwnedByGoogle(candidate) ? candidate : '';
            },
        ];
        let website = '';
        let websiteSource = '';
        for (let i = 0; i < websiteSources.length; i += 1) {
            const candidate = websiteSources[i]();
            if (candidate) {
                website = candidate;
                websiteSource = i === 0 ? 'authority-link' : i === 1 ? 'website-link' : 'website-button';
                break;
            }
        }
        return {
            phone,
            website,
            hadDetail: true,
            cardLabel,
            clickedSelector: found.selector,
            detailReason: `ready heading=1 phoneBtn=${phone ? '1' : '0'} websiteBtn=${website ? '1' : '0'} ` +
                `panelChanged=${panelChanged ? '1' : '0'} sawTransient=${sawTransientPanelChange ? '1' : '0'} matchedHeading=${matchedByHeading ? '1' : '0'} stablePolls=${stableReadyPolls}/${Math.max(1, stablePolls)} readyMs=${readySinceMs > 0 ? Date.now() - readySinceMs : 0} ` +
                `beforeHeading=${beforeClick.heading || '-'} afterHeading=${afterClick.heading || '-'}`,
            phoneSource,
            websiteSource,
        };
    };
    try {
        const injection = await chrome.scripting.executeScript({
            target: { tabId },
            func: inPageDetailScraper,
            args: [
                cardIndex,
                timeoutMs,
                DETAIL_PANEL_POLL_MS,
                DETAIL_PANEL_STABLE_POLLS,
                DETAIL_PRE_CLICK_SETTLE_MS,
                DETAIL_POST_CLICK_SETTLE_MS,
                DETAIL_POST_READY_DWELL_MS,
            ],
        });
        const first = injection.find((entry) => entry?.result);
        return (first?.result ?? {
            phone: '',
            website: '',
            hadDetail: false,
            cardLabel: '',
            clickedSelector: 'no-result',
            detailReason: 'executeScript-no-result',
            phoneSource: '',
            websiteSource: '',
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'detail_inject_failed';
        await setDebug('detail-scrape', `card=${cardIndex} threw=${message}`);
        return {
            phone: '',
            website: '',
            hadDetail: false,
            cardLabel: '',
            clickedSelector: 'executeScript-throw',
            detailReason: message,
            phoneSource: '',
            websiteSource: '',
        };
    }
}
async function enrichItemsWithDetails(tabId, items, perCardTimeoutMs, progressEvery) {
    const enriched = [];
    for (let i = 0; i < items.length; i += 1) {
        if (i === 0 || i % progressEvery === 0) {
            await setStatus({
                status: 'capturing',
                message: `Membaca detail ${Math.min(i + 1, items.length)}/${items.length} tempat (phone + website)...`,
            });
        }
        const detail = await clickAndScrapeDetail(tabId, i, perCardTimeoutMs);
        const item = items[i];
        // Skip the card only if it had no detail panel at all (Maps didn't
        // respond to the click). Otherwise keep the item and only overwrite
        // phone/website when the detail panel actually surfaced them.
        if (!detail.hadDetail) {
            await setDebug('detail-scrape', `card=${i + 1}/${items.length} label=${detail.cardLabel || item.name} selector=${detail.clickedSelector} reason=${detail.detailReason}`);
            enriched.push(item);
            continue;
        }
        const next = { ...item };
        if (detail.phone)
            next.phone = detail.phone.slice(0, 50); // backend cap
        if (detail.website)
            next.website = detail.website.slice(0, 500); // backend cap
        const debugPhone = normalizePhoneForDebug(next.phone) || '-';
        const debugWebsite = next.website?.trim() || '-';
        await setDebug('detail-scrape', `card=${i + 1}/${items.length} label=${detail.cardLabel || item.name} selector=${detail.clickedSelector} phone=${next.phone ? 'yes' : 'no'} phoneValue=${debugPhone} phoneSrc=${detail.phoneSource || '-'} website=${next.website ? 'yes' : 'no'} websiteValue=${debugWebsite} websiteSrc=${detail.websiteSource || '-'} reason=${detail.detailReason}`);
        enriched.push(next);
        // Intentional pacing between cards so Maps has room to finish paint,
        // input handling, and panel state cleanup before the next click.
        await sleep(DETAIL_BETWEEN_CARDS_MS);
    }
    return enriched;
}
async function runCapture() {
    const session = await getPendingSession();
    if (!session) {
        const status = {
            status: 'idle',
            message: 'Belum ada session aktif dari dashboard.',
        };
        await setStatus(status);
        return status;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!(await isGoogleMapsTab(tab))) {
        const status = {
            status: 'failed',
            message: 'Buka tab Google Maps dengan hasil pencarian, lalu klik extension lagi.',
        };
        await setStatus(status);
        return status;
    }
    const capturingStatus = { status: 'capturing' };
    await setStatus(capturingStatus);
    await setDebug('runCapture', `tabId=${tab.id} url=${tab.url}`);
    // Force the active Maps tab to the dashboard's clean search URL. The tab
    // may have been redirected by Google to a landing page (entry=ttu,
    // g_ep=...) or to a single place's detail view — neither of which has a
    // list of cards to scrape. We strip query params from the current tab URL
    // to detect "not on results" and re-navigate to the search URL.
    if (session.googleMapsUrl && !isSearchResultsUrl(tab.url)) {
        try {
            await chrome.tabs.update(tab.id, { url: session.googleMapsUrl });
            await waitForTabComplete(tab.id, 12000);
            await setDebug('navigate', `reloaded results url=${session.googleMapsUrl}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'nav_failed';
            await setDebug('navigate', `failed url=${session.googleMapsUrl} error=${message}`);
        }
    }
    else if (session.googleMapsUrl) {
        await setDebug('navigate', `already on results url=${tab.url}`);
    }
    await setDebug('ready-check', 'waiting for Google Maps results DOM');
    const readyState = await waitForGoogleMapsReady(tab.id, 25000);
    await setDebug('ready-check', readyState
        ? `ready=${readyState.ready} state=${readyState.readyState} cards=${readyState.cardsTotal} placeLinks=${readyState.placeLinks} feed=${readyState.hasFeed} results=${readyState.hasResultsLabel} url=${readyState.url}`
        : 'no readiness payload');
    const maxCaptureItems = await resolveMaxCaptureItems();
    const autoScrollSteps = autoScrollStepsFor(maxCaptureItems);
    const detailProgressEvery = detailProgressEveryFor(maxCaptureItems);
    const scrollSummary = await autoScrollGoogleMapsResults(tab.id, autoScrollSteps);
    await setDebug('auto-scroll', scrollSummary
        ? `steps=5 cards=${scrollSummary.cardsTotal} url=${scrollSummary.url}`
        : 'no scroll payload');
    // Run the scraper in-page via executeScript({func: ...}). This is the
    // most reliable path: the function runs synchronously in the page's main
    // world, returns the captured items directly, and there is no message
    // round-trip to drop. (Past versions injected a separate `content.js`
    // and listened for a `leadsgen:content-result` message — that approach
    // hit a race in MV3 and would time out at 8000ms.)
    await setDebug('capture-config', `maxItems=${maxCaptureItems} autoScrollSteps=${autoScrollSteps} detailTimeoutMs=${DETAIL_SCRAPE_TIMEOUT_MS} detailPollMs=${DETAIL_PANEL_POLL_MS} detailStablePolls=${DETAIL_PANEL_STABLE_POLLS} preClickSettleMs=${DETAIL_PRE_CLICK_SETTLE_MS} postClickSettleMs=${DETAIL_POST_CLICK_SETTLE_MS} postReadyDwellMs=${DETAIL_POST_READY_DWELL_MS} betweenCardsMs=${DETAIL_BETWEEN_CARDS_MS} progressEvery=${detailProgressEvery}`);
    let items;
    try {
        // Inline the scraper here — executeScript's `func` only accepts a
        // serialized function and cannot import modules. The function runs in
        // the page's default isolated world, which has full DOM access.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inPageScraper = function scrapeMapsResults(limit) {
            const clean = (v) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
            const pickFromRoot = (root, selectors) => {
                for (const selector of selectors) {
                    const node = root.querySelector(selector);
                    const value = clean(node && node.textContent);
                    if (value)
                        return value;
                }
                return '';
            };
            const pickHrefFromRoot = (root, selectors) => {
                for (const selector of selectors) {
                    const node = root.querySelector(selector);
                    const href = node ? node.getAttribute('href') : null;
                    if (href)
                        return href.trim();
                }
                return '';
            };
            const extractFromContainerList = (listSelector, limit) => {
                const root = document.querySelector(listSelector);
                if (!root)
                    return [];
                const candidates = [
                    ...Array.from(root.querySelectorAll('[data-local-attribute]')),
                    ...Array.from(root.querySelectorAll('div[role="article"]')),
                    ...Array.from(root.querySelectorAll('a[href*="/maps/place/"]')),
                ];
                const seen = new Set();
                const unique = candidates.filter((c) => {
                    if (seen.has(c))
                        return false;
                    seen.add(c);
                    return true;
                });
                return unique
                    .slice(0, limit)
                    .map((card) => {
                    const fullText = clean(card.textContent);
                    const parts = fullText
                        .split('·')
                        .map((p) => clean(p))
                        .filter(Boolean);
                    // Anchored phone pattern: starts with +/digit, only phone chars,
                    // bounded length. Google Maps often merges phone+address+hours
                    // into a single "·" segment, so a loose regex would pick up the
                    // whole blob and break the 100-char backend cap.
                    const phoneCandidate = parts.find((p) => /^\+?[\d][\d\s().-]{5,30}$/.test(p)) ?? '';
                    const address = parts.find((p) => /\d/.test(p) || /(street|st\b|road|rd\b|avenue|ave\b|jalan|jl\b)/i.test(p)) ?? '';
                    const phoneFromSelector = pickFromRoot(card, ['[data-local-attribute="d3ph"]']);
                    // Defensive: drop any phone value > 30 chars (E.164 + separators
                    // fit comfortably; longer is almost certainly a mis-merged blob).
                    const phone = (phoneFromSelector && phoneFromSelector.length <= 30 ? phoneFromSelector : '') ||
                        (phoneCandidate && phoneCandidate.length <= 30 ? phoneCandidate : '');
                    // Website must NOT come from a Google-owned host. Without this
                    // filter, `a[href^="http"]` matches the search-result card link
                    // itself (`https://www.google.com/maps/place/...`) and the lead's
                    // `profileUrl` ends up pointing at Google Maps instead of the
                    // business's own website. The detail panel (post-click) renders a
                    // dedicated Website button, but the list-view card has none —
                    // so we keep the link free of Maps URLs even if a future
                    // selector surfaces a stray one.
                    const isOwnedByGoogle = (href) => {
                        try {
                            const host = new URL(href, window.location.href).hostname.toLowerCase();
                            return (host === 'google.com' ||
                                host.endsWith('.google.com') ||
                                host === 'google.co.id' ||
                                host.endsWith('.google.co.id') ||
                                host === 'maps.google.com' ||
                                host === 'g.page' ||
                                host.endsWith('.g.page'));
                        }
                        catch {
                            return true; // unparseable — treat as unsafe and skip
                        }
                    };
                    const pickBusinessHref = (root, selectors) => {
                        for (const selector of selectors) {
                            const node = root.querySelector(selector);
                            const href = node ? node.getAttribute('href') : null;
                            if (!href)
                                continue;
                            const trimmed = href.trim();
                            if (!trimmed || isOwnedByGoogle(trimmed))
                                continue;
                            return trimmed;
                        }
                        return '';
                    };
                    // Backend caps (from ScrapeImportItemSchema):
                    //   name  <= 200, address <= 500, phone <= 50,
                    //   website <= 500.
                    // Truncate each field at the source so a malformed selector or a
                    // mis-merged Google Maps text blob cannot push the payload over
                    // the limit and trigger a 400 VALIDATION on POST /results.
                    const cap = (value, max) => value.length > max ? value.slice(0, max) : value;
                    return {
                        name: cap(pickFromRoot(card, [
                            'div[role="heading"]',
                            'h3',
                            '.dbg0pd',
                            '.rllt__details div:first-child',
                        ]) || clean(card.getAttribute('aria-label')), 200),
                        address: cap(pickFromRoot(card, [
                            '.rllt__details div:nth-child(2)',
                            '[data-local-attribute="d3adr"]',
                        ]) || address, 500),
                        phone,
                        website: cap(pickBusinessHref(card, ['a[data-value="Website"]', 'a[href^="http"]']), 500),
                    };
                })
                    .filter((item) => Boolean(item && item.name));
            };
            const a = extractFromContainerList('body', limit);
            const modernContainers = [
                '[role="feed"]',
                'div[aria-label*="Results"]',
                'div[aria-label*="results"]',
                'div.Nv2PK',
                'div.m6QErb',
            ];
            let bestItems = a;
            let bestSelector = 'document[data-local-attribute]';
            let bestCount = a.length;
            for (const sel of modernContainers) {
                const items = extractFromContainerList(sel, limit);
                if (items.length > bestCount) {
                    bestItems = items;
                    bestCount = items.length;
                    bestSelector = sel;
                }
            }
            const cardsTotal = document.querySelectorAll('[data-local-attribute], div[role="article"], a[href*="/maps/place/"], div.Nv2PK').length;
            return {
                items: bestItems,
                meta: {
                    url: window.location.href,
                    cardsTotal,
                    extracted: bestItems.length,
                    selector: bestSelector,
                },
            };
        };
        let selectedResult = null;
        let frameCount = 0;
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            const injection = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                // DEFAULT world (ISOLATED) — DOM access still works because the
                // injected function runs in a JS context that can read the page's
                // DOM. `world: 'MAIN'` was rejected by Google Maps' CSP on some
                // runs, dropping the result entirely; falling back to the default
                // world eliminates that failure mode.
                func: inPageScraper,
                args: [maxCaptureItems],
            });
            frameCount = injection?.length ?? 0;
            if (chrome.runtime.lastError) {
                await setDebug('executeScript', `attempt=${attempt} lastError=${chrome.runtime.lastError.message ?? 'unknown'}`);
            }
            const payloadCandidate = injection
                .map((entry) => entry?.result)
                .find((result) => Boolean(result && result.meta));
            await setDebug('executeScript', payloadCandidate
                ? `attempt=${attempt} frames=${frameCount} extracted=${payloadCandidate.meta.extracted} selector=${payloadCandidate.meta.selector} url=${payloadCandidate.meta.url}`
                : `attempt=${attempt} frames=${frameCount} no-payload`);
            if (payloadCandidate) {
                selectedResult = payloadCandidate;
                break;
            }
            if (attempt < 4) {
                await sleep(1400);
            }
        }
        if (!frameCount) {
            const status = {
                status: 'failed',
                message: 'Content script injection returned no result (frame access blocked?).',
            };
            await setStatus(status);
            return status;
        }
        if (!selectedResult) {
            const status = {
                status: 'failed',
                message: 'In-page scrape returned no payload after multiple attempts. Google Maps results may still be rendering.',
            };
            await setStatus(status);
            return status;
        }
        await setDebug('scraped', `url=${selectedResult.meta.url} cardsTotal=${selectedResult.meta.cardsTotal} extracted=${selectedResult.meta.extracted} selector=${selectedResult.meta.selector}`);
        items = selectedResult.items;
        // Enrich each card by clicking it in-place and scraping the right-hand
        // detail panel for phone + website. These fields are NOT present in the
        // list-view card itself, so the initial list scrape only seeds
        // name/address. The enrichment loop respects the user's design:
        // keep the panel open between clicks, 3-second per-card timeout,
        // progress logged via `setDebug('detail-scrape', ...)`.
        await setStatus({
            status: 'capturing',
            message: 'Membaca detail setiap tempat (phone + website)...',
        });
        items = await enrichItemsWithDetails(tab.id, items, DETAIL_SCRAPE_TIMEOUT_MS, detailProgressEvery);
        items = items.filter((item) => typeof item.phone === 'string' && item.phone.trim().length > 0);
        await setDebug('detail-scrape', `phone-filter kept=${items.length}`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'inject_failed';
        await setDebug('executeScript', `threw=${message}`);
        const status = { status: 'failed', message };
        await setStatus(status);
        return status;
    }
    const itemSummary = summarizeItemsForDebug(items);
    await setDebug('post-items', `count=${itemSummary.count} uniquePhones=${itemSummary.uniquePhones} uniqueWebsites=${itemSummary.uniqueWebsites} duplicatePhoneGroups=${itemSummary.duplicatePhoneGroups} sample=${itemSummary.sample || '-'}`);
    if (items.length === 0) {
        const status = {
            status: 'failed',
            message: 'Tidak ada lead dengan nomor telepon yang berhasil dibaca dari hasil Google Maps ini. Coba kata kunci/lokasi lain atau pastikan panel detail setiap tempat memang menampilkan phone number.',
        };
        await setStatus(status);
        return status;
    }
    const baseUrl = await resolveBackendBaseUrl();
    const collectingUrl = `${baseUrl}/api/teams/${session.teamId}/connectors/scrape/session/${session.sessionId}/collecting`;
    const resultsUrl = `${baseUrl}/api/teams/${session.teamId}/connectors/scrape/session/${session.sessionId}/results`;
    try {
        const collectingResponse = await postToBackend(collectingUrl, session.captureToken);
        if (!collectingResponse.ok) {
            const text = await collectingResponse.text();
            const status = {
                status: 'failed',
                message: `collecting ${collectingResponse.status}: ${text}`,
            };
            await setStatus(status);
            return status;
        }
        const resultsResponse = await postToBackend(resultsUrl, session.captureToken, {
            items: items,
        });
        if (!resultsResponse.ok) {
            const text = await resultsResponse.text();
            const status = {
                status: 'failed',
                message: `results ${resultsResponse.status}: ${text}`,
            };
            await setStatus(status);
            return status;
        }
        const summary = (await resultsResponse.json());
        const sent = {
            status: 'sent',
            count: items.length,
            summary: summary.summary,
            message: `Berhasil kirim ${items.length} leads ke dashboard.`,
        };
        await setStatus(sent);
        await clearPendingSession();
        return sent;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'network_error';
        const status = { status: 'failed', message };
        await setStatus(status);
        return status;
    }
}
async function resolveBackendBaseUrl() {
    const stored = await chrome.storage.local.get('leadsgen:backend-base-url');
    const value = stored['leadsgen:backend-base-url'];
    if (typeof value === 'string' && value.length > 0)
        return value;
    return 'http://localhost:3001';
}
async function resolveMaxCaptureItems() {
    const stored = await chrome.storage.local.get(MAX_CAPTURE_ITEMS_STORAGE_KEY);
    const value = stored[MAX_CAPTURE_ITEMS_STORAGE_KEY];
    if (value === '20' || value === '50' || value === '100') {
        return Number(value);
    }
    if (typeof value === 'number' && [20, 50, 100].includes(value)) {
        return value;
    }
    return DEFAULT_MAX_CAPTURE_ITEMS;
}
function autoScrollStepsFor(maxItems) {
    if (maxItems >= 100)
        return 24;
    if (maxItems >= 50)
        return 12;
    return 5;
}
function detailProgressEveryFor(maxItems) {
    if (maxItems >= 100)
        return 10;
    if (maxItems >= 50)
        return 5;
    return 3;
}
chrome.runtime.onInstalled.addListener(() => {
    void setStatus({ status: 'idle' });
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (typeof message !== 'object' || message === null)
        return;
    const typed = message;
    if (typed.type === 'leadsgen:capture-session' && typed.payload) {
        const payload = typed.payload;
        void (async () => {
            await chrome.storage.session.set({ [STORAGE_KEY]: payload });
            await setStatus({
                status: 'pending',
                message: 'Session siap. Klik icon extension di tab Google Maps.',
            });
            const pendingUrl = payload.googleMapsUrl;
            if (pendingUrl) {
                const existingTabs = await chrome.tabs.query({ url: 'https://www.google.com/maps/*' });
                if (existingTabs.length === 0) {
                    await chrome.tabs.create({ url: pendingUrl });
                }
            }
            sendResponse({ ok: true });
        })();
        return true;
    }
    if (typed.type === 'leadsgen:popup-status') {
        void (async () => {
            const status = await getStatus();
            sendResponse(status ?? { status: 'idle' });
        })();
        return true;
    }
    if (typed.type === 'leadsgen:trigger-capture') {
        void (async () => {
            const status = await runCapture();
            sendResponse(status);
        })();
        return true;
    }
    return false;
});
// Same handler for messages coming from web pages (dashboard).
// `chrome.runtime.onMessage` only fires for internal senders (content scripts,
// popup, options). Anything from a web page matching `externally_connectable`
// arrives on `onMessageExternal` instead — without this listener the dashboard
// can never reach the extension, no matter what the manifest matches allow.
const externalHandler = (message, sender, sendResponse) => {
    if (typeof message !== 'object' || message === null)
        return false;
    const typed = message;
    if (typed.type === 'leadsgen:ping') {
        sendResponse({ ok: true, from: sender.id ?? 'unknown' });
        return false;
    }
    if (typed.type === 'leadsgen:capture-session' && typed.payload) {
        const payload = typed.payload;
        void (async () => {
            await chrome.storage.session.set({ [STORAGE_KEY]: payload });
            await setStatus({
                status: 'pending',
                message: 'Session siap. Klik icon extension di tab Google Maps.',
            });
            const pendingUrl = payload.googleMapsUrl;
            if (pendingUrl) {
                const existingTabs = await chrome.tabs.query({ url: 'https://www.google.com/maps/*' });
                if (existingTabs.length === 0) {
                    await chrome.tabs.create({ url: pendingUrl });
                }
            }
            sendResponse({ ok: true });
        })();
        return true;
    }
    if (typed.type === 'leadsgen:popup-status') {
        void (async () => {
            const status = await getStatus();
            sendResponse(status ?? { status: 'idle' });
        })();
        return true;
    }
    if (typed.type === 'leadsgen:trigger-capture') {
        void (async () => {
            const status = await runCapture();
            sendResponse(status);
        })();
        return true;
    }
    return false;
};
chrome.runtime.onMessageExternal.addListener(externalHandler);
chrome.action.onClicked.addListener(() => {
    void runCapture();
});
export {};
