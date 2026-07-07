# PRD: Quantitative Research Survey Module

**Date:** 2026-06-20  
**Product:** Leads Generation Dashboard  
**Status:** Draft  
**Owner:** Product / Dashboard Team

---

## 1. Overview

Produk ini akan menambahkan modul baru di dalam dashboard untuk membantu team menjalankan **quantitative UX research** melalui survey terstruktur yang mirip Google Forms, tetapi terintegrasi dengan kemampuan **AI-assisted analysis**.

Modul ini memungkinkan team membuat survey, membagikan public link kepada participant, mengumpulkan response, menganalisis hasil secara kuantitatif, dan menghasilkan insight otomatis dengan bantuan AI.

Posisi produk ini adalah **quantitative-first research tool** dengan dukungan **limited qualitative context**, bukan full qualitative research platform. Artinya, struktur utamanya tetap berpusat pada data terukur, analytics, dan pola agregat, sementara input open-ended dipakai sebagai pelengkap untuk memperkaya interpretasi.

Pendekatan produk dibagi menjadi dua tahap:

- **V1:** membangun fondasi survey quantitative yang solid, manual, dan production-ready.
- **V2:** menambahkan opsi **AI-assisted research mode** saat membuat survey, sehingga creator dapat memilih metode manual atau assisted AI.

---

## 2. Problem Statement

Saat ini dashboard belum memiliki modul khusus untuk research quantitative. Team yang ingin menjalankan UX research harus menggunakan tool eksternal seperti Google Forms, Typeform, atau platform survey lain, lalu memindahkan data dan analisis secara manual ke workflow internal.

Hal ini menimbulkan beberapa masalah:

1. **Fragmentasi workflow** — pembuatan survey, distribusi, pengumpulan data, dan analisis terjadi di tool terpisah.
2. **Analisis manual memakan waktu** — terutama untuk open-ended response dan pencarian pola antar jawaban.
3. **Tidak ada integrasi native dengan workflow team** — research tidak hidup di dashboard yang sama dengan aktivitas operasional lain.
4. **Kesempatan insight terlewat** — team sering hanya melihat data permukaan tanpa summary, clustering, atau pattern detection yang lebih kuat.

---

## 3. Product Vision

Menyediakan modul research di dalam dashboard yang memungkinkan team:

- membuat survey quantitative dengan cepat,
- membagikannya melalui public link,
- mengumpulkan response secara terstruktur,
- melihat analytics kuantitatif secara langsung,
- dan mendapatkan insight otomatis dari AI tanpa keluar dari platform.

Dalam jangka panjang, modul ini akan berkembang dari **survey builder + analyzer** menjadi **research operating system** dengan mode manual maupun AI-assisted.

---

## 4. Goals

### Primary Goals

1. Memungkinkan team membuat dan menjalankan survey quantitative langsung dari dashboard.
2. Mendukung tipe pertanyaan utama yang dibutuhkan untuk UX research quantitative.
3. Menyediakan analytics kuantitatif yang mudah dipahami tanpa perlu tool eksternal.
4. Menyediakan analisis AI untuk mempercepat interpretasi hasil research.
5. Menjaga isolasi data per team dan kontrol akses berbasis role.

### Secondary Goals

1. Mengurangi ketergantungan pada Google Forms / Typeform untuk use case internal.
2. Mempercepat waktu dari data collection ke insight.
3. Menyiapkan arsitektur yang bisa dikembangkan ke AI-assisted adaptive research di V2.

---

## 5. Non-Goals

Untuk menghindari scope creep, hal-hal berikut **bukan target utama V1**:

1. Full conversational AI interview.
2. Real-time per-question AI branching selama participant mengisi survey.
3. File upload sebagai instrumen riset utama.
4. Advanced collaboration seperti inline comments, version diff review, atau multi-editor live presence.
5. Full statistical engine setara SPSS / Qualtrics.
6. Survey monetization, panel recruitment, atau incentive management.

Catatan: beberapa hal di atas dapat dipertimbangkan sebagai evolusi pasca-V2.

