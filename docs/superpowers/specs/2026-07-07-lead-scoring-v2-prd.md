# PRD: Lead Opportunity Scoring v2 — Formula Sederhana & Explainable

**Version**: 1.0
**Date**: 2026-07-07
**Status**: Draft
**Author**: PM session (Claude + Luthfi)
**Scoring version target**: `2026-07-v2`

---

## 1. Executive Summary

Kita merombak formula lead scoring menjadi **3 pilar + 1 multiplier** (Business Value, Digital Gap, Reachability, dikali Data Confidence) yang membaca **langsung dari skor Lighthouse (SEO / UX / Performance)** — audit yang sama dengan yang ditampilkan di AI analysis — supaya angka yang dilihat user di analysis dan lead score berasal dari satu sumber, satu arah semantik ("tinggi = peluang bagus"), dan setiap score bisa dijelaskan ke sales dalam satu kalimat tanpa bertanya ke developer.

---

## 2. Problem Statement

### Current State

Lead score hari ini dihitung oleh `computeLeadOpportunityScore` (`backend/src/scoring/`): 4 pilar (businessValue, websiteNeed, reachability, confidence) dengan dua set bobot berbeda (hasWebsite vs noWebsite), lalu dikali confidence modifier.

### Pain Points (hasil audit kode, 2026-07-07)

| # | Masalah | Bukti di kode |
|---|---|---|
| P1 | **Dua audit berbeda untuk hal yang sama.** AI analysis menampilkan skor Lighthouse (`performanceScore`, `seoScore`, dst), tapi lead score dihitung dari custom parser (`WebsiteAuditSummary`) dengan heuristik sendiri (`responseTimeMs/4000`, `issues.length × 12`). Angka SEO/Perf yang dilihat user ≠ angka yang membentuk score. | `ai/lighthouse-website-auditor.ts` vs `scoring/website-need.ts` |
| P2 | **Semantik terbalik.** Sub-skor websiteNeed adalah *penalty* (tinggi = website jelek = lead bagus), sementara Lighthouse adalah *quality score* (tinggi = bagus). Dua arah berlawanan dalam satu produk. | `website-need.ts:34-97` |
| P3 | **Confidence dihitung dua kali.** Jadi pilar berbobot 5% DAN jadi multiplier 0.7–1.0. | `finalize.ts:25-33`, `constants.ts:27-40` |
| P4 | **Double-count internal di businessValue.** `activityScore` hanyalah kombinasi ulang reviews & rating yang sudah dihitung — indirection tanpa informasi baru. | `business-value.ts:19-31` |
| P5 | **Magic numbers tak bisa dijelaskan.** Default 65 saat audit kosong, `× 12` per issue, `20 − lazyImageRatio × 20`, dst. Sales bertanya "kenapa score 62?" → tidak ada jawaban manusiawi. | `website-need.ts` |
| P6 | **Satu kolom score, dua formula.** Saat scan/ingest, lead di-score pakai factor model lama (`compute-score.ts`: keyword, recency, source). Setelah AI analysis, di-overwrite oleh opportunity score. Makna angka berubah diam-diam. | `scan-pipeline.ts:146` vs `lead-opportunity-scorer.ts:77` |
| P7 | **Score antar lead tak sebanding.** Branch hasWebsite dan noWebsite pakai bobot dan sub-formula yang sama sekali berbeda; lead tanpa website bisa dapat websiteNeed lebih rendah (40) daripada lead dengan website jelek — padahal tidak punya website seharusnya kebutuhan tertinggi. | `website-need.ts:113-146`, `constants.ts` |

### Opportunity

Lighthouse audit sudah berjalan untuk AI analysis dan menghasilkan skor SEO / Accessibility / Best Practices / Performance yang standar industri, dikenal user, dan gratis dipakai ulang. Menjadikan skor itu input langsung lead score menghapus P1, P2, dan P5 sekaligus.

---

## 3. Target Users & Personas

### Primary: Sales / Outreach User
- **Siapa**: Orang yang buka dashboard, sortir leads by score, pilih siapa yang di-WhatsApp duluan.
- **Butuh**: Percaya score. Paham dalam 5 detik kenapa lead A 82 dan lead B 45.
- **Pain point**: "Score-nya 62, tapi pas kubuka AI analysis, SEO-nya 80. Ini nyambungnya gimana?"

### Secondary: Developer / Maintainer
- **Butuh**: Formula deterministik, testable, satu sumber audit, tanpa tabel bobot ganda.
- **Pain point**: Ubah satu konstanta → tak ada yang tahu efeknya ke ranking.

---

## 4. Strategic Context

