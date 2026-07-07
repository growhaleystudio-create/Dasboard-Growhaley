# Design: VOIT DS Dashboard Redesign

**Date:** 2026-06-26
**Product:** Leads Generation Dashboard
**Status:** Approved
**Owner:** Dashboard Team
**Scope:** Frontend dashboard redesign only. No backend contract or business logic changes.

---

## 1. Overview

Dashboard frontend saat ini sudah punya komponen reusable dan token Tailwind sendiri, tetapi visual language-nya masih campuran: sebagian screen sudah memakai token internal, sebagian masih punya styling ad-hoc per page, dan shell dashboard belum sepenuhnya dibangun sebagai satu design system yang konsisten. User ingin **merombak total seluruh design dashboard** dan menggantinya dengan **VOIT DS** sebagai sumber visual tunggal.

Target redesign ini adalah **full visual migration** untuk semua page dashboard existing, dengan guardrail utama bahwa **fungsi existing harus tetap sama**. Kita tidak mengubah API, auth, permissions, routing, atau business flow. Yang berubah adalah seluruh presentational layer: token, typography, components, shell, page patterns, dan styling surface pada semua halaman dashboard.

Pendekatan yang disetujui adalah **hard switch per layer** dengan strategi **foundation first**:

1. audit seluruh UI dashboard existing,
2. petakan VOIT DS ke token frontend,
3. bangun foundation + reusable components + app patterns,
4. migrasikan semua page ke layer baru,
5. hapus komponen lama yang bentrok.

Untuk kebutuhan UI yang belum tersedia eksplisit di VOIT DS (mis. chart, visualization, atau app-specific composite pattern), implementasi harus mengikuti aturan **closest-match strict fallback**: bentuk komponen boleh disesuaikan seperlunya, tetapi tetap harus tunduk pada typography, color, spacing, states, dan visual language dari VOIT DS.

---

## 2. Goals & Non-Goals

### Goals

1. **Single visual system** — seluruh dashboard memakai VOIT DS sebagai sumber visual tunggal.
2. **Full dashboard coverage** — semua page dashboard existing masuk scope redesign.
3. **Behavior parity** — semua flow existing tetap berfungsi identik dari sisi behavior inti.
4. **Foundation-first implementation** — redesign dibangun dari token, primitives, shell, dan patterns yang reusable.
5. **Replace legacy UI** — komponen existing yang bentrok dengan VOIT DS diganti total, bukan di-wrapper atau di-patch.
6. **Strict DS fidelity** — implementasi sedekat mungkin dengan Figma VOIT DS untuk typography, hierarchy, components, state, dan spacing.
7. **Reusable frontend architecture** — hasil redesign harus lebih mudah dipelihara dan mencegah styling liar per page.

### Non-Goals

1. **No backend changes** — tidak ada perubahan endpoint, payload, auth contract, atau repository behavior.
2. **No business workflow redesign** — tidak ada perubahan requirement produk, task flow, atau permission model.
3. **No feature expansion** — redesign tidak dipakai sebagai kendaraan untuk menambah fitur baru.
4. **No compatibility mode** — tidak ada target mempertahankan legacy component API kalau bertentangan dengan struktur VOIT DS.
5. **No partial mixed-language final state** — hasil akhir bukan koeksistensi jangka panjang antara visual lama dan VOIT DS.

---

## 3. Existing Frontend Context

### 3.1 Dashboard shell

Dashboard shell saat ini dipusatkan di `frontend/src/components/layout/DashboardLayout.tsx`, lalu dipasang lewat `frontend/src/app/dashboard/layout.tsx`. Shell ini sudah memegang:
- sidebar desktop,
- mobile bottom navigation,
- desktop page header,
- auth/session blocking state,
- profile menu dan logout,
- page title/subtitle mapping berdasarkan pathname.

Artinya, redesign shell bisa dilakukan secara terpusat tanpa mengubah struktur route App Router.

### 3.2 Existing UI primitives

