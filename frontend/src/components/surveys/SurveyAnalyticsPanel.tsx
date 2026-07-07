'use client';

import { BarChart3, CheckCircle2, Clock3, Sigma } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { SurveyAnalyticsSummary, SurveyQuestionStats } from '@/lib/surveys/types';

interface SurveyAnalyticsPanelProps {
  analytics?: SurveyAnalyticsSummary;
  isLoading?: boolean;
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function renderQuestionStat(question: SurveyQuestionStats) {
  if (question.type === 'linear_scale') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-text-sub-600">Average: {question.average ?? '—'}</p>
        <p className="text-sm text-text-sub-600">
          Range: {question.minimum ?? '—'} to {question.maximum ?? '—'}
        </p>
      </div>
    );
  }

  if (question.matrixDistribution) {
    return (
      <div className="space-y-3">
        {Object.entries(question.matrixDistribution).map(([rowKey, items]) => (
          <div key={rowKey} className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50/40 p-3">
            <p className="text-sm font-medium text-text-strong-950">{rowKey}</p>
            <div className="mt-2 space-y-1">
              {items.length === 0 ? (
                <p className="text-sm text-text-soft-400">No answers yet.</p>
              ) : (
                items.slice(0, 5).map((item) => (
                  <div key={`${rowKey}-${item.value}`} className="flex items-center justify-between gap-3 text-sm text-text-sub-600">
                    <span className="truncate">{item.value}</span>
                    <span className="shrink-0">
                      {item.count} ({item.percentage}%)
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {!question.distribution || question.distribution.length === 0 ? (
        <p className="text-sm text-text-soft-400">No distribution data yet.</p>
      ) : (
        question.distribution.slice(0, 6).map((item) => (
          <div key={item.value} className="flex items-center justify-between gap-3 text-sm text-text-sub-600">
            <span className="truncate">{item.value}</span>
            <span className="shrink-0">
              {item.count} ({item.percentage}%)
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export function SurveyAnalyticsPanel({
  analytics,
  isLoading = false,
}: SurveyAnalyticsPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-panel" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-panel" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="rounded-panel border border-dashed border-stroke-soft-200 bg-bg-weak-50/50 px-6 py-10 text-center">
            <p className="text-sm font-medium text-text-strong-950">No analytics yet</p>
            <p className="mt-1 text-sm text-text-soft-400">
              Publish the survey and collect responses to populate this dashboard.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const kpis = [
    {
      label: 'Total responses',
      value: analytics.totalResponses,
      icon: <BarChart3 size={16} className="text-text-sub-600" />,
    },
    {
      label: 'Completed responses',
      value: analytics.completedResponses,
      icon: <CheckCircle2 size={16} className="text-text-sub-600" />,
    },
    {
      label: 'Completion rate',
      value: `${analytics.completionRate}%`,
      icon: <Sigma size={16} className="text-text-sub-600" />,
    },
    {
      label: 'Latest submitted',
      value: formatDateTime(analytics.latestSubmittedAt),
      icon: <Clock3 size={16} className="text-text-sub-600" />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-text-sub-600">{item.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-text-strong-950">{item.value}</p>
                </div>
                <div className="flex size-9 items-center justify-center rounded-ui bg-bg-weak-50">
                  {item.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per-question summary</CardTitle>
          <CardDescription>
            Lightweight distributions and scale summaries based on the current response set.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {analytics.questions.length === 0 ? (
            <div className="rounded-panel border border-dashed border-stroke-soft-200 bg-bg-weak-50/50 px-6 py-10 text-center">
              <p className="text-sm font-medium text-text-strong-950">No question analytics yet</p>
              <p className="mt-1 text-sm text-text-soft-400">
                Question summaries will appear after the survey receives responses.
              </p>
            </div>
          ) : (
            analytics.questions.map((question) => (
              <div key={question.questionId} className="rounded-panel border border-stroke-soft-200 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-text-strong-950">{question.title}</p>
                    <p className="text-sm text-text-soft-400">
                      {question.questionKey} • answered by {question.totalAnswered} respondents
                    </p>
                  </div>
                </div>
                {renderQuestionStat(question)}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