- Produk ini menjual **jasa pembuatan/perbaikan website** ke bisnis lokal. Lead paling berharga = bisnis sehat (mampu bayar) + kondisi digital buruk (butuh jasa) + gampang dihubungi.
- Formula harus mencerminkan tiga pertanyaan sales itu secara literal — bukan konstruksi statistik.
- **Why now**: fitur AI analysis baru saja pindah ke Lighthouse; selama scoring masih pakai custom parser, setiap rilis memperlebar inkonsistensi yang dilihat user.

---

## 5. Solution Overview: Formula v2

### 5.1 Struktur

```
FinalScore = round( BaseScore × ConfidenceMultiplier )

BaseScore  = BusinessValue × 0.35
           + DigitalGap    × 0.40
           + Reachability  × 0.25

ConfidenceMultiplier = 0.7 + 0.3 × (Confidence / 100)     // linear 0.7–1.0
```

Prinsip desain:
1. **Satu arah semantik** — semua pilar 0–100, tinggi = peluang lebih bagus.
2. **Satu set bobot** untuk semua lead (hasWebsite & noWebsite) → score sebanding antar lead. Perbedaan branch hanya di *cara menghitung* DigitalGap, bukan di bobot pilar.
3. **Confidence hanya multiplier** (bukan pilar) — perannya "seberapa yakin kita pada data", bukan "seberapa bagus lead-nya".
4. **Inversi hanya di satu tempat** dengan nama eksplisit: `DigitalGap = 100 − WebsiteQuality`.

### 5.2 Pilar 1 — Business Value (bobot 0.35)

> "Seberapa layak bisnis ini dikejar?"

```
BusinessValue = clamp( reviews_norm × 0.6 + rating_norm × 0.4 + categoryBonus, 0, 100 )

reviews_norm  = normalizeLogCount(reviewCount)          // existing util, log-scale ke 0–100
rating_norm   = (rating / 5) × 100
categoryBonus = tabel CATEGORY_FIT_BONUS existing (0–5)
```

Perubahan vs v1: hapus `activityScore` (P4). Bobot efektif v1 sudah ≈ reviews 0.62 / rating 0.38 — v2 menuliskannya langsung.

### 5.3 Pilar 2 — Digital Gap (bobot 0.40)

> "Seberapa besar mereka butuh jasa website?"

**Branch A — punya website, audit Lighthouse sukses:**

```
WebsiteQuality = Performance × 0.30
              + SEO          × 0.25
              + UX           × 0.25
              + Conversion   × 0.20

Performance = lighthouse.performanceScore          (0–100, dipakai apa adanya)
SEO         = lighthouse.seoScore
UX          = lighthouse.accessibilityScore × 0.6 + lighthouse.bestPracticesScore × 0.4
Conversion  = checklist 0–100:
              + 40 → ada kanal kontak (WhatsApp / phone / email link)
              + 30 → ada CTA (ctaCount > 0)
              + 30 → ada contact form

DigitalGap = 100 − WebsiteQuality
```

Angka Lighthouse yang tampil di AI analysis **identik** dengan input scoring — menutup P1/P2. `Conversion` menangkap hal yang Lighthouse tidak ukur (kesiapan website menghasilkan kontak) dan sudah tersedia dari sinyal audit existing.

**Branch B — website mati / bermasalah** (tabel tetap, tanpa rumus):

| Status | DigitalGap |
|---|---|
| `parked` | 100 |
| `inactive` | 90 |
| `timeout` / `fetch_failed` | 80 |

Rasional: domain parked = sudah bayar domain tapi tak jalan → sinyal kebutuhan + intent tertinggi.

**Branch C — tidak punya website:**

```
DigitalGap = 70 + 30 × ( categoryNeed_norm × 0.5 + marketPresence_norm × 0.5 )

categoryNeed_norm   = CATEGORY_NEED_SCORE[category] / 100   (default 0.5 jika kategori tak dikenal)
marketPresence_norm = (reviews_norm × 0.6 + rating_norm × 0.4) / 100
```

Range 70–100. **Floor 70 adalah aturan ranking eksplisit**: lead tanpa website tidak pernah dianggap "kurang butuh" dibanding lead yang websitenya masih hidup (menutup P7). Bisnis ramai tanpa website (review banyak, rating tinggi) mendekati 100.

### 5.4 Pilar 3 — Reachability (bobot 0.25)

Tidak berubah dari v1 (sudah bagus dan jelas):

| Tipe kontak | Score |
|---|---|
| Mobile / WhatsApp (`08`, `628`, `62`) | 100 |
| Landline | 60 |
| Invalid (< 6 digit) | 20 |
| Tidak ada | 0 |

