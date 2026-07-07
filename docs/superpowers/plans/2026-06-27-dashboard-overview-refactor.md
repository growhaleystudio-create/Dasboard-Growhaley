# Dashboard Overview Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard overview page with a real-data executive overview that reflects the product’s actual dashboard features: Leads, Scans, Research/Surveys, Content/AI, Team, and Settings.

**Architecture:** Keep the work frontend-only inside `frontend/src/app/dashboard/page.tsx`, using existing TanStack Query patterns and existing backend endpoints already consumed by feature pages. Remove unrelated mock analytics and replace them with a hybrid overview: global KPI cards, primary feature panels for Leads/Scans/Research/Content, and supporting panels for Team and Settings, all populated only from real data.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, TanStack Query, existing UI components (`BentoGrid`, `BentoCard`, `BasicCard`, `Surface`, `Typography`, `Button`, `Badge`), existing feature API clients (`fetchApi`, survey API helpers).

---

## File Structure

### Files to modify
- `frontend/src/app/dashboard/page.tsx`
  - Replace mock chart-driven overview with a real-data executive overview.
  - Add new local mapping helpers for KPI calculation and lightweight panel summaries.
  - Reuse existing endpoint contracts from leads, scans, surveys, content, team, and AI usage.

### Files to read during implementation
- `frontend/src/app/dashboard/leads/page.tsx`
  - Source of truth for lead table mapping and AI insight expectations.
- `frontend/src/app/dashboard/scans/page.tsx`
  - Source of truth for scan configuration query shape.
- `frontend/src/app/dashboard/content/page.tsx`
  - Source of truth for brand kit, master template, and content examples endpoints.
- `frontend/src/app/dashboard/surveys/page.tsx`
  - Source of truth for survey list query helper and `SurveyListItem` usage.
- `frontend/src/app/dashboard/team/page.tsx`
  - Source of truth for team members endpoint contract.
- `frontend/src/app/dashboard/settings/page.tsx`
  - Source of truth for AI usage endpoint contract.
- `frontend/src/lib/types.ts`
  - Shared frontend response types already available for leads, scans, team, and AI usage.
- `frontend/src/lib/surveys/types.ts`
  - Shared survey list item type.

### Files to verify after implementation
- `frontend/src/app/dashboard/page.tsx`
- `frontend/package.json`
  - Only to confirm available scripts when running tests/lint if needed.

---

## Implementation Notes

- Do not add new backend endpoints.
- Do not use placeholder business metrics.
- Only show data that can be derived from real endpoint responses.
- Keep styling aligned with the rest of the dashboard and the existing overview page’s component vocabulary.
- Keep the recent leads table as the lower-detail operational section, but move it below the executive summary panels.
- Prefer one-page-local helper components inside `frontend/src/app/dashboard/page.tsx` rather than creating many new files for a single-page refactor.

---

