# Implementation Plan: Lead Scoring v2 + AI Insight Formula

**Version**: 1.0
**Date**: 2026-07-07
**Status**: Draft
**Parent PRD**: `2026-07-07-lead-scoring-v2-prd.md`
**Scoring version target**: `2026-07-v2`

---

## 0. Definisi "Akurat ≥95%" (operasional, bisa diukur)

"Score akurat 95% sebagai acuan leads" tidak bisa diukur sebagai satu angka tunggal — harus dipecah jadi 4 kontrak yang masing-masing testable:

| # | Kontrak | Definisi terukur | Target | Cara ukur |
|---|---|---|---|---|
| A1 | **Determinisme** | Input sama → score sama, selalu | 100% | Unit + property tests |
| A2 | **Validitas data** | Lead ber-band Hot/Warm punya audit resolved & fresh (≤30 hari) dan kontak tervalidasi | ≥95% | Query + monitoring |
| A3 | **Precision@Hot** | Dari semua lead band 🔥 Hot, yang benar-benar layak dihubungi menurut penilaian manusia | ≥95% | Golden set validation (§4) |
| A4 | **Ranking sanity** | Aturan urutan tidak pernah dilanggar (no-website ≥ gap 70; Lighthouse naik → gap turun; dst) | 100% | Property tests |

A3 adalah jantungnya: **"95% bisa dijadikan acuan" = dari lead yang sistem bilang "hubungi sekarang", minimal 95% memang layak dihubungi.** Ini diverifikasi lewat protokol golden set di Phase 2, bukan diklaim.

Catatan jujur (PM): angka pilar (mis. Performa 30%) adalah kalibrasi awal. Phase 2 ada khusus untuk mengukur dan menggeser angka-angka ini terhadap penilaian manusia SEBELUM score user berubah. Akurasi dicapai lewat loop kalibrasi, bukan lewat menebak bobot sekali jadi.

---

## 1. Scoring Matrix v2 — Detail Penuh

### 1.1 Struktur (dari PRD)

```
FinalScore = round( BaseScore × ConfidenceMultiplier )
BaseScore  = BusinessValue×0.35 + DigitalGap×0.40 + Reachability×0.25
ConfidenceMultiplier = 0.7 + 0.3 × (Confidence/100)
DigitalGap = 100 − WebsiteQuality          (branch punya website)
```

### 1.2 WebsiteQuality — matrix SEO / UI-UX / Performa / Conversion

Semua angka 0–100, sumber utama **Lighthouse** (audit sama dengan AI analysis).

#### Performa — bobot 0.30

| Sub-metrik | Sumber | Kenapa dipercaya |
|---|---|---|
| `performanceScore` Lighthouse dipakai apa adanya | `lighthouse.performanceScore` | Sudah agregat resmi CWV: LCP 25%, TBT 30%, CLS 25%, FCP 10%, Speed Index 10% (LH v10). Standar industri, tidak perlu rumus tandingan. |

Ambang CWV berikut TIDAK masuk formula (sudah terwakili di score) tapi dipakai AI insight & reason strings:

| Metrik | Baik | Buruk | Reason string contoh |
|---|---|---|---|
| LCP | ≤2.5s | >4.0s | "Konten utama baru muncul setelah 6,2 detik" |
| TBT | ≤200ms | >600ms | "Halaman beku 1,3 detik karena script" |
| CLS | ≤0.10 | >0.25 | "Layout bergeser saat loading (CLS 0.41)" |
| INP | ≤200ms | >500ms | "Respons klik lambat (720ms)" |

#### SEO — bobot 0.25

| Sub-metrik | Sumber |
|---|---|
| `seoScore` Lighthouse dipakai apa adanya | `lighthouse.seoScore` — mencakup title, meta description, crawlable links, robots valid, viewport, dsb. |

Fallback (Lighthouse gagal, pakai custom parser — mapping eksplisit ke 0–100):

| Cek | Poin |
|---|---|
| `hasTitle` | 20 |
| `hasMetaDescription` | 20 |
| `hasCanonical` | 15 |
| `h1Count > 0` | 15 |
| `hasRobotsTxt` | 15 |
| `hasSitemap` | 15 |

#### UI/UX — bobot 0.25

```
UIUX = accessibilityScore × 0.6 + bestPracticesScore × 0.4
```

