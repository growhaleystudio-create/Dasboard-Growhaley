'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/useSession';
import { fetchApi } from '@/lib/api';
import { sourceLabelFor, sourceUrlFor, websiteStatusFor } from '@/lib/leadDisplay';
import { AlignLeadTable, type AlignLead } from '@/components/leads/AlignLeadTable';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import {
  CircleDot,
  Search,
  UserCheck,
} from 'lucide-react';
import type { LeadStatus } from '@leads-generator/shared';
import type { LeadListItem, MetricsResponse, PageResponse } from '@/lib/types';

const DASHBOARD_PAGE_SIZE = 6;

const statusFilterMap: Record<string, LeadStatus[] | undefined> = {
  All: undefined,
  New: ['New'],
  'In Progress': ['Contacted', 'Reviewed'],
  Completed: ['Qualified', 'Converted'],
  Failed: ['Rejected'],
};

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
    location: lead.location ?? 'Unknown location',
    niche: lead.matchedKeywords.join(', ') || 'General',
    dateFound: formatDate(lead.discoveredAt ?? lead.createdAt),
    sourceLabel: sourceLabelFor(lead),
    sourceUrl: sourceUrlFor(lead),
    websiteStatus: websiteStatusFor(lead),
    status: lead.status,
    score: lead.aiIntentScore ?? lead.score,
  };
}

function emptyMetrics(): MetricsResponse {
  return {
    totalLeads: 0,
    byStatus: {
      New: 0,
      Reviewed: 0,
      Contacted: 0,
      Qualified: 0,
      Converted: 0,
      Rejected: 0,
    },
    bySource: [],
    conversionRatePercent: 0,
  };
}

