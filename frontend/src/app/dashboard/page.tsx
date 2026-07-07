'use client';

import Link from 'next/link';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  Search,
  Target,
  Users2,
} from 'lucide-react';
import { listSurveys } from '@/lib/surveys/api';
import { Surface } from '@/components/ui/Surface';
import { Badge } from '@/components/ui/Badge';
import { useSession } from '@/lib/useSession';
import { fetchApi } from '@/lib/api';
import {
  deterministicLeadScore,
  sourceLabelFor,
  sourceUrlFor,
  websiteStatusFor,
  whatsappTargetFor,
} from '@/lib/leadDisplay';
import { AlignLeadTable, type AlignLead } from '@/components/leads/AlignLeadTable';
import { BentoGrid, BentoCard } from '@/components/ui/BentoGrid';
import { Heading, Text } from '@/components/ui/Typography';
import { Button } from '@/components/ui/Button';
import { PieChartBase } from '@/components/ui/PieChartBase';
import { BarChartBase } from '@/components/ui/BarChartBase';
import type { LeadListItem, MetricsResponse, PageResponse } from '@/lib/types';

function formatDate(value: Date | string | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function toAlignLead(lead: LeadListItem): AlignLead {
  return {
    id: lead.id,
    name: lead.name ?? 'Unknown',
    contact: lead.publicContact ?? 'No contact',
    whatsappUrl: whatsappTargetFor(lead),
    whatsappNumber: typeof lead.whatsappNumber === 'string' ? lead.whatsappNumber : null,
    whatsappVerificationStatus: lead.whatsappVerificationStatus,
    location: lead.location ?? 'Unknown location',
    niche: lead.matchedKeywords.join(', ') || 'General',
    dateFound: formatDate(lead.discoveredAt ?? lead.createdAt),
    sourceLabel: sourceLabelFor(lead),
    sourceUrl: sourceUrlFor(lead),
    websiteStatus: websiteStatusFor(lead),
    status: lead.status,
    score: deterministicLeadScore(lead),
  };
}

const EMPTY_METRICS: MetricsResponse = {
  totalLeads: 0,
  byStatus: { New: 0, Reviewed: 0, Contacted: 0, Qualified: 0, Converted: 0, Rejected: 0 },
  bySource: [],
  conversionRatePercent: 0,
};

// DS Token colors (from tailwind.config.ts)
const LEAD_STATUS_COLORS = {
  New: '#177cb3',       // primary-base
  Reviewed: '#007fb9',  // primary-accent
  Contacted: '#f79009', // state-warning-base
  Qualified: '#12b76a', // state-success-base
  Converted: '#027a48', // state-success-dark
  Rejected: '#f04438',  // state-danger-base
} as const;

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
  return (
    <BentoGrid cols={3} className="mb-6">
      <BentoCard span={1} className="min-h-[170px] justify-between p-6">
        <Text variant="body-m-bold" color="secondary">Total Leads</Text>
        <div className="flex items-center justify-between gap-3">
          <Heading as="p" variant="h1" className="text-4xl">{totalLeads}</Heading>
          <div className="flex size-12 items-center justify-center rounded-full bg-primary-base/10 text-primary-base">
            <Users2 size={24} />
          </div>
        </div>
        <Text variant="body-s" color="secondary">All leads stored in your workspace</Text>
      </BentoCard>

      <BentoCard span={1} className="min-h-[170px] justify-between p-6">
        <Text variant="body-m-bold" color="secondary">Active Pipeline</Text>
        <div className="flex items-center justify-between gap-3">
          <Heading as="p" variant="h1" className="text-4xl">{activeLeads}</Heading>
          <div className="flex size-12 items-center justify-center rounded-full bg-warning-base/10 text-warning-base">
            <Search size={24} />
          </div>
        </div>
        <Text variant="body-s" color="secondary">Leads currently moving through review and qualification</Text>
      </BentoCard>

      <BentoCard span={1} className="min-h-[170px] justify-between p-6">
        <Text variant="body-m-bold" color="secondary">Conversion Rate</Text>
        <div className="flex items-center justify-between gap-3">
          <Heading as="p" variant="h1" className="text-4xl">{conversionRate}%</Heading>
          <div className="flex size-12 items-center justify-center rounded-full bg-state-success-base/10 text-state-success-base">
            <ArrowRight size={24} />
          </div>
        </div>
        <Text variant="body-s" color="secondary">Share of leads that have converted</Text>
      </BentoCard>

      <BentoCard span={1} className="min-h-[170px] justify-between p-6">
        <Text variant="body-m-bold" color="secondary">Total Surveys</Text>
        <div className="flex items-center justify-between gap-3">
          <Heading as="p" variant="h1" className="text-4xl">{totalSurveys}</Heading>
          <div className="flex size-12 items-center justify-center rounded-full bg-primary-base/10 text-primary-base">
            <ClipboardList size={24} />
          </div>
        </div>
        <Text variant="body-s" color="secondary">Research surveys created for this workspace</Text>
      </BentoCard>

      <BentoCard span={1} className="min-h-[170px] justify-between p-6">
        <Text variant="body-m-bold" color="secondary">Published Surveys</Text>
        <div className="flex items-center justify-between gap-3">
          <Heading as="p" variant="h1" className="text-4xl">{publishedSurveys}</Heading>
          <div className="flex size-12 items-center justify-center rounded-full bg-primary-base/10 text-primary-base">
            <Target size={24} />
          </div>
        </div>
        <Text variant="body-s" color="secondary">Surveys currently live and collecting responses</Text>
      </BentoCard>

      <BentoCard span={1} className="min-h-[170px] justify-between p-6">
        <Text variant="body-m-bold" color="secondary">Total Responses</Text>
        <div className="flex items-center justify-between gap-3">
          <Heading as="p" variant="h1" className="text-4xl">{totalResponses}</Heading>
          <div className="flex size-12 items-center justify-center rounded-full bg-primary-base/10 text-primary-base">
            <BarChart3 size={24} />
          </div>
        </div>
        <Text variant="body-s" color="secondary">Responses captured across all research surveys</Text>
      </BentoCard>
    </BentoGrid>
  );
}

