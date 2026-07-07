# Dashboard Overview Leads + Research Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocus the dashboard overview on Leads and Research only, remove unrelated sections, add richer real-data charts, and provide a proper empty state when Recent Leads has no rows.

**Architecture:** Keep the work localized to `frontend/src/app/dashboard/page.tsx`, reusing existing queries for leads metrics, recent leads, and surveys. Replace the broader executive layout with a leaner Leads + Research overview: updated KPI row, a compact chart block using the existing chart component library, two simplified feature panels, and a guarded Recent Leads block that explains empty results and links users to the right next action.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, TanStack Query, existing UI components (`BentoGrid`, `BentoCard`, `Surface`, `Badge`, `Button`, `Typography`), existing chart components already present in the frontend UI kit.

---

## File Structure

### Files to modify
- `frontend/src/app/dashboard/page.tsx`
  - Remove Scans, Team, Content & AI, and Settings & AI sections from the overview.
  - Rework KPI row to Leads + Research only.
  - Add real-data charts for Leads + Research using existing chart components.
  - Add a proper empty state for Recent Leads.
  - Add minimal inline diagnostics/copy so empty results are understandable.

### Files to read during implementation
- `frontend/src/app/dashboard/page.tsx`
  - Current overview implementation.
- `frontend/src/components/leads/AlignLeadTable.tsx`
  - Empty-state behavior and required props.
- `frontend/src/components/ui/BarChartBase.tsx`
- `frontend/src/components/ui/PieChartBase.tsx`
- `frontend/src/components/ui/LineChartBase.tsx`
- `frontend/src/components/ui/AreaChartBase.tsx`
  - Existing chart components to reuse rather than introducing new chart primitives.
- `frontend/src/app/dashboard/leads/page.tsx`
  - Existing lead table mapping conventions.
- `frontend/src/app/dashboard/surveys/page.tsx`
  - Existing survey list usage.

### Files to verify after implementation
- `frontend/src/app/dashboard/page.tsx`

---

## Implementation Notes

- Do not add new backend endpoints.
- Keep all displayed metrics/chart values grounded in real data from current queries.
- If a chart needs a small derived dataset, derive it inline in `page.tsx`.
- Keep the recent-leads query shape unchanged first; only adjust if the empty-state investigation proves a frontend mapping/display problem.
- Prefer deleting sections over adding more abstraction.

---

### Task 1: Refocus the overview data model on Leads + Research only

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Remove non-target overview queries from the page**

Delete the overview-only queries that feed sections the user asked to remove:

```ts
const scansQuery = useQuery({ ... });
const brandKitQuery = useQuery({ ... });
const masterTemplateQuery = useQuery({ ... });
const examplesQuery = useQuery({ ... });
const membersQuery = useQuery({ ... });
const aiUsageQuery = useQuery({ ... });
```

Keep only:
- leads metrics query
- recent leads query
- surveys query

- [ ] **Step 2: Remove unused imports tied to deleted sections**

Delete imports like these if they remain after Step 1:

```ts
import {
  ArrowRight,
  ClipboardList,
  ScanLine,
  Search,
  Settings,
  Sparkles,
  Users,
  Users2,
} from 'lucide-react';
import type { BrandKit, MasterTemplate } from '@leads-generator/shared';
import { Badge } from '@/components/ui/Badge';
import type {
  AiUsageResponse,
  ScanConfigurationListItem,
  TeamMemberResponse,
} from '@/lib/types';
```

Keep only the icons and types needed for Leads + Research.

- [ ] **Step 3: Reduce the derived state to Leads + Research metrics only**

Keep and/or rewrite derived values so the page focuses on these only:

```ts
const metrics = metricsData ?? EMPTY_METRICS;
const leads = (leadsData?.items ?? []).map(toAlignLead);
const surveys = surveysQuery.data ?? [];

const activeLeads =
  metrics.byStatus.New +
  metrics.byStatus.Reviewed +
  metrics.byStatus.Contacted +
  metrics.byStatus.Qualified;

const conversionRate = Math.round(metrics.conversionRatePercent ?? 0);

const surveyCounts = surveys.reduce(
  (summary, survey) => {
    if (survey.status === 'draft') summary.draft += 1;
    if (survey.status === 'published') summary.published += 1;
    if (survey.status === 'closed') summary.closed += 1;
    summary.responses += survey.responseCount;
    return summary;
  },
  { draft: 0, published: 0, closed: 0, responses: 0 }
);
```

Delete leftover counts for scans, team, content, or AI readiness.

- [ ] **Step 4: Add a simple recent-leads diagnostic flag**

Add this small derived value so the empty state can explain what happened:

```ts
const hasRecentLeads = leads.length > 0;
```

Do not invent a new API call yet.

