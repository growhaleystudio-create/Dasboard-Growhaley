# Implementation Plan: AI Content/Carousel Generator

## Overview

Rencana ini menerjemahkan desain menjadi langkah-langkah implementasi inkremental di atas stack dokumen induk: **backend Node.js + TypeScript + Fastify**, **PostgreSQL**, **BullMQ di atas Redis**, dan **Object_Storage** untuk aset gambar. Fitur ini **menggantikan (clean replacement)** implementasi konten ad-hoc yang sudah ada (`content-generator-service.ts`, `content-generator-client.ts`, `content.routes.ts`, serta tabel `content_template`/`content_template_reference`/`content_generation`) dan **merancang keluar (design out)** cacat-cacatnya: penyimpulan endpoint dari awalan kunci (`isk-`), fallback foto stok yang disamarkan sebagai sukses, dan fallback Object_Storage ke data-URI base64 / project URL hardcoded (`supabase-storage.ts`).

Urutan tugas mengikuti ketergantungan: tipe bersama & perluasan `Action` lebih dulu, lalu migrasi skema (drop tabel ad-hoc + buat skema carousel + perluasan aksi audit), kemudian repository ber-tenant dan Object_Storage gagal-keras, lalu layanan domain (BrandKit → MasterTemplate → ProviderEndpoint → Privacy/SSRF guard → akuntansi panggilan AI), lalu pipeline pembuatan (ExampleRetriever → Planner → Validator → katalog tata letak → Chart/Mockup → Background → Renderer → Content_Generator_Service → Worker), lalu RBAC dan lapisan API.

Pendekatan pengujian bersifat ganda sesuai desain:
- **Property-based tests (PBT)** dengan **fast-check** (minimum 100 iterasi, `{ numRuns: 100 }`) untuk ke-31 Correctness Properties. Setiap properti diimplementasikan oleh **tepat satu** property test dan diberi tag komentar dengan format: `Feature: ai-content-carousel-generator, Property {n}: {teks properti}`.
- **Unit / integration / smoke tests** untuk kriteria non-PBT (contoh, edge case, integrasi AI nyata via mock, infrastruktur, dan konfigurasi) sesuai bagian Testing Strategy desain.

Sub-tugas pengujian ditandai dengan `*` (opsional) dan tidak diimplementasikan secara otomatis. Sub-tugas implementasi inti tidak ditandai `*` dan wajib diimplementasikan.

## Tasks

- [x] 1. Tipe bersama dan perluasan Action konten
  - [x] 1.1 Tambah tipe domain konten dan aksi RBAC di paket `shared/`
    - Perluas tipe `Action` dengan `'content.manage'` dan `'content.generate'` (terpisah dari `ai.configure`/`ai.reanalyze`)
    - Definisikan tipe `AspectRatio`, `BlockType` (9 tipe), `JobStatus`, `SlideStatus`, dan `FailureReason` (seluruh nilai pada tabel Error Handling)
    - Definisikan antarmuka kontrak inti (`BrandKit`, `BrandKitInput`, `MasterTemplate`, `MasterTemplateRules`, `ContentPlan`, `ContentPlanSlide`, `ContentPlanBlock`, `JobView`, `ProviderSetting`, `ApprovedExampleStructure`) memakai ulang `Result<T>`/`AppError`
    - _Design: Components and Interfaces → Aksi RBAC & Tipe Bersama_
    - _Requirements: 12.1; dasar untuk seluruh requirement_

- [x] 2. Migrasi skema (penggantian bersih tabel konten ad-hoc)
  - [x] 2.1 Tulis migrasi drop tabel konten ad-hoc
    - `DROP TABLE` `content_generation`, `content_template_reference`, `content_template` beserta index terkait (forward-only; menutup migrasi `...07000` & `...09000` tanpa mengubah riwayatnya)
    - Tidak ada migrasi data — fitur konten lama pra-produksi, tidak ada data produksi yang dipertahankan
    - _Design: Data Models → Rencana Migrasi (Supersede Tabel Konten Ad-hoc)_
    - _Requirements: dasar penggantian R2 (Master_Template menggantikan content_template), R10_

  - [x] 2.2 Tulis migrasi skema carousel
    - Buat tabel `brand_kit`, `brand_font`, `master_template`, `content_provider_setting`, `content_generation_job`, `content_generation_slide`, `approved_example`
    - Terapkan seluruh CHECK & UNIQUE constraint desain: `max_slides BETWEEN 1 AND 10`, `provider_https_only` (`base_url LIKE 'https://%'`), `slide_success_has_url`, `slide_failed_has_reason`, `uniq_brand_kit_team`, `uniq_master_template_team`, index `idx_cgj_team`/`idx_brand_font_kit`/`idx_approved_example_team`
    - Hanya acuan URL Object_Storage (tanpa kolom blob base64)
    - _Design: Data Models → Skema PostgreSQL_
    - _Requirements: 1.5, 1.6, 2.1, 2.5, 5.8, 5.9, 5.11, 8.1, 8.5, 10.2, 10.5, 11.4, 14.1, 14.5, 16.1_

  - [x] 2.3 Tulis migrasi perluasan aksi Audit_Log
    - `ALTER TABLE audit_log` perluas `CHECK (action IN (...,'content_generate','content_manage'))`; `ai_call` tetap dipakai untuk panggilan AI
    - `ai_call_log` dan `team_ai_settings` tidak diubah (dipakai ulang; `lead_id` di-set NULL untuk panggilan konten)
    - _Design: Data Models → Keputusan: aksi Audit_Log untuk konten; Rencana Migrasi_
    - _Requirements: 1.1, 2.1, 8.1, 13.3, 14.2, 14.6, 15.5_

