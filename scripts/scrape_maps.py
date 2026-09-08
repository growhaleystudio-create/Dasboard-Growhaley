#!/usr/bin/env python3
"""
Google Maps Scraper via Playwright
Direct browser automation without external third-party APIs.

Features:
- Search any keyword/location (e.g. "barbershop jakarta selatan")
- Infinite scroll container handling
- Detail panel extraction (accurate Name, Phone/WhatsApp, Address, Rating, Website, Coordinates)
- Export to CSV or JSON
- Optional headed mode (watch browser in real-time)
"""

import argparse
import asyncio
import csv
import json
import os
import re
import sys
from urllib.parse import quote_plus
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

# Fix Windows console UTF-8 output
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

def clean_text(text: str) -> str:
    if not text:
        return ""
    # Strip Unicode Private Use Area characters (used by Google Maps for icons like  and )
    text = re.sub(r"[\ue000-\uf8ff]", "", text)
    # Remove extra whitespaces & clean common artifacts
    return " ".join(text.replace("\u202a", "").replace("\u202c", "").split()).strip()

def extract_coords_from_url(url: str):
    # Pattern 1: /@ -6.2088,106.8456,15z
    match1 = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if match1:
        return float(match1.group(1)), float(match1.group(2))
    # Pattern 2: !3d-6.229986!4d106.851059
    match2 = re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", url)
    if match2:
        return float(match2.group(1)), float(match2.group(2))
    return None, None

def normalize_phone(phone_raw: str) -> str:
    if not phone_raw:
        return ""
    cleaned = phone_raw.replace("Salin nomor telepon", "").replace("Copy phone number", "").strip()
    return clean_text(cleaned)