---

## 6. Target Users

### Internal Users (Authenticated)

1. **Admin**
   - Membuat, mengedit, mempublikasikan, menutup, dan menganalisis survey.
   - Mengatur akses dan konfigurasi AI bila diperlukan.

2. **Member**
   - Membuat dan mengelola survey.
   - Melihat response dan analytics.
   - Menggunakan fitur AI analysis sesuai izin team.

3. **Viewer**
   - Melihat hasil, dashboard, dan summary bila diizinkan.
   - Tidak dapat mengubah struktur survey.

### External Users (Unauthenticated)

4. **Participant**
   - Mengakses survey melalui public link tanpa harus login.
   - Mengisi dan submit response.

---

## 7. User Stories

### Survey Creation

- Sebagai Admin/Member, saya ingin membuat survey baru agar saya dapat mengumpulkan data research.
- Sebagai Admin/Member, saya ingin menambah, menghapus, dan mengurutkan pertanyaan agar survey sesuai kebutuhan studi.
- Sebagai Admin/Member, saya ingin memilih tipe pertanyaan yang berbeda agar saya dapat mengumpulkan data numerik dan opini singkat.
- Sebagai Admin/Member, saya ingin menambahkan rule conditional logic agar pertanyaan yang tampil lebih relevan.

### Distribution

- Sebagai Admin/Member, saya ingin mempublikasikan survey dan mendapatkan public link agar participant bisa langsung mengisi.
- Sebagai participant, saya ingin mengisi survey tanpa login agar prosesnya cepat dan friction rendah.

### Analytics

- Sebagai Admin/Member, saya ingin melihat chart per pertanyaan agar saya cepat memahami distribusi jawaban.
- Sebagai Admin/Member, saya ingin memfilter response agar saya bisa menganalisis segmen tertentu.
- Sebagai Admin/Member, saya ingin export data agar saya bisa mengolahnya di tool lain bila perlu.

### AI Analysis

- Sebagai Admin/Member, saya ingin AI merangkum hasil survey agar saya bisa lebih cepat mendapatkan insight utama.
- Sebagai Admin/Member, saya ingin AI menganalisis jawaban open-ended agar pola tema lebih cepat terlihat.
- Sebagai Admin/Member, saya ingin AI membantu membaca karakteristik participant secara agregat agar saya bisa memahami kelompok response dengan lebih baik.

---

## 8. V1 Scope

V1 difokuskan pada **manual quantitative survey workflow** yang stabil dan berguna untuk penggunaan nyata.

### 8.1 Survey Builder

V1 harus mendukung:

- membuat survey baru,
- menyimpan judul dan deskripsi survey,
- menyimpan **project goal / research objective** sebagai konteks utama research,
- menyimpan background / context tambahan (opsional),
- menyimpan target participant (opsional),
- menyimpan primary decision to support (opsional),
- menambah / menghapus / mengubah urutan pertanyaan,
- menyimpan status draft / published / closed,
- preview survey sebelum publish.

`Project goal / research objective` direkomendasikan menjadi field penting saat create research karena akan membantu creator dan team memahami tujuan studi sejak awal. Field ini juga dapat dipakai oleh sistem AI pada V1 untuk membuat summary yang lebih relevan terhadap tujuan research.

### 8.2 Supported Question Types

V1 akan mendukung tipe pertanyaan berikut:

1. **Short text**
2. **Long text / paragraph**
3. **Multiple choice**
4. **Checkboxes**
5. **Dropdown**
6. **Linear scale / rating**
7. **Matrix / grid question**

Catatan:
- Walau produk diarahkan ke quantitative research, short text dan long text tetap didukung untuk menangkap konteks tambahan singkat.
- Matrix/grid penting untuk kebutuhan UX research seperti satisfaction rating lintas fitur.

### 8.3 Question Configuration

Untuk V1, setiap pertanyaan dapat memiliki:

