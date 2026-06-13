# Product Requirement Document (PRD)
Project Name: AI-Powered Server-Driven Carousel Content Generator
Document Version: 1.0 (Master Blueprint)
Target Platform: Web Application (Desktop & Mobile Preview)
Output Formats: Instagram & LinkedIn Carousel (Aspect Ratio 4:5 / 1080x1350px)

---

## 1. Executive Summary & Objective

### 1.1. Latar Belakang
Pembuatan konten berbasis gambar berformat carousel untuk media sosial membutuhkan waktu eksekusi yang tinggi karena harus menyelaraskan antara alur cerita (storytelling flow), kepadatan teks, dan konsistensi visual. Mengandalkan AI Generative Image secara mentah sering kali menghasilkan tata letak (layout) yang berantakan, teks yang tumpang tindih (overflow), dan inkonsistensi identitas visual merek (brand identity).

### 1.2. Tujuan Produk
Membangun platform pembuat konten carousel otomatis yang memadukan fleksibilitas AI dengan kekakuan sistem kode. Dengan mengadopsi model Generative Server-Driven UI (SDUI), platform ini memisahkan pembuatan konten teks (oleh AI) dengan proses penggambaran visual (oleh mesin kode). Sistem ini memastikan hasil akhir 100% presisi sesuai brand guidelines, hemat biaya API (API cost efficiency), dan memiliki latency yang rendah.

---

## 2. Core Pillars & Architecture

Sistem ini didesain dengan memisahkan fungsi kecerdasan yang tidak deterministik dengan fungsi eksekusi kode yang 100% deterministik (Separation of Concerns).

- AI Engine (The Brain): Hanya bertugas sebagai Data Structurer, Slide Allocator, dan Structural Layout Matcher. AI bertugas menganalisis topik, menulis materi teks per slide, dan menentukan jenis komponen informasi yang dibutuhkan tanpa menyentuh urusan ukuran piksel atau warna gambar.
- System Engine (The Worker): Kode frontend murni yang bertugas membaca instruksi data JSON dari AI, lalu merendernya secara kaku menggunakan komponen UI asli sistem (deterministic rendering).

---

## 3. User Experience & Product Workflows

Alur kerja sistem dibagi menjadi dua fase utama: Fase Setup (Konfigurasi Brand) dan Fase Produksi (Siklus Konten Harian).

### 3.1. Fase Setup (Konfigurasi Awal)
1. Brand Asset Locking: Pengguna mengunggah Logo perusahaan (.png/.svg), Font Family (.zip), dan menentukan palet warna utama (Hex Codes).
2. Metadata Placement: Pengguna menentukan koordinat posisi absolut untuk elemen statis (Logo dan Pagination) pada sistem grid luar.
3. Visual Reference Ingestion (Opsional): Pengguna mengunggah contoh gambar/carousel eksternal yang sukses sebagai referensi gaya tata letak. Sistem langsung melakukan rekayasa balik (reverse engineering) untuk mengekstrak Visual DNA struktur informasinya.

### 3.2. Fase Produksi & Siklus Revisi Dua Fase
1. Input & Mode Selection: Pengguna memasukkan prompt topik, menentukan jumlah slide, dan memilih salah satu dari 3 mode referensi visual:
   - Auto-Match Mode: AI menganalisis topik dan otomatis memilih 1 referensi layout terbaik dari library.
   - Manual Gallery Mode: Pengguna memilih manual 1 contoh layout dari galeri referensi.
   - No-Reference Mode: AI bekerja otonom menentukan layout berdasarkan kaidah kegunaan (UX Heuristics).
2. Fase A: Chat Prompt Feedback (Pre-Render Revision): AI Planner menghasilkan draf teks mentah dalam bentuk struktur JSON. Pengguna meninjau teks di layar dan dapat memasukkan revisi teks lewat kolom chat (Contoh: "Ubah nada bicara slide 3 menjadi lebih profesional"). AI memperbarui isi teks di dalam JSON tanpa mengganti arsitektur komponen.
3. Execution (Render): Pengguna mengklik tombol "Eksekusi Render". Backend menggabungkan data teks AI dengan aturan visual dari Brand Kit, lalu mengirimkannya ke Worker Engine.
4. Fase B: Post-Render Targeted Revision (Visual Revision): Hasil visual ditampilkan di kanvas. Jika terdapat kesalahan kecil, pengguna dilarang melakukan generate ulang total. Pengguna dapat:
   - Inline Text Editing: Mengklik teks langsung di kanvas dan mengetik perbaikan typo secara lokal.
   - Single-Slide AI Regeneration: Memilih 1 slide spesifik untuk di-generate ulang teks atau gambarnya oleh AI tanpa mengganggu slide lainnya.
