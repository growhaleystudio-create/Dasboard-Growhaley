# Requirements Document

## Introduction

Leads Generation Dashboard adalah aplikasi web yang secara otomatis memindai berbagai sumber eksternal (seperti Fiverr, Threads, LinkedIn, Google, dan Facebook) untuk menemukan prospek (leads) potensial berdasarkan kriteria yang ditentukan pengguna, lalu mengumpulkannya dalam satu tempat terpusat untuk dikelola dan ditindaklanjuti. Sistem ditujukan untuk menemukan bisnis atau individu yang membutuhkan layanan desain produk, pengembangan landing page / web app, UI/UX, SEO, dan branding, dengan fokus geografis Indonesia namun terbuka untuk prospek internasional.

Pengambilan data dilakukan secara eksklusif melalui API resmi setiap platform untuk menjaga kepatuhan terhadap Ketentuan Layanan (Terms of Service) masing-masing platform. Karena tidak semua platform menyediakan API yang dapat digunakan, lapisan integrasi dirancang sebagai konektor yang dapat dipasang per sumber (pluggable), dan Sistem harus menangani secara baik sumber yang tidak memiliki API yang tersedia.

Fitur utama yang ditekankan adalah penilaian prospek otomatis (automatic lead scoring) untuk memeringkat prospek paling potensial, didukung oleh manajemen prospek standar (status, penyaringan, tindak lanjut). Sebagai pengayaan opsional, Sistem mendukung analisis niat berbasis AI menggunakan Google Gemini yang dapat diaktifkan per Scan_Configuration (opt-in, nonaktif sebagai bawaan) untuk melengkapi penilaian berbasis aturan tanpa menggantikannya. Sistem bersifat multi-pengguna untuk tim, dengan akun individual, peran, hak akses, dan data prospek bersama tingkat tim. Penanganan data pribadi harus mematuhi GDPR dan Undang-Undang Pelindungan Data Pribadi Indonesia (UU PDP).

Stack teknologi target adalah aplikasi web modern: frontend React/Next.js, backend Node.js, dan basis data PostgreSQL. Dokumen ini mendefinisikan kebutuhan fungsional dan non-fungsional menggunakan pola EARS dan aturan kualitas INCOSE.

## Glossary

- **System**: Aplikasi Leads Generation Dashboard secara keseluruhan, mencakup antarmuka pengguna, layanan backend, dan basis data.
- **User**: Orang yang sudah terautentikasi dan menggunakan System sebagai anggota sebuah Team.
- **Team**: Kumpulan User yang berbagi data Lead, konfigurasi, dan sumber daya dalam satu ruang kerja (workspace).
- **Admin**: User dengan peran yang memiliki hak mengelola anggota Team, peran, dan konfigurasi tingkat Team.
- **Member**: User dengan peran yang dapat membuat dan mengelola Lead serta menjalankan pemindaian, tetapi tidak mengelola anggota Team.
- **Viewer**: User dengan peran yang hanya dapat melihat data Lead dan metrik tanpa mengubahnya.
- **Auth_Service**: Komponen yang menangani autentikasi User dan otorisasi berbasis peran (role-based access control).
- **Lead**: Entitas data yang merepresentasikan satu prospek potensial yang ditemukan dari sebuah Source, terdiri dari atribut seperti nama, kontak publik, sumber, URL profil, kata kunci pemicu, lokasi, skor, dan status.
- **Source**: Platform eksternal asal Lead, contoh: Fiverr, Threads, LinkedIn, Google, Facebook.
- **Source_Connector**: Modul yang dapat dipasang (pluggable) per Source yang mengambil data prospek dari API resmi Source tertentu dan menormalkannya menjadi objek Lead.
- **Connector_Registry**: Komponen yang mendaftarkan, menyediakan, dan mengelola status ketersediaan setiap Source_Connector.
- **Scan_Configuration**: Sekumpulan kriteria pencarian yang ditentukan User, terdiri dari kata kunci (keyword), niche/industri, lokasi, dan daftar Source yang dipilih.
- **Scan_Engine**: Komponen backend yang mengeksekusi Scan_Configuration terhadap Source_Connector yang dipilih dan mengumpulkan hasil sebagai Lead.
- **Scan_Job**: Satu kali eksekusi pemindaian yang dijalankan oleh Scan_Engine berdasarkan sebuah Scan_Configuration.
- **Deduplication_Service**: Komponen yang mendeteksi dan menggabungkan Lead yang merujuk pada prospek yang sama.
- **Duplicate_Lead**: Lead yang merujuk pada prospek yang sama dengan Lead yang sudah ada, diidentifikasi melalui identitas yang cocok (misalnya URL profil, email, atau kombinasi atribut identitas).
- **Lead_Scoring_Engine**: Komponen yang menghitung Lead_Score secara otomatis dan memeringkat Lead.
- **Lead_Score**: Nilai numerik antara 0 sampai 100 yang merepresentasikan potensi sebuah Lead.
- **Scoring_Model**: Sekumpulan faktor berbobot yang dikonfigurasi tingkat Team dan digunakan Lead_Scoring_Engine untuk menghitung Lead_Score.
- **Lead_Status**: Tahapan tindak lanjut sebuah Lead: New, Reviewed, Contacted, Qualified, Converted, Rejected.
- **Lead_Manager**: Komponen backend yang membuat, membaca, memperbarui, dan menghapus data Lead serta mengelola Lead_Status.
- **Activity**: Catatan satu peristiwa pada sebuah Lead, misalnya perubahan Lead_Status atau penambahan catatan tindak lanjut, berisi pelaku dan waktu.
- **Dashboard_View**: Halaman ringkasan yang menampilkan metrik agregat tentang Lead dan Scan_Job.
- **Personal_Data**: Setiap informasi yang berkaitan dengan individu yang teridentifikasi atau dapat diidentifikasi, sebagaimana didefinisikan oleh GDPR dan UU PDP.
- **Data_Retention_Period**: Jangka waktu maksimum Personal_Data sebuah Lead disimpan sebelum dihapus secara otomatis, dikonfigurasi tingkat Team.
- **Audit_Log**: Catatan kronologis tindakan User dan System terhadap data, mencakup pelaku, aksi, objek, dan waktu.
- **AI_Provider**: Penyedia layanan model bahasa eksternal yang digunakan untuk analisis niat prospek; dalam Sistem ini adalah Google Gemini melalui API resminya.
- **AI_Analyzer_Service**: Komponen backend yang mengirim data publik Lead ke AI_Provider, menerima keluaran terstruktur, lalu mempersistkan AI_Intent_Score dan AI_Insight pada Lead.
- **AI_Intent_Score**: Bilangan bulat 0 sampai 100 inklusif yang dihasilkan AI_Analyzer_Service dan merepresentasikan kekuatan indikasi bahwa Lead membutuhkan layanan yang ditawarkan Team.
- **AI_Insight**: Ringkasan naratif singkat (maksimum 500 karakter) yang dihasilkan AI_Analyzer_Service untuk menjelaskan dasar AI_Intent_Score.
- **AI_Call_Budget**: Batas maksimum jumlah panggilan ke AI_Provider per Team dalam jendela bergulir 30 hari, dikonfigurasi tingkat Team oleh Admin.
- **Public_Lead_Snapshot**: Subset data publik Lead yang sudah tersimpan (nama, kontak publik, URL profil, lokasi, kata kunci pemicu, dan cuplikan konten publik yang sah diperoleh Source_Connector) yang merupakan satu-satunya data yang boleh dikirim ke AI_Provider.