- label / question title,
- helper text / description,
- required flag,
- options (untuk choice-based question),
- validation rules dasar,
- display order,
- conditional logic rules,
- randomize option order (khusus tipe tertentu, bila diaktifkan).

### 8.4 Conditional Logic

V1 akan mendukung **manual conditional logic** berbasis aturan sederhana, misalnya:

- jika jawaban Q1 = "Ya", tampilkan Q2,
- jika jawaban Q3 berada pada range tertentu, tampilkan blok pertanyaan lanjutan,
- jika jawaban tertentu dipilih, lewati pertanyaan yang tidak relevan.

Tujuan fitur ini adalah membuat survey lebih relevan tanpa bergantung pada AI.

Batasan V1:
- conditional logic difokuskan pada **simple rule-based branching**,
- belum menargetkan nested logic yang sangat kompleks,
- belum menargetkan visual logic tree builder tingkat lanjut.

### 8.5 Survey Access & Distribution

V1 harus mendukung:

- public link untuk participant,
- akses tanpa login untuk mengisi survey,
- kontrol publish/unpublish dari sisi creator,
- opsi menutup survey secara manual,
- response quota / maximum response count,
- auto-close ketika quota tercapai.

### 8.6 Response Collection

V1 harus menyimpan:

- metadata survey,
- jawaban participant,
- waktu submit,
- status completion,
- phase / version response bila dibutuhkan untuk evolusi berikutnya.

V1 tidak perlu memaksa identitas participant kecuali creator memang menambahkan pertanyaan identitas di survey.

### 8.7 Analytics Dashboard

V1 harus menyediakan dashboard analytics untuk survey yang mencakup:

- total responses,
- completion rate,
- distribusi jawaban per pertanyaan,
- chart per question (bar, pie, line/trend bila relevan),
- summary statistik sederhana,
- filter berdasarkan tanggal, completion status, dan jawaban tertentu,
- segment exploration dasar.

Scope analytics V1 sengaja dibatasi agar tetap fokus dan cepat usable. Segmentasi yang ditargetkan pada tahap awal adalah segmentasi sederhana berbasis:
- rentang waktu,
- status penyelesaian response,
- jawaban pada pertanyaan tertentu.

V1 belum menargetkan advanced analytics builder setara BI tool atau product analytics platform.

### 8.8 AI Features in V1

AI pada V1 difokuskan pada **post-response analysis**, bukan pertanyaan adaptif real-time.

V1 AI features:

1. **AI summary overall survey**
   - merangkum insight utama,
   - menuliskan highlights,
   - menyebut pola dominan,
   - menyarankan interpretasi awal.

2. **AI analysis per question**
   - terutama untuk open-ended response,
   - kategorisasi tema,
   - sentiment / tone summary bila relevan,
   - deteksi pain points atau recurring themes.

3. **AI aggregate respondent insights**
   - bukan profiling individu sensitif,
   - tetapi rangkuman pola kelompok participant berdasarkan jawaban agregat,
   - membantu membaca karakteristik responden secara umum tanpa memosisikan sistem sebagai alat profiling personal.

4. **Goal-aware AI interpretation**
   - AI analysis dan summary harus mempertimbangkan `project goal / research objective` yang dimasukkan creator,
   - insight yang dihasilkan harus dikaitkan kembali ke tujuan research,
   - sistem harus membantu user menjawab apakah data yang terkumpul mendukung objective awal atau belum.

Catatan penting:
- V1 AI harus diposisikan sebagai **assistant**, bukan single source of truth.
- Hasil AI harus bisa direview oleh user.
- AI tidak boleh mengubah response mentah.

### 8.9 Export

V1 harus menyediakan export baseline:

- CSV,
- JSON.

Excel dapat diposisikan sebagai **post-MVP enhancement** bila effort implementasinya lebih besar dari nilai awal yang diberikannya.

Dengan demikian, komitmen minimum V1 adalah CSV + JSON, sementara Excel bukan dependency wajib untuk validasi produk awal.

### 8.10 Permissions & Isolation

V1 harus mengikuti prinsip existing platform:

