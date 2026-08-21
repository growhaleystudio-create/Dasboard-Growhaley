import { GoogleScraperConnector } from '../backend/dist/connector/google-scraper.js';

async function main() {
  const scraper = new GoogleScraperConnector();
  console.log('Testing scraper for: hotel in bali');
  const results = await scraper.fetch({
    keywords: ['hotel'],
    location: 'bali',
    niche: 'hotel'
  }, new AbortController().signal);
  console.log('Results count:', results.length);
  results.slice(0, 5).forEach((r, i) => {
    console.log(`[${i+1}] Name: ${r.name} | Location: ${r.location} | Snippet: ${r.postSnippet}`);
  });
}

main().catch(console.error);