Frontend sudah memiliki kumpulan komponen UI di `frontend/src/components/ui/`, seperti:
- `Button.tsx`
- `Input.tsx`
- `Select.tsx`
- `Card.tsx`
- `Table.tsx`
- `Tabs.tsx`
- `Badge.tsx`
- `Modal.tsx`
- `Skeleton.tsx`
- `Pagination.tsx`

Namun saat dibaca dari implementasi saat ini, komponen-komponen tersebut masih berada pada level **design-token internal + per-component tailoring**, belum menjadi representasi formal dari VOIT DS. Beberapa page juga masih menulis layout dan presentational patterns langsung di page file, mis. `frontend/src/app/dashboard/page.tsx`, `frontend/src/app/dashboard/surveys/page.tsx`, dan `frontend/src/app/dashboard/content/page.tsx`.

### 3.3 Page surfaces in scope

Berdasarkan struktur App Router saat ini, redesign mencakup seluruh surface dashboard berikut:
- `frontend/src/app/dashboard/page.tsx`
- `frontend/src/app/dashboard/leads/page.tsx`
- `frontend/src/app/dashboard/scans/page.tsx`
- `frontend/src/app/dashboard/scan-leads/page.tsx`
- `frontend/src/app/dashboard/metrics/page.tsx`
- `frontend/src/app/dashboard/connectors/page.tsx`
- `frontend/src/app/dashboard/settings/page.tsx`
- `frontend/src/app/dashboard/team/page.tsx`
- `frontend/src/app/dashboard/content/page.tsx`
- `frontend/src/app/dashboard/catalog/page.tsx`
- `frontend/src/app/dashboard/catalog/layouts/page.tsx`
- `frontend/src/app/dashboard/content-catalog/page.tsx`
- `frontend/src/app/dashboard/surveys/page.tsx`
- `frontend/src/app/dashboard/surveys/[surveyId]/page.tsx`

Jika ada screen lain yang masih hidup di bawah `/dashboard`, screen tersebut otomatis masuk scope.

---

## 4. Design Decisions

### 4.1 Hard switch per layer (approved)

Pendekatan implementasi yang disepakati adalah **hard switch per layer**, bukan wrapper compatibility dan bukan page-first rebuild. Layer kerja dipecah menjadi:

1. **Design foundation**
2. **Core reusable components**
3. **App patterns**
4. **Page migration**
5. **Legacy cleanup**

Alasannya:
- user menginginkan strict fidelity ke VOIT DS,
- user memilih replace total untuk komponen yang bentrok,
- scope redesign mencakup semua dashboard page,
- fondasi reusable dibutuhkan agar hasil akhir tidak campur aduk.

### 4.2 Foundation first (approved)

Page migration baru dimulai setelah foundation dan komponen inti cukup siap dipakai lintas screen. Ini mencegah dua kegagalan umum:
- page-style override liar sebelum token matang,
- komponen reusable lahir reaktif per page dan akhirnya tidak konsisten.

### 4.3 Replace total for conflicting legacy UI (approved)

Jika komponen existing tidak sesuai struktur visual VOIT DS, komponen tersebut harus:
- diganti dengan implementasi baru yang lebih sesuai,
- atau dipecah dan dibangun ulang di atas foundation baru.

Strategi “bungkus komponen lama supaya terlihat mirip” tidak dipakai sebagai arah utama.

### 4.4 Strict fallback for DS gaps (approved)

Jika VOIT DS tidak menyediakan komponen app-specific tertentu secara eksplisit, implementasi fallback harus:
- memakai token warna, type scale, radius, border, elevation, dan state dari VOIT DS,
- menjaga hierarchy dan density tetap terasa native terhadap DS,
- menghindari visual bawaan library yang tidak matching.

Contoh area yang bisa terkena aturan ini:
- charts / data visualization,
- filter bars kompleks,
- composite table actions,
- app-specific empty/loading/error state.

---

## 5. Target Architecture

### 5.1 Layer 1 — Design foundation

