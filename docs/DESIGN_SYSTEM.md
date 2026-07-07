# VOIT DS - Dashboard UI Style Guide

**Date:** 2026-06-26  
**Scope:** Frontend Dashboard Components & Tokens  

This document serves as the technical style guide and component inventory for the Leads Generation Dashboard, based on the **VOIT DS** design system.

---

## 1. Design Tokens

The following design tokens are strictly defined in `tailwind.config.ts` and must be used across all components. Avoid using arbitrary values (e.g., `text-[#123456]`) or default Tailwind colors if a semantic token exists.

### 🎨 Colors

**Primary (Brand)**
- `primary-base` (`#177cb3`) - Core brand color, used for primary actions and active states.
- `primary-hover` (`#0f6f9f`) - Hover state for primary interactive elements.
- `primary-accent` (`#007fb9`) - Accent elements and highlights.
- `alpha-primary-10` (`rgba(23,124,179,0.10)`) - Very light primary background for subtle highlights and avatars.

**Backgrounds**
- `bg-white-0` (`#ffffff`) - Pure white for cards, panels, and input backgrounds.
- `bg-subtle` (`#fbfcfe`) - Slightly off-white background.
- `bg-weak-50` (`#f5f7fa`) - Default app background and container backgrounds (e.g., segmented controls, hover states).
- `bg-accent-soft` (`#eef8fc`) - Soft background for highlighted active rows or items.

**Text (Typography)**
- `text-strong-950` (`#171717`) - High emphasis text, headings, and active labels.
- `text-sub-600` (`#5f6368`) - Medium emphasis text, body copy, and inactive labels.
- `text-soft-400` (`#8c9198`) - Low emphasis text, placeholders, and meta information.
- `text-disabled-300` (`#c7cbd1`) - Disabled text and icons.

**Strokes & Borders**
- `stroke-soft-200` (`#e3e8ef`) - Subtle borders for cards, dividers, and default inputs.
- `stroke-strong-300` (`#cdd5df`) - Stronger borders for focused or active outline elements.
- `neutral-gray-200` (`#e3e8ef`) - General neutral gray.

**State & Semantic**
- **Success**: `state-success-base` (`#12b76a`), `state-success-dark` (`#027a48`), `state-success-light` (`#d1fadf`), `state-success-bg` (`#ecfdf3`)
- **Danger/Error**: `state-danger-base` (`#f04438`), `state-danger-hover` (`#d92d20`), `state-danger-dark` (`#b42318`), `state-danger-light` (`#fef3f2`), `state-danger-border` (`#fecdca`)
- **Warning**: `state-warning-base` (`#f79009`), `state-warning-border` (`#fedf89`)
- **Info**: `state-info-base` (`#2e90fa`), `state-info-border` (`#b2ddff`)

---

### 📐 Radius & Elevation

**Border Radius**
- `rounded-ui` (`14px`) - Used for most UI elements like inputs, standard buttons, and small containers.
- `rounded-panel` (`20px`) - Used for larger surfaces like cards, modals, and major sections.

**Box Shadows**
- `shadow-card` - `0px 8px 20px rgba(15, 23, 42, 0.05)` - Soft shadow for standard cards and dropdowns.
- `shadow-panel` - `0px 10px 24px rgba(15, 23, 42, 0.06)` - Deeper shadow for prominent panels and modals.
- `shadow-focus` - `0 0 0 4px rgba(23,124,179,0.14)` - Focus ring for accessibility and keyboard navigation.

---

## 2. Component Inventory

All components are located in `frontend/src/components/ui/`. They are built as reusable primitives adhering to VOIT DS.

### Form & Input

**Checkbox**
- **Purpose**: Allow users to select one or more options from a set.
- **Sizes**: Small (16px), Medium (20px)
- **States**: Default, Checked, Indeterminate, Focus (Ring)
- **Props**: `label` (optional), `supportMessage` (optional), standard input props.

**Radio**
- **Purpose**: Allow users to select one option from a set.
- **Sizes**: Small (20px base)
- **States**: Default, Checked, Focus (Ring)
- **Props**: `label` (optional), `supportMessage` (optional), standard input props.

**FileDrop**
- **Purpose**: Allow users to upload files via drag-and-drop or clicking.
- **Layouts**: Default (large area), Button (small button-style), Small (compact list style)
- **States**: Idle, Active (Dragging over), Loading (uploading), Success, Error.
- **Props**: `layout`, `state`, `fileName`, `progress`, `helperText`.

**Slider**
- **Purpose**: Select a value or range from a predefined scale.
- **Sizes**: Large 24
- **States**: Default
- **Props**: `size`, `style`, `value`
- **Variants**: Accent style

**Switch** (Toggle)
- **Purpose**: Toggle a setting on or off.
- **Sizes**: XSmall (16px), Medium (20px)
- **States**: Default
- **Props**: `focus`, `size`, `state`, `style`, `toggle`
- **Variants**: Accent style

**TextArea**
- **Purpose**: Multi-line text input field.
- **Sizes**: Medium, Large
- **States**: Default, Active, Done, Error, Disable
- **Props**: `count`, `filled`, `focus`, `footer`, `hint`, `iconLeading`, `iconTrailing`, `label`, `resizeHandle`, `size`, `state`, `style`, `support`, `tag`

**TextField**
- **Purpose**: Single-line text input field.
- **Sizes**: Medium, Large, XLarge
- **States**: Default, Active, Done, Error, Disable
- **Props**: `buttonLeading`, `buttonTrailing`, `colorCode`, `count`, `filled`, `focus`, `hint`, `iconLeading`, `iconTrailing`, `label`, `size`, `slotLeading`, `slotTrailing`, `state`, `style`, `support`, `tag`