| Komponen | Yang tercakup (dari Lighthouse) | Kenapa proxy UX yang sah |
|---|---|---|
| Accessibility (0.6) | Kontras teks, alt text, tap target, label form, urutan heading, viewport | Semua langsung memengaruhi usability nyata pengunjung |
| Best Practices (0.4) | HTTPS, mixed content, error console, aspect ratio gambar, API deprecated | Indikator "website terawat vs terbengkalai" |

**Keputusan desain penting**: penilaian "desain jadul vs modern" bersifat subjektif → **tidak masuk angka score** (merusak akurasi & reprodusibilitas). Penilaian visual jadi tugas AI explainer di `ux_analysis.visual` (kualitatif), bukan angka.

Fallback custom parser: `hasViewport` 35, rasio gambar ber-alt 35 (proporsional), tidak ada mixed content 15, HTTPS 15.

#### Conversion Readiness — bobot 0.20

Deterministik dari sinyal audit (Lighthouse anchors / custom parser):

| Cek | Poin |
|---|---|
| Kanal kontak ada (WhatsApp ATAU phone link ATAU email link) | 40 |
| CTA terdeteksi (`ctaCount ≥ 1`) | 30 |
| Form kontak ada | 30 |

Rasional bobot 0.20: untuk agensi, website tanpa jalur kontak = kegagalan paling mahal — tapi sinyal deteksinya lebih rapuh (parser bisa miss CTA non-standar), jadi tidak boleh lebih besar dari pilar Lighthouse yang lebih andal.

#### Rekap WebsiteQuality

```
WebsiteQuality = Performa×0.30 + SEO×0.25 + UIUX×0.25 + Conversion×0.20
DigitalGap     = 100 − WebsiteQuality
```

Kategori Lighthouse null → sub-skor itu dianggap 50 (netral) + dicatat di reason + confidence cek audit turun (§1.4).

### 1.3 Branch tanpa website / website mati (dari PRD, tidak berubah)

| Kondisi | DigitalGap |
|---|---|
| `parked` | 100 |
| `inactive` | 90 |
| `timeout` / `fetch_failed` | 80 |
| Tidak punya website | `70 + 30×(categoryNeed×0.5 + marketPresence×0.5)` → range 70–100 |

### 1.4 Confidence (multiplier) — revisi kecil dari PRD

4 cek × 25, dengan satu penyesuaian: cek audit dibagi dua tingkat supaya sumber data memengaruhi kepercayaan:

| Cek | Nilai |
|---|---|
| Kontak publik / WhatsApp ada | 25 |
| Sinyal bisnis ada (rating ATAU reviewCount) | 25 |
| Status website resolved — **penuh (25)** jika audit Lighthouse sukses ATAU confirmed `no_website`; **parsial (15)** jika hanya custom parser / kategori Lighthouse ada yang null | 25 / 15 |
| Timestamp discovery/acquired ada | 25 |

---

## 2. Implementation Phases

### Phase 0 — Audit cache (PRD S1) · prasyarat semua fase

**Tujuan**: hasil Lighthouse disimpan & dipakai ulang; scoring dan AI analysis membaca audit yang SAMA.

| Task | File | Detail |
|---|---|---|
| 0.1 | `backend/migrations/` (baru) | Tabel `lead_website_audits`: `team_id, lead_id, audit_source ('lighthouse'\|'custom-parser'), status, performance_score, seo_score, accessibility_score, best_practices_score, conversion_signals jsonb, cwv jsonb, raw jsonb, computed_at`. Unique `(team_id, lead_id)`, upsert. |
| 0.2 | `backend/src/repository/` (baru) | `LeadWebsiteAuditRepository`: `upsertForLead`, `findForLead`, `findFresh(maxAgeDays=30)` |
| 0.3 | `backend/src/ai/ai-analyzer-service.ts` | Setelah `websiteAuditor.audit()` sukses → persist ke repo (dalam tx yang sudah ada) |
| 0.4 | `backend/src/scoring/service/lead-opportunity-scorer.ts` | Baca cache fresh dulu; kalau kosong/basi → fallback `CustomWebsiteAuditor` (perilaku sekarang); catat `auditSource` |

**Exit criteria**: rescore lead yang sudah dianalisis = 0 Lighthouse run baru; test integrasi membuktikan scorer membaca angka yang sama dengan yang dikirim ke AI.