- [x] 3. Repository ber-tenant artefak konten (Tenant Guard)
  - [x] 3.1 Implementasikan repository ber-`teamId` untuk seluruh tabel konten
    - Setiap metode WAJIB menerima `teamId`; tidak ada metode akses lintas-Team; seluruh query difilter `team_id`
    - Repository untuk `brand_kit`+`brand_font`, `master_template`, `content_provider_setting`, `content_generation_job`+`content_generation_slide`, `approved_example`
    - _Design: Components and Interfaces (service ber-`teamId`); Desain Keamanan dan Privasi → Tenant Guard_
    - _Requirements: 16.1, 16.2_

- [x] 4. ObjectStorage gagal-keras (tanpa fallback base64/URL hardcoded)
  - [x] 4.1 Implementasikan ObjectStorage dengan namespace per-Team
    - `upload(teamId, key, bytes, contentType)` mengembalikan acuan URL; GAGAL-KERAS (`INTERNAL`/`CONFLICT`) bila kredensial hilang atau unggahan gagal — TIDAK PERNAH fallback ke data-URI base64 atau project URL hardcoded (merancang keluar `fallbackResponse`/`getSupabaseUrl` pada `supabase-storage.ts`)
    - `resolveForTeam(teamId, objectUrl)` membatasi akses ke Team pemilik; lintas-Team → `NOT_FOUND` seragam; kunci objek di-namespace `{teamId}/...`
    - _Design: Components and Interfaces → ObjectStorage; Desain Keamanan dan Privasi → No base64 di DB_
    - _Requirements: 1.5, 5.9, 5.11, 16.4, 16.5_

  - [x]* 4.2 Tulis property test tidak ada blob base64 pada basis data
    - **Property 3: Tidak ada blob base64 pada basis data**
    - **Validates: Requirements 1.5, 5.9**
    - Tag: `Feature: ai-content-carousel-generator, Property 3: Tidak ada blob base64 pada basis data` (fast-check, `{ numRuns: 100 }`)

  - [x]* 4.3 Tulis property test isolasi multi-tenant dan not-found seragam
    - **Property 31: Isolasi multi-tenant artefak dan not-found seragam**
    - **Validates: Requirements 1.6, 2.5, 8.5, 16.1, 16.2, 16.3, 16.4, 16.5**
    - Tag: `Feature: ai-content-carousel-generator, Property 31: Isolasi multi-tenant artefak dan not-found seragam` (fast-check, `{ numRuns: 100 }`)

- [x] 5. BrandKitService (R1)
  - [x] 5.1 Implementasikan `save`/`get` dengan validasi mengumpulkan-semua dan tanpa partial-save
    - Validasi seluruh aset (logo PNG transparan ≤ 5 MB; tiap Brand_Font `.ttf`/`.otf` ≤ 5 MB; ≥ 1 warna heksadesimal valid; chrome lengkap) dan kumpulkan SELURUH pesan kesalahan sebelum menolak
    - Unggah ke Object_Storage hanya **setelah** seluruh validasi lolos; tulis acuan URL + Audit_Log (`content_manage`) dalam satu transaksi; bila satu unggahan gagal, batalkan tanpa menulis DB (tanpa penyimpanan sebagian)
    - _Design: Components and Interfaces → BrandKitService; Error Handling → Pola Transaksi & Kompensasi_
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 16.6_

  - [x]* 5.2 Tulis property test roundtrip dan audit penyimpanan Brand_Kit
    - **Property 1: Roundtrip & audit penyimpanan Brand_Kit**
    - **Validates: Requirements 1.1, 1.2**
    - Tag: `Feature: ai-content-carousel-generator, Property 1: Roundtrip & audit penyimpanan Brand_Kit` (fast-check, `{ numRuns: 100 }`)

  - [x]* 5.3 Tulis property test validasi Brand_Kit menolak tanpa partial-save
    - **Property 2: Validasi Brand_Kit menolak tanpa partial-save**
    - **Validates: Requirements 1.3, 1.4**
    - Tag: `Feature: ai-content-carousel-generator, Property 2: Validasi Brand_Kit menolak tanpa partial-save` (fast-check, `{ numRuns: 100 }`)

- [x] 6. MasterTemplateService (R2, R9)
  - [x] 6.1 Implementasikan `save`/`get`/`rules` dengan validasi aturan keras
    - Validasi acuan `brand_kit_id` ada pada Team (tolak bila Team belum punya Brand_Kit), `allowedBlocks` subset 9 tipe, `maxSlides` ∈ 1..10, batas teks per blok, ≥ 1 rasio dari {1:1,4:5,9:16}; tolak masukan tak valid tanpa mengubah Master_Template yang ada + sebut aturan yang dilanggar
    - `rules` mengembalikan `MasterTemplateRules` (sumber kebenaran aturan keras yang dipakai Planner & Validator); tulis Audit_Log (`content_manage`)
    - _Design: Components and Interfaces → MasterTemplateService_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x]* 6.2 Tulis property test roundtrip Master_Template dan aturan Planner
    - **Property 4: Roundtrip Master_Template & aturan Planner**
    - **Validates: Requirements 2.1, 2.2**
    - Tag: `Feature: ai-content-carousel-generator, Property 4: Roundtrip Master_Template & aturan Planner` (fast-check, `{ numRuns: 100 }`)

  - [x]* 6.3 Tulis property test validasi Master_Template menolak masukan tak valid
    - **Property 5: Validasi Master_Template menolak masukan tak valid**
    - **Validates: Requirements 2.3**
    - Tag: `Feature: ai-content-carousel-generator, Property 5: Validasi Master_Template menolak masukan tak valid` (fast-check, `{ numRuns: 100 }`)