## Requirements

### Requirement 1: Autentikasi dan Sesi Pengguna

**User Story:** Sebagai User, saya ingin masuk ke dashboard dengan akun individual yang aman, sehingga hanya orang yang berwenang yang dapat mengakses data Lead Team.

#### Acceptance Criteria

1. WHEN User mengirimkan kredensial yang valid, THE Auth_Service SHALL membuat sesi terautentikasi, mengatur ulang penghitung percobaan login gagal akun tersebut menjadi nol, dan mengarahkan User ke Dashboard_View.
2. IF User mengirimkan kredensial yang tidak valid, THEN THE Auth_Service SHALL menolak permintaan tanpa membuat sesi terautentikasi dan menampilkan pesan kesalahan autentikasi yang tidak mengungkapkan apakah kesalahan terletak pada email atau kata sandi.
3. WHILE sesi User belum terautentikasi, THE System SHALL membatasi akses ke seluruh halaman pengelolaan Lead dan mengarahkan User ke halaman login.
4. WHEN User yang terautentikasi memilih aksi keluar (logout), THE Auth_Service SHALL mengakhiri sesi User dan mengarahkan User ke halaman login.
5. WHEN sesi User yang terautentikasi tidak menunjukkan aktivitas selama 30 menit berturut-turut, THE Auth_Service SHALL mengakhiri sesi tersebut dan mengarahkan User ke halaman login untuk masuk kembali.
6. IF jumlah percobaan login gagal berturut-turut untuk satu akun mencapai 5 kali dalam rentang 15 menit, THEN THE Auth_Service SHALL mengunci akun tersebut selama 15 menit, menolak setiap upaya masuk selama periode penguncian, dan menampilkan pesan kesalahan yang menunjukkan akun terkunci sementara.

### Requirement 2: Manajemen Tim dan Peran

**User Story:** Sebagai Admin, saya ingin mengundang anggota dan menetapkan peran, sehingga tiap anggota tim memiliki hak akses yang sesuai terhadap data Lead bersama.

#### Acceptance Criteria