### Task 1: Replace overview data layer with real dashboard queries

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`
- Read: `frontend/src/lib/types.ts`
- Read: `frontend/src/lib/surveys/types.ts`
- Read: `frontend/src/app/dashboard/scans/page.tsx`
- Read: `frontend/src/app/dashboard/content/page.tsx`
- Read: `frontend/src/app/dashboard/team/page.tsx`
- Read: `frontend/src/app/dashboard/settings/page.tsx`
- Read: `frontend/src/app/dashboard/surveys/page.tsx`

- [ ] **Step 1: Write the failing test plan note for the new query surface**

Because this page currently has no page-level automated tests and the codebase patterns here are integration-heavy UI pages, document the expected runtime data dependencies before editing code:

```ts
// Dashboard overview real-data dependencies to add in page.tsx
// 1. /api/leads/metrics -> MetricsResponse
// 2. /api/leads?limit=6&sortBy=createdAt&sortOrder=desc -> PageResponse<LeadListItem>
// 3. /api/teams/:teamId/scans -> ScanConfigurationListItem[]
// 4. listSurveys(teamId) -> SurveyListItem[]
// 5. /api/teams/:teamId/content/brand-kit -> BrandKit | null
// 6. /api/teams/:teamId/content/master-template -> MasterTemplate | null
// 7. /api/teams/:teamId/content/carousel/examples -> ExampleItem[]
// 8. /api/teams/:teamId/members -> TeamMemberResponse[]
// 9. /api/teams/:teamId/ai/usage -> AiUsageResponse
```

Expected result: after implementation, the overview page should render without any mock chart data or static KPI numbers.

- [ ] **Step 2: Remove mock chart imports and hard-coded datasets from `page.tsx`**

Delete imports like these from `frontend/src/app/dashboard/page.tsx`:

```ts
import { ArrowRight, CircleDot, Search, TrendingUp, UserCheck, Users2, Wallet, Activity, PieChart as PieChartIcon, Target, Map } from 'lucide-react';
import { BasicCard } from '@/components/ui/BasicCard';
import { LineChartBase } from '@/components/ui/LineChartBase';
import { BarChartBase } from '@/components/ui/BarChartBase';
import { AreaChartBase } from '@/components/ui/AreaChartBase';
import { PieChartBase } from '@/components/ui/PieChartBase';
import { RadarChartBase } from '@/components/ui/RadarChartBase';
import { ComposedChartBase } from '@/components/ui/ComposedChartBase';
import { RegionMapBase } from '@/components/ui/RegionMapBase';
```

Delete all mock datasets like these blocks:

```ts
const mockRevenueData = [/* ... */];
const mockSourceData = [/* ... */];
const mockProgressData = [/* ... */];
const mockLineData = [/* ... */];
const mockPieData = [/* ... */];
const mockRadarData = [/* ... */];
const mockMapMarkers = [/* ... */];
```

Delete the entire `ChartsSection()` implementation.

- [ ] **Step 3: Add the missing imports for real overview queries and compact UI panels**

Add imports like these to `frontend/src/app/dashboard/page.tsx`:

```ts
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bot,
  ClipboardList,
  FileText,
  ScanLine,
  Search,
  Settings,
  Sparkles,
  Users,
  Users2,
} from 'lucide-react';
import type { BrandKit, MasterTemplate } from '@leads-generator/shared';
import { listSurveys } from '@/lib/surveys/api';
import type { SurveyListItem } from '@/lib/surveys/types';
import { Surface } from '@/components/ui/Surface';
import { Badge } from '@/components/ui/Badge';
import type {
  AiUsageResponse,
  LeadListItem,
  MetricsResponse,
  PageResponse,
  ScanConfigurationListItem,
  TeamMemberResponse,
} from '@/lib/types';
```

Also keep the existing imports that are still needed:

```ts
import { useSession } from '@/lib/useSession';
import { fetchApi } from '@/lib/api';
import { sourceLabelFor, sourceUrlFor, websiteStatusFor } from '@/lib/leadDisplay';
import { AlignLeadTable, type AlignLead } from '@/components/leads/AlignLeadTable';
import { BentoGrid, BentoCard } from '@/components/ui/BentoGrid';
import { Heading, Text } from '@/components/ui/Typography';
import { Button } from '@/components/ui/Button';
```

- [ ] **Step 4: Add page-level queries for scans, surveys, content, team, and AI usage**

Inside `DashboardPage()`, after `teamId` is derived from session, add these queries:

```ts
const teamId = sessionData?.session.teamId;

const scansQuery = useQuery({
  queryKey: ['dashboard-overview-scans', teamId],
  queryFn: () => fetchApi<ScanConfigurationListItem[]>(`/api/teams/${teamId}/scans`),
  enabled: !!teamId,
});

const surveysQuery = useQuery({
  queryKey: ['dashboard-overview-surveys', teamId],
  queryFn: () => listSurveys(teamId!),
  enabled: !!teamId,
});

const brandKitQuery = useQuery({
  queryKey: ['dashboard-overview-brand-kit', teamId],
  queryFn: () => fetchApi<BrandKit | null>(`/api/teams/${teamId}/content/brand-kit`),
  enabled: !!teamId,
});

const masterTemplateQuery = useQuery({
  queryKey: ['dashboard-overview-master-template', teamId],
  queryFn: () => fetchApi<MasterTemplate | null>(`/api/teams/${teamId}/content/master-template`),
  enabled: !!teamId,
});

const examplesQuery = useQuery({
  queryKey: ['dashboard-overview-content-examples', teamId],
  queryFn: () => fetchApi<Array<{ id: string }>>(`/api/teams/${teamId}/content/carousel/examples`),
  enabled: !!teamId,
});

const membersQuery = useQuery({
  queryKey: ['dashboard-overview-members', teamId],
  queryFn: () => fetchApi<TeamMemberResponse[]>(`/api/teams/${teamId}/members`),
  enabled: !!teamId,
});

