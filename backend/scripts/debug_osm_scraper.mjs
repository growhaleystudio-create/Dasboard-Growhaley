process.env.DEBUG_OSM_SCRAPER = '1';

const keyword = process.argv[2] ?? 'cafe';
const location = process.argv[3] ?? 'Bandung';

const { GoogleScraperConnector } = await import('../dist/connector/google-scraper.js');

const connector = new GoogleScraperConnector();
const startedAt = performance.now();
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 90_000);

try {
  const prospects = await connector.fetch({
    keywords: [keyword],
    niche: keyword,
    location,
  }, controller.signal);

  console.log(JSON.stringify({
    ok: true,
    durationMs: Math.round(performance.now() - startedAt),
    count: prospects.length,
    sample: prospects.slice(0, 5),
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    durationMs: Math.round(performance.now() - startedAt),
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : String(error),
  }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