1. WHEN Admin mengundang seseorang ke Team dengan alamat email yang valid (maksimum 254 karakter) dan peran yang dipilih dari Admin, Member, atau Viewer, THE System SHALL mengirim undangan dan membuat keanggotaan Team berstatus tertunda (pending) yang berlaku selama 168 jam (7 hari) sejak undangan dikirim.
2. WHEN penerima undangan menyelesaikan pendaftaran sebelum undangan kedaluwarsa, THE System SHALL menautkan User tersebut ke Team dengan peran yang ditetapkan Admin dan mengubah status keanggotaan menjadi aktif.
3. WHEN Admin mengubah peran seorang User, THE Auth_Service SHALL menerapkan hak akses peran baru pada permintaan terotorisasi berikutnya dari User tersebut.
4. WHERE User memiliki peran Viewer, THE System SHALL mengizinkan operasi baca pada Lead dan metrik serta menolak seluruh operasi tulis pada Lead maupun data terkait Lead, mencakup pembuatan, perubahan, dan penghapusan Lead, perubahan Lead_Status, serta penambahan atau perubahan catatan tindak lanjut dan label (tag).
5. WHERE User berperan Viewer dengan keanggotaan Team berstatus tertunda (pending), THE System SHALL tetap mengizinkan operasi baca pada Lead dan metrik Team.
6. WHERE User memiliki peran Member, THE System SHALL mengizinkan pembuatan, perubahan Lead, dan eksekusi Scan_Job serta menolak pengelolaan anggota Team.
7. WHERE User memiliki peran Admin, THE System SHALL mengizinkan pengelolaan anggota Team, peran, dan konfigurasi tingkat Team.
8. THE System SHALL membatasi akses setiap User hanya pada data Lead yang dimiliki oleh Team User tersebut.
9. IF Admin mengundang seseorang dengan alamat email yang tidak valid, melebihi 254 karakter, atau sudah memiliki keanggotaan Team yang aktif atau tertunda, THEN THE System SHALL menolak undangan tanpa membuat keanggotaan baru dan menampilkan pesan kesalahan validasi undangan.
10. IF penerima undangan menyelesaikan pendaftaran setelah undangan kedaluwarsa, THEN THE System SHALL menolak penautan ke Team tanpa mengaktifkan keanggotaan dan menampilkan pesan kesalahan bahwa undangan telah kedaluwarsa.

### Requirement 3: Registrasi dan Ketersediaan Source Connector

**User Story:** Sebagai Admin, saya ingin mengelola konektor sumber yang dapat dipasang per platform, sehingga Team dapat memindai hanya pada sumber yang memiliki API resmi yang tersedia.

#### Acceptance Criteria

1. THE Connector_Registry SHALL menyediakan daftar Source_Connector beserta tepat satu status ketersediaan aktif untuk setiap konektor pada satu waktu: available, unavailable, atau requires_configuration.
2. WHEN sebuah Source_Connector baru ditambahkan dan belum divalidasi terhadap API Source, THE Connector_Registry SHALL menetapkan status awal available sampai validasi API dilakukan.
3. WHERE sebuah Source tidak memiliki API resmi yang dapat digunakan, THE Connector_Registry SHALL menandai Source_Connector tersebut berstatus unavailable dan menampilkan alasan ketidaktersediaan kepada User.
4. WHEN Admin mengaktifkan sebuah Source_Connector dengan kredensial API yang diterima oleh API Source dalam waktu 30 detik dan kredensial berhasil disimpan, THE System SHALL menyimpan kredensial secara terenkripsi dan menandai konektor tersebut berstatus available untuk Team.
5. IF penyimpanan kredensial API sebuah Source_Connector gagal, THEN THE System SHALL mempertahankan status konektor saat ini dan menampilkan pesan kesalahan penyimpanan kredensial.
6. IF kredensial API sebuah Source_Connector ditolak oleh API Source, THEN THE System SHALL menandai konektor tersebut berstatus requires_configuration dan menampilkan pesan kesalahan kredensial.
7. IF API Source tidak merespons dalam waktu 30 detik saat validasi kredensial, THEN THE System SHALL membatalkan aktivasi konektor, mempertahankan status konektor sebelumnya, dan menampilkan pesan kesalahan batas waktu validasi.
8. WHILE sebuah Source_Connector tidak dapat digunakan pada saat eksekusi Scan_Job (berstatus selain available atau gagal validasi lain saat eksekusi), THE Scan_Engine SHALL mengecualikan Source tersebut dari eksekusi Scan_Job dan mencatat pengecualian tersebut pada hasil Scan_Job.
9. WHEN sebuah Source_Connector baru ditambahkan, THE System SHALL mendaftarkannya tanpa mengubah status atau konfigurasi Source_Connector lain yang sudah terdaftar.

### Requirement 4: Konfigurasi Pencarian (Scan Configuration)

**User Story:** Sebagai Member, saya ingin menentukan kriteria pencarian berdasarkan kata kunci, niche, dan lokasi, sehingga Sistem menemukan prospek yang relevan dengan layanan yang saya tawarkan.

#### Acceptance Criteria

