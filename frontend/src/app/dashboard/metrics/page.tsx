'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/useSession';
import { fetchApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { MetricsResponse } from '@/lib/types';

function MetricsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Card key={item}>
            <CardContent className="p-6">
              <Skeleton className="mb-3 h-4 w-28" />
              <Skeleton className="h-9 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map((card) => (
          <Card key={card}>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {[0, 1, 2, 3, 4].map((item) => (
                  <div key={item} className="flex flex-col gap-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

export default function MetricsPage() {
  const { data: sessionData, isLoading: isSessionLoading } = useSession();
  const teamId = sessionData?.session.teamId;

  const { data: metricsData, isLoading: isMetricsLoading } = useQuery({
    queryKey: ['metrics', teamId],
    queryFn: () => fetchApi<MetricsResponse>(`/api/teams/${teamId}/metrics`),
    enabled: !!teamId,
  });

  if (isSessionLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Skeleton className="h-8 w-36" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>
        <MetricsSkeleton />
      </div>
    );
  }
  if (!teamId) return <div className="p-4">Error: No active team session.</div>;

  return (
    <div className="flex flex-col gap-6">


      {isMetricsLoading ? (
        <MetricsSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <p className="text-sm font-medium text-text-sub-600 mb-2">Total Leads</p>
                <p className="text-3xl font-semibold text-text-strong-950">{metricsData?.totalLeads ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm font-medium text-text-sub-600 mb-2">Conversion Rate</p>
                <p className="text-3xl font-semibold text-text-strong-950">{metricsData?.conversionRatePercent ?? 0}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm font-medium text-text-sub-600 mb-2">Qualified Leads</p>
                <p className="text-3xl font-semibold text-text-strong-950">{metricsData?.byStatus?.Qualified ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm font-medium text-text-sub-600 mb-2">Avg AI Score</p>
                <p className="text-3xl font-semibold text-text-strong-950">84.5</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Leads by Status</CardTitle>
                <CardDescription>Current pipeline distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  {Object.entries(metricsData?.byStatus ?? {}).map(([status, count]) => {
                    const max = metricsData?.totalLeads ?? 1;
                    const percent = Math.round((count / max) * 100);
                    return (
                      <div key={status} className="flex flex-col gap-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-text-strong-950">{status}</span>
                          <span className="text-text-soft-400">{count} ({percent}%)</span>
                        </div>
                        <div className="w-full h-2 bg-bg-weak-50 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary-base rounded-full" 
                            style={{ width: `${percent}%` }} 
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Leads by Source</CardTitle>
                <CardDescription>Top performing acquisition channels</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  {(metricsData?.bySource ?? []).map(({ sourceId, count }) => {
                    const max = metricsData?.totalLeads ?? 1;
                    const percent = Math.round((count / max) * 100);
                    return (
                      <div key={sourceId} className="flex items-center gap-4">
                        <div className="w-24 capitalize text-sm font-medium text-text-strong-950">{sourceId}</div>
                        <div className="flex-1 h-2 bg-bg-weak-50 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary-base rounded-full" 
                            style={{ width: `${percent}%` }} 
                          />
                        </div>
                        <div className="w-8 text-right text-sm text-text-soft-400">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