Layer ini menjadi sumber styling tunggal frontend. Isinya:
- typography scale VOIT DS,
- color roles/tokens,
- spacing scale,
- radius,
- border tokens,
- shadow/elevation tokens,
- interaction state tokens,
- motion/transition dasar.

Output layer ini bukan sekadar kumpulan class acak, tetapi **frontend theme contract** yang bisa dipakai semua primitive dan page surface.

### 5.2 Layer 2 — Core reusable components

Layer ini berisi building blocks reusable yang strict ke VOIT DS, minimal untuk:
- text / heading primitives,
- button,
- input,
- textarea,
- select / dropdown,
- checkbox / radio / switch,
- badge / tag,
- alert / notice,
- card,
- modal / drawer,
- tabs,
- tooltip,
- table primitives,
- pagination,
- avatar,
- skeleton / spinner / empty-state base.

Semua primitive wajib punya state penting: default, hover, active, focus, disabled, loading, dan error bila relevan.

### 5.3 Layer 3 — App shell & patterns

Layer ini membangun pattern dashboard yang reusable lintas halaman:
- dashboard shell,
- sidebar,
- top header / mobile header,
- mobile navigation,
- page header,
- content container,
- section wrapper,
- action bar,
- filter/search toolbar,
- data table section,
- form section,
- card grid/list section,
- loading state,
- empty state,
- error state,
- confirmation pattern.

Tujuan layer ini adalah memindahkan styling dan layout berulang dari page files ke pattern reusable.

### 5.4 Layer 4 — Page migration

Setelah foundation, primitives, dan patterns stabil, semua page dashboard existing dimigrasikan ke layer baru. Selama migrasi:
- route tetap sama,
- query/mutation logic tetap sama,
- data flow dan API tetap sama,
- yang berubah hanya visual structure dan presentational composition.

### 5.5 Layer 5 — Legacy cleanup

Tahap akhir harus eksplisit menghapus atau men-deprecate:
- komponen lama yang tidak lagi dipakai,
- utility visual lama yang bentrok,
- page-level style yang redundant,
- import lama yang memungkinkan kebocoran design language lama.

---

## 6. File Structure Direction

Berikut struktur file yang disarankan untuk mendukung redesign tanpa memecah pola Next.js yang sudah ada:

### Modify existing
- `frontend/src/app/globals.css`
- `frontend/src/components/layout/DashboardLayout.tsx`
- `frontend/src/components/ui/Button.tsx`
- `frontend/src/components/ui/Input.tsx`
- `frontend/src/components/ui/Textarea.tsx`
- `frontend/src/components/ui/Select.tsx`
- `frontend/src/components/ui/Card.tsx`
- `frontend/src/components/ui/Table.tsx`
- `frontend/src/components/ui/Tabs.tsx`
- `frontend/src/components/ui/Badge.tsx`
- `frontend/src/components/ui/Modal.tsx`
- `frontend/src/components/ui/Skeleton.tsx`
- `frontend/src/components/ui/Pagination.tsx`
- `frontend/src/app/dashboard/page.tsx`
- `frontend/src/app/dashboard/surveys/page.tsx`
- seluruh page lain di bawah `frontend/src/app/dashboard/**/page.tsx` yang masih aktif

### Create new foundation files
- `frontend/src/components/ui/Typography.tsx` — text/heading primitives strict VOIT DS.
- `frontend/src/components/ui/Surface.tsx` — reusable surface wrapper bila `Card` perlu dipisah dari semantic panel abstractions.
- `frontend/src/components/ui/EmptyState.tsx` — base empty state yang VOIT-native.
- `frontend/src/components/ui/InlineMessage.tsx` — alert/notice small pattern untuk inline feedback.
- `frontend/src/components/ui/Spinner.tsx` — shared loading indicator bila skeleton saja tidak cukup.