- [x] 7. ContentProviderSettingService dan ProviderEndpointResolver (R14)
  - [x] 7.1 Implementasikan ContentProviderSettingService (Admin-only)
    - `set`/`get` setelan endpoint per-Team; default `kind='google_official'` + `base_url='https://generativelanguage.googleapis.com'`; izinkan `third_party_proxy`; tulis Audit_Log (`content_manage`) + metadata pada setiap perubahan endpoint
    - _Design: Components and Interfaces → ContentProviderSettingService; Desain Keamanan dan Privasi → Endpoint allowlist_
    - _Requirements: 14.1, 14.2_

  - [x] 7.2 Implementasikan ProviderEndpointResolver dan ResolvedEndpoint.assertAllowed
    - `resolve(teamId)` menentukan endpoint HANYA dari `content_provider_setting` tersimpan — TIDAK PERNAH dari bentuk/awalan kunci API (merancang keluar cabang `apiKey.startsWith('isk-')`)
    - `assertAllowed(targetUrl)` sukses jika-dan-hanya-jika host target == host terkonfigurasi (else `endpoint_mismatch`) DAN skema HTTPS (else `insecure_transport`)
    - _Design: Components and Interfaces → ProviderEndpointResolver; Desain Keamanan dan Privasi → Allowlist tujuan_
    - _Requirements: 14.1, 14.3, 14.4, 14.5_

  - [x]* 7.3 Tulis property test endpoint ditentukan dari setelan bukan kunci API
    - **Property 27: Endpoint ditentukan dari setelan, bukan dari kunci API**
    - **Validates: Requirements 14.1**
    - Tag: `Feature: ai-content-carousel-generator, Property 27: Endpoint ditentukan dari setelan, bukan dari kunci API` (fast-check, `{ numRuns: 100 }`)

  - [x]* 7.4 Tulis property test hanya endpoint terkonfigurasi dan wajib HTTPS
    - **Property 28: Hanya endpoint terkonfigurasi yang menjadi tujuan, dan wajib HTTPS**
    - **Validates: Requirements 14.2, 14.3, 14.4, 14.5**
    - Tag: `Feature: ai-content-carousel-generator, Property 28: Hanya endpoint terkonfigurasi yang menjadi tujuan, dan wajib HTTPS` (fast-check, `{ numRuns: 100 }`)

- [x] 8. PrivacyGuard dan UrlSafetyGuard (R15, keamanan SSRF)
  - [x] 8.1 Implementasikan PrivacyGuard (whitelist payload AI)
    - `assertNoLeadPII(payload, explicitlyIncludedByUser)` memastikan payload hanya memuat prompt User, aturan Master_Template, struktur Approved_Example, dan aset Brand_Kit relevan; blokir total bila terdeteksi Personal_Data Lead tanpa penyertaan eksplisit
    - Catat peristiwa keamanan ke Audit_Log TANPA menuliskan nilai Personal_Data
    - _Design: Components and Interfaces → PrivacyGuard; Desain Keamanan dan Privasi → Privasi masukan AI_
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 8.2 Implementasikan UrlSafetyGuard untuk URL yang disuplai User
    - `fetchSafely` memaksa skema `https`; tolak `http`/`file`/`data`/`gopher`; blokir resolusi DNS privat/loopback/link-local/metadata (`169.254.169.254`, `::1`, RFC1918); batasi ukuran + `content-type` (`image/*`) + timeout; validasi ulang setiap hop redirect
    - Dipakai BackgroundImageClient (reference image) dan jalur unggah mockup berasal URL
    - _Design: Components and Interfaces → UrlSafetyGuard; Desain Keamanan dan Privasi → Proteksi SSRF_
    - _Requirements: 15.1_

  - [x]* 8.3 Tulis property test whitelist payload masukan AI
    - **Property 29: Whitelist payload masukan AI**
    - **Validates: Requirements 15.1**
    - Tag: `Feature: ai-content-carousel-generator, Property 29: Whitelist payload masukan AI` (fast-check, `{ numRuns: 100 }`)

  - [x]* 8.4 Tulis property test pemblokiran kebocoran Personal_Data tanpa mencatat PII
    - **Property 30: Pemblokiran kebocoran Personal_Data tanpa mencatat PII**
    - **Validates: Requirements 15.2, 15.3, 15.4**
    - Tag: `Feature: ai-content-carousel-generator, Property 30: Pemblokiran kebocoran Personal_Data tanpa mencatat PII` (fast-check, `{ numRuns: 100 }`)

