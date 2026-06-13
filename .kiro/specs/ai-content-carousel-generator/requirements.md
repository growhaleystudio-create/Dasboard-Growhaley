# Requirements Document

## Introduction

AI Content/Carousel Generator adalah perluasan dari Leads Generation Dashboard yang memungkinkan Team menghasilkan materi konten media sosial — baik teks (caption/copy) maupun gambar carousel multi-slide — yang tetap konsisten dengan identitas brand (on-brand) sambil mengizinkan variasi kreatif tata letak antar-slide. Fitur ini ditujukan agar Team dapat memproduksi konten promosi yang seragam secara visual tanpa menggambar ulang elemen brand secara manual pada setiap slide.

Pendekatan yang dipakai bersifat hibrida: elemen brand yang wajib identik di seluruh keluaran (logo, font brand, warna brand, dan "chrome" tetap seperti penempatan logo, penomoran halaman, dan URL situs) dirender secara deterministik oleh kode dari sebuah Brand_Kit tersimpan, dan TIDAK pernah digambar atau ditebak oleh model gambar AI. Yang boleh bervariasi secara kreatif per-slide hanya tata letak (komposisi blok) dan latar (background) hasil AI gambar. Pemrosesan dibagi menjadi dua tahap yang dapat diuji dan dikendalikan: Planner (model teks AI) menghasilkan rencana konten terstruktur dalam bentuk JSON tervalidasi, lalu Renderer (kode deterministik) merender setiap blok memakai aset Brand_Kit asli dan menyusun chrome tetap menjadi slide PNG final.

Fitur ini menggunakan ulang mekanisme AI yang sudah ada pada Requirement 13 dokumen induk: kunci API Gemini terenkripsi per-Team (bring-your-own key), AI_Call_Budget jendela bergulir 30 hari, pencatatan setiap panggilan AI pada `ai_call_log` dan Audit_Log, serta pemrosesan latar belakang berbasis antrean. AI_Provider_Endpoint yang dipakai dapat dikonfigurasi secara eksplisit oleh Admin per-Team: API resmi Google Generative Language menjadi nilai bawaan, sementara Admin boleh mengonfigurasi endpoint pihak ketiga atau proxy yang disetujui. Konfigurasi endpoint bersifat sengaja (deliberate) dan tidak boleh disimpulkan secara implisit dari bentuk atau awalan kunci API. Isolasi multi-tenant (R2.8 dokumen induk), kepatuhan privasi (R11 dokumen induk), dan otorisasi berbasis peran (R2 dokumen induk) tetap berlaku dan diperluas dengan hak akses khusus konten.

Konsep "belajar dari template" pada fitur ini BUKAN pelatihan ulang model (model training), melainkan pengondisian dalam-konteks (in-context conditioning) dan pengambilan contoh (retrieval): aturan keras berasal dari Master_Template, dan contoh-contoh yang disetujui User (Approved_Example) disuntikkan sebagai panduan few-shot kepada Planner. Bila Master_Template dan Approved_Example bertentangan, Master_Template selalu menang.

Stack teknologi target selaras dengan dokumen induk: frontend React/Next.js, backend Node.js (TypeScript), basis data PostgreSQL, antrean kerja (BullMQ di atas Redis), dan penyimpanan objek (object storage) untuk aset gambar. Dokumen ini mendefinisikan kebutuhan menggunakan pola EARS dan aturan kualitas INCOSE.

## Glossary