- survey dan response terisolasi per team,
- hanya user login yang bisa melihat / edit / analisa survey,
- participant publik hanya bisa mengakses form publik,
- role internal menentukan apakah user bisa create/edit/publish/analyze.

---

## 9. V2 Direction

V2 memperkenalkan **survey creation mode** saat user ingin membuat research baru:

1. **Manual Mode**
   - flow seperti V1,
   - semua pertanyaan ditentukan creator,
   - conditional logic tetap manual.

2. **AI-Assisted Mode**
   - creator memilih objective research,
   - creator mengisi project goal / research objective sebagai konteks utama AI,
   - creator dapat menambahkan background / context tambahan,
   - menentukan batas jumlah phase,
   - menentukan batas jumlah pertanyaan per phase,
   - menetapkan batas total pertanyaan,
   - mengarahkan AI dengan constraint dan topic guardrails.

### 9.1 V2 Core Idea

Pada AI-Assisted Mode, survey tidak hanya statis. Setelah participant menyelesaikan phase tertentu, sistem dapat menghasilkan **phase berikutnya** berdasarkan jawaban phase sebelumnya.

Contoh:
- Phase 1 berisi 5 pertanyaan fixed yang sama untuk semua participant.
- Setelah phase 1 selesai, AI menganalisis jawaban participant.
- Sistem menampilkan pesan seperti: **"Pertanyaan berikut sedang disiapkan..."**
- AI menghasilkan phase 2 yang relevan berdasarkan jawaban sebelumnya.
- Creator telah menetapkan guardrails sebelumnya agar pertanyaan tetap relevan dan tidak melebar.

### 9.2 V2 Guardrails

Agar AI-assisted research tetap aman dan berguna, V2 harus memiliki batasan seperti:

- maximum phases,
- maximum questions per phase,
- maximum total questions,
- relevance guardrails,
- forbidden topics,
- allowed question types,
- duplication prevention,
- anti-sensitive-question policy,
- audit log untuk generated question.

### 9.3 V2 Benefits

- survey terasa lebih adaptif,
- participant mendapatkan pertanyaan lanjutan yang lebih relevan,
- research dapat menggabungkan pendekatan quantitative dengan eksplorasi kualitatif yang lebih terarah,
- creator punya opsi antara workflow klasik dan workflow AI-assisted.

### 9.4 V2 Risks

- latency saat generate phase baru,
- biaya AI per response meningkat,
- kualitas pertanyaan AI bisa bervariasi,
- hasil antar participant tidak seragam, sehingga analisis kuantitatif lintas participant lebih sulit,
- perlu guardrails ketat untuk menghindari pertanyaan yang bias, repetitif, atau sensitif.

Secara metodologis, AI-Assisted Mode lebih cocok untuk **exploratory deepening** dibanding **standardized benchmarking**. Karena pertanyaan lanjutan dapat berbeda antar participant, hasilnya tidak selalu comparable secara penuh seperti survey manual yang seluruh pertanyaannya seragam.

Karena itu, V2 diposisikan sebagai **mode opsional**, bukan pengganti total manual mode.

---

## 10. Functional Requirements

### V1 Functional Requirements

1. System harus memungkinkan authenticated team member membuat survey.
2. System harus mewajibkan atau sangat menonjolkan input `project goal / research objective` saat create research.
3. System harus memungkinkan creator menambah, menghapus, dan mengurutkan pertanyaan.
4. System harus mendukung short text, paragraph, multiple choice, checkboxes, dropdown, rating, dan matrix.
5. System harus mendukung rule conditional logic manual.
6. System harus memungkinkan survey dipublish sebagai public link.
7. Participant harus bisa mengisi survey tanpa login.
8. System harus menyimpan response secara terstruktur.
9. System harus menampilkan analytics kuantitatif per survey.
10. System harus menyediakan AI summary dan AI analysis terhadap response.
11. AI summary harus mempertimbangkan `project goal / research objective` sebagai konteks interpretasi.
12. System harus menyediakan export data.
13. System harus membatasi akses data survey berdasarkan team dan role.