- [x] 9. Akuntansi panggilan AI: anggaran dan audit (R13)
  - [x] 9.1 Implementasikan pembungkus panggilan AI ber-Team (budget + endpoint + privacy + audit)
    - Pakai ulang `TeamAiSettingsService.loadApiKey` (kunci Gemini terenkripsi per-Team; tanpa kunci lintas-Team) dan `AiBudgetTracker` untuk pra-pemeriksaan jendela bergulir 30 hari sebelum SETIAP panggilan
    - Untuk setiap panggilan (sukses/gagal): tulis tepat satu `ai_call_log` (`lead_id` NULL) + satu Audit_Log (`ai_call`) memuat pelaku, Job terkait, waktu, hasil, tujuan endpoint (R14.6), dan lingkup data (R15.5) dalam transaksi pembaruan status Job
    - Tolak panggilan saat budget tercapai/terlampaui → `budget_exceeded` (fail-fast); rangkai `ProviderEndpointResolver.assertAllowed` + `PrivacyGuard` sebelum keluar
    - _Design: Error Handling → Pola Transaksi & Kompensasi; Desain Keamanan dan Privasi → Penggunaan ulang kunci_
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x]* 9.2 Tulis property test setiap panggilan AI tercatat pada budget dan Audit_Log
    - **Property 25: Setiap panggilan AI tercatat pada budget dan Audit_Log**
    - **Validates: Requirements 13.2, 13.3, 14.6, 15.5**
    - Tag: `Feature: ai-content-carousel-generator, Property 25: Setiap panggilan AI tercatat pada budget dan Audit_Log` (fast-check, `{ numRuns: 100 }`)

  - [x]* 9.3 Tulis property test pra-pemeriksaan AI_Call_Budget jendela 30 hari
    - **Property 26: Pra-pemeriksaan AI_Call_Budget jendela 30 hari**
    - **Validates: Requirements 13.4**
    - Tag: `Feature: ai-content-carousel-generator, Property 26: Pra-pemeriksaan AI_Call_Budget jendela 30 hari` (fast-check, `{ numRuns: 100 }`)

- [x] 10. Checkpoint — pastikan fondasi layanan dan keamanan lulus
  - Pastikan semua test (unit + property) untuk repository, ObjectStorage, BrandKit, MasterTemplate, ProviderEndpoint, Privacy/SSRF guard, dan akuntansi AI lulus, tanyakan kepada user bila ada pertanyaan.

- [x] 11. ApprovedExampleService dan ExampleRetriever (R8)
  - [x] 11.1 Implementasikan ApprovedExampleService (`approve`/`unapprove`/`list`)
    - `approve(teamId, actorId, jobId)` menyimpan STRUKTUR tata letak Carousel (JSON, tanpa brand) ke Example_Library + Audit_Log (`content_manage`); `unapprove` menghapus dari library; `list` di-scope Team
    - _Design: Components and Interfaces → ApprovedExampleService & ExampleRetriever_
    - _Requirements: 8.1, 8.5, 8.6_

  - [x] 11.2 Implementasikan ExampleRetriever (relevansi dapat dijelaskan, bukan embedding)
    - `topRelevant(teamId, query, n=3)` skor `wTag*jaccard(tags) + wAspect*(rasio cocok) + wBlock*jaccard(blockSets)`; kembalikan hanya contoh dengan skor ≥ ambang; `[]` bila library kosong atau tidak ada yang relevan (Planner berjalan Master-only)
    - _Design: Components and Interfaces → ExampleRetriever (rumus relevansi)_
    - _Requirements: 8.2, 8.4, 8.7_

  - [x]* 11.3 Tulis property test roundtrip dan audit Approved_Example
    - **Property 22: Roundtrip & audit Approved_Example**
    - **Validates: Requirements 8.1**
    - Tag: `Feature: ai-content-carousel-generator, Property 22: Roundtrip & audit Approved_Example` (fast-check, `{ numRuns: 100 }`)

  - [x]* 11.4 Tulis property test relevansi retrieval dan pembatalan persetujuan
    - **Property 23: Relevansi retrieval dan pembatalan persetujuan**
    - **Validates: Requirements 8.2, 8.4, 8.6, 8.7**
    - Tag: `Feature: ai-content-carousel-generator, Property 23: Relevansi retrieval dan pembatalan persetujuan` (fast-check, `{ numRuns: 100 }`)

- [x] 12. Planner dan kontrak Content_Plan (R3, R7, R8)
  - [x] 12.1 Implementasikan Planner dan skema Content_Plan
    - `plan(input, signal)` memanggil model teks via pembungkus AI (budget precheck + privacy guard + endpoint resolve WAJIB sebelum call); timeout 30 detik via AbortSignal
    - Hasilkan `ContentPlan` JSON sesuai Content_Plan_Schema (Zod); patuhi jumlah slide diminta bila ≤ maxSlides (R3.3); sertakan ≥ 1 blok `chart`|`stat` saat `expectsData` (R3.4)
    - HANYA tandai kebutuhan chart/mockup via `chartDataRef`/`mockupRef` tanpa mengarang nilai data inline (R7.3); Approved_Example hanya memengaruhi `layoutVariantHint`/komposisi blok, bukan brand (R8.2, R8.3)
    - Petakan kegagalan ke `PlannerError` (`non_json`/`budget_exceeded`/`endpoint_mismatch`/`insecure_transport`/`privacy_violation`/`timeout`/`provider_error`)
    - _Design: Components and Interfaces → Content_Plan & Planner; Data Models → Content_Plan JSON Schema_
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 7.3, 8.2, 8.3_

  - [x]* 12.2 Tulis integration test Planner dengan mock AI provider
    - Verifikasi payload memuat prompt+master rules+examples (R3.2), timeout 30 detik membatalkan via AbortSignal (R3.5), keluaran non-JSON terpetakan ke `PlannerError.non_json`, dan Planner hanya menandai `chartDataRef`/`mockupRef` tanpa mengarang nilai data inline (R7.3)
    - _Requirements: 3.2, 3.5, 7.3_