- **System**: Aplikasi Leads Generation Dashboard secara keseluruhan, termasuk perluasan AI Content/Carousel Generator yang didefinisikan dokumen ini.
- **User**, **Team**, **Admin**, **Member**, **Viewer**, **Auth_Service**, **Audit_Log**, **Personal_Data**, **AI_Provider**, **AI_Call_Budget**: sebagaimana didefinisikan pada Glossary dokumen induk (`leads-generator-dashboard/requirements.md`) dan berlaku tanpa perubahan pada dokumen ini.
- **AI_Provider_Endpoint**: Alamat tujuan (base URL) layanan AI_Provider yang dipakai untuk panggilan teks Planner dan panggilan gambar Background_Image. AI_Provider_Endpoint dikonfigurasi secara eksplisit oleh Admin per-Team sebagai setelan tersimpan; nilai bawaannya adalah API resmi Google Generative Language, dan Admin boleh menggantinya dengan endpoint pihak ketiga atau proxy yang disetujui. AI_Provider_Endpoint tidak pernah disimpulkan dari bentuk atau awalan kunci API.
- **Content_Generator_Service**: Komponen backend yang mengoordinasikan pembuatan konten, mencakup pemanggilan Planner, validasi Content_Plan, pemicuan Renderer, serta pengelolaan status pekerjaan pembuatan konten.
- **Brand_Kit**: Sekumpulan aset dan parameter identitas brand tingkat Team yang dipakai Renderer secara deterministik, terdiri dari berkas logo (PNG transparan), satu atau lebih berkas font brand (.ttf atau .otf), daftar warna brand dalam format heksadesimal, serta definisi chrome tetap (penempatan logo, format penomoran halaman, dan URL situs).
- **Brand_Font**: Berkas font (.ttf atau .otf) milik Team yang diunggah dan disimpan sebagai bagian dari Brand_Kit, dipakai Renderer untuk merender teks pada slide.
- **Master_Template** (disebut juga Content_Template): Definisi otoritatif tingkat Team/brand yang memuat aturan keras (hard rules) pembuatan konten, mencakup acuan Brand_Kit, kumpulan Content_Block yang diizinkan, batas jumlah Slide, batas panjang teks per blok, rasio aspek yang didukung, dan nada (tone) bawaan. Master_Template selalu dipatuhi dan tidak dapat ditimpa oleh Planner maupun Approved_Example.
- **Carousel**: Satu keluaran konten yang terdiri dari satu atau lebih Slide berurutan yang berbagi chrome tetap dan identitas Brand_Kit yang sama.
- **Slide**: Satu halaman tunggal dari sebuah Carousel, terdiri dari chrome tetap, satu latar (background), dan satu atau lebih Content_Block yang disusun menurut sebuah Slide_Layout.
- **Content_Block**: Satuan konten pada sebuah Slide dengan tipe dari kumpulan yang diizinkan: heading, body, mockup, chart, quote, stat, bullet, cta, dan image.
- **Slide_Layout**: Varian tata letak terdefinisi (preset) untuk sebuah Slide yang menentukan penataan posisi Content_Block; dipilih per-Slide dan boleh berbeda antar-Slide.
- **Chrome**: Elemen tetap yang dirender identik pada setiap Slide dalam satu Carousel, terdiri dari logo brand, penomoran halaman (contoh: 1/5), dan URL situs, yang seluruhnya bersumber dari Brand_Kit.
- **Content_Plan**: Keluaran terstruktur Planner dalam format JSON yang mendeskripsikan jumlah Slide, daftar Content_Block per Slide beserta teksnya, data chart, dan kebutuhan mockup; tervalidasi terhadap Content_Plan_Schema sebelum dirender.
- **Content_Plan_Schema**: Skema yang membatasi Content_Plan agar hanya memuat tipe Content_Block yang diizinkan, jumlah Slide dalam batas yang ditetapkan, dan panjang teks per blok dalam batas yang ditetapkan.
- **Planner**: Komponen yang memanggil model teks AI_Provider untuk mengubah prompt User, aturan Master_Template, dan Approved_Example yang relevan menjadi sebuah Content_Plan.
- **Renderer**: Komponen kode deterministik yang merender setiap Content_Block dan chrome menjadi gambar Slide final memakai aset Brand_Kit asli, tanpa memanggil model gambar AI untuk menggambar teks, logo, chart, atau mockup.
- **Background_Image**: Latar visual sebuah Slide yang dihasilkan oleh model gambar AI_Provider, tidak memuat teks, logo, angka, chart, maupun mockup.
- **Approved_Example**: Sebuah hasil Carousel yang ditandai "disetujui" oleh User berwenang; struktur tata letaknya (dalam bentuk JSON) disimpan ke Example_Library dan dapat disuntikkan sebagai panduan few-shot ke Planner.
- **Example_Library**: Kumpulan Approved_Example tingkat Team yang bertambah seiring User menyetujui lebih banyak hasil, dipakai untuk menyelaraskan keluaran Planner dengan selera Team tanpa pelatihan ulang model.
- **Content_Generation_Job**: Satu kali eksekusi pembuatan Carousel yang diproses secara latar belakang melalui antrean, memiliki status keseluruhan (pending, success, atau failed) dan status per-Slide.
- **Object_Storage**: Layanan penyimpanan objek tempat aset gambar Slide final disimpan dan diacu melalui URL, bukan disimpan sebagai blob base64 di basis data.
- **Content_Plan_Validator**: Komponen yang memvalidasi Content_Plan terhadap Content_Plan_Schema dan aturan Master_Template.

## Requirements

### Requirement 1: Penyimpanan dan Pengelolaan Brand Kit

**User Story:** Sebagai Admin, saya ingin menyimpan aset identitas brand Team (logo, font, warna, dan chrome) di satu tempat, sehingga setiap konten yang dihasilkan menggunakan elemen brand yang asli dan konsisten.

#### Acceptance Criteria

1. WHEN Admin menyimpan Brand_Kit dengan satu berkas logo berformat PNG transparan berukuran maksimum 5 MB, setidaknya satu Brand_Font berformat .ttf atau .otf berukuran maksimum 5 MB per berkas, dan setidaknya satu warna brand dalam format heksadesimal yang valid, THE Content_Generator_Service SHALL menyimpan setiap berkas aset ke Object_Storage, menyimpan acuan URL Object_Storage beserta daftar warna heksadesimal pada Brand_Kit Team, dan mencatat operasi pada Audit_Log beserta pelaku dan waktu.
2. THE Content_Generator_Service SHALL menyimpan definisi chrome pada Brand_Kit berupa penempatan logo, format penomoran halaman, dan URL situs yang dipakai Renderer pada setiap Slide.
3. IF Admin menyimpan Brand_Kit dengan berkas logo berformat selain PNG transparan (contoh: berkas .ttf yang dikirim sebagai logo), Brand_Font berformat selain .ttf atau .otf, berkas melebihi 5 MB, atau nilai warna yang bukan heksadesimal valid, THEN THE Content_Generator_Service SHALL menolak penyimpanan tanpa mengubah Brand_Kit yang sudah ada, tanpa menyimpan satu pun aset ke Object_Storage (tanpa penyimpanan sebagian), dan menampilkan pesan kesalahan validasi yang menyebutkan aset yang tidak valid.
4. IF Admin menyimpan Brand_Kit tanpa berkas logo, tanpa Brand_Font, atau tanpa setidaknya satu warna brand, THEN THE Content_Generator_Service SHALL menolak penyimpanan tanpa menyimpan satu pun aset ke Object_Storage dan menampilkan pesan kesalahan validasi yang menyebutkan komponen mana (logo, Brand_Font, atau warna brand) yang belum disediakan.
5. THE Content_Generator_Service SHALL menyimpan berkas aset Brand_Kit ke Object_Storage dan menyimpan hanya acuan URL pada basis data, tanpa menyimpan konten berkas aset sebagai blob base64 pada basis data.
6. THE Content_Generator_Service SHALL membatasi setiap Brand_Kit beserta seluruh asetnya pada Team pemiliknya dan menolak akses dari Team lain.