1. WHEN Member menyimpan Scan_Configuration dengan setidaknya satu kata kunci yang valid dan setidaknya satu Source yang dipilih, THE System SHALL memangkas (trim) spasi di awal dan akhir setiap kata kunci, lalu menyimpan Scan_Configuration tersebut untuk Team dengan jumlah kata kunci 1 sampai 50 inklusif dan panjang setiap kata kunci 2 sampai 100 karakter inklusif setelah dipangkas.
2. IF Member menyimpan Scan_Configuration tanpa kata kunci atau seluruh kata kunci yang dimasukkan menjadi kosong setelah spasi di awal dan akhir dipangkas (hanya berisi spasi), THEN THE System SHALL menolak penyimpanan dan menampilkan pesan kesalahan validasi bahwa minimal satu kata kunci tidak kosong wajib diisi.
3. IF Member menyimpan Scan_Configuration tanpa Source yang dipilih, THEN THE System SHALL menolak penyimpanan dan menampilkan pesan kesalahan validasi bahwa minimal satu Source wajib dipilih.
4. THE System SHALL mengizinkan Scan_Configuration memuat filter niche/industri dan filter lokasi sebagai kriteria opsional, dengan panjang nilai setiap filter maksimum 100 karakter setelah dipangkas.
5. WHERE filter lokasi tidak ditentukan pada Scan_Configuration, THE Scan_Engine SHALL menyertakan prospek dari seluruh lokasi yang dikembalikan oleh Source.
6. IF Member memilih satu atau lebih Source yang Source_Connector-nya berstatus selain available (yaitu unavailable atau requires_configuration), THEN THE System SHALL menampilkan peringatan yang mencantumkan setiap Source yang dikecualikan beserta statusnya, lalu menyimpan Scan_Configuration tanpa Source-Source tersebut tanpa memerlukan konfirmasi tambahan dari Member, dan jika hasil pengecualian menyisakan tidak ada Source available maka penyimpanan tersebut segera ditolak sesuai kriteria 8.
7. IF Member menyimpan Scan_Configuration yang melanggar satu atau lebih aturan validasi kata kunci (jumlah kata kunci lebih dari 50, atau kata kunci yang panjangnya kurang dari 2 karakter atau lebih dari 100 karakter setelah dipangkas), THEN THE System SHALL menolak penyimpanan seluruh Scan_Configuration dan menampilkan seluruh pesan kesalahan validasi yang berlaku secara bersamaan, yang menyatakan batas jumlah kata kunci (1 sampai 50) dan batas panjang kata kunci (2 sampai 100 karakter).
8. IF pengecualian otomatis Source yang berstatus selain available menyebabkan tidak ada satu pun Source yang tersisa pada Scan_Configuration, THEN THE System SHALL menolak penyimpanan dan menampilkan pesan kesalahan validasi bahwa minimal satu Source berstatus available wajib dipilih.

### Requirement 5: Eksekusi Pemindaian dan Pengumpulan Lead

**User Story:** Sebagai Member, saya ingin menjalankan pemindaian berdasarkan konfigurasi saya, sehingga prospek yang ditemukan terkumpul di satu tempat.

#### Acceptance Criteria

1. WHEN Member memicu sebuah Scan_Job dari sebuah Scan_Configuration, THE Scan_Engine SHALL memanggil setiap Source_Connector yang dipilih dan berstatus available menggunakan API resmi Source dengan batas waktu tunggu maksimum 60 detik per Source_Connector.
2. WHEN sebuah Source_Connector mengembalikan hasil prospek, THE Scan_Engine SHALL menormalkan setiap hasil menjadi objek Lead dengan Lead_Status awal "New" dan mencatat Source serta kata kunci pemicunya.
3. WHEN sebuah Scan_Job selesai, THE Scan_Engine SHALL menyimpan ringkasan berisi jumlah Lead baru, jumlah Duplicate_Lead, dan daftar Source yang dikecualikan.
4. IF sebuah Source_Connector mengembalikan kesalahan atau melampaui batas waktu tunggu 60 detik saat eksekusi Scan_Job, THEN THE Scan_Engine SHALL mencatat kesalahan tersebut pada hasil Scan_Job dan melanjutkan eksekusi Source_Connector lainnya.
5. IF sebuah Source_Connector mencapai batas laju (rate limit) API Source, THEN THE Scan_Engine SHALL menghentikan permintaan ke Source tersebut dan menandai hasil Source tersebut sebagai sebagian (partial) pada ringkasan Scan_Job.
6. WHERE Member menjadwalkan Scan_Configuration untuk berulang pada interval terjadwal dengan parameter penjadwalan yang valid (nilai minimum 1 jam dan maksimum 30 hari), THE Scan_Engine SHALL menandai Scan_Job sebagai jatuh tempo (due) pada setiap interval yang dijadwalkan dan mengeksekusinya secara otomatis.
7. IF Member memicu sebuah Scan_Job sementara tidak ada Source_Connector yang dipilih berstatus available, THEN THE Scan_Engine SHALL membatalkan Scan_Job tanpa membuat Lead dan menampilkan pesan kesalahan yang mengindikasikan tidak ada Source yang tersedia.
8. IF sebuah Scan_Job terjadwal jatuh tempo untuk sebuah Scan_Configuration sementara Scan_Job sebelumnya dari Scan_Configuration yang sama masih berjalan, THEN THE Scan_Engine SHALL melewati eksekusi terjadwal tersebut dan mencatat pelewatan tersebut pada hasil Scan_Job.

### Requirement 6: Deduplikasi Lead

**User Story:** Sebagai User, saya ingin Sistem menggabungkan prospek yang sama dari berbagai sumber, sehingga daftar Lead tetap bersih dan tidak berulang.

#### Acceptance Criteria