5. Export: Pengguna mengunduh hasil akhir dalam format PDF atau kumpulan gambar (PNG/JPEG).

---

## 4. Functional Requirements (Spesifikasi Modul)

### 4.1. Modul 1: Brand Kit & Spesifikasi Layout Bersarang (Sisi Worker)
Modul ini berfungsi untuk mengunci variabel estetika merek dan menyediakan struktur layout yang rapi.

- FR-1.1 (Brand Kit Enforcement): Sistem wajib mengunci Font Family, kode warna, dan logo asli milik pengguna. Berkas referensi dari luar sama sekali tidak diizinkan mengubah variabel estetika ini.
- FR-1.2 (Outer Frame 9-Slot Grid): Elemen statis (Logo, Pagination, Tag) dikunci menggunakan koordinat grid 3x3 di luar safe area kanvas. Satu slot koordinat hanya boleh ditempati oleh maksimal 1 komponen metadata. Jika terjadi bentrokan, sistem UI otomatis menggeser komponen kedua ke slot kosong terdekat.
- FR-1.3 (Nested Groups & Token Spacing): Worker wajib mengelompokkan komponen ke dalam kontainer bersarang (nested auto-layout ala Figma) untuk menghindari teks yang terlalu renggang. Sistem pembagian jarak diatur sebagai berikut:
  * Micro Spacing (4px / 8px): Di dalam kontainer Core Content. Jarak antara teks Header dengan Body / Sub-header di bawahnya agar menyatu secara konteks.
  * Meso Spacing (12px / 16px): Di dalam kontainer Action / Footer. Jarak antar-baris pada komponen Checklist atau antar-item pada kumpulan Pills.
  * Macro Spacing (24px / 32px): Jarak antar-kontainer utama. Jarak dari kelompok Top Meta ke Core Content, atau dari Core Content ke Action / Footer.

### 4.2. Modul 2: Structural Reference Dataset & Fallback System
Modul untuk mengekstrak dan menangani arsitektur informasi dari konten eksternal secara aman.

- FR-2.1 (Structural DNA Extraction): Saat contoh gambar luar diunggah, Vision AI di backend hanya boleh mengekstrak susunan komponen dan rasio skala tipografi (header_to_body_ratio). Satuan ukuran piksel absolut dari gambar luar wajib diabaikan.
- FR-2.1.a (Typography Scale Multiplier Extraction): Vision AI diwajibkan mengekstrak nilai rasio perbandingan antara tinggi font Header utama terhadap font Body dari gambar referensi. Nilai ini disimpan dalam bentuk float multiplier pada properti header_to_body_ratio.
- FR-2.2 (Typography Scale Archetype): Hasil extraction ukuran teks dari referensi dipetakan ke dalam 3 kategori multiplier terhadap ukuran base body font yang dikunci di Brand Kit (Misal base font = 16px):
  * Editorial Bold (Rasio 3.5x - 4.5x): Teks header berukuran raksasa dan sangat mendominasi ruang slide.
  * Balanced Classic (Rasio 2.0x - 2.5x): Proporsi ukuran standar desain profesional.
  * Information Dense (Rasio 1.4x - 1.8x): Header berukuran kecil untuk menampung teks informasi yang padat.