### 5.5 Confidence → multiplier saja

4 cek data, masing-masing bernilai 25 (skor hanya bisa 0/25/50/75/100 — gampang dijelaskan):

| Cek | Nilai |
|---|---|
| Kontak publik / WhatsApp ada | 25 |
| Sinyal bisnis ada (rating ATAU reviewCount) | 25 |
| Status website resolved (audit sukses ATAU confirmed `no_website`) | 25 |
| Timestamp discovery/acquired ada | 25 |

```
ConfidenceMultiplier = 0.7 + 0.3 × (Confidence / 100)
```

Contoh: data lengkap → ×1.0; hanya 2 cek → ×0.85. Satu kalimat ke sales: *"score dipotong 15% karena data lead belum lengkap."*

### 5.6 Score bands (untuk UI dashboard)

| Band | Range | Aksi sales |
|---|---|---|
| 🔥 Hot | 75–100 | Hubungi hari ini |
| 🌤 Warm | 55–74 | Masuk antrian minggu ini |
| 🌱 Nurture | 35–54 | Follow-up ringan / drip |
| ❄️ Cold | 0–34 | Arsip / re-scan nanti |

### 5.7 Contoh perhitungan (sanity check)

| Lead | BV | Gap | Reach | Conf | Final | Band |
|---|---|---|---|---|---|---|
| Klinik ramai, tanpa website, WA aktif | 65 | 92 | 100 | 100 | **85** | 🔥 |
| Resto, website lambat (LH Perf 30/SEO 50), WA aktif | 55 | 62 | 100 | 100 | **69** | 🌤 |
| Hotel, website bagus (Quality 85), WA aktif | 70 | 15 | 100 | 100 | **56** | 🌤 |
| Bisnis tanpa kontak, tanpa rating, tanpa website | 0 | 78 | 0 | 25 | **24** | ❄️ |

Website bagus → gap kecil → score turun. Sesuai bisnis: mereka tidak butuh jasa kita.

### 5.8 Satu sumber audit (menutup P1 & P6)

1. **Audit source of truth = Lighthouse** (`LighthouseWebsiteAuditor`). Hasil audit di-cache/persist di lead saat AI analysis; scorer **memakai ulang** hasil itu, tidak menjalankan Lighthouse kedua kali.
2. **Fallback**: jika Lighthouse gagal / belum jalan, pakai mapping dari custom parser (`WebsiteAuditSummary`) → cek confidence "status website resolved" tetap terpenuhi, `auditSource` dicatat di breakdown (field sudah ada).
3. **Score awal saat scan** (sebelum AI analysis) dihitung dengan formula v2 juga — pilar DigitalGap memakai Branch C atau fallback parser; TIDAK lagi memakai factor model lama untuk kolom `score`. Factor model (`compute-score.ts`) dipensiunkan dari jalur `score` utama (lihat Out of Scope).

---

## 6. Success Metrics

| Metric | Target |
|---|---|
| **Konsistensi angka**: skor SEO/Perf di AI analysis = input DigitalGap di breakdown (audit yang sama) | 100% leads yang punya audit Lighthouse |
| **Explainability**: setiap FinalScore punya breakdown 3 pilar + multiplier di UI, tiap pilar punya 1 kalimat alasan | 100% leads scored |
| **Ranking sanity** (unit/property tests): (a) tanpa website → Gap ≥ 70; (b) parked > website hidup ter-jelek; (c) Lighthouse naik → Gap turun (monotonic); (d) confidence turun → score tidak naik | Semua test pass |
| **Distribusi score**: tidak menggumpal di 50–70 (std dev naik vs v1 pada dataset sama) | Diverifikasi via backfill dry-run |
| **Biaya**: recompute score tidak memicu Lighthouse run baru (reuse cache) | 0 extra Lighthouse run per rescore |

Guardrail: urutan top-20 leads per tim tidak berubah total secara acak — sampling manual 20 lead sebelum/sesudah, perubahan urutan harus bisa dijelaskan oleh P1–P7.

---

## 7. Requirements (Engineering)

### Epic Hypothesis

Kami percaya menyatukan sumber audit dan menyederhanakan formula menjadi 3 pilar + 1 multiplier akan membuat sales percaya dan memakai lead score sebagai urutan kerja harian, karena selama ini score diabaikan sebab tidak bisa dijelaskan dan tidak konsisten dengan AI analysis.

### Stories

**S1 — Persist & reuse hasil Lighthouse untuk scoring**
- Simpan `lighthouse` metrics (4 skor kategori + status) di lead saat AI analysis selesai.
- `LeadOpportunityScorer.recomputeLead` membaca cache ini; hanya fallback ke custom parser jika kosong.
- AC: rescore lead yang sudah dianalisis → 0 panggilan Lighthouse baru; `auditSource` di breakdown = `lighthouse`.