### Create new shell/pattern files
- `frontend/src/components/layout/DashboardSidebar.tsx`
- `frontend/src/components/layout/DashboardTopbar.tsx`
- `frontend/src/components/layout/DashboardMobileNav.tsx`
- `frontend/src/components/layout/PageHeader.tsx`
- `frontend/src/components/patterns/FilterToolbar.tsx`
- `frontend/src/components/patterns/DataSection.tsx`
- `frontend/src/components/patterns/MetricCard.tsx`
- `frontend/src/components/patterns/StatePanel.tsx`

Tidak semua nama file di atas wajib final, tetapi batas tanggung jawabnya harus tetap sama: file kecil, fokus, dan reusable.

---

## 7. Migration Rules

### 7.1 No mixed design language

Begitu satu area/dashboard surface dimigrasikan ke VOIT DS, area itu tidak boleh masih mencampur komponen lama dan pola visual lama secara signifikan.

### 7.2 Replace, not patch

Jika sebuah komponen bertentangan dengan VOIT DS, solusi utamanya adalah mengganti struktur visual komponen tersebut, bukan menumpuk override kecil di atas implementasi lama.

### 7.3 Token-first styling

Semua style baru harus lahir dari foundation. Hardcoded value baru di page hanya boleh dipakai jika memang belum ada token yang tepat, dan kasus itu harus menjadi sinyal untuk menambah foundation token/pattern.

### 7.4 Pattern before page exceptions

Kalau dua atau lebih halaman butuh pola UI yang sama, pola itu harus dinaikkan menjadi component/pattern reusable. Jangan copy styling antar page.

### 7.5 Behavior parity required

Redesign tidak boleh merusak:
- routing,
- fetch/mutation flow,
- form submit,
- save/edit/delete/publish flows,
- auth/session gating,
- role-based access behavior.

### 7.6 Strict fallback for missing DS pieces

Untuk UI yang tidak ada secara eksplisit di DS, implementasi harus tetap terlihat seperti bagian organik dari VOIT DS, bukan tampilan default library.

---

## 8. Page Scope & Surface Expectations

### 8.1 Global shell

Global shell redesign mencakup:
- sidebar desktop,
- mobile navigation,
- page title header,
- notification trigger,
- profile menu,
- blocking/loading session state.

`frontend/src/components/layout/DashboardLayout.tsx` adalah titik masuk utamanya.

### 8.2 Overview and dashboard summaries

`frontend/src/app/dashboard/page.tsx` saat ini masih memakai panel dan layout langsung di file page. Area ini harus dimigrasi ke metric pattern, data section pattern, dan filter/search pattern yang reusable.

### 8.3 Survey module surfaces

`frontend/src/app/dashboard/surveys/page.tsx` dan `frontend/src/app/dashboard/surveys/[surveyId]/page.tsx` harus mengikuti shell dan primitive baru. Survey module juga harus konsisten dengan redesign page list, modal, table, badge, card, dan form controls.

### 8.4 Content generator and dense app screens

`frontend/src/app/dashboard/content/page.tsx` adalah salah satu page paling padat dan paling berisiko dalam redesign, karena memuat banyak tabs, forms, cards, badges, action groups, previews, dan workflow states. Page seperti ini akan menjadi validasi utama bahwa foundation dan patterns cukup kuat untuk screen kompleks.

### 8.5 Other dashboard pages

Semua page dashboard lain harus mengikuti standard shell dan patterns yang sama, termasuk state kosong, loading, error, table/list sections, serta action buttons.

---

## 9. Accessibility

Redesign tidak boleh hanya mengejar fidelity visual. Semua primitive dan shell baru harus tetap menjaga:
- focus visible state yang jelas,
- keyboard navigation pada navigation, modal, tabs, dropdown, pagination, dan form controls,
- semantic heading dan landmark yang masuk akal,
- disabled/loading/error state yang tidak bergantung hanya pada warna,
- contrast yang aman sesuai token DS yang dipilih.

Karena beberapa primitive existing memakai Radix dan pola accessible yang cukup baik, integrasi dengan foundation baru sebaiknya mempertahankan perilaku aksesibilitas tersebut sambil mengganti visual layer-nya.