### Requirement 2: Penyusunan Master Template

**User Story:** Sebagai Admin, saya ingin menyusun Master_Template yang memuat aturan keras pembuatan konten, sehingga seluruh konten Team mematuhi batasan brand dan struktur yang ditetapkan.

#### Acceptance Criteria

1. WHEN Admin menyimpan Master_Template yang mengacu pada Brand_Kit Team yang sudah tersimpan, memuat kumpulan Content_Block yang diizinkan sebagai subset dari {heading, body, mockup, chart, quote, stat, bullet, cta, image}, batas jumlah Slide antara 1 sampai 10 inklusif, batas panjang teks per blok, dan setidaknya satu rasio aspek dari {1:1, 4:5, 9:16}, THE Content_Generator_Service SHALL menyimpan Master_Template untuk Team tersebut dan mencatat operasi pada Audit_Log beserta pelaku dan waktu.
2. THE Content_Generator_Service SHALL menetapkan nada (tone) bawaan dan kumpulan Content_Block yang diizinkan pada Master_Template sebagai aturan yang dipakai Planner pada setiap pembuatan Content_Plan untuk Team tersebut.
3. IF Admin menyimpan Master_Template yang mengacu pada Brand_Kit yang tidak ada pada Team, memuat tipe Content_Block di luar kumpulan yang diizinkan, batas jumlah Slide di luar rentang 1 sampai 10, atau tanpa rasio aspek yang didukung, THEN THE Content_Generator_Service SHALL menolak penyimpanan tanpa mengubah Master_Template yang sudah ada dan menampilkan pesan kesalahan validasi yang menyebutkan aturan yang dilanggar.
4. WHERE Team belum memiliki Brand_Kit tersimpan, THE Content_Generator_Service SHALL menolak penyimpanan Master_Template dan menampilkan pesan kesalahan bahwa Brand_Kit wajib disusun terlebih dahulu.
5. THE Content_Generator_Service SHALL membatasi setiap Master_Template pada Team pemiliknya dan menolak akses dari Team lain.

### Requirement 3: Pembuatan Rencana Konten dari Prompt (Planner)

**User Story:** Sebagai Member, saya ingin memasukkan prompt deskripsi konten, sehingga Planner menghasilkan rencana konten terstruktur yang sesuai dengan permintaan saya dan aturan Master_Template.

#### Acceptance Criteria

1. WHEN Member memicu pembuatan Carousel dengan sebuah prompt sepanjang 1 sampai 2.000 karakter dan Team memiliki Master_Template tersimpan, THE Content_Generator_Service SHALL memasukkan permintaan tersebut ke antrean latar belakang sebagai Content_Generation_Job berstatus pending tanpa memanggil AI_Provider secara inline pada permintaan HTTP.
2. WHEN Planner memproses sebuah Content_Generation_Job, THE Planner SHALL memanggil model teks AI_Provider dengan masukan berupa prompt User, aturan Master_Template, dan Approved_Example relevan (jika ada), lalu menghasilkan sebuah Content_Plan dalam format JSON.
3. WHEN prompt User menentukan jumlah Slide yang berada dalam batas jumlah Slide Master_Template, THE Planner SHALL menghasilkan Content_Plan dengan jumlah Slide yang sama persis dengan jumlah yang diminta prompt.
4. WHEN prompt User meminta penyajian data atau angka, THE Planner SHALL menyertakan setidaknya satu Content_Block bertipe chart atau stat pada Content_Plan yang dihasilkan.
5. THE Planner SHALL menerapkan batas waktu tunggu (timeout) sebesar 30 detik untuk setiap panggilan ke AI_Provider.
6. IF prompt User kosong setelah spasi di awal dan akhir dipangkas atau melebihi 2.000 karakter, THEN THE Content_Generator_Service SHALL menolak pemicuan pembuatan Carousel tanpa membuat Content_Generation_Job dan menampilkan pesan kesalahan validasi panjang prompt.
7. IF Team belum memiliki Master_Template tersimpan saat Member memicu pembuatan Carousel, THEN THE Content_Generator_Service SHALL menolak pemicuan tanpa membuat Content_Generation_Job dan menampilkan pesan kesalahan bahwa Master_Template wajib disusun terlebih dahulu.
8. IF lebih dari satu kondisi validasi prapemicuan pembuatan Carousel gagal secara bersamaan (mencakup panjang prompt tidak valid, Master_Template belum tersedia, atau kunci API Gemini belum dikonfigurasi), THEN THE Content_Generator_Service SHALL mengumpulkan dan menampilkan SEMUA pesan kesalahan validasi yang berlaku secara bersamaan, bukan hanya pesan kesalahan pertama, tanpa membuat Content_Generation_Job.

### Requirement 4: Validasi dan Perbaikan Rencana Konten

**User Story:** Sebagai Member, saya ingin rencana konten divalidasi sebelum dirender, sehingga hasil akhir selalu mematuhi aturan Master_Template dan tidak berisi struktur yang tidak diizinkan.

#### Acceptance Criteria