- [x] 13. Content_Plan_Validator (R4, R9)
  - [x] 13.1 Implementasikan validator murni deterministik
    - `validate(plan, rules)` memeriksa blok ∈ `allowedBlocks`, `slides.length ≤ maxSlides`, panjang teks ≤ batas, rasio ∈ `aspectRatios`, konsistensi referensi (`chart`→`chartDataRef`, `mockup`→`mockupRef`); tanpa I/O
    - Validasi selalu terhadap Master_Template terlepas Approved_Example (master-menang); keluaran non-JSON diperlakukan invalid
    - _Design: Components and Interfaces → Content_Plan_Validator; Data Models → aturan validasi tambahan_
    - _Requirements: 4.1, 4.2, 9.2_

  - [x]* 13.2 Tulis property test Content_Plan sesuai aturan dinyatakan valid
    - **Property 8: Content_Plan yang sesuai aturan dinyatakan valid**
    - **Validates: Requirements 4.1, 4.2**
    - Tag: `Feature: ai-content-carousel-generator, Property 8: Content_Plan yang sesuai aturan dinyatakan valid` (fast-check, `{ numRuns: 100 }`)

  - [x]* 13.3 Tulis property test penolakan, perbaikan terbatas, dan fail-closed validasi
    - **Property 9: Penolakan, perbaikan terbatas, dan fail-closed validasi**
    - **Validates: Requirements 4.3, 4.4, 4.5, 9.4**
    - Tag: `Feature: ai-content-carousel-generator, Property 9: Penolakan, perbaikan terbatas, dan fail-closed validasi` (fast-check, `{ numRuns: 100 }`)
    - Catatan: gunakan fault injection pada eksekusi Validator untuk memicu jalur fail-closed `validation_error` secara deterministik

  - [x]* 13.4 Tulis property test master menang atas Approved_Example
    - **Property 10: Master menang atas Approved_Example**
    - **Validates: Requirements 8.8, 9.1, 9.2**
    - Tag: `Feature: ai-content-carousel-generator, Property 10: Master menang atas Approved_Example` (fast-check, `{ numRuns: 100 }`)

- [x] 14. SlideLayoutCatalog, ChartRenderer, dan MockupRenderer (R6, R7)
  - [x] 14.1 Implementasikan SlideLayoutCatalog (katalog varian di kode)
    - Definisikan `SlideLayoutVariant[]` statis (template subset flexbox `satori`, area aman chrome tetap); `variantsFor(blocks, aspectRatio)` mengembalikan varian cocok; `defaultFor` menjamin ≥ 1 varian default
    - _Design: Data Models → Slide_Layout Variant Model_
    - _Requirements: 6.1, 6.4_

  - [x] 14.2 Implementasikan ChartRenderer deterministik (tanpa AI gambar)
    - `render(data, palette, size)` menggambar bar/line/pie dari data User → SVG → PNG via `resvg-js`; keluaran identik untuk masukan sama; tanpa model gambar AI
    - _Design: Components and Interfaces → ChartRenderer; Pilihan Teknologi (Renderer)_
    - _Requirements: 7.1_

  - [x] 14.3 Implementasikan MockupRenderer deterministik (tanpa AI gambar)
    - `render(image, frame, size)` compositing gambar User ke frame perangkat preset (`phone`/`browser`/`plain`) via `sharp`; tanpa model gambar AI
    - _Design: Components and Interfaces → MockupRenderer; Pilihan Teknologi (Renderer)_
    - _Requirements: 7.2_

  - [x]* 14.4 Tulis property test pemilihan varian layout dan fallback default
    - **Property 14: Pemilihan varian layout dan fallback default**
    - **Validates: Requirements 5.7, 6.1, 6.4, 11.4**
    - Tag: `Feature: ai-content-carousel-generator, Property 14: Pemilihan varian layout dan fallback default` (fast-check, `{ numRuns: 100 }`)

  - [x]* 14.5 Tulis property test chart/mockup deterministik dari data User tanpa AI gambar
    - **Property 17: Chart dan mockup deterministik dari data User tanpa AI gambar**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - Tag: `Feature: ai-content-carousel-generator, Property 17: Chart dan mockup deterministik dari data User tanpa AI gambar` (fast-check, `{ numRuns: 100 }`)
    - Catatan: menguji determinisme keluaran `ChartRenderer.render`/`MockupRenderer.render` dan ketiadaan panggilan model gambar AI