function OverviewPanel({
  title,
  description,
  icon,
  href,
  actionLabel = 'View',
  badge,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  actionLabel?: string;
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
          <Link href={href}>
            <Button variant="ghost" className="rounded-xl px-3">{actionLabel}</Button>
          </Link>
        </div>
        <div className="mt-5">{children}</div>
      </Surface>
    </BentoCard>
  );
}

function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <Surface className="rounded-2xl border border-stroke-soft-200 p-4">
      <Text variant="body-s" color="secondary">{label}</Text>
      <Heading as="p" variant="title-2-bold" className="mt-2">{value}</Heading>
      {detail ? (
        <Text variant="caption" color="secondary" className="mt-1">
          {detail}
        </Text>
      ) : null}
    </Surface>
  );
}

function EmptyRecentLeadsState() {
  return (
    <Surface className="rounded-[20px] border border-dashed border-stroke-soft-200 bg-bg-white-0 p-8 text-center">
      <div className="mx-auto max-w-2xl">
        <Heading as="h3" variant="title-3-bold">No recent leads found for this workspace</Heading>
        <Text variant="body-m" color="secondary" className="mt-2">
          This usually means the active workspace has no recently created lead records yet, not that the table is broken.
        </Text>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard/scans">
            <Button variant="primary" className="rounded-xl">Run a scan</Button>
          </Link>
          <Link href="/dashboard/leads">
            <Button variant="outline" className="rounded-xl">Open lead workspace</Button>
          </Link>
        </div>
      </div>
    </Surface>
  );
}