- [ ] **Step 5: Verify file-local lint and workspace type-check**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/frontend" && npx eslint src/app/dashboard/page.tsx && npm run type-check
```

Expected: PASS.

---

### Task 2: Rebuild KPI row for Leads + Research only

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Rewrite `MetricsOverview` props to only accept Leads + Research KPIs**

Use this signature:

```ts
function MetricsOverview({
  totalLeads,
  activeLeads,
  conversionRate,
  totalSurveys,
  publishedSurveys,
  totalResponses,
}: {
  totalLeads: number;
  activeLeads: number;
  conversionRate: number;
  totalSurveys: number;
  publishedSurveys: number;
  totalResponses: number;
}) {
  return <BentoGrid cols={3} className="mb-6">...</BentoGrid>;
}
```

- [ ] **Step 2: Replace the six KPI cards with Leads + Research values only**

Use cards for:
- `Total Leads`
- `Active Pipeline`
- `Conversion Rate`
- `Total Surveys`
- `Published Surveys`
- `Total Responses`

Use real values only. Example card shape:

```tsx
<BentoCard span={1} className="min-h-[170px] justify-between p-6">
  <Text variant="body-m-bold" color="secondary">Total Surveys</Text>
  <div className="flex items-center justify-between gap-3">
    <Heading as="p" variant="h1" className="text-4xl">{totalSurveys}</Heading>
    <div className="flex size-12 items-center justify-center rounded-full bg-primary-base/10 text-primary-base">
      <ClipboardList size={24} />
    </div>
  </div>
  <Text variant="body-s" color="secondary">Research surveys created in your workspace</Text>
</BentoCard>
```

- [ ] **Step 3: Update the page header copy to match the narrower focus**

Use copy like this:

```tsx
<Text variant="body-m" color="secondary" className="mt-1 max-w-3xl">
  Real-time summary of lead pipeline health and research activity across your workspace.
</Text>
```

Update the action area so it only points to relevant destinations:

```tsx
<div className="flex flex-wrap gap-3">
  <Link href="/dashboard/surveys">
    <Button variant="outline" className="rounded-xl">Open research</Button>
  </Link>
  <Link href="/dashboard/leads">
    <Button variant="primary" className="rounded-xl">Review leads</Button>
  </Link>
</div>
```

- [ ] **Step 4: Pass the new KPI props from `DashboardPage()`**

Replace the old call with:

```tsx
<MetricsOverview
  totalLeads={metrics.totalLeads}
  activeLeads={activeLeads}
  conversionRate={conversionRate}
  totalSurveys={surveys.length}
  publishedSurveys={surveyCounts.published}
  totalResponses={surveyCounts.responses}
/>
```

- [ ] **Step 5: Verify file-local lint and workspace type-check**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/frontend" && npx eslint src/app/dashboard/page.tsx && npm run type-check
```

Expected: PASS.

---

### Task 3: Add richer Leads + Research chart block

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`
- Read: `frontend/src/components/ui/BarChartBase.tsx`
- Read: `frontend/src/components/ui/PieChartBase.tsx`
- Read: `frontend/src/components/ui/LineChartBase.tsx`
- Read: `frontend/src/components/ui/AreaChartBase.tsx`

- [ ] **Step 1: Import the existing chart components that best fit the available data**

Add only the components you actually use, for example:

```ts
import { BarChartBase } from '@/components/ui/BarChartBase';
import { PieChartBase } from '@/components/ui/PieChartBase';
```

If another existing chart component fits better after inspection, use it instead — but keep it to existing UI-kit charts only.

- [ ] **Step 2: Derive compact chart datasets from real metrics and surveys**

Add lightweight derived datasets like this:

```ts
const leadStatusChartData = [
  { name: 'New', value: metrics.byStatus.New },
  { name: 'Reviewed', value: metrics.byStatus.Reviewed },
  { name: 'Contacted', value: metrics.byStatus.Contacted },
  { name: 'Qualified', value: metrics.byStatus.Qualified },
  { name: 'Converted', value: metrics.byStatus.Converted },
  { name: 'Rejected', value: metrics.byStatus.Rejected },
];

const leadPipelineChartData = [
  { name: 'Open', value: activeLeads },
  { name: 'Converted', value: metrics.byStatus.Converted },
  { name: 'Rejected', value: metrics.byStatus.Rejected },
];

const surveyStatusChartData = [
  { name: 'Draft', value: surveyCounts.draft },
  { name: 'Published', value: surveyCounts.published },
  { name: 'Closed', value: surveyCounts.closed },
];