### Phase 1 — Scoring engine v2 (PRD S2)

**Tujuan**: formula §1 sebagai pure functions, teruji, BELUM dipasang ke jalur produksi.

| Task | File | Detail |
|---|---|---|
| 1.1 | `scoring/website-quality.ts` (baru) | `computeWebsiteQuality(audit)` → {performa, seo, uiux, conversion, quality, reasons[]} — Lighthouse path + fallback mapping §1.2 |
| 1.2 | `scoring/digital-gap.ts` (gantikan `website-need.ts`) | 3 branch §1.2–1.3, output {score, branch, inputs, reasons[]} |
| 1.3 | `scoring/business-value.ts` | Hapus `activityScore`; `reviews×0.6 + rating×0.4 + categoryBonus` |
| 1.4 | `scoring/confidence.ts` | 4 cek §1.4; hapus dari pilar berbobot |
| 1.5 | `scoring/finalize.ts`, `constants.ts` | Satu set bobot 0.35/0.40/0.25; multiplier linear; version `2026-07-v2`; bands (75/55/35 — sementara, final di Phase 2) |
| 1.6 | `shared/src/lead-scoring.ts`, `lead.ts` | Breakdown baru: per-pilar + sub-skor SEO/UIUX/Performa/Conversion + `reasons[]` + `band`. Breakdown v1 tetap kompatibel (scoringVersion membedakan) |
| 1.7 | Tests | (a) reproduksi contoh PRD §5.7; (b) property tests A4: no-website→gap≥70, parked>website hidup terjelek, monotonic Lighthouse↑→gap↓, confidence↓→score tidak naik, semua output 0–100 integer |

**Exit criteria**: semua test hijau; coverage penuh di file scoring baru.

### Phase 2 — GATE: Kalibrasi & validasi golden set ⚠️ (inti kontrak A3 ≥95%)

**Tujuan**: buktikan Precision@Hot ≥95% SEBELUM score user berubah. Fase ini yang membuat klaim "95% akurat" jadi jujur.

**Protokol golden set:**

1. **Dry-run**: script `dev/dry-run-scoring-v2.ts` (extend backfill existing) → hitung v2 untuk semua lead TANPA persist → keluarkan CSV: leadId, nama, kategori, v1 score, v2 score, band, per-pilar, reasons.
2. **Sampling stratified**: 60 leads — 15 per band (Hot/Warm/Nurture/Cold). Kalau band kosong, ambil proporsional.
3. **Label manual** (kamu / tim sales), per lead, tanpa melihat score v2 (blind): 
   - "Layak dihubungi minggu ini?" (Ya/Tidak)
   - Band manual (Hot/Warm/Nurture/Cold)
4. **Hitung metrik**:
   - `Precision@Hot = (# Hot v2 yang dilabel Ya) / (# Hot v2)` → **target ≥95%** (toleransi: pada sample 15, maksimal 0–1 salah)
   - `Precision@Hot+Warm` → target ≥85%
   - Band agreement keseluruhan → target ≥80% putaran 1, ≥90% putaran 2
   - Spearman correlation urutan v2 vs urutan manual → target ≥0.8
5. **Kalibrasi**: kalau target meleset → geser HANYA (a) threshold band, (b) bobot sub-metrik WebsiteQuality, (c) bobot pilar — urutan prioritas itu. Setiap perubahan dicatat di doc kalibrasi + ulangi langkah 3–4 dengan 20 sample segar (hindari overfit ke sample lama).
6. **Freeze**: target tercapai → bobot & threshold dikunci di `constants.ts`, version final `2026-07-v2`.

**Exit criteria**: laporan kalibrasi berisi angka A3 aktual + histogram distribusi v1 vs v2 + confusion matrix band. Tanpa laporan ini, Phase 3 tidak boleh jalan.

### Phase 3 — Satu formula untuk kolom `score` (PRD S3)

| Task | File | Detail |
|---|---|---|
| 3.1 | `scan/scan-pipeline.ts`, `scan/scan-engine.ts` | Lead baru di-score dengan scorer v2 (branch no-website / fallback parser) — bukan `scoreAndPersist` factor model |
| 3.2 | `ai/lead-analysis-service.ts` | Tetap `recomputeLead` — otomatis pakai v2 |
| 3.3 | Factor model (`compute-score.ts`, `score-and-persist.ts`) | Lepas dari jalur kolom `score`; JANGAN hapus modul (cleanup terpisah, lihat PRD Out of Scope) |