1. WHEN Scan_Engine menyimpan sebuah Lead yang identitasnya cocok dengan Lead yang sudah ada pada Team, THE Deduplication_Service SHALL menandai Lead baru tersebut sebagai Duplicate_Lead, menautkannya ke Lead yang sudah ada, dan tidak membuat entri Lead terpisah pada daftar utama.
2. WHEN sebuah Lead ditandai sebagai Duplicate_Lead, THE Deduplication_Service SHALL menambahkan Source baru tersebut ke daftar Source pada Lead yang sudah ada tanpa membuat entri Lead terpisah pada daftar utama.
3. THE Deduplication_Service SHALL menentukan kecocokan identitas berdasarkan URL profil yang identik, atau alamat email yang identik, atau kombinasi nama dan lokasi yang identik, dengan perbandingan yang tidak membedakan huruf besar dan kecil (case-insensitive) setelah menghapus spasi di awal dan akhir setiap nilai (trim).
4. WHEN Scan_Engine menyimpan sebuah Lead yang identitasnya tidak cocok dengan Lead mana pun yang sudah ada pada Team, THE Deduplication_Service SHALL membuat entri Lead terpisah yang berbeda pada daftar utama.
5. WHERE sebuah Lead baru berhasil diidentifikasi sebagai Duplicate_Lead melalui deduplikasi dan pada Lead yang sudah ada terdapat atribut bernilai kosong DAN atribut yang bersesuaian pada Lead baru bernilai tidak kosong, THE Deduplication_Service SHALL mengisi atribut kosong pada Lead yang sudah ada dengan nilai dari Lead baru tersebut.
6. IF proses pencocokan identitas tidak menemukan kecocokan atau gagal, THEN THE Deduplication_Service SHALL mempertahankan setiap Lead sebagai entri terpisah tanpa menggabungkan atau berbagi atribut antar-Lead.
7. IF sebuah atribut pada Lead yang sudah ada dan atribut yang bersesuaian pada Lead baru keduanya bernilai tidak kosong dan berbeda, THEN THE Deduplication_Service SHALL mempertahankan nilai atribut pada Lead yang sudah ada dan mengabaikan nilai dari Lead baru.

### Requirement 7: Penilaian dan Pemeringkatan Lead Otomatis

**User Story:** Sebagai Member, saya ingin Sistem menghitung skor potensi setiap prospek secara otomatis, sehingga saya dapat memprioritaskan tindak lanjut pada prospek paling potensial.

#### Acceptance Criteria

1. WHEN sebuah Lead baru disimpan, THE Lead_Scoring_Engine SHALL menghitung Lead_Score berdasarkan Scoring_Model Team dan menyimpan nilai Lead_Score tersebut pada Lead dalam waktu kurang dari 5 detik sejak Lead disimpan.
2. THE Lead_Scoring_Engine SHALL menghasilkan Lead_Score berupa bilangan bulat dalam rentang 0 sampai 100 inklusif.
3. WHEN Scoring_Model Team diperbarui, THE Lead_Scoring_Engine SHALL menghitung ulang Lead_Score untuk seluruh Lead Team berdasarkan Scoring_Model yang baru.
4. THE Dashboard_View SHALL menampilkan daftar Lead terurut menurun berdasarkan Lead_Score sebagai urutan bawaan.
5. WHERE dua Lead memiliki Lead_Score yang sama, THE Dashboard_View SHALL mengurutkan kedua Lead tersebut berdasarkan tanggal penemuan dari yang terbaru ke yang terlama, dan jika tanggal penemuan juga sama, berdasarkan pengidentifikasi Lead secara menaik.
6. THE Lead_Scoring_Engine SHALL menyimpan rincian setiap faktor Scoring_Model beserta kontribusi nilainya terhadap Lead_Score sebuah Lead agar dapat ditampilkan kepada User.
7. FOR ALL pemanggilan `computeScore` atas sebuah Lead tersimpan dengan kumpulan atribut masukan tersimpan yang identik (termasuk AI_Intent_Score yang sudah tersimpan pada Lead, jika ada, sebagai atribut masukan) dan Scoring_Model yang sama, THE Lead_Scoring_Engine SHALL menghasilkan Lead_Score yang identik (properti determinisme `computeScore`); langkah pengayaan AI yang menghasilkan AI_Intent_Score itu sendiri bersifat non-deterministik dan berada di luar cakupan jaminan determinisme ini, diatur tersendiri oleh Requirement 13.
8. IF penghitungan Lead_Score gagal saat sebuah Lead baru disimpan, Scoring_Model Team belum dikonfigurasi, atau hasil penilaian berada dalam keadaan tidak pasti, THEN THE Lead_Scoring_Engine SHALL tetap menyimpan Lead dengan Lead_Score dalam keadaan belum tersedia (unscored), mencatat kegagalan atau ketidakpastian penilaian, dan menampilkan indikasi kepada User bahwa Lead tersebut memerlukan penilaian ulang.
9. IF penyimpanan Lead dengan keadaan unscored berhasil tetapi pencatatan kegagalan penilaian atau penyampaian indikasi kepada User gagal, THEN THE Lead_Scoring_Engine SHALL membatalkan (roll back) penyimpanan Lead tersebut sehingga seluruh langkah penanganan kegagalan berhasil bersama-sama atau tidak sama sekali.
10. IF penghitungan ulang Lead_Score sebuah Lead gagal selama pembaruan Scoring_Model, THEN THE Lead_Scoring_Engine SHALL mempertahankan Lead_Score sebelumnya pada Lead tersebut dan melanjutkan penghitungan ulang untuk Lead lainnya.

### Requirement 8: Manajemen Lead dan Status Tindak Lanjut

**User Story:** Sebagai Member, saya ingin mengelola status setiap prospek, sehingga saya dapat melacak progres tindak lanjut dari penemuan hingga konversi.

#### Acceptance Criteria