1. WHEN Planner menghasilkan sebuah Content_Plan, THE Content_Plan_Validator SHALL memvalidasi Content_Plan terhadap Content_Plan_Schema dan aturan Master_Template sebelum Renderer dipanggil.
2. WHERE sebuah Content_Plan memuat hanya tipe Content_Block yang diizinkan Master_Template, jumlah Slide dalam batas Master_Template, dan panjang teks per blok dalam batas Master_Template, THE Content_Plan_Validator SHALL menandai Content_Plan tersebut valid dan meneruskannya ke Renderer.
3. IF sebuah Content_Plan memuat tipe Content_Block di luar kumpulan yang diizinkan, jumlah Slide melebihi batas Master_Template, atau panjang teks blok melebihi batas Master_Template, THEN THE Content_Plan_Validator SHALL menolak Content_Plan tersebut dan memicu paling banyak satu kali percobaan perbaikan (repair) melalui Planner.
4. IF percobaan perbaikan menghasilkan Content_Plan yang tetap tidak valid terhadap Content_Plan_Schema atau aturan Master_Template, THEN THE Content_Generator_Service SHALL menandai Content_Generation_Job berstatus failed dengan alasan kegagalan validasi rencana dan tidak memanggil Renderer.
5. IF keluaran Planner bukan JSON yang dapat diurai (parse), THEN THE Content_Plan_Validator SHALL memperlakukan keluaran tersebut sebagai Content_Plan tidak valid dan menerapkan aturan perbaikan pada kriteria 3.

### Requirement 5: Rendering Deterministik dengan Kesetiaan Brand

**User Story:** Sebagai Member, saya ingin elemen brand dirender oleh kode dari aset asli, sehingga logo, warna, font, dan chrome tampil identik di seluruh slide tanpa ditebak oleh AI gambar.

#### Acceptance Criteria

1. WHEN Renderer merender sebuah Slide dari Content_Plan yang valid, THE Renderer SHALL menggunakan berkas logo asli, Brand_Font asli, dan nilai warna heksadesimal dari Brand_Kit Team untuk merender chrome dan teks Slide tersebut.
2. THE Renderer SHALL merender chrome (logo, penomoran halaman, dan URL situs) secara identik pada setiap Slide dalam satu Carousel sesuai definisi chrome pada Brand_Kit.
3. THE Renderer SHALL merender teks Content_Block hanya menggunakan Brand_Font dari Brand_Kit dan warna dari daftar warna brand Brand_Kit.
4. THE Renderer SHALL menggunakan Background_Image dari model gambar AI_Provider hanya sebagai latar, dan THE Renderer SHALL tidak mengambil logo, teks, penomoran halaman, URL situs, chart, atau mockup dari Background_Image.
5. WHEN Renderer menerima Background_Image dari model gambar AI_Provider, THE Renderer SHALL memindai (scan) dan memvalidasi Background_Image secara aktif untuk memastikan tidak memuat elemen brand, teks, atau konten menyerupai logo sebelum proses compositing, tanpa hanya mengandalkan jaminan dari AI_Provider.
6. IF Renderer mendeteksi Background_Image memuat teks atau konten menyerupai logo, THEN THE Renderer SHALL memperlakukan kondisi tersebut sebagai masalah rendering dan menerapkan penanganan fallback berupa pembuatan ulang (regenerasi) Background_Image atau penggunaan latar polos berwarna brand dari Brand_Kit, tanpa pernah menyusun (compositing) Background_Image yang terdeteksi bermasalah ke dalam Slide terlepas dari apakah jalur penanganan fallback itu sendiri mengalami kendala.
7. WHEN Renderer mendeteksi kontras teks terhadap latar di bawah rasio 4.5:1, terjadi luapan (overflow) teks di luar area blok, terjadi tumpang tindih (collision) antar-Content_Block, atau terdapat batasan tata letak (layout constraint) lain yang tidak dapat dipenuhi pada sebuah Slide, THE Renderer SHALL menerapkan Slide_Layout bawaan (fallback) untuk Slide tersebut.
8. WHEN Renderer menyelesaikan rendering sebuah Slide, THE Renderer SHALL menyimpan gambar Slide final berformat PNG ke Object_Storage dan menyimpan acuan URL Object_Storage pada hasil per-Slide Content_Generation_Job.
9. THE Renderer SHALL menyimpan gambar Slide final hanya sebagai acuan URL Object_Storage pada basis data, tanpa menyimpan konten gambar sebagai blob base64 pada basis data.
10. IF Renderer mendeteksi Background_Image bermasalah tetapi penanganan fallback (regenerasi maupun penggunaan latar polos berwarna brand) tidak dapat diselesaikan, THEN THE Renderer SHALL menandai Slide tersebut berstatus failed beserta alasan kegagalan dan tidak menyusun Background_Image yang terdeteksi bermasalah ke dalam Slide.
11. IF rendering sebuah Slide berhasil menghasilkan berkas PNG tetapi pengunggahan berkas PNG tersebut ke Object_Storage gagal, THEN THE Renderer SHALL memperlakukan rendering Slide tersebut sebagai tidak selesai (gagal) berstatus failed beserta alasan kegagalan, dan THE Renderer SHALL tidak menandai Slide tersebut berstatus success, sehingga sebuah Slide hanya dianggap success ketika berkas PNG berhasil dihasilkan DAN pengunggahan ke Object_Storage berhasil.

### Requirement 6: Variasi Tata Letak Per-Slide

**User Story:** Sebagai Member, saya ingin tata letak tiap slide bisa berbeda secara kreatif, sehingga carousel terlihat dinamis sambil tetap mempertahankan chrome dan identitas brand yang konsisten.

#### Acceptance Criteria

