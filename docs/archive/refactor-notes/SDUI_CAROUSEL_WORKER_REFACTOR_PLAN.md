# SDUI Carousel Worker - Refactor Plan

**File:** `backend/src/content/sdui-carousel-worker.ts`  
**Current:** main worker still contains substantial legacy inline logic; helper extraction is already underway  
**Target:** orchestration-focused worker + extracted modules for reusable logic  
**Date:** 2026-06-15

---

## 🎯 Executive Summary

File `sdui-carousel-worker.ts` awalnya merupakan god object besar. Refactor ini sudah berjalan dan mayoritas helper inti sudah diekstrak ke modul `utils`, `validators`, `processors`, dan `pipeline`. Fokus yang tersisa sekarang bukan lagi memulai implementasi, melainkan menyelesaikan sinkronisasi signature handler, verifikasi regresi, dan membersihkan sisa orchestration inline di file utama.

**Current Reality:**
- Utils extracted
- Validators extracted
- Processors extracted
- Pipeline handlers extracted under `backend/src/content/workers/pipeline/`
- Main worker masih belum menjadi facade tipis sepenuhnya
- Regression verification masih belum bersih

---

## 📁 Current Structure Snapshot

```text
backend/src/content/
├── sdui-carousel-worker.ts
└── workers/
    ├── utils/
    │   ├── image-utils.ts
    │   ├── theme-builder.ts
    │   ├── content-sanitizer.ts
    │   └── slide-utils.ts
    ├── validators/
    │   ├── slide-quality-validator.ts
    │   └── slide-content-analyzer.ts
    ├── processors/
    │   ├── slide-enrichment.ts
    │   ├── layout-processor.ts
    │   └── slide-repair.ts
    └── pipeline/
        ├── job-pipeline-context.ts
        ├── slide-acquisition.ts
        ├── quality-gate.ts
        ├── image-generation-handler.ts
        └── render-phase-handler.ts
```

## ✅ What Is Already Implemented

### Phase 1 — Utils
Completed and integrated:
- `workers/utils/image-utils.ts`
- `workers/utils/theme-builder.ts`
- `workers/utils/content-sanitizer.ts`
- `workers/utils/slide-utils.ts`

### Phase 2 — Validators
Completed and integrated:
- `workers/validators/slide-quality-validator.ts`
- `workers/validators/slide-content-analyzer.ts`

### Phase 3 — Processors + Pipeline Foundation
Completed at extraction level:
- `workers/processors/slide-enrichment.ts`
- `workers/processors/layout-processor.ts`
- `workers/processors/slide-repair.ts`
- `workers/pipeline/job-pipeline-context.ts`
- `workers/pipeline/slide-acquisition.ts`
- `workers/pipeline/quality-gate.ts`

### Phase 4 — Terminal Pipeline Handlers
Implemented, but verification/cleanup remains:
- `workers/pipeline/image-generation-handler.ts`
- `workers/pipeline/render-phase-handler.ts`

---

## 🔄 Updated Refactor Direction

Refactor tidak lagi mengikuti target folder `workers/phases/` seperti draft awal. Implementasi aktual memakai folder `workers/pipeline/` untuk orchestration handlers. Karena itu, plan ini diselaraskan ke struktur repo yang sudah ada.

### Active End-State Goal
1. `sdui-carousel-worker.ts` hanya memuat orchestration inti dan dependency wiring.
2. Reusable logic hidup di `utils`, `validators`, `processors`, dan `pipeline`.
3. Signature antar handler konsisten.
4. Worker tests kembali hijau.
5. Dokumentasi mencerminkan kondisi implementasi nyata.

---

## 🧪 Current Verification Status

Known status from current documentation and repo state:
- helper extraction sudah berjalan jauh
- `image-generation-handler.ts` masih perlu signature sync penuh dengan worker call sites / tests
- worker regression suite belum bersih
- final cleanup belum selesai

---

## 📌 Remaining Work

### 1. Signature & Wiring Sync
- sinkronkan call signature `image-generation-handler.ts`
- pastikan `render-phase-handler.ts` dan worker memakai kontrak yang sama
- pastikan context objects pipeline konsisten

### 2. Main Worker Cleanup
- kurangi helper inline yang sudah punya padanan modul
- pindahkan orchestration yang masih bisa diekstrak aman
- arahkan worker menjadi facade yang lebih mudah diaudit

### 3. Regression Verification
- jalankan dan bereskan worker tests terkait refactor
- verifikasi alur image generation failure vs optional repair
- verifikasi render/upload terminal flow

### 4. Documentation Sync
- selaraskan `docs/SDUI_CAROUSEL_WORKER_REFACTOR_TASKS.md`
- hapus asumsi lama tentang `workers/phases/` bila tidak dipakai
- dokumentasikan bahwa implementasi aktual memakai `workers/pipeline/`

---

## 🚨 Risks Still Active

- signature drift antara worker dan handler pipeline
- false sense of completion dari dokumen lama yang masih menyebut “draft” atau “ready for implementation”
- regression di `sdui-carousel-worker.test.ts`
- cleanup yang belum selesai dapat menyisakan duplicate logic di worker

---

## ✅ Success Criteria (Updated)

Refactor dianggap selesai bila:
- worker test suite kembali pass
- signature handler pipeline sinkron
- `sdui-carousel-worker.ts` materially lebih tipis dan fokus orchestration
- tidak ada mismatch besar antara plan, task list, dan kondisi repo
- dokumentasi status mencerminkan kondisi aktual

---

## 📚 References

- [Original Analysis](./SDUI_CAROUSEL_WORKER_ANALYSIS.md)
- [Task List](./SDUI_CAROUSEL_WORKER_REFACTOR_TASKS.md)

---

**Status:** 🟡 In Progress  
**Next Steps:** Finish signature sync → verify worker regressions → clean up remaining inline orchestration  
**Contact:** Development Team
