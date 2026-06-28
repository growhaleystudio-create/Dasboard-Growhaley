# PRD: Google Maps Headless Scraping Connector

**Version**: 1.0  
**Date**: 2026-06-28  
**Status**: Draft  
**Author**: Brainstorming session  

---

## 1. Problem Statement

### Current State
Saat ini Leads Generator mengandalkan **third-party API** untuk mendapatkan data leads:
- **Apify Google Maps** — butuh API key berbayar, quota terbatas, ketergantungan penuh ke service pihak ketiga
- **OSM Scraper** — gratis tapi data terbatas (nama, alamat), tidak ada rating, website, atau info kontak lengkap

Tim tidak punya **scraping engine sendiri** yang bisa diandalkan tanpa biaya API dan tanpa batasan quota.

### Pain Points
1. **Ketergantungan third-party**: Kalau Apify down atau limit tercapai, leads berhenti masuk
2. **Biaya**: Apify berbayar per scrape, OSM gratisan tapi data kurang kaya
3. **Data freshness**: Tidak bisa scrape on-demand saat butuh data terbaru
4. **No control**: Tidak bisa custom extraction logic (misal scrape field spesifik yang tidak disediakan API)

### Opportunity
Dengan Playwright (headless browser), kita bisa scrape Google langsung tanpa API key, tanpa quota, tanpa biaya. Data yang didapat lebih kaya (rating, website, kontak) dibanding OSM, dan gratis dibanding Apify.

---

## 2. Goals & Success Metrics

### Goals
| # | Goal | Priority |
|---|---|---|
| G1 | User bisa trigger scrape on-demand dari dashboard | P0 |
| G2 | Data leads hasil scrape masuk otomatis ke pipeline (dedup, persist) | P0 |
| G3 | Scrape berjalan di background tanpa blocking UI | P0 |
| G4 | Scrape menggunakan Playwright headless browser — zero third-party API | P0 |
| G5 | Scrape tidak mengganggu worker lain (AI, survey) | P1 |

### Success Metrics
| Metric | Target |
|---|---|
| Leads baru per scrape | ≥ 3 hasil per keyword |
| Scrape success rate | ≥ 80% |
| Waktu scrape per keyword | ≤ 30 detik |
| Worker uptime | Tidak ada crash yang bawa down worker lain |
| User bisa scrape tanpa training | Cukup isi keyword + klik submit |

---

## 3. User Personas

### Primary: Admin / Team Member
- **Siapa**: Orang yang manage leads di dashboard
- **Butuh**: Cara cepat dapat leads baru tanpa nunggu scheduler
- **Pain point**: "Gue lagi cari cafe di Bandung, masa harus nunggu besok?"

### Secondary: Developer / Maintainer
- **Siapa**: Yang maintain infra scraping
- **Butuh**: Scraper yang gampang di-debug, log jelas, error terisolasi
- **Pain point**: "Jangan sampe scraper crash bawa mati worker AI"

---

## 4. User Stories

| ID | Story | Acceptance Criteria |
|---|---|---|
| US1 | Sebagai admin, saya bisa trigger scrape dari halaman connectors | Klik "Scrape Sekarang" → modal keyword/lokasi → submit → toast sukses |
| US2 | Sebagai admin, saya lihat leads hasil scrape dalam waktu < 2 menit | Leads baru muncul di `/dashboard/leads` setelah scrape selesai |
| US3 | Sebagai admin, saya dapat data leads yang lengkap | Nama, alamat, rating, website, telepon (jika tersedia di Google) |
| US4 | Sebagai admin, saya tidak bisa submit scrape baru kalau masih ada yang berjalan | Error 409 "another scrape already running" |
| US5 | Sebagai developer, scrape error tidak mengganggu worker AI/survey | Crash scraper → AI worker tetap jalan |

---

## 5. Functional Requirements

### FR1: Scrape Trigger
- **FR1.1**: `POST /api/teams/:teamId/scrape` dengan body `{ keyword, location? }`
- **FR1.2**: Keyword wajib (1–100 karakter), lokasi opsional (0–200 karakter)
- **FR1.3**: Hanya satu scrape aktif per team dalam satu waktu (anti-overlap)

### FR2: Scraping Engine
- **FR2.1**: Buka `google.com/search?q={keyword}+{location}` via Playwright
- **FR2.2**: Parse Places/Knowledge sidebar untuk ekstrak data bisnis
- **FR2.3**: Data yang diekstrak: name, address, phone, website, rating, category
- **FR2.4**: Timeout 30 detik per scrape

### FR3: Integration
- **FR3.1**: Hasil scrape masuk ke pipeline yang sudah ada (normalize, dedup, persist)
- **FR3.2**: Duplikat otomatis terdeteksi dan tidak insert ulang
- **FR3.3**: Source tercatat sebagai `google-maps-headless`

### FR4: UI
- **FR4.1**: Tombol "Scrape Sekarang" di halaman `/dashboard/connectors`
- **FR4.2**: Modal input: keyword, lokasi, submit
- **FR4.3**: Loading state saat menunggu response
- **FR4.4**: Toast sukses/gagal setelah submit

### FR5: Queue
- **FR5.1**: Job masuk BullMQ queue `google-maps-scrape`
- **FR5.2**: Concurrency 1
- **FR5.3**: Attempts 1, auto-remove setelah complete

---

## 6. Non-Functional Requirements

| # | Requirement | Detail |
|---|---|---|
| NFR1 | Isolation | Scraper crash tidak boleh membawa down worker AI/survey |
| NFR2 | Performance | Scrape ≤ 30 detik per keyword |
| NFR3 | Memory | Playwright browser dibuka per-job, ditutup setelah selesai |
| NFR4 | Reliability | Retry 1x kalau Google block, lalu gagal gracefully |
| NFR5 | Observability | Log jumlah hasil, error, dan durasi per scrape |

---

## 7. Out of Scope (V1)

- ❌ Scheduled/cron scraping otomatis
- ❌ Proxy rotation & captcha solving
- ❌ Multi-page scrolling (ambil lebih dari top results)
- ❌ Enrichment leads yang sudah ada
- ❌ Support multiple concurrent scrape per team
- ❌ Custom extraction rules per user

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Google deteksi bot & block IP | Scrape gagal total | User-agent rotation, random delay, stealth mode |
| DOM Google berubah struktur | Parse gagal | Parse by semantic tags, alert kalau fail 3x berturut |
| Playwright OOM | Worker crash | Concurrency 1, browser close after each job, timeout |
| User abuse (spam scrape) | IP kena block | Anti-overlap, rate limit 1 per team |

---

## 9. Timeline & Phases

| Phase | Deliverable | Estimate |
|---|---|---|
| Phase 1 | Connector + worker + queue | 1-2 hari |
| Phase 2 | API endpoint + validation | 0.5 hari |
| Phase 3 | UI button + modal | 0.5 hari |
| Phase 4 | Testing & hardening | 1 hari |

**Total estimate**: 3-4 hari kerja

---

## 10. Dependencies

- **playwright** npm package (backend)
- Chromium binary (bundled with Playwright atau system-installed)
- BullMQ + Redis (sudah ada)
- Postgres (sudah ada)

---

## 11. Open Questions

1. Apakah Chromium harus di-install di server deploy, atau pakai Playwright's built-in `chromium.launch()` dengan bundled binary?
2. Apakah perlu queue terpisah untuk scheduled scraping di masa depan, atau cukup reuse queue yang sama dengan trigger berbeda?
3. Apakah perlu notifikasi (email/in-app) saat scrape selesai, atau cukup lihat di dashboard?