---

## 10. Testing Strategy

### 10.1 Foundation and primitives

Tambahkan/ubah test untuk shared primitives yang paling penting agar state visual dasar tetap aman secara behavior:
- button variants dan disabled/loading behavior,
- input/select/tabs interactions,
- modal open/close behavior,
- pagination click behavior,
- shell navigation active state.

Tidak semua fidelity visual perlu snapshot test, tetapi interaction state dan semantic contract harus diuji.

### 10.2 Page regression checks

Untuk setiap page yang dimigrasikan, minimal dicek:
- route tetap render,
- data fetch tetap berjalan,
- action penting masih callable,
- no runtime error,
- loading/error state tetap muncul benar.

### 10.3 Manual visual QA

Karena redesign ini fokus visual, perlu manual QA lintas:
- desktop shell,
- mobile shell,
- overview page,
- surveys page,
- survey detail/editor,
- content generator,
- table-heavy screens,
- form-heavy screens.

Checklist visual QA harus fokus pada:
- typography hierarchy,
- spacing rhythm,
- state consistency,
- icon sizing,
- card/surface consistency,
- active/focus/disabled styles,
- absence of legacy visual leakage.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Scope redesign terlalu besar | Kerja dengan layer jelas: audit → foundation → components → patterns → pages → cleanup |
| Mixed design language saat transisi | Terapkan migration rule per surface: area yang dimigrasikan harus full VOIT DS |
| DS gap untuk chart/composite app UI | Gunakan closest-match strict fallback berbasis token dan pattern DS |
| Legacy component masih dipakai diam-diam | Tambahkan cleanup phase eksplisit dan audit import usage |
| Literal fidelity ke Figma merusak usability existing | Behavior parity menjadi guardrail tetap; visual strict, behavior tetap functional |
| Dense pages (mis. content generator) butuh terlalu banyak exception | Bangun pattern reusable lebih dulu sebelum menyentuh screen paling kompleks |

---

## 12. Rollout Plan

High-level phase yang disepakati:

1. **Audit & mapping**
   - inventaris page dashboard,
   - inventaris komponen legacy,
   - mapping VOIT DS → token frontend,
   - identifikasi gap.

2. **Build design foundation**
   - colors,
   - typography,
   - spacing,
   - radius/border/elevation,
   - interactive states.

3. **Build core components**
   - primitives strict VOIT DS.

4. **Build shell & app patterns**
   - layout shell,
   - page headers,
   - data sections,
   - filter bars,
   - states.

5. **Migrate all pages**
   - migrasi seluruh page existing ke layer baru.

6. **Cleanup & hardening**
   - remove deprecated UI,
   - clean imports/styles,
   - final regression + consistency pass.

Walaupun target akhirnya full dashboard, urutan page migration saat eksekusi sebaiknya tetap:
1. global shell,
2. shared patterns,
3. high-traffic pages,
4. remaining pages,
5. final cleanup.

---

## 13. Definition of Done

Redesign dianggap selesai jika:
- semua page dashboard existing sudah memakai foundation dan component VOIT DS,
- komponen lama yang bentrok sudah diganti atau dideprecate,
- tidak ada mixed styling signifikan dari visual lama,
- behavior existing tetap parity,
- dashboard secara keseluruhan terasa sebagai satu sistem UI yang konsisten: **VOIT DS**.

---

## 14. References

- VOIT DS Figma: `https://www.figma.com/design/5EgyDD4AyqogEyfoGUzWUj/VOIT-DS?node-id=1-4&p=f&t=s7rV9JHlJ58fqnjE-0`
- Current shell: `frontend/src/components/layout/DashboardLayout.tsx`
- Current dashboard layout wrapper: `frontend/src/app/dashboard/layout.tsx`
- Existing UI primitives: `frontend/src/components/ui/`
- Existing dashboard pages: `frontend/src/app/dashboard/**/page.tsx`
