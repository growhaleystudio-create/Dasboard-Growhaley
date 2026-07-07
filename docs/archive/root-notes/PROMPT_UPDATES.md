# Perubahan System Prompt AI Content Generator

## Tanggal: 2026-06-16

---

## Update 2: Fix AI Salah Interpretasi Target Audience sebagai Topik Slide

### Masalah
AI carousel planner salah menginterpretasi struktur prompt user. Ketika user input:
```
Topik: Manfaat Landing Page
Target Audience: Pemilik bisnis online
```

AI membaca ini sebagai **daftar topik terpisah** dan generate:
- Slide 1: Manfaat Landing Page ✓
- Slide 2: Target Audience ✗ (harusnya masih bahas Manfaat Landing Page)
- Slide 3: Pemilik bisnis online ✗ (harusnya masih bahas Manfaat Landing Page)

Yang benar:
- **TOPIK** = tema yang harus dibahas di SEMUA slide konten
- **Target Audience** = konteks untuk siapa konten ditulis (bukan topik slide)

### Perubahan
**File**: `backend/src/content/sdui-planner/prompt/prompt-builder.ts` (line 224-232)

**Ditambahkan instruksi eksplisit:**
```
[TOPIK DAN KONTEKS KONTEN]
Prompt user berikut berisi TOPIK UTAMA yang harus dibahas di SELURUH carousel, 
serta konteks tambahan (target audience, angle, dll). Pahami struktur ini:
- TOPIK = tema/isi yang harus dibahas di semua slide konten (bukan hanya slide pertama)
- Target Audience = untuk siapa konten ini dibuat (bukan topik slide terpisah)
- Detail lain = konteks pendukung, bukan daftar slide terpisah

SEMUA slide konten harus membahas TOPIK yang sama dari angle berbeda. 
Jangan interpretasikan target audience atau konteks lain sebagai topik slide berikutnya.

Prompt user: ${input.prompt}
```

### Dampak
- AI sekarang paham bahwa **satu topik = semua slide membahas topik itu**
- Target audience diperlakukan sebagai **konteks**, bukan topik terpisah
- Carousel jadi kohesif: semua slide nyambung membahas satu tema

### Testing
Generate carousel dengan prompt:
```
Topik: Manfaat Landing Page
Target Audience: Pemilik bisnis online
```

Expected:
- Slide 1: Cover - Manfaat Landing Page
- Slide 2-9: Berbagai manfaat landing page (konversi, tracking, AB test, dll)
- Slide 10: CTA

Semua slide harus nyambung bahas **Manfaat Landing Page**, bukan loncat ke topik lain.

---

## Update 1: Perbaikan Bahasa Indonesia yang Natural

## Tanggal: 2026-06-16

## Masalah yang Diselesaikan
AI content generator menghasilkan konten bahasa Indonesia yang terdengar kaku, seperti hasil terjemahan literal dari bahasa Inggris. Konten tidak natural dan tidak sesuai dengan cara orang Indonesia berbicara sehari-hari.

## Perubahan yang Dilakukan

### 1. System Instruction Utama (Base Prompt)
**File**: `backend/src/content/content-generator-client.ts` (baris 109-125)

**Sebelum:**
```
Anda adalah spesialis pembuat konten pemasaran digital profesional.

ATURAN UTAMA: Kembalikan HANYA teks konten final yang siap posting. Tanpa penjelasan, tanpa markdown, tanpa heading, tanpa bold markers.
```

**Sesudah:**
```
Anda adalah spesialis pembuat konten pemasaran digital profesional yang ahli dalam menulis bahasa Indonesia yang natural dan engaging.

ATURAN UTAMA:
- Kembalikan HANYA teks konten final yang siap posting
- WAJIB gunakan bahasa Indonesia yang natural, tidak kaku, seperti native speaker
- Hindari terjemahan literal dari bahasa Inggris
- Gunakan idiom dan ungkapan yang umum dipakai orang Indonesia
- Tanpa penjelasan meta, tanpa markdown formatting, tanpa bold/italic markers
- Jangan gunakan kata seperti "Yuk", "Guys", "Cus", "Cusss" kecuali sesuai brand voice
```

### 2. Channel-Specific Constraints

#### Instagram
**Ditambahkan:**
- Bahasa harus natural seperti orang Indonesia berbicara, hindari terjemahan kaku
- Sesuaikan tone dengan target audience (casual untuk youth, lebih formal untuk profesional)
- Catatan penggunaan emoji: jangan berlebihan

#### LinkedIn
**Ditambahkan:**
- Gunakan bahasa Indonesia baku tapi tidak kaku, seperti profesional Indonesia berbicara
- Hindari jargon berlebihan atau istilah asing yang tidak perlu
- Tone: profesional dan informatif, tapi tetap approachable

#### Twitter/X
**Ditambahkan:**
- Bahasa harus punchy dan to-the-point, seperti orang Indonesia ngobrol santai di Twitter

#### Threads
**Ditambahkan:**
- Bahasa Indonesia yang sangat natural, seperti chat di WhatsApp atau story IG
- Boleh pakai bahasa gaul yang umum, tapi jangan maksa
- Seperti ngobrol dengan teman

#### Email Marketing
**Ditambahkan:**
- Bahasa sopan tapi hangat, seperti email dari kolega profesional Indonesia
- Hindari bahasa terlalu formal yang terdengar seperti surat resmi

#### Facebook
**Ditambahkan:**
- Bahasa harus sangat relatable untuk audience Indonesia
- Tone bisa lebih conversational dan storytelling dibanding LinkedIn

## Dampak yang Diharapkan

1. **Konten lebih natural**: Tidak terdengar seperti terjemahan Google Translate
2. **Lebih engaging**: Bahasa yang digunakan sesuai dengan cara target audience berkomunikasi
3. **Platform-appropriate**: Setiap channel punya karakteristik bahasa yang berbeda
4. **Brand consistency**: Tetap bisa disesuaikan dengan brand voice melalui template systemPrompt

## Testing yang Disarankan

1. Generate konten untuk masing-masing channel (Instagram, LinkedIn, Twitter, Threads, Email, Facebook)
2. Bandingkan hasil sebelum dan sesudah perubahan
3. Verifikasi bahwa:
   - Bahasa tidak kaku/literal
   - Tone sesuai dengan channel
   - Tidak ada kata-kata cringe yang tidak perlu ("yuk guys cus")
   - Tetap mengikuti constraint karakter maksimal
   - Masih bisa di-override oleh template systemPrompt jika ada

## File yang Dimodifikasi

- `backend/src/content/content-generator-client.ts`

## Catatan Teknis

- Perubahan ini hanya mengubah prompt, tidak mengubah arsitektur atau logika code
- Build berhasil tanpa error
- Backward compatible dengan template yang sudah ada
- Template custom tetap bisa override behavior ini melalui `systemPrompt` field
