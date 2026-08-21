async function testLiveScrape(keywords, location) {
  const q = `${keywords} ${location} kontak whatsapp OR website`.trim();
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  
  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });

  const html = await res.text();
  console.log('Status:', res.status, 'HTML length:', html.length);

  // Extract titles, links, snippets
  const results = [];
  const resultBlocks = html.split('<div class="result results_links');
  
  for (let i = 1; i < resultBlocks.length; i++) {
    const block = resultBlocks[i];
    
    // Title & Link
    const titleMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/) || block.match(/<a class="result__url[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const linkMatch = block.match(/<a class="result__url"[^>]*href="([^"]+)"/);
    const titleHeader = block.match(/<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

    if (titleHeader) {
      const rawTitle = titleHeader[2].replace(/<[^>]+>/g, '').trim();
      const rawUrl = titleHeader[1];
      const rawSnippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      
      // Clean URL from duckduckgo redirect if present
      let finalUrl = rawUrl;
      const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        finalUrl = decodeURIComponent(uddgMatch[1]);
      }

      // Extract potential phone / WA from snippet
      const waMatch = (rawTitle + ' ' + rawSnippet).match(/(?:08|\+628|628)\d{8,12}/);
      const phone = waMatch ? waMatch[0] : null;

      results.push({
        title: rawTitle,
        url: finalUrl,
        phone,
        snippet: rawSnippet
      });
    }
  }

  console.log(`Found ${results.length} live search results:`);
  results.slice(0, 8).forEach((r, idx) => {
    console.log(`\n[${idx + 1}] ${r.title}`);
    console.log(`    URL: ${r.url}`);
    console.log(`    Phone/WA: ${r.phone || 'N/A'}`);
    console.log(`    Snippet: ${r.snippet.slice(0, 100)}...`);
  });
}

testLiveScrape('hotel', 'bali');