**Exit criteria**: makna `score` konsisten sebelum vs sesudah AI analysis; test e2e scan→score→analyze→rescore.

### Phase 4 — AI Insight Formula v2 (baru — detail di §3)

| Task | File | Detail |
|---|---|---|
| 4.1 | `ai/public-lead-snapshot.ts`, `shared/src/lead.ts` | Perbaiki data contract: kirim `rating`, `review_count`, `category`, band + pilar v2 + reasons (§3.1). **Fix bug `scale_indicators` selalu 0.** |
| 4.2 | `ai/ai-text-provider-client.ts` → `buildPrompt` | Prompt v2 sesuai spec §3.2–3.4: hapus star rating AI, anti-generic rules, few-shot Google Maps |
| 4.3 | Parser output (`LeadScoringOutput`) | Schema baru §3.3 (headline, pain_points ber-evidence, seo_analysis, opening_message) |
| 4.4 | Rubric eval | Script sampling 20 insight → rubric §3.5; jalankan sebelum rilis dan tiap ganti model/prompt |

**Exit criteria**: ≥90% sample insight lolos rubric (≥7/8) dengan faithfulness wajib sempurna; 0 insight menyebut metrik yang tidak ada di input.

### Phase 5 — UI breakdown (PRD S4)

| Task | Detail |
|---|---|
| 5.1 | Kartu lead: FinalScore + band emoji + bar 3 pilar |
| 5.2 | Detail: sub-skor SEO/UI-UX/Performa/Conversion (angka SAMA dengan tab AI analysis — bukti konsistensi ke user), multiplier + alasan potongan, reasons per pilar |
| 5.3 | Tooltip formula: satu kalimat per pilar, bahasa sales bukan bahasa engineer |

**Exit criteria**: user bisa jawab "kenapa lead ini 82" dari kartu, tanpa buka AI analysis.

### Phase 6 — Backfill & rilis (PRD S5)

| Task | Detail |
|---|---|
| 6.1 | Jalankan backfill v2 semua lead (breakdown v1 tersimpan — rollback = recompute versi lama) |
| 6.2 | Umumkan perubahan band + arti score baru ke pengguna dashboard |
| 6.3 | Monitoring 2 minggu: distribusi band per tim, % Hot dengan audit fresh (kontrak A2), spot-check 10 lead Hot (kontrak A3 berkelanjutan) |

### Urutan & estimasi

```
Phase 0 ──► Phase 1 ──► Phase 2 (GATE) ──► Phase 3 ──► Phase 6
                              │
                              └────────► Phase 4 (paralel setelah gate)
                                         Phase 5 (paralel setelah gate)
```

| Phase | Estimasi |
|---|---|
| 0 | 1 hari |
| 1 | 2 hari |
| 2 | 1 hari kerja + waktu labeling manual (60 lead ± 2 jam) + iterasi |
| 3 | 1 hari |
| 4 | 1–2 hari |
| 5 | 1–2 hari |
| 6 | 0.5 hari + monitoring pasif |

---

## 3. Formula Arahan AI Agent (Insight non-generik)

### 3.0 Akar masalah insight generik sekarang (bukti kode)

| # | Masalah | Lokasi |
|---|---|---|
| G1 | `scale_indicators` hardcoded `{employee_count: 0, followers: 0, review_count: 0}` — rating & review lead TIDAK pernah dikirim ke AI, padahal matriks segmentasi prompt butuh angka itu | `ai-text-provider-client.ts:272-276` |
| G2 | AI disuruh bikin star rating 1–5 dengan matriks sendiri = sistem scoring ke-3 yang bertabrakan dengan score deterministik; prompt sekaligus bilang "AI tidak boleh menebak skor" — kontradiksi | `buildPrompt` §LOGIKA PENILAIAN |
| G3 | Few-shot examples LinkedIn & Twitter, tanpa satu pun contoh Google Maps (sumber dominan) dan tanpa contoh yang mengutip Lighthouse/CWV → model tidak dicontohkan memakai angka | `buildPrompt` §CONTOH |
| G4 | `issues`/`solutions` yang dikirim adalah template string dari auditor → AI memparafrase template → terasa generik | `lighthouse-website-auditor.ts` buildIssues/buildSolutions |