1. THE Renderer SHALL memilih Slide_Layout untuk setiap Slide dari kumpulan varian preset yang tersedia untuk tipe Slide tersebut sesuai Content_Plan.
2. THE Content_Generator_Service SHALL mengizinkan Slide_Layout berbeda antar-Slide dalam satu Carousel sementara chrome (logo, penomoran halaman, URL situs), warna brand, dan Brand_Font tetap identik di seluruh Slide.
3. WHERE sebuah Content_Plan menetapkan komposisi Content_Block berbeda antar-Slide (contoh: Slide hanya teks; Slide mockup dan teks; Slide teks dan chart), THE Renderer SHALL merender setiap Slide menurut komposisi Content_Block masing-masing tanpa mengubah chrome, warna brand, atau Brand_Font.
4. WHERE sebuah Content_Plan tidak menetapkan komposisi Content_Block untuk sebuah Slide, THE Renderer SHALL menerapkan komposisi Content_Block bawaan untuk Slide tersebut dan tetap merendernya tanpa mengubah chrome, warna brand, atau Brand_Font.
5. IF sebuah Content_Plan menetapkan komposisi Content_Block untuk sebuah Slide tetapi Renderer tidak dapat menerapkannya bahkan setelah mencoba Slide_Layout bawaan (fallback), THEN THE Renderer SHALL menandai Slide tersebut berstatus failed beserta alasan kegagalan tanpa menggugurkan konsistensi brand secara diam-diam.
6. THE Renderer SHALL mempertahankan chrome, warna brand, dan Brand_Font sebagai invarian pada setiap Slide, dan IF chrome, warna brand, atau Brand_Font tidak dapat dihormati pada sebuah Slide, THEN THE Renderer SHALL menandai Slide tersebut berstatus failed alih-alih merender Slide yang menyimpang dari brand (off-brand).

### Requirement 7: Aturan Rendering Chart dan Mockup

**User Story:** Sebagai Member, saya ingin chart dan mockup dirender dari data nyata yang saya sediakan, sehingga angka dan tampilan produk akurat dan tidak dihalusinasi oleh AI gambar.

#### Acceptance Criteria

1. THE Renderer SHALL merender setiap Content_Block bertipe chart dari data yang disediakan User secara deterministik oleh kode, dan THE Renderer SHALL tidak menggunakan model gambar AI_Provider untuk menggambar chart.
2. THE Renderer SHALL merender setiap Content_Block bertipe mockup dari berkas gambar yang disediakan User secara deterministik oleh kode, dan THE Renderer SHALL tidak menggunakan model gambar AI_Provider untuk menggambar mockup.
3. THE Planner SHALL tidak mengarang (synthesize) nilai data chart maupun isi mockup; THE Planner SHALL hanya menandai kebutuhan chart atau mockup pada Content_Plan dan mengacu pada data yang disediakan User.
4. IF sebuah Content_Block bertipe chart pada Content_Plan tidak memiliki data chart yang disediakan User, atau sebuah Content_Block bertipe mockup tidak memiliki berkas gambar yang disediakan User, THEN THE Content_Generator_Service SHALL segera menandai seluruh Slide terkait berstatus failed dengan alasan data chart atau berkas mockup tidak tersedia, tanpa merender sebagian Slide tersebut, tanpa menunggu, dan tanpa menggambar chart atau mockup melalui model gambar AI_Provider.
5. THE Renderer SHALL merender Background_Image dari model gambar AI_Provider tanpa teks, angka, chart, atau mockup di dalamnya.

### Requirement 8: Kurasi dan Pengambilan Contoh yang Disetujui

**User Story:** Sebagai Admin, saya ingin menandai hasil yang bagus sebagai contoh disetujui, sehingga Planner belajar selera Team dari struktur contoh tersebut tanpa pelatihan ulang model.

#### Acceptance Criteria

1. WHEN User berwenang menandai sebuah hasil Carousel sebagai disetujui, THE Content_Generator_Service SHALL menyimpan struktur tata letak Carousel tersebut dalam bentuk JSON sebagai Approved_Example pada Example_Library Team dan mencatat operasi pada Audit_Log beserta pelaku dan waktu.
2. WHEN Planner memproses sebuah Content_Generation_Job sementara Example_Library Team memuat setidaknya satu Approved_Example, THE Planner SHALL menyuntikkan struktur tata letak Approved_Example yang paling relevan sebagai panduan few-shot ke AI_Provider.
3. THE Planner SHALL menggunakan Approved_Example hanya untuk memengaruhi pemilihan Slide_Layout dan komposisi Content_Block, dan THE Planner SHALL tidak menggunakan Approved_Example untuk mengubah warna brand, logo, atau Brand_Font.
4. WHERE Example_Library Team tidak memuat satu pun Approved_Example, THE Planner SHALL menghasilkan Content_Plan hanya berdasarkan prompt User dan aturan Master_Template.
5. THE Content_Generator_Service SHALL membatasi setiap Approved_Example dan Example_Library pada Team pemiliknya dan menolak akses dari Team lain.
6. WHEN User berwenang membatalkan persetujuan sebuah Approved_Example, THE Content_Generator_Service SHALL menghapus Approved_Example tersebut dari Example_Library Team sehingga tidak lagi disuntikkan ke Planner pada pembuatan berikutnya.
7. WHERE Example_Library Team memuat setidaknya satu Approved_Example tetapi tidak ada satu pun yang cukup relevan untuk disuntikkan pada sebuah Content_Generation_Job, THE Planner SHALL menghasilkan Content_Plan hanya berdasarkan prompt User dan aturan Master_Template tanpa menyuntikkan Approved_Example.
8. THE Planner SHALL menerapkan aturan Master_Template pada setiap Content_Generation_Job terlepas dari ada atau tidaknya Approved_Example yang disuntikkan, sehingga ketiadaan Approved_Example yang relevan tidak pernah melonggarkan penegakan aturan Master_Template.

