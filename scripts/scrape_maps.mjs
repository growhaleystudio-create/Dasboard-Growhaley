import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

function cleanText(text) {
  if (!text) return '';
  return text.replace(/[\ue000-\uf8ff]/g, '').replace(/\u202a/g, '').replace(/\u202c/g, '').replace(/\s+/g, ' ').trim();
}

function extractCoordsFromUrl(url) {
  const match1 = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (match1) {
    return { lat: parseFloat(match1[1]), lng: parseFloat(match1[2]) };
  }
  const match2 = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (match2) {
    return { lat: parseFloat(match2[1]), lng: parseFloat(match2[2]) };
  }
  return { lat: null, lng: null };
}

function normalizePhone(raw) {
  if (!raw) return '';
  return cleanText(raw.replace('Salin nomor telepon', '').replace('Copy phone number', ''));
}

export async function scrapeGoogleMaps({ keyword, maxResults = 10, headless = true }) {
  console.log(`\n🚀 Memulai Google Maps Scraper (Playwright)...`);
  console.log(`📌 Keyword   : ${keyword}`);
  console.log(`🎯 Target    : ${maxResults} leads`);
  console.log(`🖥️  Headless  : ${headless}\n`);

  const browser = await chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'id-ID'
  });

  const page = await context.newPage();
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(keyword)}`;
  console.log(`🌐 Membuka: ${searchUrl}`);

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.log(`⚠️ Warning load halaman: ${err.message}`);
  }

  await page.waitForTimeout(3000);

  // Handle consent popup if any
  try {
    const consent = page.locator("button:has-text('Accept all'), button:has-text('Setuju semua'), button:has-text('Saya setuju')");
    if (await consent.count() > 0) {
      console.log(`🛡️ Menyetujui cookie dialog...`);
      await consent.first().click();
      await page.waitForTimeout(2000);
    }
  } catch {}

  const feedSelector = 'div[role="feed"]';
  let hasFeed = false;
  try {
    await page.waitForSelector(feedSelector, { timeout: 15000 });
    hasFeed = true;
  } catch {
    console.log('ℹ️ Feed list tidak ditemukan, memeriksa direct place...');
  }

  const placeUrls = [];

  if (hasFeed) {
    const feed = page.locator(feedSelector);
    console.log(`📜 Menggulir daftar hasil...`);
    let stuckCount = 0;

    while (placeUrls.length < maxResults) {
      const anchors = page.locator('div[role="feed"] a.hfpxzc');
      const count = await anchors.count();

      for (let i = 0; i < count; i++) {
        const href = await anchors.nth(i).getAttribute('href');
        const title = await anchors.nth(i).getAttribute('aria-label');
        if (href && !placeUrls.some(p => p.url === href)) {
          placeUrls.push({ title, url: href });
          if (placeUrls.length >= maxResults) break;
        }
      }

      console.log(`   Ditemukan: ${placeUrls.length} / ${maxResults} tempat...`);
      if (placeUrls.length >= maxResults) break;

      await feed.evaluate(el => el.scrollBy(0, 1500));
      await page.waitForTimeout(1500);

      const endNotice = page.locator("text='You\\'ve reached the end of the list', text='Anda telah mencapai bagian akhir daftar'");
      if (await endNotice.count() > 0) {
        console.log(`🏁 Telah mencapai akhir daftar Google Maps.`);
        break;
      }

      const newCount = await anchors.count();
      if (newCount === count) {
        stuckCount++;
        if (stuckCount >= 4) break;
      } else {
        stuckCount = 0;
      }
    }
  } else {
    placeUrls.push({ title: await page.title(), url: page.url() });
  }

  console.log(`\n🔍 Mengambil data detail dari ${placeUrls.length} tempat...\n`);
  const results = [];

  for (let idx = 0; idx < placeUrls.length; idx++) {
    const item = placeUrls[idx];
    console.log(`[${idx + 1}/${placeUrls.length}] Buka: ${item.title || item.url}...`);

    try {
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(2000);

      // Name
      let name = '';
      const nameElem = page.locator('h1.DUwDvf');
      if (await nameElem.count() > 0) {
        name = cleanText(await nameElem.first().textContent());
      } else if (item.title) {
        name = cleanText(item.title);
      }

      // Rating & Reviews
      let rating = '';
      let reviewsCount = '';
      const ratingContainer = page.locator('div.F7nice');
      if (await ratingContainer.count() > 0) {
        const ratingText = await ratingContainer.first().textContent();
        const match = ratingText.match(/(\d+[.,]\d+)(?:\s*\(([\d.,]+)\))?/);
        if (match) {
          rating = match[1].replace(',', '.');
          if (match[2]) reviewsCount = match[2].replace(/[.,]/g, '');
        }
      }

      // Category
      let category = '';
      const catElem = page.locator('button.DkEaL, span.DkEaL');
      if (await catElem.count() > 0) {
        category = cleanText(await catElem.first().textContent());
      }

      // Address
      let address = '';
      const addrElem = page.locator('button[data-item-id="address"], button[data-tooltip="Salin alamat"], button[aria-label*="Alamat:"]');
      if (await addrElem.count() > 0) {
        address = cleanText(await addrElem.first().textContent());
      }

      // Phone
      let phone = '';
      const phoneElem = page.locator('button[data-tooltip="Salin nomor telepon"], button[data-item-id*="phone:tel:"], button[aria-label*="Telepon:"]');
      if (await phoneElem.count() > 0) {
        phone = normalizePhone(await phoneElem.first().textContent());
      }

      // Website
      let website = '';
      const webElem = page.locator('a[data-item-id="authority"], a[aria-label*="Situs web:"], a[aria-label*="Website:"]');
      if (await webElem.count() > 0) {
        website = (await webElem.first().getAttribute('href')) || '';
        if (website.includes('/url?q=')) {
          const m = website.match(/\/url\?q=([^&]+)/);
          if (m) website = decodeURIComponent(m[1]);
        }
      }

      const { lat, lng } = extractCoordsFromUrl(page.url());

      const lead = {
        name,
        phone,
        address,
        category,
        rating,
        reviews_count: reviewsCount,
        website,
        latitude: lat,
        longitude: lng,
        maps_url: page.url()
      };

      results.push(lead);
      console.log(`    ✅ Nama   : ${name}`);
      console.log(`    📞 Telp   : ${phone || '-'}`);
      console.log(`    ⭐ Rating : ${rating} (${reviewsCount} reviews)`);
      console.log(`    📍 Alamat : ${address.slice(0, 50)}${address.length > 50 ? '...' : ''}`);
      console.log(`    🌐 Web    : ${website || '-'}`);
    } catch (err) {
      console.log(`    ⚠️ Error scrape detail: ${err.message}`);
    }

    await page.waitForTimeout(1000);
  }

  await browser.close();
  return results;
}

function saveToCsv(data, filepath) {
  if (!data.length) return;
  const headers = ['name', 'phone', 'address', 'category', 'rating', 'reviews_count', 'website', 'latitude', 'longitude', 'maps_url'];
  const rows = [headers.join(',')];
  
  for (const item of data) {
    const row = headers.map(h => {
      const val = item[h] != null ? String(item[h]) : '';
      return `"${val.replace(/"/g, '""')}"`;
    });
    rows.push(row.join(','));
  }

  fs.writeFileSync(filepath, '\uFEFF' + rows.join('\r\n'), 'utf8');
  console.log(`\n💾 Hasil CSV tersimpan: ${path.resolve(filepath)}`);
}

// CLI execution
if (process.argv[1] && process.argv[1].endsWith('scrape_maps.mjs')) {
  const args = process.argv.slice(2);
  let keyword = 'barbershop jakarta selatan';
  let limit = 10;
  let output = 'leads_maps.csv';
  let headless = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-q' || args[i] === '--query') keyword = args[++i];
    else if (args[i] === '-n' || args[i] === '--limit') limit = parseInt(args[++i], 10);
    else if (args[i] === '-o' || args[i] === '--output') output = args[++i];
    else if (args[i] === '--headed') headless = false;
  }

  scrapeGoogleMaps({ keyword, maxResults: limit, headless }).then(results => {
    if (output.endsWith('.json')) {
      fs.writeFileSync(output, JSON.stringify(results, null, 2), 'utf8');
      console.log(`\n💾 Hasil JSON tersimpan: ${path.resolve(output)}`);
    } else {
      saveToCsv(results, output);
    }
  });
}