### 3.1 Data contract v2 (input AI)

Prinsip: **AI tidak bisa spesifik melebihi datanya.** Kirim semua fakta yang deterministik scorer punya:

```jsonc
{
  "business_profile": {
    "name": "Klinik Gigi Senyum Sehat",
    "category": "dental clinic",           // dari auditAttributes.category
    "location": "Bandung",
    "rating": 4.8,                          // FIX G1 — sekarang dikirim
    "review_count": 214,                    // FIX G1 — sekarang dikirim
    "source": "google_maps"
  },
  "deterministic_score": {                  // sumber kebenaran — AI menjelaskan, bukan menilai ulang
    "final_score": 85, "band": "hot",
    "business_value": 65, "digital_gap": 92, "reachability": 100,
    "confidence_multiplier": 1.0,
    "reasons": ["Tidak punya website (gap minimal 70)", "Rating 4.8 dari 214 review", "WhatsApp aktif"]
  },
  "website_quality": {                      // null jika tidak punya website
    "performa": 34, "seo": 58, "uiux": 61, "conversion": 30,
    "quality": 45, "gap": 55
  },
  "core_web_vitals": { "lcp_ms": 6200, "tbt_ms": 1340, "cls": 0.41, "inp_ms": null },
  "seo_signals": { "has_title": true, "has_meta_description": false, "h1_count": 0, "has_sitemap": false },
  "conversion_signals": { "has_whatsapp": false, "has_phone_link": true, "has_form": false, "cta_labels": ["Hubungi Kami"], "headings": ["Selamat Datang", "Layanan Kami"] },
  "audit_meta": { "status": "ok", "audit_source": "lighthouse", "computed_at": "2026-07-01" }
}
```

### 3.2 Struktur prompt v2

```
1. ROLE      — Konsultan digital untuk agensi web. Pembaca output = sales yang mau
               kirim pesan outreach hari ini. Bukan laporan teknis.
2. TRUTH     — deterministic_score adalah keputusan final. Tugasmu MENJELASKAN dan
               MEMPERSENJATAI sales, bukan menilai ulang. Tidak ada rating versimu.
3. ATURAN ANTI-GENERIK (§3.4)
4. FEW-SHOT  — 2 contoh Google Maps (§3.6): satu no-website, satu website lambat,
               keduanya mengutip angka input di setiap klaim.
5. SELF-CHECK— sebelum menjawab: "Kalau kalimat ini dipindah ke bisnis lain tanpa
               diubah, masih masuk akal? Kalau ya — tulis ulang dengan angka/fakta
               spesifik dari input."
6. SCHEMA    — §3.3, JSON murni.
7. DATA      — payload §3.1.
```

### 3.3 Output schema v2

```jsonc
{
  "headline": "1 kalimat: kenapa lead ini band X — wajib menyebut nama bisnis + fakta terkuat",
  "pain_points": [
    {
      "finding": "Apa yang salah",
      "evidence": "Angka/fakta dari input — WAJIB ada, min. 1 angka",
      "business_impact": "Akibat konkret untuk KATEGORI bisnis ini (bukan generik)"
    }
  ],
  "seo_analysis":        { "issues": [], "solutions": [] },
  "ux_analysis":         { "flow": "", "visual": "" },
  "performance_analysis":{ "issues": [], "solutions": [] },
  "recommended_angle": "Strategi pendekatan: temuan paling menyakitkan + outcome",
  "opening_message": "Draft pesan WA 2–3 kalimat, siap kirim, menyebut nama bisnis + 1 temuan spesifik"
}
```

Perubahan vs sekarang: `star_rating` DIHAPUS (band datang dari score deterministik — menutup G2); `pain_points` jadi objek ber-`evidence` (memaksa spesifisitas — tidak bisa lolos tanpa angka); `seo_analysis` jadi seksi sendiri (permintaan eksplisit: SEO, UI/UX, Performa); `opening_message` baru — artefak paling berguna untuk sales.

### 3.4 Aturan anti-generik (masuk prompt verbatim, disesuaikan redaksi)