### Requirement 9: Aturan Konflik Master-Menang

**User Story:** Sebagai Admin, saya ingin aturan Master_Template selalu diutamakan saat bertentangan dengan contoh yang disetujui, sehingga batasan brand tidak pernah dilanggar demi mengikuti gaya contoh.

#### Acceptance Criteria

1. IF sebuah Approved_Example memuat struktur yang bertentangan dengan aturan Master_Template, THEN THE Content_Generator_Service SHALL mematuhi aturan Master_Template dan mengabaikan bagian Approved_Example yang bertentangan.
2. THE Content_Plan_Validator SHALL memvalidasi Content_Plan terhadap aturan Master_Template terlepas dari Approved_Example yang disuntikkan, sehingga Content_Plan yang melanggar Master_Template tetap ditolak sesuai Requirement 4.
3. THE Content_Generator_Service SHALL tidak pernah mengizinkan Approved_Example menimpa warna brand, logo, Brand_Font, atau definisi chrome pada Brand_Kit.
4. IF eksekusi Content_Plan_Validator sendiri gagal sehingga validasi terhadap Content_Plan_Schema dan aturan Master_Template tidak dapat diselesaikan, THEN THE Content_Generator_Service SHALL menandai Content_Generation_Job berstatus failed dengan alasan kegagalan validasi (validation_error) dan tidak meneruskan Content_Plan yang belum tervalidasi ke Renderer (fail-closed).
5. WHEN Content_Generation_Job ditandai failed akibat kegagalan eksekusi Content_Plan_Validator, THE Content_Generator_Service SHALL membiarkan Job tersebut tetap berstatus failed tanpa memulai ulang (restart) maupun mencoba ulang (retry) Job secara otomatis, sehingga percobaan ulang hanya terjadi melalui permintaan baru yang diprakarsai User atau Admin.
6. WHERE Content_Generation_Job telah ditandai failed akibat kegagalan eksekusi Content_Plan_Validator, THE Content_Generator_Service SHALL mengizinkan pekerjaan pembukuan latar belakang (pencatatan Audit_Log, pencatatan AI_Call_Budget, dan pembaruan status) diselesaikan sepanjang Job tetap berstatus failed dan tidak ada konten yang sampai ke pengguna akhir.

### Requirement 10: Pemrosesan Latar Belakang dan Status Pembuatan

**User Story:** Sebagai Member, saya ingin pembuatan carousel berjalan di latar belakang dengan status yang dapat saya pantau, sehingga proses gambar yang lama tidak memblokir permintaan saya.

#### Acceptance Criteria

1. WHEN Member memicu pembuatan Carousel, THE Content_Generator_Service SHALL membuat Content_Generation_Job berstatus pending dan mengembalikan tanggapan permintaan tanpa menunggu Planner maupun Renderer selesai.
2. THE Content_Generator_Service SHALL memproses setiap Content_Generation_Job melalui antrean latar belakang dan memperbarui status keseluruhan menjadi tepat satu dari pending, success, atau failed pada satu waktu.
3. IF sebuah Slide pada Content_Generation_Job berstatus failed saat pemrosesan, THEN THE Content_Generator_Service SHALL menghentikan pemrosesan Slide berikutnya dengan segera (fail-fast), menandai status keseluruhan Content_Generation_Job menjadi failed, dan mempertahankan apa adanya Slide yang telah berhasil dirender sebelum kegagalan tanpa membatalkan (rollback) maupun membersihkan (cleanup) Slide yang telah selesai tersebut.
4. WHEN seluruh Slide sebuah Content_Generation_Job berhasil dirender, THE Content_Generator_Service SHALL menetapkan status keseluruhan menjadi success dan menyediakan acuan URL Object_Storage untuk setiap Slide.
5. THE Content_Generator_Service SHALL menyediakan status per-Slide berupa tepat satu dari pending, success, atau failed beserta alasan kegagalan untuk Slide yang berstatus failed, dan THE Content_Generator_Service SHALL menetapkan status per-Slide success hanya ketika berkas PNG Slide tersebut berhasil dihasilkan DAN berhasil diunggah ke Object_Storage.
6. WHEN User berwenang meminta status sebuah Content_Generation_Job, THE Content_Generator_Service SHALL menampilkan status keseluruhan dan status per-Slide Job tersebut.

### Requirement 11: Penanganan Kegagalan yang Jujur

**User Story:** Sebagai Member, saya ingin sistem melaporkan kegagalan secara jujur, sehingga saya tidak menerima foto stok acak yang disamarkan sebagai hasil yang berhasil.

#### Acceptance Criteria

