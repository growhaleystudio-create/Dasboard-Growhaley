# Archive Docs

Folder ini berisi dokumen Markdown yang **tidak lagi diposisikan sebagai dokumentasi aktif utama**, tapi masih disimpan sebagai referensi historis, handoff lama, atau artefak proses kerja.

## Tujuan archive

Archive dipakai untuk merapikan root project dan folder `docs/` tanpa langsung menghapus dokumen yang mungkin masih berguna buat:
- melacak konteks keputusan lama
- melihat ringkasan sesi kerja sebelumnya
- meninjau plan/checklist/test report historis
- membandingkan arah refactor atau eksperimen lama

## Yang sebaiknya tetap dianggap source utama

Kalau cari dokumentasi aktif, prioritaskan dulu file-file utama seperti:
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/SPRINTS.md`
- `docs/ERROR_CODES.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/dashboard-internal-agent.md`
- `docs/dashboard-agent-output-templates.md`
- `docs/feature-analysis-agent-template.md`
- `docs/leads-generator-feature-analysis.md`
- `.kiro/specs/**`

## Struktur archive

### `session-notes/`
Ringkasan sesi, handoff, completion note, dan pause note yang sifatnya tanggal-spesifik.

### `refactor-notes/`
Plan, analysis, extraction guide, dan note historis terkait refactor teknis.

### `test-plans/`
Checklist, smoke test plan/report, dan dokumen validasi one-off.

### `superpowers/`
Artefak plan/spec hasil workflow superpowers yang tidak diposisikan sebagai dokumen produk utama.

### `root-notes/`
Catatan Markdown lama yang sebelumnya menumpuk di root project.

## Rule of thumb

Dokumen di archive umumnya:
- **boleh dibaca** untuk konteks historis
- **jangan diasumsikan up to date**
- **bukan source of truth utama** untuk behavior current system

Kalau ada isi archive yang masih relevan secara operasional, lebih baik pindahkan atau rangkum ulang ke dokumen aktif yang canonical.