1. THE Lead_Manager SHALL menyediakan tepat enam Lead_Status berikut dan tidak menyediakan status lain: New, Reviewed, Contacted, Qualified, Converted, Rejected.
2. WHEN Member mengubah Lead_Status sebuah Lead ke status tujuan yang berbeda dari status asal, THE Lead_Manager SHALL menyimpan status baru dan mencatat Activity perubahan status berisi status asal, status tujuan, pelaku, dan waktu perubahan.
3. WHEN Member menambahkan catatan tindak lanjut berisi 1 sampai 2.000 karakter pada sebuah Lead, THE Lead_Manager SHALL menyimpan catatan tersebut beserta pembuat dan waktu pembuatannya.
4. IF Member menambahkan catatan tindak lanjut yang kosong atau melebihi 2.000 karakter, THEN THE Lead_Manager SHALL menolak penyimpanan catatan tersebut, mempertahankan catatan Lead yang sudah ada tanpa perubahan, dan menampilkan pesan kesalahan validasi yang menunjukkan batasan panjang catatan.
5. WHEN Member menghapus sebuah Lead, THE Lead_Manager SHALL meminta konfirmasi eksplisit sebelum menghapus Lead.
6. IF Member membatalkan atau tidak menyelesaikan konfirmasi penghapusan sebuah Lead, THEN THE Lead_Manager SHALL mempertahankan Lead tersebut beserta seluruh atributnya tanpa perubahan.
7. WHEN Member mengonfirmasi penghapusan sebuah Lead, THE Lead_Manager SHALL menghapus Lead tersebut secara permanen dan mencatat penghapusan pada Audit_Log beserta pelaku dan waktu penghapusan.
8. THE Lead_Manager SHALL mencatat tanggal penemuan dan Source pada setiap Lead pada saat Lead dibuat.

### Requirement 9: Penelusuran dan Penyaringan Lead

**User Story:** Sebagai User, saya ingin menyaring dan mencari Lead, sehingga saya dapat menemukan prospek yang relevan dengan cepat.

#### Acceptance Criteria

1. WHEN User membuka halaman daftar Lead, THE System SHALL menampilkan Lead dalam halaman-halaman (pagination) dengan maksimum 25 Lead per halaman, mempertahankan urutan bawaan (Lead_Score menurun), dan menyediakan navigasi antarhalaman.
2. WHEN User memasukkan kata kunci pencarian sepanjang 1 sampai 100 karakter, THE System SHALL menampilkan Lead yang nama, kontak, atau niche-nya mengandung kata kunci tersebut sebagai substring tanpa membedakan huruf besar dan kecil (case-insensitive), setelah menghapus spasi di awal dan akhir kata kunci.
3. WHEN User memilih filter berdasarkan Lead_Status, THE System SHALL menampilkan hanya Lead dengan Lead_Status yang dipilih.
4. WHEN User memilih filter berdasarkan Source, THE System SHALL menampilkan hanya Lead yang berasal dari Source yang dipilih.
5. WHEN User memilih filter berdasarkan rentang Lead_Score dengan batas bawah dan batas atas yang berada di antara 0 sampai 100 dan batas bawah tidak melebihi batas atas, THE System SHALL menampilkan hanya Lead yang Lead_Score-nya berada dalam rentang tersebut secara inklusif.
6. IF hasil penyaringan tidak mengandung Lead, THEN THE System SHALL menampilkan pesan bahwa tidak ada Lead yang cocok.
7. WHEN User menerapkan lebih dari satu kriteria pencarian atau penyaringan secara bersamaan, THE System SHALL menampilkan hanya Lead yang memenuhi seluruh kriteria yang diterapkan (logika DAN).
8. IF User menerapkan filter rentang Lead_Score dengan batas bawah melebihi batas atas atau dengan nilai di luar rentang 0 sampai 100, THEN THE System SHALL menolak penerapan filter dan menampilkan pesan kesalahan validasi rentang Lead_Score.

### Requirement 10: Dashboard Metrik

**User Story:** Sebagai User, saya ingin melihat ringkasan metrik prospek, sehingga saya dapat memahami kondisi pencarian dan pipeline secara sekilas.

#### Acceptance Criteria

1. THE Dashboard_View SHALL menampilkan jumlah total Lead pada Team, tidak termasuk entri yang ditandai sebagai Duplicate_Lead.
2. THE Dashboard_View SHALL menampilkan jumlah Lead untuk setiap dari enam Lead_Status (New, Reviewed, Contacted, Qualified, Converted, Rejected), menampilkan nilai 0 untuk status yang tidak memiliki Lead.
3. THE Dashboard_View SHALL menampilkan jumlah Lead per Source untuk setiap Source yang memiliki setidaknya satu Lead, tidak termasuk entri yang ditandai sebagai Duplicate_Lead, secara konsisten dengan jumlah total Lead.
4. WHILE jumlah total Lead lebih besar dari nol, THE Dashboard_View SHALL menampilkan tingkat konversi yang dihitung sebagai (jumlah Lead pada Lead_Status "Converted" dibagi jumlah total Lead) dikali 100, dibulatkan ke dua angka desimal dan dinyatakan dalam persen.
5. IF jumlah total Lead bernilai nol, THEN THE Dashboard_View SHALL menampilkan tingkat konversi sebesar 0%.
6. WHEN User memilih rentang tanggal dengan tanggal awal tidak melebihi tanggal akhir dan menerapkan pilihan tersebut, THE Dashboard_View SHALL menghitung ulang seluruh metrik hanya untuk Lead yang tanggal penemuannya berada dalam rentang tanggal tersebut secara inklusif.
7. IF User menerapkan rentang tanggal dengan tanggal awal melebihi tanggal akhir, THEN THE Dashboard_View SHALL menolak penerapan rentang tersebut, mempertahankan metrik saat ini tanpa perubahan, dan menampilkan pesan kesalahan validasi rentang tanggal.

