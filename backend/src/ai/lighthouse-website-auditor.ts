import type { PublicWebsiteAudit } from '@leads-generator/shared';
import lighthouse from 'lighthouse';
import { launch, getChromePath } from 'chrome-launcher';

export interface WebsiteAuditor {
  audit(url: string): Promise<PublicWebsiteAudit>;
}

const NO_WEBSITE_AUDIT: PublicWebsiteAudit = {
  status: 'not_applicable_no_website',
  url: '',
  signals: emptySignals(),
  issues: ['Lead tidak memiliki website bisnis yang bisa diaudit.'],
  solutions: ['Bangun website bisnis dengan CTA kontak/konsultasi yang jelas.'],
  uxFlowSignals: ['Tidak ada conversion flow website yang tersedia.'],
  visualSignals: ['Tidak ada tampilan website resmi yang bisa membangun trust.'],
};

class ConcurrencyLimiter {
  private activeCount = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly limit: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

export class LighthouseWebsiteAuditor implements WebsiteAuditor {
  private static readonly limiter = new ConcurrencyLimiter(2);

  async audit(url: string): Promise<PublicWebsiteAudit> {
    return LighthouseWebsiteAuditor.limiter.run(async () => {
      const normalizedUrl = normalizeAuditUrl(url);
      if (!normalizedUrl) return NO_WEBSITE_AUDIT;

      const startedAt = Date.now();
      let chrome: Awaited<ReturnType<typeof launch>> | undefined;

      try {
        chrome = await launch({
          chromePath: resolveChromePath(),
          chromeFlags: [
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
          ],
        });

        const runnerResult = await lighthouse(normalizedUrl, {
          port: chrome.port,
          logLevel: 'error',
          output: 'json',
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
          formFactor: 'mobile',
          screenEmulation: {
            mobile: true,
            width: 390,
            height: 844,
            deviceScaleFactor: 3,
            disabled: false,
          },
        });

        const lhr = runnerResult?.lhr;
        if (!lhr) {
          return failedAudit(normalizedUrl, 'fetch_failed', startedAt, ['Lighthouse tidak mengembalikan hasil audit.']);
        }

        const finalUrl = stringField(lhr.finalDisplayedUrl) ?? stringField(lhr.finalUrl) ?? normalizedUrl;
        const pageMeta = pageMetaFromLhr(lhr);
        const httpStatus = pageMeta.httpStatus;
        const lighthouseMetrics = compactObject({
          performanceScore: scoreField(lhr.categories?.performance?.score),
          accessibilityScore: scoreField(lhr.categories?.accessibility?.score),
          bestPracticesScore: scoreField(lhr.categories?.['best-practices']?.score),
          seoScore: scoreField(lhr.categories?.seo?.score),
          firstContentfulPaintMs: auditNumeric(lhr.audits, 'first-contentful-paint'),
          largestContentfulPaintMs: auditNumeric(lhr.audits, 'largest-contentful-paint'),
          cumulativeLayoutShift: auditNumeric(lhr.audits, 'cumulative-layout-shift'),
          totalBlockingTimeMs: auditNumeric(lhr.audits, 'total-blocking-time'),
          speedIndexMs: auditNumeric(lhr.audits, 'speed-index'),
          timeToInteractiveMs: auditNumeric(lhr.audits, 'interactive'),
          interactionToNextPaintMs:
            auditNumeric(lhr.audits, 'experimental-interaction-to-next-paint') ??
            auditNumeric(lhr.audits, 'interaction-to-next-paint'),
        }) as LighthouseMetrics;
        const anchorItems = detailsItems(lhr.audits?.['crawlable-anchors']?.details);
        const whatsappContact = extractWhatsappContact(
          anchorItems.map((item) => {
            const href = stringField(item.href);
            const text = stringField(item.text) ?? nestedStringField(item.node, 'snippet');
            return {
              ...(href ? { href } : { href: '' }),
              ...(text ? { text } : { text: '' }),
            };
          }),
        );
        const signals = signalsFromLhr(lhr);
        const issues = buildIssues(lighthouseMetrics, signals, finalUrl);
        const solutions = buildSolutions(lighthouseMetrics, signals, finalUrl);

        const loadTimeSeconds = secondsFromMs(lighthouseMetrics.largestContentfulPaintMs ?? lighthouseMetrics.speedIndexMs);

        return {
          status: 'ok',
          url: normalizedUrl,
          finalUrl,
          ...whatsappContact,
          ...(httpStatus !== undefined ? { httpStatus } : {}),
          ...(loadTimeSeconds !== undefined ? { loadTimeSeconds } : {}),
          httpsEnabled: finalUrl.toLowerCase().startsWith('https://'),
          isMobileFriendly: signals.hasViewport,
          lighthouse: lighthouseMetrics,
          ...pageMeta,
          signals,
          issues,
          solutions,
          uxFlowSignals: buildUxFlowSignals(signals),
          visualSignals: buildVisualSignals(lighthouseMetrics, signals),
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Lighthouse audit gagal.';
        const status = /timeout|timed out/i.test(message) ? 'timeout' : 'fetch_failed';
        return failedAudit(normalizedUrl, status, startedAt, [message]);
      } finally {
        try {
          chrome?.kill();
        } catch {
          // Chrome may already be gone; the audit result above is still usable.
        }
      }
    });
  }
}

function normalizeAuditUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^(https?:)?\/\/(?:www\.)?openstreetmap\.org\//i.test(trimmed)) return null;
  if (/instagram\.com|facebook\.com|fb\.com|threads\.net|linkedin\.com|twitter\.com|x\.com/i.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function resolveChromePath() {
  try {
    return getChromePath();
  } catch {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
}

function failedAudit(
  url: string,
  status: 'fetch_failed' | 'timeout',
  startedAt: number,
  rawIssues: string[],
): PublicWebsiteAudit {
  const loadTimeSeconds = secondsFromMs(Date.now() - startedAt);
  return {
    status,
    url,
    ...(loadTimeSeconds !== undefined ? { loadTimeSeconds } : {}),
    httpsEnabled: url.toLowerCase().startsWith('https://'),
    signals: emptySignals(),
    issues: rawIssues.map((issue) => `Audit Lighthouse gagal: ${issue}`).slice(0, 3),
    solutions: [
      'Cek apakah website bisa diakses publik tanpa blokir bot/headless browser.',
      'Jalankan ulang audit saat koneksi stabil atau gunakan PageSpeed Insights API sebagai fallback.',
    ],
    uxFlowSignals: ['UX flow tidak bisa dinilai karena halaman gagal diaudit.'],
    visualSignals: ['Visual website tidak bisa dinilai karena halaman gagal diaudit.'],
  };
}

function emptySignals(): PublicWebsiteAudit['signals'] {
  return {
    hasViewport: false,
    hasContactLink: false,
    hasWhatsapp: false,
    hasEmailLink: false,
    hasPhoneLink: false,
    hasForm: false,
    ctaLabels: [],
    headings: [],
    imageCount: 0,
    imagesMissingAlt: 0,
    scriptCount: 0,
    stylesheetCount: 0,
  };
}

export function extractWhatsappContact(
  links: { href?: string; text?: string }[],
): { whatsappUrl?: string; whatsappNumber?: string } {
  for (const link of links) {
    const href = typeof link.href === 'string' ? link.href.trim() : '';
    if (!href) continue;

    const waMeMatch = /^https?:\/\/wa\.me\/(\d+)/i.exec(href);
    if (waMeMatch?.length && waMeMatch[1]) {
      const whatsappNumber = waMeMatch[1];
      return {
        whatsappUrl: `https://wa.me/${whatsappNumber}`,
        whatsappNumber,
      };
    }

    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      continue;
    }

    if (/^api\.whatsapp\.com$/i.test(parsed.hostname) && parsed.pathname === '/send') {
      const whatsappDigits = parsed.searchParams.get('phone')?.replace(/\D/g, '') ?? '';
      if (whatsappDigits) {
        return {
          whatsappUrl: `https://wa.me/${whatsappDigits}`,
          whatsappNumber: whatsappDigits,
        };
      }
    }
  }

  return {};
}

function signalsFromLhr(lhr: LighthouseResult): PublicWebsiteAudit['signals'] {
  const dom = detailsItems(lhr.audits?.['dom-size']?.details);
  const links = detailsItems(lhr.audits?.['crawlable-anchors']?.details);
  const imageAltItems = detailsItems(lhr.audits?.['image-alt']?.details);
  const headings = textItemsFromAudit(lhr.audits, 'heading-order').slice(0, 6);
  const ctaLabels = links
    .map((item) => stringField(item.text) ?? nestedStringField(item.node, 'snippet') ?? '')
    .filter((item) => /contact|kontak|hubungi|booking|book|order|daftar|register|consult|konsultasi|whatsapp|wa/i.test(item))
    .slice(0, 8);
  const linkText = links
    .map((item) => `${stringField(item.href) ?? ''} ${stringField(item.text) ?? ''}`)
    .join(' ');

  return {
    hasViewport: auditScorePass(lhr.audits, 'viewport'),
    hasContactLink: /contact|kontak|hubungi|consult|konsultasi|booking|whatsapp|wa\.me/i.test(linkText),
    hasWhatsapp: /wa\.me|whatsapp/i.test(linkText),
    hasEmailLink: /mailto:/i.test(linkText),
    hasPhoneLink: /tel:/i.test(linkText),
    hasForm: textItemsFromAudit(lhr.audits, 'forms').length > 0 || /<form/i.test(JSON.stringify(lhr.audits).slice(0, 20_000)),
    ctaLabels: unique(ctaLabels),
    headings,
    imageCount: Math.max(0, imageAltItems.length),
    imagesMissingAlt: Math.max(0, imageAltItems.length),
    scriptCount: countDomNodes(dom, 'script'),
    stylesheetCount: countDomNodes(dom, 'link'),
  };
}

function buildIssues(metrics: LighthouseMetrics, signals: PublicWebsiteAudit['signals'], finalUrl: string) {
  const issues: string[] = [];
  if ((metrics.performanceScore ?? 100) < 50) issues.push(`Performance score rendah: ${metrics.performanceScore}/100.`);
  if ((metrics.largestContentfulPaintMs ?? 0) > 2500) issues.push(`LCP lambat: ${formatMs(metrics.largestContentfulPaintMs)}. Target ideal <= 2.5 detik.`);
  if ((metrics.cumulativeLayoutShift ?? 0) > 0.1) issues.push(`CLS tinggi: ${metrics.cumulativeLayoutShift}. Layout berpotensi bergeser saat load.`);
  if ((metrics.totalBlockingTimeMs ?? 0) > 200) issues.push(`Total Blocking Time tinggi: ${formatMs(metrics.totalBlockingTimeMs)}. JavaScript berpotensi menghambat interaksi.`);
  if ((metrics.speedIndexMs ?? 0) > 3400) issues.push(`Speed Index lambat: ${formatMs(metrics.speedIndexMs)}. Konten visual muncul terlalu lama.`);
  if (!finalUrl.toLowerCase().startsWith('https://')) issues.push('Website tidak menggunakan HTTPS.');
  if (!signals.hasViewport) issues.push('Meta viewport tidak lolos audit, indikasi pengalaman mobile buruk.');
  if (!signals.hasContactLink && !signals.hasForm) issues.push('CTA kontak/form tidak terdeteksi jelas pada halaman.');
  if (signals.imagesMissingAlt > 0) issues.push(`${signals.imagesMissingAlt} gambar terdeteksi tanpa alt text yang memadai.`);
  return issues.length > 0 ? issues.slice(0, 8) : ['Core Web Vitals dan sinyal UX dasar tidak menunjukkan masalah besar pada audit ini.'];
}

function buildSolutions(metrics: LighthouseMetrics, signals: PublicWebsiteAudit['signals'], finalUrl: string) {
  const solutions: string[] = [];
  if ((metrics.largestContentfulPaintMs ?? 0) > 2500 || (metrics.speedIndexMs ?? 0) > 3400) {
    solutions.push('Optimasi LCP dengan kompresi gambar hero, preload asset kritikal, caching, dan pengurangan render-blocking CSS/JS.');
  }
  if ((metrics.totalBlockingTimeMs ?? 0) > 200) {
    solutions.push('Kurangi JavaScript blocking dengan code splitting, defer script pihak ketiga, dan hapus dependency frontend yang tidak perlu.');
  }
  if ((metrics.cumulativeLayoutShift ?? 0) > 0.1) {
    solutions.push('Tetapkan width/height media, reserve space untuk embed/banner, dan hindari inject elemen di atas konten saat load.');
  }
  if (!finalUrl.toLowerCase().startsWith('https://')) solutions.push('Aktifkan HTTPS dan redirect HTTP ke HTTPS.');
  if (!signals.hasViewport) solutions.push('Tambahkan meta viewport dan audit ulang layout mobile.');
  if (!signals.hasContactLink && !signals.hasForm) {
    solutions.push('Tambahkan CTA kontak/konsultasi yang terlihat di above-the-fold dan sticky/mobile-friendly.');
  }
  if (signals.imagesMissingAlt > 0) solutions.push('Tambahkan alt text deskriptif pada gambar penting untuk aksesibilitas dan SEO.');
  return solutions.length > 0 ? solutions.slice(0, 8) : ['Pertahankan performa, monitor Core Web Vitals, dan audit ulang setelah perubahan konten besar.'];
}

function buildUxFlowSignals(signals: PublicWebsiteAudit['signals']) {
  const output: string[] = [];
  output.push(signals.hasContactLink || signals.hasForm ? 'Jalur kontak/konversi terdeteksi.' : 'Jalur kontak/konversi tidak terdeteksi jelas.');
  if (signals.ctaLabels.length > 0) output.push(`CTA terdeteksi: ${signals.ctaLabels.join(', ')}.`);
  if (signals.hasWhatsapp) output.push('WhatsApp tersedia sebagai jalur konversi cepat.');
  if (signals.hasEmailLink) output.push('Email link tersedia sebagai jalur kontak.');
  if (signals.hasPhoneLink) output.push('Phone link tersedia sebagai jalur kontak mobile.');
  return output;
}

function buildVisualSignals(metrics: LighthouseMetrics, signals: PublicWebsiteAudit['signals']) {
  const output: string[] = [];
  if ((metrics.performanceScore ?? 100) < 70) output.push('Kesan visual awal berisiko buruk karena performa render rendah.');
  if ((metrics.cumulativeLayoutShift ?? 0) > 0.1) output.push('Stabilitas visual kurang baik karena CLS tinggi.');
  if (signals.headings.length > 0) output.push(`Heading utama terdeteksi: ${signals.headings.slice(0, 3).join(' | ')}.`);
  if (signals.imagesMissingAlt > 0) output.push('Beberapa aset visual kurang deskriptif untuk aksesibilitas.');
  return output.length > 0 ? output : ['Sinyal visual dasar tidak menunjukkan masalah besar dari Lighthouse.'];
}

function pageMetaFromLhr(lhr: LighthouseResult): Partial<Pick<PublicWebsiteAudit, 'title' | 'metaDescription' | 'httpStatus'>> {
  const title = stringField(lhr.audits?.['document-title']?.displayValue) ?? stringField(lhr.audits?.['document-title']?.title);
  const metaDescription = stringField(lhr.audits?.['meta-description']?.displayValue);
  const networkRequests = detailsItems(lhr.audits?.['network-requests']?.details);
  const documentRequest = networkRequests.find((item) => stringField(item.resourceType) === 'Document');
  const statusCode = numberField(documentRequest?.statusCode);
  return {
    ...(title ? { title } : {}),
    ...(metaDescription ? { metaDescription } : {}),
    ...(statusCode ? { httpStatus: statusCode } : {}),
  };
}

interface LighthouseResult {
  finalUrl?: unknown;
  finalDisplayedUrl?: unknown;
  fetchTime?: unknown;
  categories?: Record<string, { score?: unknown } | undefined>;
  audits?: Record<string, LighthouseAudit | undefined>;
}

interface LighthouseAudit {
  score?: unknown;
  numericValue?: unknown;
  displayValue?: unknown;
  title?: unknown;
  details?: unknown;
}

type LighthouseMetrics = NonNullable<PublicWebsiteAudit['lighthouse']>;

function auditNumeric(audits: LighthouseResult['audits'], id: string): number | undefined {
  return numberField(audits?.[id]?.numericValue);
}

function auditScorePass(audits: LighthouseResult['audits'], id: string): boolean {
  const score = numberField(audits?.[id]?.score);
  return score !== undefined && score >= 0.9;
}

function scoreField(value: unknown): number | undefined {
  const score = numberField(value);
  return score === undefined ? undefined : Math.round(score * 100);
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function nestedStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  return stringField((value as Record<string, unknown>)[key]);
}

function secondsFromMs(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round((value / 1000) * 100) / 100;
}

function formatMs(value: number | undefined): string {
  if (value === undefined) return '-';
  if (value >= 1000) return `${secondsFromMs(value)} detik`;
  return `${Math.round(value)} ms`;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function detailsItems(value: unknown): Record<string, unknown>[] {
  if (typeof value !== 'object' || value === null) return [];
  const items = (value as Record<string, unknown>).items;
  return Array.isArray(items) ? items.filter(isRecord) : [];
}

function textItemsFromAudit(audits: LighthouseResult['audits'], id: string): string[] {
  return detailsItems(audits?.[id]?.details)
    .map((item) => stringField(item.text) ?? stringField(item.label) ?? nestedStringField(item.node, 'snippet'))
    .filter((item): item is string => Boolean(item))
    .slice(0, 8);
}

function countDomNodes(items: Record<string, unknown>[], selector: string): number {
  return items.filter((item) => stringField(item.selector)?.includes(selector)).length;
}

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}