1. IF rendering sebuah Slide gagal atau pembuatan Background_Image-nya gagal, THEN THE Content_Generator_Service SHALL menandai Slide tersebut berstatus failed beserta alasan kegagalan dan tidak menggantinya dengan foto stok acak yang dilaporkan sebagai berhasil.
2. WHERE sebuah Slide ditandai failed dengan indikasi kegagalan yang jelas, THE Content_Generator_Service SHALL mengizinkan penampilan gambar pengganti (placeholder atau stok) hanya sebagai pratinjau kegagalan yang terlihat untuk Slide tersebut, dan THE Content_Generator_Service SHALL tidak pernah melaporkan Slide tersebut berstatus success maupun menghitungnya sebagai keberhasilan Content_Generation_Job keseluruhan, sehingga tidak ada foto stok acak yang disajikan secara diam-diam sebagai hasil AI yang berhasil.
3. IF setidaknya satu Slide pada sebuah Content_Generation_Job berstatus failed, THEN THE Content_Generator_Service SHALL menghentikan pemrosesan dengan segera dan menetapkan status keseluruhan Content_Generation_Job menjadi failed, mempertahankan apa adanya Slide yang telah berhasil dirender sebelum kegagalan tanpa membatalkan (rollback) maupun membersihkan (cleanup) Slide yang telah selesai, dan THE Content_Generator_Service SHALL menetapkan status keseluruhan menjadi success hanya ketika seluruh Slide berhasil dirender.
4. WHERE Renderer menerapkan Slide_Layout bawaan (fallback) sesuai Requirement 5 kriteria 7, THE Content_Generator_Service SHALL menandai Slide tersebut dengan indikasi fallback yang terbedakan dari status success tanpa fallback.
5. THE Content_Generator_Service SHALL menetapkan status keseluruhan dan status per-Slide berdasarkan hasil eksekusi sebenarnya, sehingga status selalu mencerminkan kenyataan terlepas dari keberhasilan penyampaian notifikasi.

### Requirement 12: Hak Akses Berbasis Peran untuk Konten

**User Story:** Sebagai Admin, saya ingin hak akses pembuatan dan pengelolaan konten dipisahkan per peran, sehingga hanya peran yang sesuai yang dapat menyusun template, menghasilkan, atau sekadar melihat konten.

#### Acceptance Criteria

1. THE System SHALL menyediakan hak akses khusus konten `content.manage` untuk penyusunan Brand_Kit dan Master_Template serta persetujuan dan pembatalan Approved_Example, dan `content.generate` untuk pemicuan pembuatan Carousel, terpisah dari hak akses analisis Lead `ai.configure` dan `ai.reanalyze`.
2. WHERE User memiliki peran Admin, THE System SHALL mengizinkan tindakan `content.manage` dan `content.generate`.
3. WHERE User memiliki peran Member, THE System SHALL mengizinkan tindakan `content.generate` dan menolak tindakan `content.manage`.
4. WHERE User memiliki peran Viewer, THE System SHALL mengizinkan pembacaan Carousel dan status Content_Generation_Job yang sudah dihasilkan serta menolak tindakan `content.generate` dan `content.manage`.
5. IF User tanpa hak akses yang sesuai mencoba melakukan tindakan `content.manage` atau `content.generate`, THEN THE System SHALL menolak tindakan tersebut tanpa mengubah data dan menampilkan pesan kesalahan otorisasi.
6. IF User mencoba melakukan sebuah tindakan tanpa memiliki hak akses spesifik untuk tindakan tersebut, THEN THE System SHALL menolak tindakan tersebut meskipun User memiliki hak akses konten lain, sehingga kepemilikan `content.generate` tidak pernah mengizinkan tindakan `content.manage` dan sebaliknya.

### Requirement 13: Penggunaan Ulang Anggaran dan Audit AI

**User Story:** Sebagai Admin, saya ingin setiap panggilan AI pembuatan konten dihitung pada anggaran dan dicatat, sehingga pemakaian AI Team terkendali dan dapat diaudit memakai mekanisme yang sama dengan analisis Lead.

#### Acceptance Criteria

1. THE Content_Generator_Service SHALL menggunakan kunci API Gemini per-Team yang sudah tersimpan terenkripsi (sesuai R13 dokumen induk) untuk setiap panggilan AI_Provider, tanpa menggunakan kunci API Gemini bersama lintas Team.
2. WHEN Content_Generator_Service melakukan satu panggilan ke AI_Provider, mencakup panggilan teks Planner, panggilan gambar Background_Image, dan panggilan deskripsi referensi apa pun, THE System SHALL menghitung panggilan tersebut pada AI_Call_Budget Team dalam jendela bergulir 30 hari dan mencatatnya pada `ai_call_log`.
3. WHEN Content_Generator_Service melakukan satu panggilan ke AI_Provider, THE System SHALL mencatat panggilan tersebut pada Audit_Log beserta pelaku, Content_Generation_Job terkait, waktu, dan hasil (berhasil atau alasan kegagalan).
4. IF sebuah panggilan AI_Provider berikutnya untuk Team akan menyebabkan jumlah panggilan dalam jendela bergulir 30 hari mencapai atau melampaui AI_Call_Budget Team, THEN THE Content_Generator_Service SHALL mengevaluasi kondisi tersebut sebelum setiap panggilan AI_Provider dan menolak memulai atau melanjutkan panggilan tersebut serta segera (fail-fast) menandai Content_Generation_Job terkait berstatus failed dengan alasan anggaran terlampaui (budget_exceeded).
5. WHERE Team belum memiliki kunci API Gemini yang tersimpan dan tervalidasi, THE Content_Generator_Service SHALL menolak pemicuan pembuatan Carousel dan menampilkan pesan kesalahan bahwa kunci API Gemini wajib dikonfigurasi terlebih dahulu.
6. WHERE Team telah memiliki kunci API Gemini yang tersimpan dan tervalidasi, THE Content_Generator_Service SHALL tidak menampilkan pesan kesalahan bahwa kunci API Gemini wajib dikonfigurasi, sehingga pesan tersebut hanya muncul ketika kunci API Gemini benar-benar belum ada atau tidak valid.

### Requirement 14: Konfigurasi dan Keamanan AI_Provider Endpoint

**User Story:** Sebagai Admin, saya ingin menentukan secara eksplisit endpoint AI_Provider yang dipakai Team saya (API resmi Google atau endpoint pihak ketiga/proxy yang disetujui), sehingga kunci dan konten Team hanya dikirim ke tujuan yang sengaja saya konfigurasi dan tidak ke penerima yang tidak dikehendaki.

