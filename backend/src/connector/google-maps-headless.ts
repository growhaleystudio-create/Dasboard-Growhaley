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
  category: string | undefined;
  mapsUrl?: string | undefined;
  lat?: number | undefined;
  lon?: number | undefined;
}

function buildSearchQuery(query: ScanQuery): string {
  const tokens = [...query.keywords, query.niche, query.location]
    .flatMap((value) => (value ? value.split(',') : []))
    .map((v) => v.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique = tokens.filter((t) => {
    const lower = t.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
  return unique.join(' ').trim();
}

function cleanText(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  // Strip Unicode Private Use Area characters (used by Google Maps for icons like  and )
  // and directional control characters (\u202a, \u202c)
  const cleaned = value
    .replace(/[\ue000-\uf8ff]/g, '')
    .replace(/[\u202a\u202c]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizePhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = cleanText(
    raw
      .replace(/Salin nomor telepon/gi, '')
      .replace(/Copy phone number/gi, '')
      .replace(/Telepon:/gi, '')
      .replace(/Phone:/gi, ''),
  );
  return cleaned;
}

function extractCoordsFromUrl(url: string): { lat?: number; lon?: number } {
  const match1 = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (match1) {
    return { lat: parseFloat(match1[1]!), lon: parseFloat(match1[2]!) };
  }
  const match2 = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (match2) {
    return { lat: parseFloat(match2[1]!), lon: parseFloat(match2[2]!) };
  }
  return {};
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
  const labels = ['I agree', 'Accept all', 'Terima semua', 'Terima', 'Saya setuju', 'Setuju'];

  for (const label of labels) {
    const button = page.getByRole('button', { name: label }).first();
    if ((await button.count()) === 0) continue;
    await button.click().catch(() => undefined);
    return;
  }
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
  const mapsSearchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}/?hl=id`;
  await page.goto(mapsSearchUrl, { waitUntil: 'domcontentloaded', timeout: SEARCH_TIMEOUT_MS });
  await waitWithJitter(page, 500);
  await maybeAcceptGoogleConsent(page);
  await waitWithJitter(page, 400);
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
      if (browserWindow.document?.querySelector('[role="feed"], div.Nv2PK, [data-local-attribute], div.m6QErb, a[href*="/maps/place/"]')) return true;
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
  const category = cleanText(business.category);

  const prospect: RawProspect = {
    name,
    location,
    matchedKeyword: firstMatchedKeyword(query),
    acquiredAt: new Date(),
  };

  if (phone) {
    prospect.publicContact = phone;
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 7) {
      let waDigits = digits;
      if (waDigits.startsWith('0')) {
        waDigits = '62' + waDigits.slice(1);
      } else if (!waDigits.startsWith('62') && waDigits.length <= 11) {
        waDigits = '62' + waDigits;
      }
      prospect.whatsappNumber = waDigits;
      prospect.whatsappUrl = `https://wa.me/${waDigits}`;
      prospect.whatsappVerificationStatus = 'registered';
    }
  }

  if (website) {
    prospect.profileUrl = website;
  } else if (business.mapsUrl) {
    prospect.profileUrl = business.mapsUrl;
  }

  const snippetParts: string[] = [];
  if (category) {
    snippetParts.push(`Kategori: ${category}`);
  }
  if (rating) {
    snippetParts.push(`Google rating: ${rating}`);
  }
  if (snippetParts.length > 0) {
    prospect.postSnippet = snippetParts.join(' | ');
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
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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

      console.info('[google-maps-headless] navigating to Google Maps results', { searchQuery });
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
        throw new Error('google_blocked_unusual_traffic');
      }

      // 1. Target feed container and scroll to collect unique place links
      const feedSelector = 'div[role="feed"]';
      let hasFeed = false;
      try {
        await page.waitForSelector(feedSelector, { timeout: 10_000 });
        hasFeed = true;
      } catch {
        console.info('[google-maps-headless] feed selector not found, checking direct place or cards');
      }

      const placeUrls: Array<{ title?: string | undefined; url: string }> = [];

      if (hasFeed) {
        const feed = page.locator(feedSelector);
        let stuckCount = 0;

        while (placeUrls.length < MAX_RESULTS) {
          if (signal.aborted) break;
          const anchors = page.locator('div[role="feed"] a.hfpxzc');
          const count = await anchors.count();

          for (let i = 0; i < count; i++) {
            const href = await anchors.nth(i).getAttribute('href');
            const title = await anchors.nth(i).getAttribute('aria-label');
            if (href && !placeUrls.some((p) => p.url === href)) {
              placeUrls.push({ title: title ?? undefined, url: href });
              if (placeUrls.length >= MAX_RESULTS) break;
            }
          }

          if (placeUrls.length >= MAX_RESULTS) break;

          await feed.evaluate((el) => {
            (el as unknown as { scrollBy: (x: number, y: number) => void }).scrollBy(0, 1500);
          });
          await waitWithJitter(page, 1000);

          const endNotice = page.locator(
            "text='You\\'ve reached the end of the list', text='Anda telah mencapai bagian akhir daftar'",
          );
          if ((await endNotice.count()) > 0) break;

          const newCount = await anchors.count();
          if (newCount === count) {
            stuckCount++;
            if (stuckCount >= 4) break;
          } else {
            stuckCount = 0;
          }
        }
      } else if (page.url().includes('/maps/place/')) {
        placeUrls.push({ title: await page.title(), url: page.url() });
      }

      console.info('[google-maps-headless] places identified for detail extraction', {
        searchQuery,
        count: placeUrls.length,
      });

      const businesses: ExtractedBusiness[] = [];

      // 2. Deep extract details for each place
      for (const item of placeUrls) {
        if (signal.aborted) break;
        try {
          await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 18_000 });
          await waitWithJitter(page, 1200);

          // Name
          let name: string | undefined;
          const nameElem = page.locator('h1.DUwDvf');
          if ((await nameElem.count()) > 0) {
            name = cleanText(await nameElem.first().textContent());
          } else if (item.title) {
            name = cleanText(item.title);
          }

          // Rating & Reviews
          let rating: string | undefined;
          let reviewsCount: string | undefined;
          const ratingContainer = page.locator('div.F7nice');
          if ((await ratingContainer.count()) > 0) {
            const ratingText = await ratingContainer.first().textContent();
            const match = ratingText?.match(/(\d+[.,]\d+)(?:\s*\(([\d.,]+)\))?/);
            if (match) {
              rating = match[1]?.replace(',', '.');
              reviewsCount = match[2]?.replace(/[.,]/g, '');
            }
          }

          // Category
          let category: string | undefined;
          const catElem = page.locator('button.DkEaL, span.DkEaL');
          if ((await catElem.count()) > 0) {
            category = cleanText(await catElem.first().textContent());
          }

          // Address
          let address: string | undefined;
          const addrElem = page.locator(
            'button[data-item-id="address"], button[data-tooltip="Salin alamat"], button[aria-label*="Alamat:"]',
          );
          if ((await addrElem.count()) > 0) {
            address = cleanText(await addrElem.first().textContent());
          }

          // Phone
          let phone: string | undefined;
          const phoneElem = page.locator(
            'button[data-tooltip="Salin nomor telepon"], button[data-item-id*="phone:tel:"], button[aria-label*="Telepon:"]',
          );
          if ((await phoneElem.count()) > 0) {
            phone = normalizePhone(await phoneElem.first().textContent());
          }

          // Website
          let website: string | undefined;
          const webElem = page.locator(
            'a[data-item-id="authority"], a[aria-label*="Situs web:"], a[aria-label*="Website:"]',
          );
          if ((await webElem.count()) > 0) {
            website = (await webElem.first().getAttribute('href')) || undefined;
            if (website?.includes('/url?q=')) {
              const m = website.match(/\/url\?q=([^&]+)/);
              if (m) website = decodeURIComponent(m[1]!);
            }
          }

          const coords = extractCoordsFromUrl(page.url());

          if (name) {
            businesses.push({
              name,
              address,
              phone,
              website,
              rating: rating ? (reviewsCount ? `${rating} (${reviewsCount} ulasan)` : rating) : undefined,
              category,
              mapsUrl: page.url(),
              lat: coords.lat,
              lon: coords.lon,
            });
            console.info(`[google-maps-headless] extracted: ${name} | Telp: ${phone ?? '-'} | Rating: ${rating ?? '-'}`);
          }
        } catch (err) {
          console.warn('[google-maps-headless] detail extraction warning for item:', item.url, err);
        }
      }

      // Fallback: If no placeUrls could be scraped via feed, attempt card extraction
      if (businesses.length === 0) {
        console.info('[google-maps-headless] falling back to candidate cards on page');
        const fallbackCards = await page.evaluate((limit: number) => {
          type BrowserElem = {
            querySelector(sel: string): BrowserElem | null;
            querySelectorAll(sel: string): Iterable<BrowserElem>;
            getAttribute(n: string): string | null;
            textContent: string | null;
          };
          const doc = (globalThis as unknown as { document: { querySelectorAll(s: string): Iterable<BrowserElem> } }).document;
          const rawCards = Array.from(doc.querySelectorAll('div.Nv2PK, [role="article"]')).slice(0, limit);
          return rawCards.map((card) => ({
            name: card.querySelector('div.qBF1Pd, h1, h3')?.textContent?.trim(),
            address: card.querySelector('div.W4Efsd:nth-child(2)')?.textContent?.trim(),
            phone: card.querySelector('span.UsdlK')?.textContent?.trim(),
            rating: card.querySelector('span.MW4etd')?.textContent?.trim(),
            category: card.querySelector('div.W4Efsd span')?.textContent?.trim(),
          })).filter(c => Boolean(c.name));
        }, MAX_RESULTS);

        for (const card of fallbackCards) {
          businesses.push({
            name: cleanText(card.name),
            address: cleanText(card.address),
            phone: normalizePhone(card.phone),
            website: undefined,
            rating: cleanText(card.rating),
            category: cleanText(card.category),
          });
        }
      }

      console.info('[google-maps-headless] extraction finished', {
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