const surveyResponseChartData = surveys.map((survey) => ({
  name: survey.title.length > 20 ? `${survey.title.slice(0, 20)}…` : survey.title,
  responses: survey.responseCount,
}));
```

If `surveyResponseChartData` is too wide, cap it to the first 5 surveys only:

```ts
const surveyResponseChartData = surveys.slice(0, 5).map((survey) => ({ ... }));
```

- [ ] **Step 3: Add a four-chart dashboard block under the KPI row**

Replace the current large feature-panel block with a chart-first section such as:

```tsx
<BentoGrid cols={2} className="mb-6 gap-6">
  <PieChartBase ... />
  <BarChartBase ... />
</BentoGrid>

<BentoGrid cols={2} className="mb-6 gap-6">
  <PieChartBase ... />
  <BarChartBase ... />
</BentoGrid>
```

Recommended chart subjects:
- `Lead Status Distribution`
- `Pipeline Outcome Snapshot`
- `Survey Status Distribution`
- `Survey Response Volume`

- [ ] **Step 4: Keep only two simplified detail panels below the charts**

Retain:
- `Leads`
- `Research`

Delete these overview sections entirely:
- `Scans`
- `Content & AI`
- `Team`
- `Settings & AI`

The two surviving panels should be summary panels only, not chart duplicates.

- [ ] **Step 5: Verify that no deleted sections remain in the JSX**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/frontend" && npx eslint src/app/dashboard/page.tsx && npm run type-check
```

Expected: PASS.

---

### Task 4: Investigate Recent Leads emptiness and add a proper empty state

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`
- Read: `frontend/src/components/leads/AlignLeadTable.tsx`

- [ ] **Step 1: Keep using `AlignLeadTable` when leads exist**

Preserve the current happy path:

```tsx
{hasRecentLeads ? <AlignLeadTable leads={leads} /> : ...}
```

- [ ] **Step 2: Replace the empty table experience with a dedicated empty-state card**

When `hasRecentLeads` is false, render a deliberate empty state instead of the table:

```tsx
<div className="rounded-[20px] border border-dashed border-stroke-soft-200 bg-bg-weak-50 p-8 text-center">
  <Heading as="h3" variant="title-3-bold">No recent leads yet</Heading>
  <Text variant="body-s" color="secondary" className="mt-2 max-w-xl mx-auto">
    We could not find any recent leads for your current workspace. Start a new scan or open the lead workspace to confirm whether this team has lead data yet.
  </Text>
  <div className="mt-5 flex flex-wrap justify-center gap-3">
    <Link href="/dashboard/scans">
      <Button variant="outline" className="rounded-xl">Run a scan</Button>
    </Link>
    <Link href="/dashboard/leads">
      <Button variant="primary" className="rounded-xl">Open leads workspace</Button>
    </Link>
  </div>
</div>
```

- [ ] **Step 3: Add a short inline note explaining the likely cause without overclaiming**

Use copy that does not pretend to know the backend root cause exactly:

```tsx
<Text variant="caption" color="secondary" className="mt-3 block">
  This usually means the active workspace has no recently created lead records yet.
</Text>
```

- [ ] **Step 4: Keep the section title but tighten the helper copy**

Use:

```tsx
<Text variant="body-s" color="secondary" className="mt-1">
  Latest discovered leads for quick follow-up.
</Text>
```

- [ ] **Step 5: Verify file-local lint and workspace type-check**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/frontend" && npx eslint src/app/dashboard/page.tsx && npm run type-check
```

Expected: PASS.

---

### Task 5: Final verification of the narrowed overview

**Files:**
- Verify: `frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Run the final verification command**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/frontend" && npx eslint src/app/dashboard/page.tsx && npm run type-check
```

Expected: PASS.

- [ ] **Step 2: Re-read `page.tsx` and confirm the final UI shape matches the request**

Checklist:
- Team Members KPI removed.
- Scans overview section removed.
- Content & AI overview section removed.
- Settings & AI overview section removed.
- KPI row is Leads + Research only.
- Chart block added.
- Recent Leads empty state exists.
- Leads and Research remain the only summary sections.

- [ ] **Step 3: Optional manual smoke check in dev server**

Run if time allows:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator" && npm run dev:frontend
```

Manual checks on `/dashboard`:
- Charts render without console/runtime errors.
- Only Leads + Research remain as focus areas.
- Empty state appears cleanly if the API returns no leads.

---

## Self-Review

### Spec coverage
- Removed non-requested sections: covered by Tasks 1 and 3.
- Added richer charts for Leads + Research: covered by Task 3.
- Investigated and handled Recent Leads emptiness: covered by Task 4.
- Reworked KPI row to Leads + Research only: covered by Task 2.

### Placeholder scan
- No TODO/TBD placeholders remain.
- Commands are explicit.
- All requested UI changes are mapped to concrete edits.

### Type consistency
- `MetricsResponse`, `LeadListItem`, `PageResponse`, and survey list types stay aligned with existing frontend usage.
- Chart data stays page-local and derived directly from existing query responses.