async def scrape_google_maps(keyword: str, max_results: int = 20, headless: bool = True):
    print(f"\n🚀 Memulai Google Maps Scraper...")
    print(f"📌 Keyword   : {keyword}")
    print(f"🎯 Target    : {max_results} leads")
    print(f"🖥️  Headless  : {headless}\n")

    results = []
    
    async with async_playwright() as p:
        # Launch browser with realistic viewport and user agent to minimize bot detection
        browser = await p.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage"
            ]
        )
        
        context = await browser.new_context(
            viewport={"width": 1366, "height": 768},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale="id-ID"
        )
        
        page = await context.new_page()

        # Direct Google Maps search URL
        search_url = f"https://www.google.com/maps/search/{quote_plus(keyword)}"
        print(f"🌐 Navigasi ke: {search_url}")
        
        try:
            await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            print(f"⚠️ Warning saat membuka halaman: {e}")

        await page.wait_for_timeout(3000)

        # Handle Google Consent popup if it appears
        try:
            consent_btn = page.locator("button:has-text('Accept all'), button:has-text('Setuju semua'), button:has-text('Saya setuju')")
            if await consent_btn.count() > 0:
                print("🛡️ Menyetujui cookie consent...")
                await consent_btn.first.click()
                await page.wait_for_timeout(2000)
        except Exception:
            pass

        # Locate the feed container
        feed_selector = 'div[role="feed"]'
        try:
            await page.wait_for_selector(feed_selector, timeout=15000)
            feed = page.locator(feed_selector)
        except PlaywrightTimeoutError:
            print("❌ Tidak menemukan container daftar hasil (div[role='feed']). Mungkin keyword terlalu spesifik atau langsung membuka 1 tempat.")
            # Check if direct single result opened
            if "/maps/place/" in page.url:
                print("ℹ️ Ditemukan langsung 1 tempat spesifik!")
                # Will extract directly below
                feed = None
            else:
                await browser.close()
                return []

        # If feed found, scroll to collect unique place links
        place_urls = []
        if feed:
            print("📜 Menggulir (scrolling) daftar hasil untuk memuat data...")
            stuck_count = 0
            
            while len(place_urls) < max_results:
                # Find all place links (class hfpxzc is standard on Google Maps result items)
                anchors = page.locator('div[role="feed"] a.hfpxzc')
                count = await anchors.count()
                
                for i in range(count):
                    href = await anchors.nth(i).get_attribute("href")
                    title = await anchors.nth(i).get_attribute("aria-label")
                    if href and href not in [item["url"] for item in place_urls]:
                        place_urls.append({"title": title, "url": href})
                        if len(place_urls) >= max_results:
                            break
                
                print(f"   Terdeteksi: {len(place_urls)} / {max_results} tempat...")
                
                if len(place_urls) >= max_results:
                    break

                # Scroll down inside feed container
                await feed.evaluate("el => el.scrollBy(0, 1500)")
                await page.wait_for_timeout(1500)

                # Check if end of list reached
                end_text = page.locator("text='You\\'ve reached the end of the list', text='Anda telah mencapai bagian akhir daftar'")
                if await end_text.count() > 0:
                    print("🏁 Telah mencapai akhir daftar Google Maps.")
                    break

                new_count = await anchors.count()
                if new_count == count:
                    stuck_count += 1
                    if stuck_count >= 4:
                        print("ℹ️ Tidak ada item baru yang dimuat setelah beberapa kali scroll.")
                        break
                else:
                    stuck_count = 0
        else:
            # Single place
            place_urls.append({"title": await page.title(), "url": page.url})

        print(f"\n🔍 Siap mengekstraksi data detail dari {len(place_urls)} tempat...\n")

        # Extract details for each place
        for idx, item in enumerate(place_urls, 1):
            url = item["url"]
            print(f"[{idx}/{len(place_urls)}] Membuka: {item.get('title') or url}...")
            
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=25000)
                await page.wait_for_timeout(2000)

                # 1. Business Name
                name = ""
                name_elem = page.locator('h1.DUwDvf')
                if await name_elem.count() > 0:
                    name = clean_text(await name_elem.first.text_content())
                elif item.get("title"):
                    name = clean_text(item["title"])

                # 2. Rating & Review Count
                rating = ""
                reviews_count = ""
                rating_container = page.locator('div.F7nice')
                if await rating_container.count() > 0:
                    rating_text = await rating_container.first.text_content()
                    # Rating text usually looks like "4,7(123)" or "4.7(123)"
                    match = re.search(r"(\d+[.,]\d+)(?:\s*\(([\d.,]+)\))?", rating_text)
                    if match:
                        rating = match.group(1).replace(",", ".")
                        if match.group(2):
                            reviews_count = match.group(2).replace(".", "").replace(",", "")

                # 3. Category
                category = ""
                cat_elem = page.locator('button.DkEaL, span.DkEaL')
                if await cat_elem.count() > 0:
                    category = clean_text(await cat_elem.first.text_content())

                # 4. Address (Pin icon / address item)
                address = ""
                addr_elem = page.locator('button[data-item-id="address"], button[data-tooltip="Salin alamat"], button[aria-label*="Alamat:"]')
                if await addr_elem.count() > 0:
                    address = clean_text(await addr_elem.first.text_content())

                # 5. Phone / WhatsApp
                phone = ""
                phone_elem = page.locator('button[data-tooltip="Salin nomor telepon"], button[data-item-id*="phone:tel:"], button[aria-label*="Telepon:"]')
                if await phone_elem.count() > 0:
                    phone_raw = await phone_elem.first.text_content()
                    phone = normalize_phone(phone_raw)

                # 6. Website
                website = ""
                web_elem = page.locator('a[data-item-id="authority"], a[aria-label*="Situs web:"], a[aria-label*="Website:"]')
                if await web_elem.count() > 0:
                    website = await web_elem.first.get_attribute("href") or ""
                    # Remove Google redirect if present
                    if "/url?q=" in website:
                        m = re.search(r"/url\?q=([^&]+)", website)
                        if m:
                            from urllib.parse import unquote
                            website = unquote(m.group(1))

                # 7. Coordinates from URL
                lat, lng = extract_coords_from_url(page.url)

                lead_data = {
                    "name": name,
                    "phone": phone,
                    "address": address,
                    "category": category,
                    "rating": rating,
                    "reviews_count": reviews_count,
                    "website": website,
                    "latitude": lat if lat else "",
                    "longitude": lng if lng else "",
                    "maps_url": page.url
                }

                results.append(lead_data)
                print(f"    ✅ Nama   : {name}")
                print(f"    📞 Telp   : {phone if phone else '-'}")
                print(f"    ⭐ Rating : {rating} ({reviews_count} reviews)")
                print(f"    📍 Alamat : {address[:50]}..." if len(address) > 50 else f"    📍 Alamat : {address}")
                print(f"    🌐 Web    : {website if website else '-'}")

            except Exception as ex:
                print(f"    ⚠️ Gagal scrape detail {url}: {ex}")

            # Small random delay between requests
            await page.wait_for_timeout(1000)

        await browser.close()

    return results

def save_to_csv(data: list, filepath: str):
    if not data:
        print("⚠️ Tidak ada data untuk disimpan.")
        return
    
    keys = ["name", "phone", "address", "category", "rating", "reviews_count", "website", "latitude", "longitude", "maps_url"]
    with open(filepath, mode="w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(data)
    print(f"\n💾 Berhasil menyimpan {len(data)} leads ke CSV: {os.path.abspath(filepath)}")

def save_to_json(data: list, filepath: str):
    if not data:
        return
    with open(filepath, mode="w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"💾 Berhasil menyimpan {len(data)} leads ke JSON: {os.path.abspath(filepath)}")

async def main():
    parser = argparse.ArgumentParser(description="Google Maps Leads Scraper via Playwright")
    parser.add_argument("-q", "--query", type=str, default="barbershop jakarta selatan", help="Keyword pencarian")
    parser.add_argument("-n", "--limit", type=int, default=10, help="Jumlah maksimal leads yang diambil")
    parser.add_argument("-o", "--output", type=str, default="leads_maps.csv", help="File output (.csv atau .json)")
    parser.add_argument("--headed", action="store_true", help="Buka browser terlihat (bukan headless)")

    args = parser.parse_args()

    leads = await scrape_google_maps(
        keyword=args.query,
        max_results=args.limit,
        headless=not args.headed
    )

    if args.output.endswith(".json"):
        save_to_json(leads, args.output)
    else:
        save_to_csv(leads, args.output)

if __name__ == "__main__":
    asyncio.run(main())