function TopStatistic({ metrics }: { metrics: MetricsResponse }) {
  const activeLeads =
    metrics.byStatus.New +
    metrics.byStatus.Reviewed +
    metrics.byStatus.Contacted +
    metrics.byStatus.Qualified +
    metrics.byStatus.Converted;
  const activePercent = metrics.totalLeads > 0 ? Math.round((activeLeads / metrics.totalLeads) * 100) : 0;

  return (
    <section className="grid min-h-[218px] grid-cols-1 overflow-hidden rounded-panel border border-stroke-soft-200 bg-bg-white-0 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] sm:grid-cols-2">
      <div className="flex flex-col justify-center gap-1 px-7 py-6">
          <p className="text-sm font-medium leading-5 text-text-sub-600">Total Leads</p>
          <div className="flex items-center gap-1.5">
          <p className="text-2xl font-medium leading-8 text-text-strong-950">{metrics.totalLeads.toLocaleString()}</p>
          <p className="text-xs font-medium leading-4 text-state-success-base">
            live <span className="text-text-sub-600">from backend</span>
          </p>
        </div>
      </div>
      <div className="flex flex-col justify-center gap-1 border-t border-stroke-soft-200 px-7 py-6 sm:border-l sm:border-t-0">
          <p className="text-sm font-medium leading-5 text-text-sub-600">Active Leads</p>
          <div className="flex items-center gap-1.5">
          <p className="text-2xl font-medium leading-8 text-text-strong-950">{activeLeads.toLocaleString()}</p>
          <p className="text-xs font-medium leading-4 text-state-success-base">
            {activePercent}% <span className="text-text-sub-600">of total</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function ProgressLeads({ metrics }: { metrics: MetricsResponse }) {
  const inProgress = metrics.byStatus.Contacted + metrics.byStatus.Reviewed;
  const needFollowUp = metrics.byStatus.New;
  const rejected = metrics.byStatus.Rejected;
  const completed = metrics.byStatus.Qualified + metrics.byStatus.Converted;
  const progressTotal = Math.max(1, inProgress + needFollowUp + rejected + completed);
  const legends = [
    ['bg-[#f6b51e]', 'In Progress', inProgress],
    ['bg-[#47c2ff]', 'Need Follow Up', needFollowUp],
    ['bg-state-danger-base', 'Rejected', rejected],
    ['bg-state-success-base', 'Completed', completed],
  ] as const;

  return (
    <section className="flex min-h-[218px] flex-col gap-4 rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
      <div className="flex items-center gap-2 py-1">
        <CircleDot size={18} className="text-text-sub-600" />
        <h2 className="text-base font-medium leading-6 text-text-strong-950">Progress Leads</h2>
      </div>
      <div className="h-px w-full bg-stroke-soft-200" />
      <div>
        <p className="text-2xl font-medium leading-8 text-text-sub-600">{progressTotal === 1 && metrics.totalLeads === 0 ? 0 : progressTotal}</p>
        <p className="mt-2 text-base leading-6 text-text-sub-600">Leads</p>
      </div>
      <div className="flex h-2.5 gap-1 overflow-hidden">
        {legends.map(([colorClass, label, value]) => (
          <span
            key={label}
            className={`min-w-[6px] rounded-sm ${colorClass}`}
            style={{ width: `${Math.max(4, (value / progressTotal) * 100)}%` }}
            title={`${label}: ${value}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {legends.map(([colorClass, label, value]) => (
          <div key={label} className="flex items-center gap-1 text-xs font-medium text-text-sub-600">
            <span className={`size-2 rounded-full ${colorClass}`} />
            {label} ({value})
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentLeadsTable({
  leads,
  activeStatus,
  onStatusChange,
  search,
  onSearchChange,
  isLoading,
  error,
}: {
  leads: AlignLead[];
  activeStatus: string;
  onStatusChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  error?: React.ReactNode;
}) {
  const filters = ['All', 'New', 'In Progress', 'Completed', 'Failed'];

  return (
    <section className="rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 py-1">
          <UserCheck size={20} className="text-text-sub-600" />
          <h2 className="text-base font-medium leading-6 text-text-strong-950">Recent Leads</h2>
        </div>
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-5"
          wrapperClassName="hidden h-9 w-[220px] py-1.5 lg:flex"
          placeholder="Search..."
          type="search"
          leftIcon={<Search size={18} />}
        />
        <div className="hidden items-center gap-1 rounded-ui bg-bg-weak-50 p-1 md:flex">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => onStatusChange(filter)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                activeStatus === filter ? 'bg-bg-white-0 text-text-strong-950 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]' : 'text-text-sub-600'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
        <Link
          className="inline-flex h-9 items-center justify-center rounded-ui border border-stroke-soft-200 bg-bg-white-0 px-3 text-sm font-medium text-text-sub-600 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] transition-all duration-150 ease-out hover:-translate-y-px hover:bg-bg-weak-50 hover:text-text-strong-950 active:translate-y-0 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary-base/20 focus:ring-offset-1"
          href="/dashboard/leads"
        >
          See All
        </Link>
      </div>

      <AlignLeadTable leads={leads} isLoading={isLoading} error={error} />
    </section>
  );
}

function DashboardOverviewSkeleton() {
  return (
    <div className="min-h-full bg-bg-white-0">
      <main className="flex w-full flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
          <section className="grid min-h-[218px] grid-cols-1 overflow-hidden rounded-panel border border-stroke-soft-200 bg-bg-white-0 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] sm:grid-cols-2">
            {[0, 1].map((item) => (
              <div key={item} className="flex flex-col justify-center gap-3 border-stroke-soft-200 px-7 py-6 sm:[&:not(:first-child)]:border-l">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-36" />
              </div>
            ))}
          </section>
          <section className="flex min-h-[218px] flex-col gap-4 rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-2.5 w-full rounded-sm" />
            <div className="flex flex-wrap gap-3">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-4 w-28" />
              ))}
            </div>
          </section>
        </div>
        <section className="rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
          <AlignLeadTable leads={[]} isLoading />
        </section>
      </main>
    </div>
  );
}

export default function DashboardOverviewPage() {
  const { data: sessionData, isLoading } = useSession();
  const [search, setSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState('All');
  const teamId = sessionData?.session.teamId;

  const metricsQuery = useQuery({
    queryKey: ['dashboard-metrics', teamId],
    queryFn: () => fetchApi<MetricsResponse>(`/api/teams/${teamId}/metrics`),
    enabled: !!teamId,
  });

  const leadsQuery = useQuery({
    queryKey: ['dashboard-recent-leads', teamId, search, activeStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', '0');
      if (search.trim()) params.set('search', search.trim());
      statusFilterMap[activeStatus]?.forEach((status) => params.append('status', status));
      return fetchApi<PageResponse<LeadListItem>>(`/api/teams/${teamId}/leads?${params.toString()}`);
    },
    enabled: !!teamId,
  });

  const metrics = metricsQuery.data ?? emptyMetrics();
  const filteredLeads = useMemo(
    () => (leadsQuery.data?.items ?? []).slice(0, DASHBOARD_PAGE_SIZE).map(toAlignLead),
    [leadsQuery.data?.items]
  );

  if (isLoading) {
    return <DashboardOverviewSkeleton />;
  }

  return (
    <div className="min-h-full bg-bg-white-0">
      <main className="flex w-full flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
          <TopStatistic metrics={metrics} />
          <ProgressLeads metrics={metrics} />
        </div>
        <RecentLeadsTable
          leads={filteredLeads}
          activeStatus={activeStatus}
          onStatusChange={setActiveStatus}
          search={search}
          onSearchChange={setSearch}
          isLoading={leadsQuery.isLoading || metricsQuery.isLoading}
          error={leadsQuery.error ? 'Failed to load recent leads' : undefined}
        />
      </main>
    </div>
  );
}