- FR-2.3 (System Default Fallback Kit): Jika koleksi referensi di database kosong atau pengguna menggunakan mode No-Reference, sistem otomatis mengaktifkan Style Kit bawaan (Latar belakang solid #FFFFFF, teks hitam #111111, font bawaan sistem system-ui). Pilihan tombol Auto-Match di UI otomatis berstatus disabled.

### 4.3. Modul 3: AI Planner Engine (Fase Ideasi Teks)
- FR-3.1 (Autonomous Layout Selection): Jika sistem berjalan dalam mode No-Reference, AI Planner wajib menganalisis teks secara mandiri untuk memilih susunan komponen terbaik:
  * Teks kutipan pendek/dramatis -> Memilih skala Editorial Bold + Rata Tengah (Center-aligned).
  * Teks komparatif/perbandingan -> Membagi komponen menjadi layout 2 kolom (Split Screen).
  * Teks instruksional/prosedural -> Membungkus teks ke dalam tipe komponen checklist.
- FR-3.2 (Text Constraints): Prompt sistem wajib mengunci batas karakter secara ketat untuk menghindari kebocoran layout: Properti header maksimal 40 karakter, properti body maksimal 120 karakter.
- FR-3.3 (Planning Phase Feedback Loop): Sebelum menekan tombol "Eksekusi Render", user diberikan kolom teks Prompt Feedback di area bawah pratinjau teks. Jika user memasukkan feedback, backend akan mengirimkan kembali JSON draft awal beserta teks umpan balik tersebut ke AI Planner untuk diperbarui tanpa merusak skema awal.

### 4.4. Modul 4: Worker Rendering Engine (Fase Eksekusi Visual)
- FR-4.1 (Layout Archetypes): Worker menyediakan 3 jenis komposisi otomatis di area aman (Safe Zone) kanvas:
  * Text Dominant: Untuk slide tanpa gambar (susunan vertikal berbasis flexbox bersarang).
  * Split Screen: Untuk slide dengan gambar (Proporsi 60% teks di atas/kiri, 40% gambar di bawah/kanan menggunakan aturan CSS object-fit: cover).
  * Background Overlay: Khusus untuk slide tipe cover. Gambar memenuhi 100% latar belakang kanvas dan wajib dilapisi Scrim/Opacity Layer hitam transparan (40%-60%) di bawah teks putih untuk menjamin tingkat keterbacaan (readability).
- FR-4.2 (Failsafe Auto-Shrink Font): Jika AI Planner melanggar batas karakter, script Worker wajib mendeteksi overflow pada kanvas secara programatis dan menurunkan ukuran font-size secara bertahap (2-3px) hingga teks muat sempurna di dalam Safe Zone.
- FR-4.3 (Asynchronous Image Placeholder): Komponen gambar hasil generate AI wajib dirender sebagai kotak putih kosong terlebih dahulu di frontend agar aplikasi tidak membeku (freeze). Proses pemanggilan API gambar berjalan di latar belakang secara asynchronous.
- FR-4.4 (Post-Render Targeted Revision): Setelah visual selesai dirender di kanvas, sistem harus mendukung manipulasi parsial:
  1. Manual Inline Editing: Pengguna dapat mengklik komponen teks langsung di kanvas atau lewat panel form samping untuk mengubah karakter typo secara manual. Worker merender ulang secara lokal (< 100ms) tanpa memanggil API AI.
  2. Single-Slide AI Regeneration: User dapat memilih satu slide spesifik dan mengklik tombol "Regenerate Slide Ini". Backend hanya mengirimkan potongan data objek slide tersebut ke API untuk diperbarui, lalu menyisipkannya kembali ku array utama tanpa mengganggu status slide lainnya.
- FR-4.5 (Dynamic Typographic Rendering): Worker harus menghitung ukuran font Header secara dinamis di dalam kanvas dengan mengalikan nilai Base Body Font Size (dari Brand Kit) dengan header_to_body_ratio (dari referensi terpilih).

---

## 5. Technical Orchestration & Core Scenarios

### Skenario 5.1: Mode Auto-Match + Kebutuhan Gambar Async (Happy Path)
1. User menginput prompt teks topik agensi bisnis dan menyalakan mode Auto-Match.
2. Backend menyuntikkan daftar katalog indeks referensi ke dalam System Prompt, lalu memanggil API AI Planner.
3. AI Planner memproses topik, memecah konten per slide, menulis teks, dan memilih 1 ID referensi visual yang relevan dari katalog (Misal: "chosen_reference_id": "ref_editorial_009").
4. Hasil draf teks JSON dikirim ke frontend untuk di-review. User menyetujui dan mengklik tombol "Eksekusi Render".
5. Backend menarik data Visual DNA untuk ID ref_editorial_009 dari database (Terbaca properti: "header_to_body_ratio": 4.0 dan "forced_text_transform": "uppercase").
6. Backend jahit data visual tersebut dengan teks dari AI, lalu mengirimkannya ke Worker Engine.
7. Worker langsung merender elemen teks menggunakan font dari Brand Kit asli user. Ukuran header dihitung otomatis: 16px x 4.0 = 64px dengan transformasi huruf kapital (capslock).
8. Kotak gambar dirender sebagai placeholder putih kosong. Secara paralel (async), backend menembak API AI Image. Begitu file gambar (JPG) selesai dibuat, Worker langsung mengganti placeholder putih dengan gambar asli.

### Skenario 5.2: Mode No-Reference + Konten Hanya Teks (AI Autonomy)
1. User menulis prompt berisi poin tutorial dan memilih mode No-Reference.
2. Backend memanggil AI Planner tanpa menyuntikkan katalog referensi luar.
3. AI Planner mendeteksi konten bersifat poin instruksi, maka menulis properti "layout_archetype": "text_dominant", jenis komponen "type": "checklist", dan memilih skala standar "typography_scale": "balanced_classic".
4. Backend menggabungkan teks JSON dari AI langsung dengan aturan font dan warna asli dari Brand Kit user.
5. Worker membangun kontainer bersarang. Menggunakan nilai Base Font 16px dari Brand Kit dan skala Balanced Classic (2.0x) dari keputusan AI, Worker menghitung ukuran teks header secara presisi: 16px x 2.0 = 32px. Komponen checklist disusun rapat ke bawah menggunakan token Meso Spacing (12px).

### Skenario 5.3: Penanganan Failsafe (JSON Rusak / Syntax Error)
1. Saat fase generate draft teks, koneksi API terinterupsi sehingga menghasilkan string JSON tidak valid (Contoh: Kurang kurung kurawal penutup).
2. Parser JSON di backend menangkap error SyntaxError: Unexpected end of JSON input.
3. Sistem backend mengaktifkan mekanisme Silent Retry (maksimal 1 kali). Sistem menembak ulang API AI Planner secara otomatis di latar belakang dengan memberikan penekanan: "Output Anda sebelumnya rusak. Hasilkan ulang JSON yang valid sesuai skema!".
4. Jika retry sukses, draf teks dikirim ke frontend. Jika retry tetap gagal, sistem menampilkan pesan aman ke UI: "Sistem sedang sibuk, mohon klik tombol generate ulang".

---

## 6. Data Contract (JSON Schema Blueprint)

Berikut adalah struktur data final hasil penggabungan (data merging) yang dikirimkan backend ke Worker Engine untuk merender konten secara presisi:

{
  "project_metadata": {
    "topic": "Strategi Skala Bisnis Agensi Desain",
    "generation_mode": "auto_match",
    "selected_reference_id": "ref_editorial_009"
  },
  "theme_config": {
    "brand_assets": {
      "logo_url": "[https://storage.link/brand-logo.png](https://storage.link/brand-logo.png)",
      "logo_slot": 1,
      "pagination_slot": 8
    },
    "typography": {
      "header_font_family": "Lato-Bold",
      "body_font_family": "Nunito-Regular",
      "base_body_size_px": 16
    },
    "brand_colors": {
      "background": "#F5F5F7",
      "text_primary": "#111111",
      "accent": "#FF4500"
    }
  },
  "structural_layout_config": {
    "typography_scale_ratio": 4.0,
    "forced_text_transform": "uppercase",
    "spacing_tokens": {
      "canvas_padding": 32,
      "macro_gap": 24,
      "meso_gap": 12,
      "micro_gap": 6
    }
  },
  "slides": [
    {
      "slide_number": 1,
      "slide_type": "cover",
      "container_layout": "text_dominant",
      "nested_groups": {
        "top_meta": [
          { "type": "tag", "text": "AGENCY LIFE" }
        ],
        "core_content": [
          { 
            "type": "header", 
            "text": "Mulai Delegasikan Tugas Desain Anda" 
          },
          { 
            "type": "body", 
            "text": "Jangan terjebak menjadi bottleneck di bisnis Anda sendiri." 
          }
        ],
        "action_footer": [
          { 
            "type": "button_cta", 
            "label": "Baca Selengkapnya", 
            "style": "primary" 
          }
        ]
      }
    },
    {
      "slide_number": 2,
      "slide_type": "content",
      "container_layout": "split_screen",
      "nested_groups": {
        "top_meta": [
          { "type": "tag", "text": "STEP 1" }
        ],
        "core_content": [
          { 
            "type": "header", 
            "text": "Petakan Pengeluaran Waktu" 
          },
          { 
            "type": "body", 
            "text": "Catat aktivitas harian Anda selama satu minggu penuh untuk melihat tugas mana yang menyerap waktu paling banyak." 
          }
        ],
        "action_footer": [
          {
            "type": "image_placeholder",
            "requires_generation": true,
            "asset_type": "ui_mockup",
            "image_object_context": "A minimalist time tracking application interface with clean bars and dark mode style"
          }
        ]
      }
    }
  ]
}

---

## 7. Non-Functional Requirements & Constraints

- UI Layout Precision: Worker wajib menggunakan sistem tata letak modern (CSS Flexbox dan CSS Grid) secara kaku. Elemen dilarang menggunakan koordinat bebas non-grup agar tidak terjadi pergeseran piksel saat aplikasi dibuka di resolusi layar yang berbeda.
- Performance Latency: Fase penggabungan data visual dan teks di backend harus berjalan di bawah 500ms. Rendering gambar secara asynchronous tidak boleh memblokir jalannya aplikasi atau fungsi manipulasi teks di slide lain oleh user.
- API Cost Optimization: Melalui implementasi modul revisi parsial (FR-4.4), platform harus mampu menekan konsumsi token biaya API hingga 80% pada fase penyuntingan konten pasca-render dibandingkan sistem generator konvensional yang melakukan pemanggilan ulang total.