1. **Setiap** `finding`, `issue`, dan `headline` wajib mengandung ≥1 angka atau fakta yang ADA di input (LCP 6,2 detik; 214 review; H1 tidak ada; CTA hanya "Hubungi Kami").
2. `business_impact` wajib dikaitkan ke kategori bisnis: klinik → pasien & booking; resto/cafe → reservasi & menu; kontraktor → inquiry proyek; hotel → direct booking vs OTA.
3. **Dilarang** kalimat tanpa angka pendamping: "tingkatkan SEO", "optimalkan performa", "perbaiki user experience", "website kurang optimal", "perlu peningkatan".
4. Data `null` / audit gagal → dilarang membahas dimensi itu seolah tahu; tulis eksplisit sebagai "butuh audit lanjutan". Dilarang mengarang metrik.
5. `solutions` harus teknis-spesifik dan terhubung ke evidence: bukan "percepat website" tapi "kompres 18 gambar tanpa lazy-load yang menahan LCP 6,2 detik".
6. `opening_message`: bahasa natural Indonesia, sebut nama bisnis, 1 temuan, tanpa jargon (LCP → "website-nya butuh 6 detik buat kebuka").
7. Kutip `deterministic_score.reasons` bila relevan — jangan bertentangan dengan score. Kalau data input tampak bertentangan dengan band, tetap jelaskan band apa adanya + catat anomalinya di pain_points terakhir.

### 3.5 Rubric QA insight (gate Phase 4)

Sampling ≥20 insight nyata, nilai 0–2 per kriteria:

| Kriteria | 2 | 0 |
|---|---|---|
| Specificity | ≥2 angka input dikutip benar | Tanpa angka |
| Business context | Kategori & dampak konkret | Bisa dipakai bisnis apa pun |
| Actionability | Solusi teknis terikat evidence | "Perbaiki website" |
| Faithfulness | 0 metrik karangan | Ada karangan → otomatis gagal total |

**Pass bar**: skor ≥7/8 pada ≥90% sample, faithfulness wajib 2 di 100% sample. Gagal → revisi prompt (bukan revisi rubric), ulangi.

### 3.6 Few-shot yang akan ditulis (arah konten)

- **Contoh A — Google Maps, no website**: klinik gigi, rating 4.8, 214 review, WA aktif, band hot. Output mengutip "214 review", dampak "pasien yang cari 'klinik gigi Bandung' di Google menemukan kompetitor ber-website", opening message menyebut nama klinik.
- **Contoh B — Google Maps, website lambat**: resto, Lighthouse Performa 34 / SEO 58, LCP 6,2s, meta description tidak ada, H1 tidak ada, CTA cuma 1. Output menghubungkan LCP → reservasi batal, meta description → CTR Google, solusi menyebut item spesifik.
- Contoh LinkedIn/Twitter lama dibuang (G3) — kalau nanti sumber sosial aktif lagi, tambah contoh baru dengan data contract v2.

---

## 4. Risiko Implementasi

| Risiko | Mitigasi |
|---|---|
| Golden set 60 lead terlalu kecil untuk klaim 95% presisi ketat | Diakui: 95% pada sample 15 Hot = toleransi ≤1 salah. Kontrak A3 dijaga berkelanjutan lewat spot-check bulanan (Phase 6.3), bukan sekali lulus |
| Labeling manual bias (yang melabel tahu formula) | Labeling blind — CSV tanpa kolom score/band |
| Lighthouse null di sebagian kategori (site aneh) | Netral 50 + confidence parsial 15 + reason eksplisit; property test memastikan tidak crash |
| Prompt v2 menaikkan token cost | Payload §3.1 lebih terstruktur tapi setara ukuran (hapus few-shot lama 2 → tetap 2); ukur via `AiBudgetTracker` existing |
| Model AI tim berbeda-beda (provider per team) | Rubric §3.5 dijalankan per model yang dipakai di produksi; pass bar sama |

---

## 5. Definition of Done (keseluruhan)

- [ ] Kontrak A1–A4 terpenuhi dengan bukti (test hijau + laporan kalibrasi Phase 2)
- [ ] Angka SEO/UI-UX/Performa di kartu lead = angka di AI analysis (satu audit)
- [ ] Kolom `score` satu formula dari scan sampai rescore
- [ ] Insight AI lolos rubric ≥90%, faithfulness 100%
- [ ] Backfill selesai, breakdown v1 tersimpan untuk rollback
- [ ] Dokumen kalibrasi tersimpan di `docs/superpowers/specs/` (bobot final + bukti angka)