export default function DashboardPage() {
  const { data: sessionData } = useSession();
  const teamId = sessionData?.session.teamId;

  const { data: metricsData } = useQuery({
    queryKey: ['leads-metrics', teamId],
    queryFn: () => fetchApi<MetricsResponse>(`/api/teams/${teamId}/metrics`),
    enabled: !!teamId,
  });

  const { data: leadsData } = useQuery({
    queryKey: ['leads', teamId],
    queryFn: () =>
      fetchApi<PageResponse<LeadListItem>>(
        `/api/teams/${teamId}/leads?limit=6&sortBy=createdAt&sortOrder=desc`,
      ),
    enabled: !!teamId,
  });

  const surveysQuery = useQuery({
    queryKey: ['dashboard-overview-surveys', teamId],
    queryFn: () => listSurveys(teamId!),
    enabled: !!teamId,
  });

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

  const leadStatusData = [
    { name: 'New', value: metrics.byStatus.New, color: LEAD_STATUS_COLORS.New },
    { name: 'Reviewed', value: metrics.byStatus.Reviewed, color: LEAD_STATUS_COLORS.Reviewed },
    { name: 'Contacted', value: metrics.byStatus.Contacted, color: LEAD_STATUS_COLORS.Contacted },
    { name: 'Qualified', value: metrics.byStatus.Qualified, color: LEAD_STATUS_COLORS.Qualified },
    { name: 'Converted', value: metrics.byStatus.Converted, color: LEAD_STATUS_COLORS.Converted },
    { name: 'Rejected', value: metrics.byStatus.Rejected, color: LEAD_STATUS_COLORS.Rejected },
  ];

  const pipelineOutcomeData = [
    {
      label: 'Pipeline',
      active: activeLeads,
      converted: metrics.byStatus.Converted,
      rejected: metrics.byStatus.Rejected,
    },
  ];

  const surveyStatusData = [
    { name: 'Draft', value: surveyCounts.draft, color: '#8c9198' },      // text-soft-400
    { name: 'Published', value: surveyCounts.published, color: '#177cb3' }, // primary-base
    { name: 'Closed', value: surveyCounts.closed, color: '#027a48' },    // state-success-dark
  ];

  const surveyResponseData = (surveys.length > 0
    ? surveys
        .slice()
        .sort((left, right) => right.responseCount - left.responseCount)
        .slice(0, 5)
        .map((survey) => ({
          name: survey.title.length > 18 ? `${survey.title.slice(0, 18)}…` : survey.title,
          responses: survey.responseCount,
        }))
    : [{ name: 'No surveys', responses: 0 }]);

  return (
    <div className="flex min-h-[calc(100vh-100px)] flex-col">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Heading as="h1" variant="display-3">Overview</Heading>
          <Text variant="body-m" color="secondary" className="mt-1 max-w-3xl">
            Real-time summary of lead pipeline health and research activity across your workspace.
          </Text>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/surveys">
            <Button variant="outline" className="rounded-xl">Open surveys</Button>
          </Link>
          <Link href="/dashboard/leads">
            <Button variant="primary" className="rounded-xl">Review leads</Button>
          </Link>
        </div>
      </div>

      <MetricsOverview
        totalLeads={metrics.totalLeads}
        activeLeads={activeLeads}
        conversionRate={conversionRate}
        totalSurveys={surveys.length}
        publishedSurveys={surveyCounts.published}
        totalResponses={surveyCounts.responses}
      />

      <BentoGrid cols={4} className="mb-6 gap-6">
        <OverviewPanel
          title="Leads"
          description="Track pipeline health, discovery volume, and conversion progress from one summary panel."
          icon={<Users2 size={18} />}
          href="/dashboard/leads"
          badge={<Badge variant="neutral">{metrics.totalLeads} total</Badge>}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="New" value={metrics.byStatus.New} />
            <StatTile label="Qualified" value={metrics.byStatus.Qualified} />
            <StatTile label="Converted" value={metrics.byStatus.Converted} />
          </div>
        </OverviewPanel>

        <OverviewPanel
          title="Research"
          description="Monitor survey publishing status and response volume across active research initiatives."
          icon={<ClipboardList size={18} />}
          href="/dashboard/surveys"
          badge={<Badge variant="neutral">{surveys.length} surveys</Badge>}
        >
          <div className="grid gap-3 sm:grid-cols-4">
            <StatTile label="Draft" value={surveyCounts.draft} />
            <StatTile label="Published" value={surveyCounts.published} />
            <StatTile label="Closed" value={surveyCounts.closed} />
            <StatTile label="Responses" value={surveyCounts.responses} />
          </div>
        </OverviewPanel>
      </BentoGrid>

      <BentoGrid cols={2} className="mb-6 gap-6">
        <BentoCard span={1}>
          <PieChartBase
            title="Lead Status Distribution"
            subtitle="Current balance across the lead funnel"
            data={leadStatusData}
            value={`${metrics.totalLeads}`}
            centerText={`${metrics.totalLeads}`}
            height={220}
            innerRadius={46}
            outerRadius={72}
            action={<div className="hidden" aria-hidden="true" />}
            className="h-full"
          />
        </BentoCard>

        <BentoCard span={1}>
          <BarChartBase
            title="Pipeline Outcome Snapshot"
            subtitle="Active leads vs converted and rejected outcomes"
            data={pipelineOutcomeData}
            dataKeys={[
              { key: 'active', color: '#177cb3', name: 'Active' },      // primary-base
              { key: 'converted', color: '#12b76a', name: 'Converted' }, // state-success-base
              { key: 'rejected', color: '#f04438', name: 'Rejected' },   // state-danger-base
            ]}
            xAxisKey="label"
            stacked
            height={220}
            action={<div className="hidden" aria-hidden="true" />}
            className="h-full"
          />
        </BentoCard>

        <BentoCard span={1}>
          <PieChartBase
            title="Survey Status Distribution"
            subtitle="Draft, live, and closed research projects"
            data={surveyStatusData}
            value={`${surveys.length}`}
            centerText={`${surveys.length}`}
            height={220}
            innerRadius={46}
            outerRadius={72}
            action={<div className="hidden" aria-hidden="true" />}
            className="h-full"
          />
        </BentoCard>

        <BentoCard span={1}>
          <BarChartBase
            title="Survey Response Volume"
            subtitle="Top surveys ranked by response count"
            data={surveyResponseData}
            dataKeys={[{ key: 'responses', color: '#177cb3', name: 'Responses' }]}
            xAxisKey="name"
            height={220}
            action={<div className="hidden" aria-hidden="true" />}
            className="h-full"
          />
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="h-auto">
        <BentoCard span={4}>
          <div className="p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <Heading as="h2" variant="title-3-bold">
                  Recent Leads
                </Heading>
                <Text variant="body-s" color="secondary" className="mt-1">
                  Latest discovered leads so the team can jump from summary into follow-up.
                </Text>
              </div>
              <Link href="/dashboard/leads">
                <Button variant="outline" className="rounded-xl">Open lead workspace</Button>
              </Link>
            </div>

            {leads.length > 0 ? (
              <AlignLeadTable
                leads={leads}
                onOpenWhatsApp={(leadId) => {
                  const lead = leadsData?.items.find((item) => item.id === leadId);
                  if (!lead) return;
                  const whatsappTarget = whatsappTargetFor(lead);
                  if (!whatsappTarget) return;
                  window.open(whatsappTarget, '_blank', 'noopener,noreferrer');
                }}
              />
            ) : (
              <EmptyRecentLeadsState />
            )}
          </div>
        </BentoCard>
      </BentoGrid>
    </div>
  );
}