### Requirement 11: Kepatuhan Privasi dan Pelindungan Data Pribadi

**User Story:** Sebagai Admin, saya ingin Sistem menangani data pribadi sesuai GDPR dan UU PDP, sehingga Team mematuhi kewajiban hukum dalam pengelolaan Personal_Data prospek.

#### Acceptance Criteria

1. THE System SHALL menyimpan hanya Personal_Data yang tersedia secara publik melalui API resmi Source berupa nama, kontak publik, URL profil, dan lokasi.
2. THE System SHALL mencatat Source dan waktu perolehan setiap Personal_Data pada Lead untuk keperluan ketertelusuran.
3. WHEN seorang subjek data mengajukan permintaan penghapusan terhadap Lead yang memuat Personal_Data miliknya dan identitas subjek data telah terverifikasi, THE System SHALL menghapus seluruh Personal_Data Lead tersebut dalam waktu paling lama 72 jam sejak permintaan terverifikasi dan mencatat penghapusan pada Audit_Log tanpa mengirim konfirmasi penyelesaian kepada pemohon.
4. IF penghapusan Personal_Data atas permintaan subjek data gagal, THEN THE System SHALL mempertahankan seluruh Personal_Data Lead tanpa perubahan dan menampilkan notifikasi kegagalan penghapusan permintaan subjek data kepada pemohon yang terpisah dari pesan kesalahan otorisasi.
5. WHEN Admin mengekspor Lead, THE System SHALL menghasilkan ekspor dan mencatat aksi ekspor pada Audit_Log beserta pelaku dan waktu.
6. IF User tanpa peran yang berwenang mencoba mengekspor Lead, THEN THE System SHALL menolak akses User tersebut terhadap hasil ekspor dan menampilkan pesan kesalahan otorisasi, meskipun proses pembuatan ekspor telah dimulai atau selesai.
7. WHEN Personal_Data sebuah Lead telah tersimpan melebihi Data_Retention_Period Team, THE System SHALL menghapus Personal_Data tersebut secara otomatis dalam waktu paling lama 24 jam setelah Data_Retention_Period terlampaui dan mencatat penghapusan pada Audit_Log.
8. THE System SHALL mencatat setiap operasi pembuatan, perubahan, dan penghapusan Personal_Data pada Audit_Log beserta pelaku dan waktu.
9. WHERE sebuah Source mensyaratkan batasan penggunaan data tertentu pada Ketentuan Layanannya, THE Source_Connector SHALL menerapkan batasan tersebut pada Personal_Data yang diperoleh dari Source itu.

### Requirement 12: Performa dan Keandalan

**User Story:** Sebagai User, saya ingin dashboard merespons dengan cepat dan andal, sehingga saya dapat bekerja tanpa hambatan.

#### Acceptance Criteria

1. WHEN User membuka halaman daftar Lead, THE System SHALL menampilkan halaman pertama daftar Lead dalam waktu kurang dari 2 detik pada persentil ke-95 dari seluruh permintaan, untuk Team dengan jumlah total Lead hingga 100.000.
2. WHEN User mengirimkan pencarian atau filter, THE System SHALL menampilkan hasil dalam waktu kurang dari 1 detik pada persentil ke-95 dari seluruh permintaan, untuk Team dengan jumlah total Lead hingga 10.000.
3. IF eksekusi sebuah Scan_Job gagal seluruhnya sehingga tidak ada satu pun Source_Connector yang mengembalikan hasil, THEN THE Scan_Engine SHALL mempertahankan seluruh Lead Team yang sudah ada tanpa perubahan.
4. IF eksekusi sebuah Scan_Job gagal seluruhnya, THEN THE Scan_Engine SHALL menandai Scan_Job tersebut berstatus gagal sehingga status Scan_Job selalu mencerminkan hasil eksekusi sebenarnya terlepas dari keberhasilan penyampaian notifikasi, dan menampilkan status kegagalan tersebut kepada User.

### Requirement 13: Analisis Niat Berbasis AI (Gemini)

**User Story:** Sebagai Member, saya ingin Sistem secara opsional menganalisis konten publik sebuah Lead menggunakan Google Gemini untuk menghasilkan skor niat dan ringkasan naratif, sehingga saya dapat memprioritaskan tindak lanjut dengan sinyal tambahan di luar penilaian berbasis aturan tanpa menggantikan Lead_Score yang sudah ada.

#### Acceptance Criteria