const aiUsageQuery = useQuery({
  queryKey: ['dashboard-overview-ai-usage', teamId],
  queryFn: () => fetchApi<AiUsageResponse>(`/api/teams/${teamId}/ai/usage`),
  enabled: !!teamId,
});
```

- [ ] **Step 5: Add derived overview data helpers inside `DashboardPage()`**

After the query declarations, derive page data like this:

```ts
const metrics = metricsData ?? emptyMetrics();
const leads = (leadsData?.items ?? []).map(toAlignLead);
const scans = scansQuery.data ?? [];
const surveys = surveysQuery.data ?? [];
const members = membersQuery.data ?? [];
const aiUsage = aiUsageQuery.data;
const brandKit = brandKitQuery.data;
const masterTemplate = masterTemplateQuery.data;
const contentExamples = examplesQuery.data ?? [];

const activeLeads =
  metrics.byStatus.New +
  metrics.byStatus.Reviewed +
  metrics.byStatus.Contacted +
  metrics.byStatus.Qualified +
  metrics.byStatus.Converted;

const conversionRate = Math.round(metrics.conversionRatePercent ?? 0);
const activeScans = scans.filter((scan) => scan.schedule).length;
const aiEnabledScans = scans.filter((scan) => scan.aiEnabled).length;
const publishedSurveys = surveys.filter((survey) => survey.status === 'published').length;
const draftSurveys = surveys.filter((survey) => survey.status === 'draft').length;
const closedSurveys = surveys.filter((survey) => survey.status === 'closed').length;
const totalSurveyResponses = surveys.reduce((sum, survey) => sum + survey.responseCount, 0);
const adminMembers = members.filter((member) => member.role === 'admin').length;
const activeMembers = members.filter((member) => member.status === 'active').length;
const hasTextAiKey = Boolean(aiUsage?.hasApiKeys?.leads || aiUsage?.hasApiKeys?.contentSuggestion || aiUsage?.hasApiKey);
const hasImageAiKey = Boolean(aiUsage?.hasApiKeys?.imageGeneration || aiUsage?.hasApiKey);
```

- [ ] **Step 6: Run the frontend typecheck for early feedback**

Run:

```bash
npm run build -w frontend
```

Expected: build may fail because layout components still need to be rewritten after removing chart code, but there should be no import-resolution errors from the new query layer.

- [ ] **Step 7: Commit the data-layer refactor checkpoint**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "refactor: wire dashboard overview to real data sources"
```

---

### Task 2: Build KPI cards and executive header around real metrics

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Replace the current `MetricsOverview` card copy and static totals**

Rewrite `MetricsOverview` so it accepts the already-derived KPI values instead of embedding fake trend text and static scan counts.

Use this signature:

```ts
function MetricsOverview({
  totalLeads,
  activeLeads,
  conversionRate,
  totalScans,
  publishedSurveys,
  teamMembers,
}: {
  totalLeads: number;
  activeLeads: number;
  conversionRate: number;
  totalScans: number;
  publishedSurveys: number;
  teamMembers: number;
}) {
  return (
    <BentoGrid cols={3} className="mb-6">
      {/* cards go here */}
    </BentoGrid>
  );
}
```

- [ ] **Step 2: Implement six real KPI cards with feature-aligned labels**

Inside `MetricsOverview`, render six cards using only passed values. Use copy like this:

```tsx
<BentoCard span={1} className="p-6 justify-between min-h-[170px]">
  <Text variant="body-m-bold" color="secondary">Total Leads</Text>
  <div className="flex items-center justify-between gap-3">
    <Heading as="p" variant="h1" className="text-4xl">{totalLeads}</Heading>
    <div className="flex size-12 items-center justify-center rounded-full bg-primary-base/10 text-primary-base">
      <Users2 size={24} />
    </div>
  </div>
  <Text variant="body-s" color="secondary">All leads stored in your workspace</Text>
</BentoCard>
```

Use the same structure for:
- `Active Pipeline` → `activeLeads` with `Search`
- `Conversion Rate` → `conversionRate%` with `ArrowRight` or `Sparkles`
- `Scan Configs` → `totalScans` with `ScanLine`
- `Published Surveys` → `publishedSurveys` with `ClipboardList`
- `Team Members` → `teamMembers` with `Users`

Do not include fake “+12% from last week” or “Across 3 active campaigns” text.

- [ ] **Step 3: Update the page header to describe the actual dashboard surface**

Replace the current subtitle and action buttons in the page header with this structure:

```tsx
<div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
  <div>
    <Heading as="h1" variant="display-3">Overview</Heading>
    <Text variant="body-m" color="secondary" className="mt-1 max-w-3xl">
      Real-time summary of leads, scans, research activity, content readiness, team access, and AI configuration.
    </Text>
  </div>
  <div className="flex flex-wrap gap-3">
    <Button asChild variant="outline" className="rounded-xl">
      <Link href="/dashboard/scans">Open scans</Link>
    </Button>
    <Button asChild variant="primary" className="rounded-xl">
      <Link href="/dashboard/leads">Review leads</Link>
    </Button>
  </div>
</div>
```

- [ ] **Step 4: Pass real KPI values into `MetricsOverview` from `DashboardPage()`**

Replace the old usage:

```tsx
<MetricsOverview metrics={metrics} />
```

with:

```tsx
<MetricsOverview
  totalLeads={metrics.totalLeads}
  activeLeads={activeLeads}
  conversionRate={conversionRate}
  totalScans={scans.length}
  publishedSurveys={publishedSurveys}
  teamMembers={members.length}
/>
```

- [ ] **Step 5: Run the page and confirm there are no remaining mock KPI strings**

Run:

```bash
npm run dev:frontend
```

Open `/dashboard` and verify visually:
- No “Revenue Growth”, “Transfer history”, “Investment 2”, or “Receiving payment” cards remain.
- The top row is now entirely dashboard-specific.