### Navigation & Progress

**PageControl**
- **Purpose**: Navigate between multiple pages or sections within a carousel or paginated view.
- **Props**: `totalDots`, `activeIndex`, `showMore`
- **Variants**: Dot styles differ based on active state.

**Pagination**
- **Purpose**: Divide content into discrete pages and allow navigation.
- **Props**: `currentPage`, `totalPages`, `onPageChange`, `size` ("Small" | "Medium")
- **Variants**: Numbers layout with Next/Prev arrows.

**ProgressBar**
- **Purpose**: Visually represent the completion status of a task or process.
- **Props**: `percentage`, `label`, `showPercentage`, `size` ("Medium" | "Large")
- **Variants**: Fill width is dynamically generated based on `percentage`.

**ProgressIndicator**
- **Purpose**: Step indicator to show discrete steps in a process.
- **Props**: `label`, `description`, `state` ("Done" | "Active" | "Pending"), `line` (boolean)
- **Variants**: Active states have a border, Done states have a checkmark and filled background.

### Overlay & Feedback

**Popover**
- **Purpose**: Floating containers that display additional information or options in context.
- **Props**: `title`, `description`, `alignment` ("Top Left" | "Top Center"), `onDismiss`, `primaryAction`, `secondaryAction`
- **Variants**: Includes a pointer and flexible alignment options.

### Navigation & Actions
- **`Button.tsx`**: Core action element. Supports multiple variants (e.g., primary, secondary, outline, ghost) and sizes. Must include loading and disabled states.
- **`SegmentedControl.tsx`**: Mutually exclusive choice selector, often used as an alternative to Tabs. Features a `bg-weak-50` container and fully customizable active/inactive states.
- **`Tabs.tsx`**: Standard horizontal tab navigation (often wrapper for Radix UI Tabs).
- **`Breadcrumb.tsx`**: Navigation path indicator with built-in auto-truncation for long paths.
- **`Pagination.tsx`**: Data table pagination controls.
- **`NavigationItem.tsx`**: Sidebar or top-bar navigation link item.
- **`DropdownMenu.tsx`**: Contextual menu component for actions (wrapper for Radix UI DropdownMenu).

### Data Display
- **`Table.tsx`**: Primitive components (`Table`, `TableHeader`, `TableRow`, `TableCell`) for constructing data grids.
- **`Card.tsx`**: Basic surface container using `bg-white-0`, `rounded-panel`, and `shadow-card`.
- **`Surface.tsx`**: Generic container component with VOIT DS elevation levels.
- **`Accordion.tsx`**: Native CSS grid transition collapsible list with `subtle`, `line`, `fill`, and `onColor` styles.
- **`Badge.tsx`**: Small visual indicator for statuses (Success, Warning, Danger, Info). Supports `sm`, `md`, `lg` sizes and `light`, `outline`, `solid` styles.
- **`Tag.tsx`**: Interactive tag for filtering or categorization. Supports sizes (xSmall), colors (Red, Orange, Yellow, etc), and icons.
- **`Avatar.tsx`**: User or AI visual representation (often circular).
- **`Typography.tsx`**: Centralized component for rendering headings and paragraphs according to the VOIT DS type scale.

### Data Visualization (Charts)
Berdasarkan referensi Figma `Dashboard-UI-Charts-1.0.0`. Menggunakan pustaka `recharts` dan `react-simple-maps`.
- **`ChartCard.tsx`**: Komponen wrapper (pembungkus) untuk semua grafik. Mendukung prop `variant="md" | "xl"` untuk menyesuaikan ukuran tajuk (*header*), Angka KPI, dan *padding*.
- **`AreaChartBase.tsx`**: Grafik area bergradasi tebal dengan garis melengkung dan *dots* aktif.
- **`BarChartBase.tsx`**: Grafik batang (pill shape) untuk komparasi metrik bulan-ke-bulan.
- **`LineChartBase.tsx`**: Grafik garis murni bersilang untuk komparasi 2+ variabel.
- **`PieChartBase.tsx`**: Grafik Donut berlubang dengan teks informasi terpusat.
- **`RadarChartBase.tsx`**: Grafik jaring laba-laba/poligon untuk sebaran kategori.
- **`ComposedChartBase.tsx`**: Campuran antara batang (Bar) dan garis (Line) di sumbu yang sama.
- **`RegionMapBase.tsx`**: Peta dunia interaktif format SVG dengan *markers* koordinat.

### Feedback & Overlays
- **`Modal.tsx`**: Dialog window overlay that blocks background interaction. Uses `shadow-panel` and `rounded-panel`.
- **`Toaster.tsx`**: Toast notification system for non-blocking alerts.
- **`Skeleton.tsx`**: Loading placeholder that mimics the shape of content to prevent layout shifts.

---

## 3. Best Practices

1. **Use Semantic Tokens**: Never hardcode colors like `bg-[#177cb3]`. Always use `bg-primary-base`.
2. **Hover States**: Interactive elements should always have a visible hover state (e.g., `hover:bg-primary-hover` or `hover:bg-stroke-soft-200/50`).
3. **Accessibility**: Form elements must support `focus-visible:ring-2 focus-visible:ring-primary-accent/20` (or the custom `shadow-focus` token) to aid keyboard navigation.
4. **Spacing**: Rely on standard Tailwind spacing utilities (`p-4`, `gap-2`, `mt-6`) rather than arbitrary pixel values, unless mandated by strict VOIT DS fallbacks.