1. THE AI_Analyzer_Service SHALL menggunakan Google Gemini melalui API resmi Google Generative Language sebagai satu-satunya AI_Provider untuk menghasilkan AI_Intent_Score dan AI_Insight.
2. THE System SHALL menyimpan kunci API Gemini per Team yang dikonfigurasi oleh Admin Team tersebut dalam keadaan terenkripsi at rest dengan mekanisme yang setara dengan penyimpanan kredensial Source_Connector, dan THE System SHALL tidak menggunakan satu kunci API Gemini bersama lintas Team.
3. WHERE Team belum memiliki kunci API Gemini yang tersimpan dan tervalidasi, THE System SHALL menonaktifkan opsi pengaktifan analisis AI pada seluruh Scan_Configuration milik Team tersebut.
4. THE System SHALL menetapkan analisis AI sebagai nonaktif sebagai bawaan pada setiap Scan_Configuration baru maupun yang sudah ada.
5. WHERE Team memiliki kunci API Gemini yang tersimpan dan tervalidasi, THE System SHALL mengizinkan Member yang memiliki hak ubah atas sebuah Scan_Configuration untuk mengaktifkan atau menonaktifkan analisis AI pada Scan_Configuration tersebut.
6. WHEN sebuah Lead baru disimpan dari sebuah Scan_Configuration yang analisis AI-nya aktif, THE Scan_Engine SHALL memasukkan Lead tersebut ke antrean latar belakang AI_Analyzer_Service tanpa memanggil AI_Provider secara inline pada eksekusi Scan_Job.
7. WHEN AI_Analyzer_Service memproses sebuah Lead dari antrean, THE AI_Analyzer_Service SHALL hanya mengirim ke AI_Provider data publik Lead yang sudah tersimpan berupa nama, kontak publik, URL profil, lokasi, daftar kata kunci pemicu (matchedKeywords), dan cuplikan post yang diperoleh secara sah oleh Source_Connector, dan THE AI_Analyzer_Service SHALL tidak mengirim atribut lain di luar daftar tersebut.
8. WHEN AI_Analyzer_Service melakukan satu panggilan ke AI_Provider, THE System SHALL mencatat panggilan tersebut pada Audit_Log beserta pelaku, Lead terkait, Scan_Configuration terkait, waktu, dan hasil (berhasil atau alasan kegagalan).
9. WHEN AI_Provider mengembalikan hasil yang valid, THE AI_Analyzer_Service SHALL menyimpan AI_Intent_Score sebagai bilangan bulat dalam rentang 0 sampai 100 inklusif dan AI_Insight sebagai teks sepanjang maksimum 500 karakter pada Lead tersebut.
10. WHEN AI_Intent_Score sebuah Lead diperbarui, THE Lead_Scoring_Engine SHALL menghitung ulang Lead_Score Lead tersebut dengan memperlakukan AI_Intent_Score sebagai faktor Scoring_Model berjenis `ai_intent_match` dengan bobot yang dikonfigurasi tingkat Team.
11. WHEN AI_Insight sebuah Lead disimpan, THE System SHALL menampilkan AI_Insight tersebut kepada User dengan peran Admin, Member, atau Viewer pada tampilan detail Lead tanpa membedakan peran dalam akses baca AI_Insight.
12. THE AI_Analyzer_Service SHALL menerapkan batas waktu tunggu (timeout) sebesar 30 detik untuk setiap panggilan ke AI_Provider.
13. IF panggilan ke AI_Provider untuk sebuah Lead gagal karena Team tidak memiliki kunci API Gemini yang tersimpan, kunci API ditolak oleh AI_Provider, AI_Provider mengembalikan kesalahan, AI_Provider mengembalikan keluaran berformat tidak valid, batas waktu 30 detik terlampaui, atau kuota AI_Provider terlampaui, THEN THE AI_Analyzer_Service SHALL menandai AI_Insight Lead tersebut sebagai 'unavailable' beserta alasan kegagalan, mempertahankan Lead dengan Lead_Score berbasis aturan tanpa faktor `ai_intent_match`, tidak membatalkan (roll back) penyimpanan Lead, dan tidak menghentikan eksekusi Scan_Job terkait.
14. WHEN Admin menetapkan AI_Call_Budget untuk Team dalam bentuk jumlah maksimum panggilan AI_Provider per jendela bergulir 30 hari, THE System SHALL menyimpan nilai tersebut dan menerapkannya pada penghitungan kuota Team.
15. IF jumlah panggilan AI_Provider yang sudah dilakukan untuk Team dalam jendela bergulir 30 hari mencapai AI_Call_Budget Team tersebut, THEN THE AI_Analyzer_Service SHALL menjeda panggilan AI_Provider berikutnya untuk Team tersebut, menandai AI_Insight Lead-Lead yang menunggu pemrosesan AI sebagai 'budget_exceeded', dan mempertahankan Lead-Lead tersebut dengan Lead_Score berbasis aturan tanpa faktor `ai_intent_match`.
16. WHEN Member yang memiliki hak ubah atas sebuah Lead memicu analisis ulang AI pada Lead tersebut, THE AI_Analyzer_Service SHALL memasukkan Lead tersebut ke antrean latar belakang sebagai panggilan AI_Provider yang baru.
17. WHERE User memiliki peran Viewer, THE System SHALL menolak pemicuan analisis ulang AI pada Lead mana pun dan tetap mengizinkan pembacaan AI_Intent_Score serta AI_Insight Lead.
18. THE System SHALL membatasi konfigurasi kunci API Gemini, pengaktifan ketersediaan AI di tingkat Team, dan penetapan AI_Call_Budget hanya kepada User dengan peran Admin.