- [x] 15. BackgroundImageClient dan BackgroundScanner (R5, R7)
  - [x] 15.1 Implementasikan BackgroundImageClient
    - `generate(teamId, req, signal)` memanggil model gambar via pembungkus AI (budget + endpoint + privacy guard); reference image (Opsi B) divalidasi `UrlSafetyGuard`; prompt latar tanpa instruksi teks/logo
    - _Design: Components and Interfaces → BackgroundImageClient; Strategi Kesetiaan Brand Hibrida_
    - _Requirements: 5.4, 7.5_

  - [x] 15.2 Implementasikan BackgroundScanner
    - `scan(image)` aktif mendeteksi teks/logo pada Background_Image; `clean=false` memicu fallback Renderer; tidak hanya mengandalkan jaminan AI_Provider
    - _Design: Components and Interfaces → BackgroundScanner; Strategi Kesetiaan Brand Hibrida (Opsi B)_
    - _Requirements: 5.5_

- [x] 16. Renderer deterministik dengan kesetiaan brand (R5, R6, R7)
  - [x] 16.1 Implementasikan `renderSlide` deterministik dan algoritma fallback
    - Susun layer tetap: Background (dipindai dulu) → blok konten deterministik → chrome; render teks hanya dengan Brand_Font + warna ⊆ daftar warna brand; logo = berkas logo Brand_Kit; chrome identik lintas-slide (hanya nomor halaman berbeda)
    - Pilih varian dari `variantsFor` (hormati `layoutVariantHint` valid); pakai `defaultFor` + tandai `usedFallbackLayout=true` saat kontras < 4.5:1 / overflow / collision / komposisi tidak ditetapkan
    - Background tidak bersih → regenerasi 1× → latar polos brand → bila tetap gagal `failed` (`background_unclean`); TIDAK PERNAH compositing background bermasalah; chrome/warna/font tak dapat dihormati → `failed` (`off_brand`); komposisi tak dapat diterapkan setelah default → `failed` (`layout_unsatisfiable`)
    - Unggah PNG ke Object_Storage; `success` HANYA jika PNG dibuat DAN terunggah (`image_url` non-null); gagal unggah → `failed` (`upload_failed`, `image_url` null)
    - _Design: Components and Interfaces → Renderer (algoritma fallback); Error Handling → Pemetaan FailureReason_
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8, 5.10, 5.11, 6.2, 6.3, 6.5, 6.6, 7.5_

  - [x]* 16.2 Tulis property test invarian kesetiaan brand
    - **Property 11: Invarian kesetiaan brand**
    - **Validates: Requirements 5.1, 5.3, 5.4, 6.2, 6.3, 8.3, 9.3**
    - Tag: `Feature: ai-content-carousel-generator, Property 11: Invarian kesetiaan brand` (fast-check, `{ numRuns: 100 }`)

  - [x]* 16.3 Tulis property test chrome identik lintas-slide
    - **Property 12: Chrome identik lintas-slide**
    - **Validates: Requirements 5.2**
    - Tag: `Feature: ai-content-carousel-generator, Property 12: Chrome identik lintas-slide` (fast-check, `{ numRuns: 100 }`)

  - [x]* 16.4 Tulis property test background dipindai sebelum compositing
    - **Property 13: Background dipindai sebelum compositing dan tidak pernah meng-compositing background bermasalah**
    - **Validates: Requirements 5.5, 5.6, 5.10, 7.5**
    - Tag: `Feature: ai-content-carousel-generator, Property 13: Background dipindai sebelum compositing dan tidak pernah meng-compositing background bermasalah` (fast-check, `{ numRuns: 100 }`)
    - Catatan: gunakan fault injection pada jalur fallback (regenerasi/latar polos) untuk memverifikasi background bermasalah tidak pernah di-compositing

  - [x]* 16.5 Tulis property test tidak pernah merender Slide off-brand
    - **Property 15: Tidak pernah merender Slide off-brand**
    - **Validates: Requirements 6.5, 6.6**
    - Tag: `Feature: ai-content-carousel-generator, Property 15: Tidak pernah merender Slide off-brand` (fast-check, `{ numRuns: 100 }`)

  - [x]* 16.6 Tulis property test Slide success berimplikasi terunggah
    - **Property 16: Slide success berimplikasi terunggah**
    - **Validates: Requirements 5.8, 5.11, 10.5**
    - Tag: `Feature: ai-content-carousel-generator, Property 16: Slide success berimplikasi terunggah` (fast-check, `{ numRuns: 100 }`)
    - Catatan: gunakan fault injection pada `ObjectStorage.upload` untuk memicu `upload_failed` secara deterministik