#### Acceptance Criteria

1. THE Content_Generator_Service SHALL menentukan AI_Provider_Endpoint untuk setiap Team dari setelan AI_Provider_Endpoint tersimpan yang dikonfigurasi secara eksplisit oleh Admin, dengan API resmi Google Generative Language sebagai nilai bawaan, dan THE Content_Generator_Service SHALL tidak menyimpulkan AI_Provider_Endpoint dari bentuk maupun awalan kunci API.
2. WHEN Admin mengonfigurasi AI_Provider_Endpoint pihak ketiga atau proxy untuk Team, THE Content_Generator_Service SHALL mencatat konfigurasi tersebut pada Audit_Log beserta pelaku dan waktu, dan THE Content_Generator_Service SHALL memperlakukan AI_Provider_Endpoint yang dikonfigurasi sebagai satu-satunya tujuan yang diizinkan untuk panggilan AI Team tersebut.
3. THE Content_Generator_Service SHALL mengirim kunci API dan data konten Team hanya ke AI_Provider_Endpoint yang dikonfigurasi secara eksplisit untuk Team tersebut, dan THE Content_Generator_Service SHALL tidak mengirimnya ke endpoint mana pun selain AI_Provider_Endpoint yang dikonfigurasi.
4. IF sebuah panggilan AI_Provider akan diarahkan ke endpoint selain AI_Provider_Endpoint yang dikonfigurasi untuk Team, THEN THE Content_Generator_Service SHALL membatalkan panggilan tersebut dan menandai Content_Generation_Job terkait berstatus failed dengan alasan tujuan tidak sesuai konfigurasi (endpoint_mismatch).
5. WHERE AI_Provider_Endpoint yang dikonfigurasi menggunakan skema HTTP alih-alih HTTPS, THE Content_Generator_Service SHALL menolak melakukan panggilan tersebut dan menandai Content_Generation_Job terkait berstatus failed dengan alasan transport tidak aman (insecure_transport).
6. WHEN Content_Generator_Service melakukan satu panggilan ke AI_Provider_Endpoint, THE Content_Generator_Service SHALL mencatat tujuan (AI_Provider_Endpoint) panggilan tersebut pada Audit_Log untuk keperluan ketertelusuran.

### Requirement 15: Kepatuhan Privasi pada Masukan AI

**User Story:** Sebagai Admin, saya ingin hanya masukan brand dan konten yang dikehendaki yang dikirim ke AI, sehingga Personal_Data prospek tidak bocor ke AI_Provider tanpa kehendak eksplisit.

#### Acceptance Criteria

1. THE Content_Generator_Service SHALL mengirim ke AI_Provider hanya masukan brand dan konten yang dikehendaki berupa prompt User, aturan Master_Template, struktur Approved_Example, dan aset Brand_Kit yang relevan.
2. THE Content_Generator_Service SHALL tidak mengirim Personal_Data Lead ke AI_Provider kecuali User secara eksplisit menyertakannya pada prompt.
3. IF sebuah panggilan AI_Provider akan mengirim Personal_Data Lead tanpa User secara eksplisit menyertakannya pada prompt, THEN THE Content_Generator_Service SHALL memblokir panggilan tersebut sepenuhnya tanpa mengirimkannya dan menandai Content_Generation_Job terkait berstatus failed dengan alasan pelanggaran privasi (privacy_violation).
4. WHEN Content_Generator_Service memblokir sebuah panggilan AI_Provider karena pelanggaran privasi, THE Content_Generator_Service SHALL mencatat peristiwa pemblokiran tersebut pada Audit_Log sebagai peristiwa keamanan tanpa menuliskan Personal_Data Lead pada catatan tersebut.
5. WHEN sebuah panggilan AI_Provider yang diizinkan dilakukan untuk pembuatan konten, THE System SHALL mencatat lingkup data yang dikirim pada Audit_Log untuk keperluan ketertelusuran.

### Requirement 16: Isolasi Multi-Tenant Artefak Konten

**User Story:** Sebagai Admin, saya ingin seluruh artefak konten terisolasi per tim, sehingga Brand_Kit, template, contoh, dan hasil satu Team tidak pernah dapat diakses Team lain.

#### Acceptance Criteria

1. THE Content_Generator_Service SHALL mengasosiasikan setiap Brand_Kit, Master_Template, Approved_Example, Content_Generation_Job, dan gambar Slide dengan `team_id` Team pemiliknya.
2. THE Content_Generator_Service SHALL membatasi setiap operasi baca dan tulis atas artefak konten hanya pada artefak yang dimiliki Team User tersebut.
3. IF User meminta artefak konten yang dimiliki Team lain atau yang tidak ada, THEN THE Content_Generator_Service SHALL memperlakukan permintaan tersebut sebagai tidak ditemukan (not found) tanpa mengungkap keberadaan artefak Team lain, dan THE Content_Generator_Service SHALL tidak menampilkan kesalahan akses ditolak (access denied) yang dapat membocorkan keberadaan artefak pada Team lain.
4. IF User mengakses acuan URL Object_Storage sebuah aset yang dimiliki Team lain, THEN THE Content_Generator_Service SHALL memperlakukan permintaan tersebut sebagai tidak ditemukan (not found) yang sama dengan permintaan lintas-Team maupun artefak tidak ada lainnya, tanpa mengungkap apakah aset tersebut ada pada Team lain.
5. THE Content_Generator_Service SHALL membatasi acuan URL Object_Storage setiap aset agar hanya dapat diakses oleh User dari Team pemilik aset tersebut.
