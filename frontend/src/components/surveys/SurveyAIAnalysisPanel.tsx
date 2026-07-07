'use client';

import { useMemo, useState } from 'react';
import { BrainCircuit, CheckCircle2, RefreshCcw, Sparkles, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import type {
  SurveyAnalysisDetail,
  SurveyAnalysisItem,
  SurveyAnalysisScope,
  SurveyQuestion,
  TriggerSurveyAnalysisInput,
} from '@/lib/surveys/types';

interface SurveyAIAnalysisPanelProps {
  questions: SurveyQuestion[];
  analyses?: SurveyAnalysisItem[];
  selectedAnalysis?: SurveyAnalysisDetail;
  isLoading?: boolean;
  isDetailLoading?: boolean;
  isTriggering?: boolean;
  onRefresh?: () => void;
  onSelectAnalysis: (analysisId: string) => void;
  onTriggerAnalysis: (input: TriggerSurveyAnalysisInput) => void;
}

const SCOPE_OPTIONS: { label: string; value: SurveyAnalysisScope }[] = [
  { label: 'Overall summary', value: 'overall' },
  { label: 'Per-question analysis', value: 'question' },
  { label: 'Segment analysis', value: 'segment' },
];

function formatDateTime(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatScopeLabel(scope: SurveyAnalysisScope) {
  return SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? scope;
}

function renderStatusBadge(status: SurveyAnalysisItem['status']) {
  if (status === 'success') return <Badge variant="success">Ready</Badge>;
  if (status === 'failed') return <Badge variant="error">Failed</Badge>;
  return <Badge variant="warning">Pending</Badge>;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-panel border border-stroke-soft-200 bg-bg-weak-50/50 p-4 text-sm leading-6 text-text-sub-600">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function SurveyAIAnalysisPanel({
  questions,
  analyses = [],
  selectedAnalysis,
  isLoading = false,
  isDetailLoading = false,
  isTriggering = false,
  onRefresh,
  onSelectAnalysis,
  onTriggerAnalysis,
}: SurveyAIAnalysisPanelProps) {
  const [scope, setScope] = useState<SurveyAnalysisScope>('overall');
  const [questionId, setQuestionId] = useState('');

  const questionOptions = useMemo(
    () => questions.map((question) => ({ label: question.title, value: question.id })),
    [questions],
  );

  const canSubmit = !isTriggering && (scope !== 'question' || questionId.length > 0);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>AI analysis</CardTitle>
              <CardDescription>
                Trigger V1 post-response analysis jobs and inspect AI outputs derived from the
                current survey responses.
              </CardDescription>
            </div>
            {onRefresh ? (
              <Button
                variant="outline"
                size="md"
                leftIcon={<RefreshCcw size={14} />}
                onClick={onRefresh}
                disabled={isLoading || isTriggering}
              >
                Refresh
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-strong-950">Analysis scope</label>
              <Select
                value={scope}
                options={SCOPE_OPTIONS}
                onChange={(event) => setScope(event.target.value as SurveyAnalysisScope)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-strong-950">Question</label>
              <Select
                value={questionId}
                options={[{ label: 'Select question', value: '' }, ...questionOptions]}
                disabled={scope !== 'question'}
                onChange={(event) => setQuestionId(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                leftIcon={<Sparkles size={14} />}
                disabled={!canSubmit}
                onClick={() =>
                  onTriggerAnalysis({
                    scope,
                    ...(scope === 'question' && questionId ? { questionId } : {}),
                  })
                }
              >
                {isTriggering ? 'Triggering...' : 'Trigger analysis'}
              </Button>
            </div>
          </div>

          {scope === 'question' && questionOptions.length === 0 ? (
            <div className="rounded-panel border border-dashed border-stroke-soft-200 bg-bg-weak-50/50 px-4 py-3 text-sm text-text-soft-400">
              Add at least one question before triggering a question-level analysis.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Analysis runs</CardTitle>
            <CardDescription>Latest jobs stored by the backend analysis queue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 rounded-panel" />
                <Skeleton className="h-16 rounded-panel" />
                <Skeleton className="h-16 rounded-panel" />
              </div>
            ) : analyses.length === 0 ? (
              <div className="rounded-panel border border-dashed border-stroke-soft-200 bg-bg-weak-50/50 px-6 py-10 text-center">
                <p className="text-sm font-medium text-text-strong-950">No analysis yet</p>
                <p className="mt-1 text-sm text-text-soft-400">
                  Trigger an overall, question, or segment analysis to generate AI insight
                  snapshots.
                </p>
              </div>
            ) : (
              analyses.map((analysis) => (
                <Button
                  key={analysis.id}
                  variant="ghost"
                  onClick={() => onSelectAnalysis(analysis.id)}
                  className={`h-auto w-full rounded-panel border px-4 py-3 text-left font-normal transition-all ${
                    selectedAnalysis?.id === analysis.id
                      ? 'border-primary-base bg-bg-weak-50/60'
                      : 'border-stroke-soft-200 bg-bg-white-0 hover:bg-bg-weak-50/40'
                  }`}
                >
                  <div className="w-full">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-text-strong-950">
                          {formatScopeLabel(analysis.scope)}
                        </p>
                        <p className="text-xs text-text-soft-400">{analysis.id.slice(0, 8)}</p>
                      </div>
                      {renderStatusBadge(analysis.status)}
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-text-soft-400">
                      <ClockCta value={analysis.createdAt} />
                      {analysis.questionId ? (
                        <span>• Question: {analysis.questionId.slice(0, 8)}</span>
                      ) : null}
                    </div>
                  </div>
                </Button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analysis detail</CardTitle>
            <CardDescription>
              Inspect the selected analysis input snapshot and result payload.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isDetailLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 rounded-panel" />
                <Skeleton className="h-32 rounded-panel" />
                <Skeleton className="h-40 rounded-panel" />
              </div>
            ) : selectedAnalysis ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  {renderStatusBadge(selectedAnalysis.status)}
                  <Badge variant="neutral">{formatScopeLabel(selectedAnalysis.scope)}</Badge>
                  {selectedAnalysis.model ? (
                    <Badge variant="active">{selectedAnalysis.model}</Badge>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50/50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-text-soft-400">
                      Created
                    </p>
                    <p className="mt-1 text-sm text-text-strong-950">
                      {formatDateTime(selectedAnalysis.createdAt)}
                    </p>
                  </div>
                  <div className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50/50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-text-soft-400">
                      Updated
                    </p>
                    <p className="mt-1 text-sm text-text-strong-950">
                      {formatDateTime(selectedAnalysis.updatedAt)}
                    </p>
                  </div>
                </div>

                {selectedAnalysis.errorMessage ? (
                  <div className="rounded-panel border border-state-danger-base/30 bg-[#fef3f2] p-4 text-sm text-state-danger-base">
                    <div className="flex items-center gap-2 font-medium">
                      <TriangleAlert size={16} />
                      Analysis failed
                    </div>
                    <p className="mt-2">{selectedAnalysis.errorMessage}</p>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-medium text-text-strong-950">Input snapshot</p>
                  <JsonBlock value={selectedAnalysis.inputSnapshot} />
                </div>

                {selectedAnalysis.result ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-text-strong-950">Result</p>
                    <JsonBlock value={selectedAnalysis.result} />
                  </div>
                ) : (
                  <div className="rounded-panel border border-dashed border-stroke-soft-200 bg-bg-weak-50/50 px-6 py-10 text-center text-sm text-text-soft-400">
                    Result payload will appear after backend processing completes.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-panel border border-dashed border-stroke-soft-200 bg-bg-weak-50/50 px-6 py-10 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-bg-white-0 text-text-sub-600">
                  <BrainCircuit size={20} />
                </div>
                <p className="mt-3 text-sm font-medium text-text-strong-950">
                  No analysis selected
                </p>
                <p className="mt-1 text-sm text-text-soft-400">
                  Choose a run from the list on the left to inspect its payload.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ClockCta({ value }: { value?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CheckCircle2 size={12} />
      {formatDateTime(value)}
    </span>
  );
}