- [x] 17. Content_Generator_Service (pemicuan asinkron + precheck) (R3, R7, R10, R13)
  - [x] 17.1 Implementasikan `trigger` dengan agregasi validasi prasyarat
    - Validasi prapemicu mengumpulkan SEMUA error: prompt 1..2000 setelah trim (R3.6), Master_Template ada (R3.7), kunci API Gemini terkonfigurasi (R13.5/R13.6); buat Job hanya jika seluruh prasyarat terpenuhi
    - Buat `content_generation_job` `pending` + persist input referensi, enqueue BullMQ, dan kembali tanpa panggilan AI inline; Audit_Log (`content_generate`)
    - _Design: Components and Interfaces → Content_Generator_Service & Worker; Sequence: Pemicuan_
    - _Requirements: 3.1, 3.6, 3.7, 3.8, 10.1, 13.5, 13.6_

  - [x] 17.2 Implementasikan `getJob` (status keseluruhan + per-Slide)
    - Kembalikan `JobView` di-scope Team: status keseluruhan + per-Slide (`pending`/`success`/`failed` + reason + `usedFallbackLayout` + `imageUrl`)
    - _Design: Components and Interfaces → Content_Generator_Service (`getJob`)_
    - _Requirements: 10.5, 10.6_

  - [x] 17.3 Implementasikan precheck data chart/mockup yang hilang
    - Sebelum render: bila blok `chart` tanpa `chartData` ter-resolve atau blok `mockup` tanpa berkas mockup → segera tandai seluruh Slide terkait `failed` (`missing_chart_data`/`missing_mockup`) tanpa render sebagian dan tanpa AI gambar
    - _Design: Sequence: Pemrosesan (precheck data); Error Handling → Pemetaan FailureReason_
    - _Requirements: 7.4_

  - [x]* 17.4 Tulis property test pemicuan asinkron tanpa panggilan AI inline
    - **Property 6: Pemicuan bersifat asinkron tanpa panggilan AI inline**
    - **Validates: Requirements 3.1, 10.1**
    - Tag: `Feature: ai-content-carousel-generator, Property 6: Pemicuan bersifat asinkron tanpa panggilan AI inline` (fast-check, `{ numRuns: 100 }`)

  - [x]* 17.5 Tulis property test agregasi validasi prasyarat pemicuan
    - **Property 7: Agregasi validasi prasyarat pemicuan**
    - **Validates: Requirements 3.6, 3.7, 3.8, 13.5, 13.6**
    - Tag: `Feature: ai-content-carousel-generator, Property 7: Agregasi validasi prasyarat pemicuan` (fast-check, `{ numRuns: 100 }`)

  - [x]* 17.6 Tulis property test precheck data chart/mockup yang hilang
    - **Property 18: Precheck data chart/mockup yang hilang**
    - **Validates: Requirements 7.4**
    - Tag: `Feature: ai-content-carousel-generator, Property 18: Precheck data chart/mockup yang hilang` (fast-check, `{ numRuns: 100 }`)

- [x] 18. Content_Generation_Worker (BullMQ, fail-fast, attempts:1) (R10, R11)
  - [x] 18.1 Implementasikan worker dan orkestrasi pipeline fail-fast
    - Konsumen BullMQ `attempts: 1` (tanpa auto-retry): Planner → Validator → (repair ≤ 1×) → precheck data → Renderer per slide; fail-closed `validation_error` bila validasi gagal (Renderer tidak dipanggil)
    - Fail-fast antar-slide: Slide `failed` pada posisi k → hentikan slide > k, Job `failed`, pertahankan Slide `success` sebelumnya tanpa rollback/cleanup; Job `success` jika-dan-hanya-jika semua slide `success` dengan acuan URL
    - Status keseluruhan selalu tepat satu dari {pending, success, failed}; tulis status dari hasil eksekusi sebenarnya + notifikasi via Outbox pattern (induk) dalam transaksi domain yang sama; gambar placeholder pada slide `failed` tidak pernah dilaporkan `success`
    - _Design: Components and Interfaces → Content_Generation_Worker; Error Handling → Fail-fast/Outbox/Tanpa auto-retry_
    - _Requirements: 4.3, 4.4, 4.5, 9.4, 9.5, 9.6, 10.2, 10.3, 10.4, 11.1, 11.2, 11.3, 11.5_

  - [x]* 18.2 Tulis property test semantik fail-fast dan keberhasilan Job
    - **Property 19: Semantik fail-fast dan keberhasilan Job**
    - **Validates: Requirements 10.3, 10.4, 11.1, 11.2, 11.3**
    - Tag: `Feature: ai-content-carousel-generator, Property 19: Semantik fail-fast dan keberhasilan Job` (fast-check, `{ numRuns: 100 }`)

  - [x]* 18.3 Tulis property test status keseluruhan adalah enum tunggal yang valid
    - **Property 20: Status keseluruhan adalah enum tunggal yang valid**
    - **Validates: Requirements 10.2**
    - Tag: `Feature: ai-content-carousel-generator, Property 20: Status keseluruhan adalah enum tunggal yang valid` (fast-check, `{ numRuns: 100 }`)

  - [x]* 18.4 Tulis property test status mencerminkan eksekusi sebenarnya terlepas notifikasi
    - **Property 21: Status mencerminkan eksekusi sebenarnya terlepas dari notifikasi**
    - **Validates: Requirements 11.5**
    - Tag: `Feature: ai-content-carousel-generator, Property 21: Status mencerminkan eksekusi sebenarnya terlepas dari notifikasi` (fast-check, `{ numRuns: 100 }`)
    - Catatan: gunakan fault injection pada pengiriman notifikasi untuk memverifikasi status tersimpan tidak berubah

  - [x]* 18.5 Tulis integration test end-to-end pemicuan → worker → status
    - Verifikasi alur pemicuan → Planner (mock) → Validator → Renderer (Object_Storage mock) → status Job/Slide; Job `failed` akibat validator tetap `failed` tanpa re-enqueue dan pembukuan selesai (R9.5, R9.6)
    - _Requirements: 9.5, 9.6, 10.2, 10.4_

