import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type {
  ConnectorStatus,
  NormalizedLead,
  RawProspect,
  UsagePolicy,
} from '@leads-generator/shared';
import { normalizeRawProspect } from './normalize.js';
import type { ScanQuery, Source_Connector } from './source-connector.js';

const SEARCH_TIMEOUT_MS = 20_000;
const MAX_RESULTS = 20;
const GOOGLE_BLOCK_TEXT = 'Our systems have detected unusual traffic from your computer network';
const GOOGLE_BLOCK_TEXT_ID = 'Sistem kami telah mendeteksi adanya lalu lintas yang tidak wajar';
const GOOGLE_ACCEPT_LANGUAGE = 'id-ID,id;q=0.9,en;q=0.8';
const GOOGLE_VIEWPORT = { width: 1366, height: 768 };
const GOOGLE_SESSION_DIR = '.playwright-google-maps';
const GOOGLE_CHROME_CHANNEL = process.env.GOOGLE_MAPS_BROWSER_CHANNEL;
const GOOGLE_USER_DATA_DIR = process.env.GOOGLE_MAPS_USER_DATA_DIR;
const GOOGLE_HEADLESS = process.env.GOOGLE_MAPS_HEADLESS !== 'false';

interface ExtractedBusiness {
  name: string | undefined;
  address: string | undefined;
  phone: string | undefined;
  website: string | undefined;
  rating: string | undefined;
}

function buildSearchQuery(query: ScanQuery): string {
  return [...query.keywords, query.location, query.niche].filter(Boolean).join(' ').trim();
}

function cleanText(value: string | null | undefined): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text ? text : undefined;
}

function normalizeWebsite(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return undefined;
}

function firstMatchedKeyword(query: ScanQuery): string {
  return query.keywords[0] ?? query.niche ?? 'google-maps-headless';
}

async function maybeAcceptGoogleConsent(page: import('playwright').Page): Promise<void> {
  const labels = ['I agree', 'Accept all', 'Terima', 'Saya setuju'];

  for (const label of labels) {
    const button = page.getByRole('button', { name: label }).first();
    if ((await button.count()) === 0) continue;
    await button.click().catch(() => undefined);
    return;
  }
}

async function warmUpGoogleHomepage(page: import('playwright').Page): Promise<void> {
  await page.goto('https://www.google.com/', { waitUntil: 'domcontentloaded' });
  await page.locator('body').waitFor();
  await waitWithJitter(page, 600);
  await maybeAcceptGoogleConsent(page);
  await waitWithJitter(page, 400);
  await page.mouse.move(200, 220, { steps: 12 }).catch(() => undefined);
  await waitWithJitter(page, 300);
}

async function submitGoogleSearch(page: import('playwright').Page, searchQuery: string): Promise<void> {
  const searchBox = page.locator('textarea[name="q"], input[name="q"]').first();
  await searchBox.waitFor();
  await searchBox.click();
  await waitWithJitter(page, 250);
  await searchBox.pressSequentially(searchQuery, { delay: 120 });
  await waitWithJitter(page, 350);
  await searchBox.press('Enter');
}

async function ensureGoogleSessionDir(): Promise<string> {
  const sessionDir = GOOGLE_USER_DATA_DIR || join(process.cwd(), GOOGLE_SESSION_DIR);
  await mkdir(sessionDir, { recursive: true });
  return sessionDir;
}

async function waitWithJitter(page: import('playwright').Page, delayMs: number): Promise<void> {
  await page.waitForTimeout(delayMs + Math.floor(Math.random() * 400));
}

async function ensureGoogleResultsPage(page: import('playwright').Page, searchQuery: string): Promise<void> {
  await warmUpGoogleHomepage(page);
  await submitGoogleSearch(page, searchQuery);
}

async function readBodyText(page: import('playwright').Page): Promise<string> {
  return page.locator('body').innerText().catch(() => '');
}

function isGoogleBlocked(pageUrl: string, pageText: string): boolean {
  return (
    pageUrl.includes('/sorry/index') ||
    pageText.includes(GOOGLE_BLOCK_TEXT) ||
    pageText.includes(GOOGLE_BLOCK_TEXT_ID)
  );
}