- [ ] **Step 6: Commit the KPI/header checkpoint**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "feat: add executive kpi row to dashboard overview"
```

---

### Task 3: Build primary feature panels for Leads, Scans, Research, and Content/AI

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Add a reusable local `OverviewPanel` helper component**

In `frontend/src/app/dashboard/page.tsx`, above `DashboardPage()`, add a focused helper component:

```tsx
function OverviewPanel({
  title,
  description,
  icon,
  href,
  badge,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <BentoCard span={2}>
      <Surface className="h-full rounded-[24px] border border-stroke-soft-200 bg-bg-white-0 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-[14px] bg-bg-accent-soft text-primary-accent">
              {icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Heading as="h2" variant="title-3-bold">{title}</Heading>
                {badge}
              </div>
              <Text variant="body-s" color="secondary" className="mt-1 max-w-xl">
                {description}
              </Text>
            </div>
          </div>
          <Button asChild variant="ghost" className="rounded-xl px-3">
            <Link href={href}>View</Link>
          </Button>
        </div>
        <div className="mt-5">{children}</div>
      </Surface>
    </BentoCard>
  );
}
```

- [ ] **Step 2: Add the Leads primary panel**

Render a panel like this below `MetricsOverview`:

```tsx
<OverviewPanel
  title="Leads"
  description="Track pipeline health, recent discoveries, and qualification progress."
  icon={<Users2 size={18} />}
  href="/dashboard/leads"
  badge={<Badge variant="neutral">{metrics.totalLeads} total</Badge>}
>
  <div className="grid gap-3 sm:grid-cols-3">
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">New</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{metrics.byStatus.New}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Qualified</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{metrics.byStatus.Qualified}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Converted</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{metrics.byStatus.Converted}</Heading>
    </Surface>
  </div>
</OverviewPanel>
```

- [ ] **Step 3: Add the Scans primary panel**

Render a scans panel using real configuration counts:

```tsx
<OverviewPanel
  title="Scans"
  description="Monitor configured lead scans, scheduled activity, and AI-enabled capture flows."
  icon={<ScanLine size={18} />}
  href="/dashboard/scans"
  badge={<Badge variant="neutral">{scans.length} configs</Badge>}
>
  <div className="grid gap-3 sm:grid-cols-3">
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Scheduled</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{activeScans}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">AI Enabled</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{aiEnabledScans}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Run-now configs</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{Math.max(scans.length - activeScans, 0)}</Heading>
    </Surface>
  </div>
</OverviewPanel>
```

- [ ] **Step 4: Add the Research primary panel**

Render a surveys panel that makes Research a first-class section:

```tsx
<OverviewPanel
  title="Research"
  description="Follow survey publishing status and response volume across research initiatives."
  icon={<ClipboardList size={18} />}
  href="/dashboard/surveys"
  badge={<Badge variant="neutral">{surveys.length} surveys</Badge>}
>
  <div className="grid gap-3 sm:grid-cols-4">
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Draft</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{draftSurveys}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Published</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{publishedSurveys}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Closed</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{closedSurveys}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Responses</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{totalSurveyResponses}</Heading>
    </Surface>
  </div>
</OverviewPanel>
```

- [ ] **Step 5: Add the Content / AI primary panel**

Render a content readiness panel using real content setup state:

```tsx
<OverviewPanel
  title="Content & AI"
  description="Check whether brand, template, and AI foundations are ready for content generation."
  icon={<Sparkles size={18} />}
  href="/dashboard/content"
  badge={
    <Badge variant={brandKit && masterTemplate ? 'success' : 'neutral'}>
      {brandKit && masterTemplate ? 'Ready to generate' : 'Needs setup'}
    </Badge>
  }
>
  <div className="grid gap-3 sm:grid-cols-3">
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Brand kit</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{brandKit ? 'Ready' : 'Missing'}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Master template</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{masterTemplate ? 'Ready' : 'Missing'}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Approved examples</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{contentExamples.length}</Heading>
    </Surface>
  </div>
</OverviewPanel>
```

- [ ] **Step 6: Compose the four primary panels into a dashboard section**

Below `<MetricsOverview />`, replace the old chart area with:

```tsx
<BentoGrid cols={4} className="mb-6 gap-6">
  {/* Leads panel */}
  {/* Scans panel */}
  {/* Research panel */}
  {/* Content & AI panel */}
</BentoGrid>
```

Keep each `OverviewPanel` at `span={2}` so the layout presents two panels per row on large screens.

- [ ] **Step 7: Run build and verify JSX/types**

Run:

```bash
npm run build -w frontend
```

Expected: the overview page compiles with the new panels and no references remain to deleted chart components.

- [ ] **Step 8: Commit the primary panel checkpoint**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "feat: add feature panels to dashboard overview"
```

---

### Task 4: Build supporting panels for Team and Settings/AI, then reposition recent leads

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Add a smaller reusable support card helper**

Above `DashboardPage()`, add:

```tsx
function SupportPanel({
  title,
  description,
  icon,
  href,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <BentoCard span={2}>
      <Surface className="h-full rounded-[24px] border border-stroke-soft-200 bg-bg-white-0 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-[14px] bg-bg-accent-soft text-primary-accent">
              {icon}
            </div>
            <div>
              <Heading as="h2" variant="title-3-bold">{title}</Heading>
              <Text variant="body-s" color="secondary" className="mt-1 max-w-xl">
                {description}
              </Text>
            </div>
          </div>
          <Button asChild variant="ghost" className="rounded-xl px-3">
            <Link href={href}>Open</Link>
          </Button>
        </div>
        <div className="mt-5">{children}</div>
      </Surface>
    </BentoCard>
  );
}
```

- [ ] **Step 2: Add the Team support panel**

Render this panel beneath the primary panels:

```tsx
<SupportPanel
  title="Team"
  description="Keep workspace access aligned across admins, members, and viewers."
  icon={<Users size={18} />}
  href="/dashboard/team"
>
  <div className="grid gap-3 sm:grid-cols-3">
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Members</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{members.length}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Active</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{activeMembers}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Admins</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{adminMembers}</Heading>
    </Surface>
  </div>
</SupportPanel>
```

- [ ] **Step 3: Add the Settings / AI support panel**

Render this beside Team:

```tsx
<SupportPanel
  title="Settings & AI"
  description="Review API key readiness, AI enablement, and token usage from one place."
  icon={<Settings size={18} />}
  href="/dashboard/settings"
>
  <div className="grid gap-3 sm:grid-cols-3">
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Text AI key</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{hasTextAiKey ? 'Ready' : 'Missing'}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">Image AI key</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{hasImageAiKey ? 'Ready' : 'Missing'}</Heading>
    </Surface>
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">AI enabled</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{aiUsage?.aiEnabled ? 'On' : 'Off'}</Heading>
      <Text variant="caption" color="secondary" className="mt-1">
        {aiUsage ? `${aiUsage.usagePercent}% budget used` : 'No usage data'}
      </Text>
    </Surface>
  </div>
</SupportPanel>
```

- [ ] **Step 4: Add the support panel grid**

Place the support section after the primary panels:

```tsx
<BentoGrid cols={4} className="mb-6 gap-6">
  {/* Team panel */}
  {/* Settings & AI panel */}
</BentoGrid>
```

- [ ] **Step 5: Keep and reframe the recent leads section as the operational footer block**

Retain `AlignLeadTable`, but update the card intro copy to match the new overview:

```tsx
<Heading as="h2" variant="title-3-bold">
  Recent Leads
</Heading>
<Text variant="body-s" color="secondary" className="mt-1">
  Operational view of the latest discovered leads so the team can jump from executive summary into follow-up.
</Text>
```

Also add a link button near the title:

```tsx
<Button asChild variant="outline" className="rounded-xl">
  <Link href="/dashboard/leads">Open lead workspace</Link>
</Button>
```

- [ ] **Step 6: Remove dead helper code and unused imports after the layout rewrite**

Delete any now-unused imports or helpers from `page.tsx`, especially if any of these remain unused:

```ts
ArrowRight,
Bot,
FileText,
Search,
sourceLabelFor,
sourceUrlFor,
websiteStatusFor,
BasicCard,
```

Also remove any helper/component that is no longer referenced after the overview rewrite.

- [ ] **Step 7: Run lint or build to catch unused code**

Run one of these commands depending on workspace script availability:

```bash
npm run lint -w frontend
```

or

```bash
npm run build -w frontend
```

Expected: no unused import/type errors remain in `frontend/src/app/dashboard/page.tsx`.

- [ ] **Step 8: Commit the support-panel and recent-leads checkpoint**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "feat: finish real-data dashboard overview layout"
```

---

### Task 5: Verify the overview end-to-end and write down follow-up notes

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx` (only if fixes are needed)
- Verify: `frontend/src/app/dashboard/leads/page.tsx`
- Verify: `frontend/src/app/dashboard/scans/page.tsx`
- Verify: `frontend/src/app/dashboard/surveys/page.tsx`
- Verify: `frontend/src/app/dashboard/content/page.tsx`
- Verify: `frontend/src/app/dashboard/team/page.tsx`
- Verify: `frontend/src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Run the final frontend build**

Run:

```bash
npm run build -w frontend
```

Expected: PASS.

- [ ] **Step 2: Smoke-test overview navigation and data presence manually**

Run:

```bash
npm run dev:frontend
```

Manual checks on `/dashboard`:
- KPI row shows only real metrics.
- Primary panels shown: Leads, Scans, Research, Content & AI.
- Support panels shown: Team, Settings & AI.
- Recent Leads table still renders.
- Every panel button navigates to the correct dashboard page.
- Research is visible as a first-class overview section.
- No chart from the old financial demo remains.

- [ ] **Step 3: Fix any small JSX/copy/layout issue found during smoke test**

If a card title wraps badly, a count is misleading, or a query can be named more clearly, apply the smallest fix directly in `frontend/src/app/dashboard/page.tsx`.

Example of acceptable small follow-up cleanup:

```tsx
<Text variant="body-s" color="secondary" className="mt-1 max-w-2xl leading-6">
  Real-time summary of leads, scans, research activity, content readiness, team access, and AI configuration.
</Text>
```

- [ ] **Step 4: Re-run the final verification command**

Run:

```bash
npm run build -w frontend
```

Expected: PASS after any final cleanup.

- [ ] **Step 5: Commit the verified final result**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "refactor: align dashboard overview with actual product features"
```

- [ ] **Step 6: Record follow-up opportunities outside this scope**

Document these as non-blocking follow-ups in your handoff notes, not in code:

```md
Follow-up ideas:
- Add a dedicated overview skeleton/loading strategy for secondary queries.
- Add automated tests for the overview page once a page-level testing pattern exists.
- Consider a recent survey/recent scan activity feed if backend endpoints expose timestamps/history cleanly.
- Consider extracting overview panel primitives if more dashboard summary pages are introduced.
```

---

## Self-Review

### Spec coverage
- Executive KPI dashboard requirement: covered by Task 2.
- Real-data-only requirement: enforced in Task 1 and reflected through all panel tasks.
- Research as primary feature: covered by Task 3 Research panel.
- Hybrid layout requirement: covered by Tasks 2, 3, and 4.
- Team and Settings as supporting sections: covered by Task 4.
- Removal of irrelevant mock analytics: covered by Task 1 and verified in Task 5.

### Placeholder scan
- No TODO/TBD markers remain.
- Each code-changing step includes concrete snippets or exact targets.
- Commands and expected outcomes are explicit.

### Type consistency
- `MetricsResponse`, `LeadListItem`, `PageResponse`, `ScanConfigurationListItem`, `TeamMemberResponse`, `AiUsageResponse`, `SurveyListItem`, `BrandKit`, and `MasterTemplate` match the currently observed frontend usage.
- Query keys are page-local and do not conflict with existing feature-page keys.