- [x] 19. RBAC konten dan matriks izin (R12)
  - [x] 19.1 Wiring `content.manage`/`content.generate` ke RBAC dengan peran efektif
    - Perluas matriks `authorizeAction`: Admin → `content.manage` + `content.generate`; Member → `content.generate`, tolak `content.manage`; Viewer → tolak keduanya, izinkan baca Carousel/status; kepemilikan satu aksi tidak pernah mengizinkan aksi lain
    - Baca peran efektif per-permintaan via `EffectiveRoleResolver` (bukan peran sesi beku); permintaan ditolak tidak mengubah data
    - _Design: Alur Permintaan Berbasis Peran (RBAC + Tenant Guard); Desain Keamanan dan Privasi → Tenant Guard_
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x]* 19.2 Tulis property test matriks RBAC konten per-aksi
    - **Property 24: Matriks RBAC konten per-aksi**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6**
    - Tag: `Feature: ai-content-carousel-generator, Property 24: Matriks RBAC konten per-aksi` (fast-check, `{ numRuns: 100 }`)

- [x] 20. Lapisan API (Fastify: Auth + RBAC + TenantGuard)
  - [x] 20.1 Implementasikan rute Brand_Kit, Master_Template, dan provider setting
    - Rute Fastify untuk simpan/baca Brand_Kit (multipart aset) & Master_Template, dan set/get `content_provider_setting` (RBAC `content.manage`); seluruhnya melewati rantai Auth → RBAC → Tenant Guard dan memetakan `AppError` ke HTTP
    - _Design: Components and Interfaces; Alur Permintaan Berbasis Peran_
    - _Requirements: 1.1, 2.1, 12.2, 12.5, 14.1, 14.2, 16.2_

  - [x] 20.2 Implementasikan rute generate, status, dan approve/unapprove
    - `POST /content/generate` (RBAC `content.generate`) → `trigger`, kembalikan 202 `{ jobId, status }`; `GET /content/jobs/:id` status keseluruhan + per-Slide; `POST/DELETE` approve/unapprove Example (RBAC `content.manage`)
    - Artefak lintas-Team / tidak ada → `NOT_FOUND` seragam; validasi prasyarat gagal → `VALIDATION` dengan SEMUA pesan; otorisasi gagal → `AUTHORIZATION`
    - Refactor/ganti `content.routes.ts` lama (hapus jalur cacat `isk-`/stock fallback/base64); pastikan tidak ada layanan jaringan tanpa Auth+RBAC
    - _Design: Components and Interfaces; Error Handling → Bentuk Kesalahan Terpadu_
    - _Requirements: 3.1, 8.1, 8.6, 10.6, 12.3, 12.4, 12.6, 16.3, 16.4_

- [x] 21. Checkpoint akhir — pastikan seluruh test lulus
  - Pastikan seluruh test (unit + property + integration + smoke) lulus, tanyakan kepada user bila ada pertanyaan.

## Notes

- Tugas bertanda `*` bersifat opsional (pengujian) dan dapat dilewati untuk MVP yang lebih cepat; tugas implementasi inti tidak ditandai `*`.
- Setiap tugas merujuk requirement spesifik dan bagian desain terkait untuk ketertelusuran.
- Ke-31 Correctness Properties dipetakan tepat satu property-based test (fast-check, `{ numRuns: 100 }`), diberi tag `Feature: ai-content-carousel-generator, Property {n}: {teks}`.
- Properti yang melibatkan kegagalan eksternal — Property 9 (validator throw), 13 (fallback background), 16 (upload gagal), 21 (notifikasi gagal), 26 (budget terlampaui) — memakai fault injection terhadap dependensi (Validator, BackgroundScanner, ObjectStorage, notifier, AiBudgetTracker) agar jalur kegagalan terpicu deterministik.
- Penggantian bersih: migrasi task 2.1 men-drop tabel ad-hoc (`content_template`/`content_template_reference`/`content_generation`, supersede migrasi `...07000`/`...09000`); kode `content/*.ts` dan `content.routes.ts` lama di-refactor/diganti untuk merancang keluar defek `isk-` prefix, silent stock fallback, dan base64/project-URL fallback (`supabase-storage.ts`).
- Kriteria non-PBT (R2.4 Brand_Kit kosong, R3.2/R3.3/R3.5 integrasi Planner, R9.5/R9.6 pembukuan tanpa retry, R10.6 getJob, migrasi & konfigurasi endpoint) dicakup unit/integration/smoke test.
- Renderer diuji pada lapisan logika (pemilihan font/warna/varian, keputusan fallback, status Slide) dengan Object_Storage dan AI client di-mock; rasterisasi piksel penuh diverifikasi sejumlah kecil snapshot test, bukan PBT.
- Checkpoint memastikan validasi inkremental pada batas-batas yang wajar.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["3.1", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.1", "6.1", "7.1", "8.1", "8.2", "11.1", "14.1", "14.2", "14.3"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.2", "6.3", "7.2", "8.3", "8.4", "9.1", "11.2", "13.1", "14.4", "14.5", "15.1", "15.2"] },
    { "id": 6, "tasks": ["7.3", "7.4", "9.2", "9.3", "11.3", "11.4", "12.1", "13.2", "13.3", "13.4", "16.1"] },
    { "id": 7, "tasks": ["12.2", "16.2", "16.3", "16.4", "16.5", "16.6", "17.1", "17.2", "17.3"] },
    { "id": 8, "tasks": ["17.4", "17.5", "17.6", "18.1", "19.1"] },
    { "id": 9, "tasks": ["18.2", "18.3", "18.4", "18.5", "19.2"] },
    { "id": 10, "tasks": ["20.1", "20.2"] }
  ]
}
```