async function waitForGoogleOutcome(page: import('playwright').Page): Promise<void> {
  await page.waitForFunction(
    (blockTexts) => {
      const browserWindow = globalThis as unknown as {
        location?: { href?: string };
        document?: {
          body?: { innerText?: string };
          querySelector(selector: string): unknown;
        };
      };
      const bodyText = browserWindow.document?.body?.innerText || '';
      const pageUrl = browserWindow.location?.href || '';
      if (pageUrl.includes('/sorry/index')) return true;
      if (blockTexts.some((blockText: string) => bodyText.includes(blockText))) return true;
      if (browserWindow.document?.querySelector('[data-local-attribute]')) return true;
      return Boolean(browserWindow.document?.querySelector('form, button'));
    },
    [GOOGLE_BLOCK_TEXT, GOOGLE_BLOCK_TEXT_ID],
    { timeout: SEARCH_TIMEOUT_MS },
  );
}

function mapBusinessToProspect(business: ExtractedBusiness, query: ScanQuery): RawProspect | null {
  const name = cleanText(business.name);
  if (!name) return null;

  const location = cleanText(business.address) ?? query.location?.trim() ?? 'Unknown';
  const phone = cleanText(business.phone);
  const website = normalizeWebsite(cleanText(business.website));
  const rating = cleanText(business.rating);

  const prospect: RawProspect = {
    name,
    location,
    matchedKeyword: firstMatchedKeyword(query),
    acquiredAt: new Date(),
  };

  if (phone) {
    prospect.publicContact = phone;
    const digits = phone.replace(/\D/g, '');
    if (digits) {
      prospect.whatsappNumber = digits;
      prospect.whatsappUrl = `https://wa.me/${digits}`;
    }
  }

  if (website) {
    prospect.profileUrl = website;
  }

  if (rating) {
    prospect.postSnippet = `Google rating: ${rating}`;
  }

  return prospect;
}

export class GoogleMapsHeadlessConnector implements Source_Connector {
  public readonly sourceId = 'google-maps-headless';
  public readonly displayName = 'Google Maps (Headless)';
  public readonly usagePolicy: UsagePolicy = {
    allowedRetentionDays: 90,
    disallowFields: [],
  };

  public async checkAvailability(): Promise<ConnectorStatus> {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return 'available';
  }