**S2 — Implement formula v2 (pure functions)**
- Ganti isi `business-value.ts`, `website-need.ts` (rename konsep → `digital-gap.ts`), `confidence.ts`, `finalize.ts`, `constants.ts` sesuai §5.
- `LEAD_OPPORTUNITY_SCORING_VERSION = '2026-07-v2'`.
- AC: semua contoh di §5.7 direproduksi oleh unit test; property tests §6 pass.

**S3 — Satu formula untuk kolom `score`**
- Jalur scan/ingest memakai scorer v2 (Branch C / fallback) alih-alih `scoreAndPersist` factor model.
- AC: nilai `score` lead tidak berubah makna sebelum vs sesudah AI analysis — hanya inputnya yang makin lengkap.

**S4 — Breakdown & alasan di UI**
- Simpan per-pilar score + reason strings di `LeadScoreBreakdown`.
- UI dashboard menampilkan: FinalScore, band, 3 pilar dengan bar, multiplier + alasan potongan.
- AC: user bisa melihat "kenapa 82" tanpa membuka AI analysis.

**S5 — Backfill & migrasi**
- Recompute semua lead via `backfill-lead-scoring-breakdowns.ts` dengan versi v2; row breakdown v1 tetap tersimpan (`scoringVersion` membedakan).
- AC: dry-run menghasilkan laporan distribusi (histogram v1 vs v2) sebelum apply.

### Edge cases
- Audit Lighthouse partial (kategori null) → kategori hilang dianggap 50, confidence cek audit tetap terpenuhi, catat di reason.
- `profileUrl` bukan business website (social link) → perlakukan sebagai Branch C (no website).
- Rating ada tapi reviewCount 0 → reviews_norm 0, tetap dapat rating_norm; bukan error.
- Kategori tak dikenal → categoryNeed_norm 0.5, categoryBonus 0.

---

## 8. Out of Scope

- **Bobot custom per tim / UI pengaturan bobot** — selaras arahan produk sebelumnya (tanpa knob/dropdown); bobot fixed di `constants.ts`.
- **Machine-learned weights / kalibrasi otomatis** — butuh data outcome (reply rate, closing) yang belum dikumpulkan. Kandidat v3.
- **Menghapus `compute-score.ts` sepenuhnya** — v2 hanya melepasnya dari jalur kolom `score`; pembongkaran modul & tabel factor jadi cleanup terpisah.
- **AI ikut menentukan angka score** — AI tetap *explainer* (sesuai desain refactor sebelumnya), scoring tetap deterministik.
- **Sinyal kompetitor / market density** — `competitionPressureScore` v1 (55/35 dari ada-tidaknya lokasi) dihapus tanpa pengganti; nilai informasinya nol.

---

## 9. Dependencies & Risks

| Risk | Mitigasi |
|---|---|
| Lighthouse lambat/flaky (limiter concurrency 2) → banyak lead lama tak punya cache | Fallback custom parser tetap ada; backfill tidak memaksa Lighthouse run, hanya recompute dari data tersedia |
| Distribusi score bergeser drastis → sales kaget urutan berubah | Dry-run histogram + sampling top-20 sebelum apply; umumkan perubahan band |
| Bobot 0.35/0.40/0.25 belum tentu optimal | Tidak apa — tujuan v2 adalah *explainable & konsisten*, bukan optimal; kalibrasi berbasis outcome adalah v3 |
| Lead lama tanpa audit apa pun | Branch C / status `unknown` → Gap default dari kategori; confidence cek audit = 0 → multiplier memotong score |

---

## 10. Open Questions

1. Cache Lighthouse disimpan di kolom lead atau tabel audit terpisah? (Kecenderungan: tabel audit terpisah dengan `computedAt`, biar bisa expire.)
2. Umur cache audit sebelum dianggap basi dan perlu re-audit? (Usulan: 30 hari.)
3. Band thresholds (75/55/35) perlu dicek terhadap distribusi nyata saat dry-run backfill — angka boleh digeser sebelum rilis.

---

## Self-Assessment

- **Terkuat**: Problem statement — semua pain point berakar bukti baris kode.
- **Terlemah**: Bobot pilar (0.35/0.40/0.25) adalah 🔶 *assumption* — dipilih untuk meniru intensi v1 sambil menyederhanakan; belum divalidasi outcome.
- **Next step**: review PRD → implement S1–S2 → dry-run backfill → lihat histogram → baru S3–S5.