### V2 Functional Requirements (Directional)

1. System harus menyediakan pilihan Manual Mode vs AI-Assisted Mode saat membuat research.
2. System harus memungkinkan creator menetapkan batas phase dan question generation.
3. System harus dapat menghasilkan pertanyaan phase berikutnya berdasarkan phase sebelumnya.
4. System harus menerapkan guardrails pada generated questions.
5. System harus menyimpan jejak generated question untuk audit dan review.

---

## 11. Non-Functional Requirements

1. **Security & privacy**
   - team isolation wajib,
   - public submission endpoint aman,
   - AI processing tidak boleh membocorkan data antar team.

2. **Performance**
   - survey publik harus cepat dibuka,
   - submit response harus responsif,
   - analytics dashboard harus tetap usable pada response volume menengah.

3. **Reliability**
   - response submission tidak boleh hilang saat submit sukses,
   - survey publish/close state harus konsisten.

4. **Auditability**
   - perubahan penting survey tercatat,
   - penggunaan AI analysis idealnya dapat ditelusuri.

5. **Scalability**
   - desain V1 harus memungkinkan penambahan AI-assisted phase generation di V2 tanpa rewrite total.

---

## 12. UX Principles

1. **Simple for creators**
   - builder harus terasa familiar seperti form builder umum.

2. **Low friction for participants**
   - public link, cepat, mobile-friendly, tidak butuh login.

3. **Clear insight over raw complexity**
   - analytics harus mudah dipahami, bukan hanya dump data.

4. **AI as assistant, not controller**
   - AI memberi insight dan bantuan, bukan mengambil alih keputusan user secara tidak transparan.

5. **Safe evolution path**
   - V1 harus kokoh sebagai produk mandiri meskipun V2 belum dibangun.

---

## 13. Success Metrics

### V1 Success Metrics

1. Jumlah survey yang dibuat per team.
2. Publish-to-response conversion rate.
3. Average completion rate per survey.
4. Persentase survey yang menggunakan AI analysis.
5. Waktu rata-rata dari survey close ke first insight review.
6. Jumlah export yang dilakukan user.

### V2 Success Metrics

1. Persentase creator yang memilih AI-Assisted Mode.
2. Completion rate per phase pada assisted survey.
3. Average AI-generated phase acceptance / usefulness feedback.
4. Latency rata-rata generation phase berikutnya.

---

## 14. Open Questions

Beberapa hal yang masih perlu diputuskan saat masuk tahap desain teknis:

1. Apakah randomize options wajib untuk semua choice question atau hanya tipe tertentu?
2. Apakah anonymous response perlu dibedakan dari pseudonymous response pada model data?
3. Apakah AI analysis dijalankan sinkron on-demand atau async via background job?
4. Bagaimana policy retention untuk response dan AI-generated analysis?
5. Untuk V2, apakah generated phase akan disimpan sebagai immutable trace per participant?

---

## 15. Recommended Rollout Strategy

### Phase 1
- Survey builder manual
- Public link
- Core question types
- Response storage

### Phase 2
- Analytics dashboard
- Export
- AI summary & per-question analysis

### Phase 3
- Hardening, permissions, audit trail, optimization
- Preparation for V2 architecture hooks

### Future Phase (V2)
- Mode selection: Manual vs AI-Assisted
- Multi-phase adaptive questioning
- Guardrails and AI governance layer

---

## 16. Summary

Modul ini akan memperluas dashboard dari tool operasional menjadi tool research yang lebih kuat. Strategi produk yang direkomendasikan adalah:

- **V1:** deliver workflow quantitative research yang solid, jelas, dan usable sekarang.
- **V2:** tambah opsi AI-Assisted Mode sebagai diferensiasi produk, dengan guardrails yang ketat.

Pendekatan ini menyeimbangkan **value jangka pendek** dan **innovation jangka menengah**, sambil menjaga risiko produk dan teknis tetap terkendali.