  public async fetch(query: ScanQuery, signal: AbortSignal): Promise<RawProspect[]> {
    if (signal.aborted) {
      throw new Error('aborted');
    }

    const searchQuery = buildSearchQuery(query);
    console.info('[google-maps-headless] fetch started', {
      searchQuery,
      keywords: query.keywords,
      ...(query.location ? { location: query.location } : {}),
      ...(query.niche ? { niche: query.niche } : {}),
      headless: GOOGLE_HEADLESS,
    });

    if (!searchQuery) {
      console.info('[google-maps-headless] fetch skipped because search query is empty');
      return [];
    }

    const sessionDir = await ensureGoogleSessionDir();
    const context = await chromium.launchPersistentContext(sessionDir, {
      ...(GOOGLE_CHROME_CHANNEL ? { channel: GOOGLE_CHROME_CHANNEL } : {}),
      headless: GOOGLE_HEADLESS,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      locale: 'id-ID',
      timezoneId: 'Asia/Jakarta',
      viewport: GOOGLE_VIEWPORT,
      extraHTTPHeaders: {
        'Accept-Language': GOOGLE_ACCEPT_LANGUAGE,
        'Upgrade-Insecure-Requests': '1',
      },
    });
    await context.addInitScript(() => {
      const browserNavigator = (globalThis as unknown as { navigator?: object }).navigator;
      if (!browserNavigator) return;
      Object.defineProperty(browserNavigator, 'webdriver', {
        get: () => undefined,
      });
    });
    console.info('[google-maps-headless] browser context ready', {
      searchQuery,
      sessionDir,
    });
    const closeContext = async () => {
      await context.close().catch(() => undefined);
    };
    signal.addEventListener(
      'abort',
      () => {
        void closeContext();
      },
      { once: true },
    );

    try {
      const page = context.pages()[0] ?? (await context.newPage());
      page.setDefaultTimeout(SEARCH_TIMEOUT_MS);

      console.info('[google-maps-headless] navigating to Google results', { searchQuery });
      await ensureGoogleResultsPage(page, searchQuery);
      await waitForGoogleOutcome(page);
      console.info('[google-maps-headless] page outcome detected', {
        searchQuery,
        pageUrl: page.url(),
      });

      const pageText = await readBodyText(page);
      if (isGoogleBlocked(page.url(), pageText)) {
        console.warn('[google-maps-headless] blocked by Google unusual traffic page', {
          searchQuery,
          pageUrl: page.url(),
        });
        // ponytail: fail fast on Google anti-bot pages so verification sees the real blocker.
        throw new Error('google_blocked_unusual_traffic');
      }

      const businesses = await page.evaluate((maxResults: number) => {
        type BrowserElement = {
          querySelector(selector: string): BrowserElement | null;
          getAttribute(name: string): string | null;
          textContent: string | null;
        };

        const browserDocument = (globalThis as unknown as {
          document: { querySelectorAll(selector: string): Iterable<BrowserElement> };
        }).document;
        const text = (value: string | null | undefined): string | undefined =>
          value?.replace(/\s+/g, ' ').trim() || undefined;
        const pickText = (root: BrowserElement, selectors: string[]): string | undefined => {
          for (const selector of selectors) {
            const value = text(root.querySelector(selector)?.textContent);
            if (value) return value;
          }
          return undefined;
        };
        const pickHref = (root: BrowserElement, selectors: string[]): string | undefined => {
          for (const selector of selectors) {
            const href = root.querySelector(selector)?.getAttribute('href')?.trim();
            if (href) return href;
          }
          return undefined;
        };
        const cards = Array.from(browserDocument.querySelectorAll('[data-local-attribute]')).slice(0, maxResults);

        // ponytail: Google changes markup often, so we keep a tiny selector set
        // and fall back to text heuristics instead of building a full parser.
        return cards.map((card) => {
          const fullText = text(card.textContent) || '';
          const parts = fullText
            .split('·')
            .map((part: string) => text(part))
            .filter((part): part is string => Boolean(part));
          const phone = parts.find((part: string) => /\+?\d[\d\s().-]{6,}/.test(part));
          const address = parts.find(
            (part: string) =>
              /\d/.test(part) || /(street|st|road|rd|avenue|ave|jalan|jl)/i.test(part),
          );
          const rating = parts.find((part: string) => /^\d(?:[.,]\d)?(?:\s*\(.*\))?$/.test(part));

          return {
            name: pickText(card, [
              'div[role="heading"]',
              'h3',
              '.dbg0pd',
              '.rllt__details div:first-child',
            ]),
            address:
              pickText(card, ['.rllt__details div:nth-child(2)', '[data-local-attribute="d3adr"]']) ||
              address,
            phone: pickText(card, ['[data-local-attribute="d3ph"]']) || phone,
            website: pickHref(card, ['a[data-value="Website"]', 'a[href^="http"]']),
            rating: pickText(card, ['[aria-label*="stars"]', '.yi40Hd']) || rating,
          };
        });
      }, MAX_RESULTS);

      console.info('[google-maps-headless] extracted business cards', {
        searchQuery,
        count: businesses.length,
      });

      const prospects = businesses
        .map((business) => mapBusinessToProspect(business, query))
        .filter((prospect): prospect is RawProspect => prospect !== null);

      console.info('[google-maps-headless] normalized prospects ready', {
        searchQuery,
        count: prospects.length,
      });

      return prospects;
    } catch (error) {
      console.error('[google-maps-headless] fetch failed', {
        searchQuery,
        error,
      });
      throw error;
    } finally {
      await closeContext();
    }
  }

  public normalize(raw: RawProspect, teamId: string): NormalizedLead {
    return normalizeRawProspect(raw, {
      teamId,
      sourceId: this.sourceId,
      usagePolicy: this.usagePolicy,
    });
  }
}
