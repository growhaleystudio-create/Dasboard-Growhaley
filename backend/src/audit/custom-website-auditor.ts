import type { WebsiteAuditSummary } from '@leads-generator/shared';
import { isBusinessWebsiteUrl, normalizeWebsiteCandidate } from '../url/business-website.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const CTA_PATTERN = /(hubungi|konsultasi|booking|pesan sekarang|order now|contact us|get started|whatsapp)/gi;
const PARKED_PATTERN = /(domain for sale|this domain is for sale|parked|coming soon|under construction|buy this domain)/i;

export interface CustomWebsiteAuditor {
  audit(url: string): Promise<WebsiteAuditSummary>;
}

export class BasicHtmlWebsiteAuditor implements CustomWebsiteAuditor {
  async audit(url: string): Promise<WebsiteAuditSummary> {
    const normalizedUrl = normalizeAuditUrl(url);
    if (!normalizedUrl) {
      return unknownAudit(url);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      const response = await fetch(normalizedUrl, {
        signal: controller.signal,
        headers: {
          'user-agent': 'LeadsGeneratorAuditBot/1.0 (+https://local.audit)',
        },
        redirect: 'follow',
      });

      const html = await response.text();
      const responseTimeMs = Date.now() - startedAt;
      const lowerHtml = html.toLowerCase();
      const finalUrl = response.url || normalizedUrl;
      const title = extractTagText(html, 'title');
      const metaDescription = extractMetaContent(html, 'description');
      const canonical = extractCanonical(html);
      const headings = extractHeadings(html);
      const images = extractImageTags(html);
      const imageCount = images.length;
      const imagesMissingAlt = images.filter((img) => !/\salt\s*=\s*['"][^'"]+['"]/i.test(img)).length;
      const requestLikeAssetCount = countMatches(lowerHtml, /<(script|img|link)\b/g);
      const renderBlockingScriptCount = countMatches(
        html,
        /<script\b(?![^>]*\b(?:async|defer)\b)[^>]*src=/gi,
      );
      const lazyImageCount = countMatches(html, /<img\b[^>]*loading\s*=\s*['"]lazy['"]/gi);
      const sizedImageCount = countMatches(
        html,
        /<img\b[^>]*\bwidth\s*=\s*['"][^'"]+['"][^>]*\bheight\s*=\s*['"][^'"]+['"]/gi,
      );
      const h1Count = countMatches(html, /<h1\b/gi);
      const ctaCount = countMatches(html, CTA_PATTERN);
      const parkedSignals = collectParkedSignals(title, lowerHtml);
      const issues = buildIssues({
        response,
        h1Count,
        html,
        ctaCount,
        parkedSignals,
        imagesMissingAlt,
        imageCount,
        ...(title ? { title } : {}),
        ...(metaDescription ? { metaDescription } : {}),
        ...(canonical ? { canonical } : {}),
      });

      return {
        status: parkedSignals.length > 0 ? 'parked' : response.ok ? 'ok' : 'inactive',
        url: normalizedUrl,
        finalUrl,
        httpsEnabled: finalUrl.toLowerCase().startsWith('https://'),
        responseTimeMs,
        htmlSizeKb: Math.round(Buffer.byteLength(html, 'utf8') / 1024),
        requestLikeAssetCount,
        renderBlockingScriptCount,
        lazyImageRatio: imageCount > 0 ? lazyImageCount / imageCount : 1,
        missingImageDimensionRatio: imageCount > 0 ? 1 - sizedImageCount / imageCount : 0,
        hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
        hasTitle: Boolean(title),
        hasMetaDescription: Boolean(metaDescription),
        hasCanonical: Boolean(canonical),
        hasRobotsTxt: await checkExists(new URL('/robots.txt', finalUrl).toString()),
        hasSitemap: await checkExists(new URL('/sitemap.xml', finalUrl).toString()),
        h1Count,
        headingOrderScore: scoreHeadingOrder(headings),
        hasContactLink: /href=["'](tel:|mailto:|https?:\/\/wa\.me\/|https?:\/\/api\.whatsapp\.com\/)/i.test(html),
        hasWhatsappLink: /wa\.me\/|api\.whatsapp\.com\/send/i.test(html),
        hasPhoneLink: /href=["']tel:/i.test(html),
        hasEmailLink: /href=["']mailto:/i.test(html),
        hasContactForm: /<form\b/i.test(html),
        ctaCount,
        imageCount,
        imagesMissingAlt,
        securityHeaderCount: countSecurityHeaders(response.headers),
        mixedContentDetected: /http:\/\//i.test(html.replace(finalUrl, '')),
        parkedSignals,
        issues,
        ...(title ? { title } : {}),
        ...(metaDescription ? { metaDescription } : {}),
      };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError';
      return {
        ...unknownAudit(normalizedUrl),
        status: timedOut ? 'timeout' : 'fetch_failed',
        issues: [timedOut ? 'Website timeout saat di-fetch.' : error instanceof Error ? error.message : 'Fetch failed'],
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeAuditUrl(url: string): string | null {
  const normalized = normalizeWebsiteCandidate(url);
  if (!normalized) return null;
  if (!isBusinessWebsiteUrl(normalized)) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `https://${normalized}`;
}

function unknownAudit(url: string): WebsiteAuditSummary {
  return {
    status: 'unknown',
    url,
    httpsEnabled: url.toLowerCase().startsWith('https://'),
    hasViewport: false,
    hasTitle: false,
    hasMetaDescription: false,
    hasCanonical: false,
    hasRobotsTxt: false,
    hasSitemap: false,
    h1Count: 0,
    hasContactLink: false,
    hasWhatsappLink: false,
    hasPhoneLink: false,
    hasEmailLink: false,
    hasContactForm: false,
    ctaCount: 0,
    imageCount: 0,
    imagesMissingAlt: 0,
    securityHeaderCount: 0,
    mixedContentDetected: false,
    parkedSignals: [],
    issues: ['Website audit belum tersedia.'],
  };
}

function extractTagText(html: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(html);
  return match?.[1]?.replace(/<[^>]+>/g, '').trim() || undefined;
}

function extractMetaContent(html: string, name: string): string | undefined {
  const match = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i').exec(html);
  return match?.[1]?.trim() || undefined;
}

function extractCanonical(html: string): string | undefined {
  const match = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(html);
  return match?.[1]?.trim() || undefined;
}

function extractHeadings(html: string): string[] {
  return [...html.matchAll(/<(h[1-6])\b[^>]*>/gi)]
    .map((match) => match[1])
    .filter((heading): heading is string => typeof heading === 'string')
    .map((heading) => heading.toLowerCase());
}

function extractImageTags(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function scoreHeadingOrder(headings: string[]): number {
  if (headings.length === 0) return 0;
  let score = 100;
  let previous = Number(headings[0]?.slice(1) ?? '1');

  for (const heading of headings.slice(1)) {
    const current = Number(heading.slice(1));
    if (current - previous > 1) score -= 20;
    previous = current;
  }

  return Math.max(0, score);
}

function collectParkedSignals(title: string | undefined, lowerHtml: string): string[] {
  const signals: string[] = [];
  if (title && PARKED_PATTERN.test(title)) signals.push(`title:${title}`);
  if (PARKED_PATTERN.test(lowerHtml)) signals.push('body:parked-keyword');
  if (lowerHtml.trim().length < 300) signals.push('body:too-short');
  return signals;
}

function buildIssues(input: {
  response: Response;
  title?: string;
  metaDescription?: string;
  canonical?: string;
  h1Count: number;
  html: string;
  ctaCount: number;
  parkedSignals: string[];
  imagesMissingAlt: number;
  imageCount: number;
}): string[] {
  const issues: string[] = [];
  if (!input.response.ok) issues.push(`HTTP status ${input.response.status}`);
  if (!input.title) issues.push('Title tag tidak ditemukan.');
  if (!input.metaDescription) issues.push('Meta description tidak ditemukan.');
  if (!input.canonical) issues.push('Canonical URL tidak ditemukan.');
  if (input.h1Count === 0) issues.push('Heading H1 tidak ditemukan.');
  if (!/<meta[^>]+name=["']viewport["']/i.test(input.html)) issues.push('Viewport mobile belum di-set.');
  if (input.ctaCount === 0) issues.push('CTA atau link kontak tidak jelas.');
  if (input.imageCount > 0 && input.imagesMissingAlt > 0) {
    issues.push('Sebagian gambar belum punya alt text.');
  }
  if (input.parkedSignals.length > 0) issues.push('Halaman terindikasi parked / placeholder.');
  return issues;
}

async function checkExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

function countSecurityHeaders(headers: Headers): number {
  const keys = [
    'content-security-policy',
    'strict-transport-security',
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
  ];
  return keys.filter((key) => headers.get(key)).length;
}
