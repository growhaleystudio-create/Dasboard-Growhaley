'use client';

import { useMemo, useState } from 'react';
import { Clock3, Eye, FileSearch, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import type { SurveyQuestion, SurveyResponseItem } from '@/lib/surveys/types';

interface SurveyResponsesPanelProps {
  questions: SurveyQuestion[];
  responses?: SurveyResponseItem[];
  isLoading?: boolean;
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function renderResponseStatus(status: SurveyResponseItem['status']) {
  if (status === 'completed') return <Badge variant="success">Completed</Badge>;
  if (status === 'abandoned') return <Badge variant="error">Abandoned</Badge>;
  return <Badge variant="warning">In progress</Badge>;
}

function renderAnalysisStatus(state: SurveyResponseItem['analysisState']) {
  if (state === 'success') return <Badge variant="success">Analysis ready</Badge>;
  if (state === 'failed') return <Badge variant="error">Analysis failed</Badge>;
  if (state === 'pending') return <Badge variant="warning">Analysis pending</Badge>;
  return <Badge variant="neutral">No analysis</Badge>;
}

function summarizeAnswers(response: SurveyResponseItem) {
  return Object.keys(response.answers).length;
}

export function SurveyResponsesPanel({
  questions,
  responses = [],
  isLoading = false,
}: SurveyResponsesPanelProps) {
  const [selectedResponse, setSelectedResponse] = useState<SurveyResponseItem | null>(null);

  const questionMap = useMemo(
    () => new Map(questions.map((question) => [question.questionKey, question.title])),
    [questions],
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Responses</CardTitle>
          <CardDescription>
            Review raw response entries, completion state, submission timestamps, and answer volume.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-ui" />
              <Skeleton className="h-10 w-full rounded-ui" />
              <Skeleton className="h-10 w-full rounded-ui" />
            </div>
          ) : responses.length === 0 ? (
            <div className="rounded-panel border border-dashed border-stroke-soft-200 bg-bg-weak-50/50 px-6 py-10 text-center">
              <p className="text-sm font-medium text-text-strong-950">No responses yet</p>
              <p className="mt-1 text-sm text-text-soft-400">
                Once the survey starts collecting data, responses will appear here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Response</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Analysis</TableHead>
                  <TableHead>Answers</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <tbody>
                {responses.map((response) => (
                  <TableRow key={response.id}>
                    <TableCell>
                      <div className="min-w-[180px]">
                        <p className="font-medium text-text-strong-950">{response.id.slice(0, 8)}</p>
                        <p className="text-xs text-text-soft-400">v{response.surveyVersion}</p>
                      </div>
                    </TableCell>
                    <TableCell>{renderResponseStatus(response.status)}</TableCell>
                    <TableCell>{renderAnalysisStatus(response.analysisState)}</TableCell>
                    <TableCell>{summarizeAnswers(response)}</TableCell>
                    <TableCell>{formatDateTime(response.startedAt)}</TableCell>
                    <TableCell>{formatDateTime(response.submittedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="md"
                        leftIcon={<Eye size={14} />}
                        onClick={() => setSelectedResponse(response)}
                      >
                        View details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={!!selectedResponse}
        onClose={() => setSelectedResponse(null)}
        title={selectedResponse ? `Response ${selectedResponse.id.slice(0, 8)}` : 'Response detail'}
      >
        {selectedResponse ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50/60 p-4">
                <div className="flex items-center gap-2">
                  <Clock3 size={16} className="text-text-sub-600" />
                  <p className="text-sm font-medium text-text-strong-950">Response timing</p>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-text-sub-600">
                  <li>Started: {formatDateTime(selectedResponse.startedAt)}</li>
                  <li>Submitted: {formatDateTime(selectedResponse.submittedAt)}</li>
                  <li>Status: {selectedResponse.status}</li>
                </ul>
              </div>

              <div className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50/60 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-text-sub-600" />
                  <p className="text-sm font-medium text-text-strong-950">Analysis state</p>
                </div>
                <div className="mt-3">{renderAnalysisStatus(selectedResponse.analysisState)}</div>
                <p className="mt-2 text-sm text-text-sub-600">
                  This reflects async V1 post-response analysis processing on the backend.
                </p>
              </div>
            </div>

            <div className="rounded-panel border border-stroke-soft-200 p-4">
              <div className="flex items-center gap-2">
                <FileSearch size={16} className="text-text-sub-600" />
                <p className="text-sm font-medium text-text-strong-950">Submitted answers</p>
              </div>
              <div className="mt-4 space-y-3">
                {Object.entries(selectedResponse.answers).length === 0 ? (
                  <p className="text-sm text-text-soft-400">No answers recorded for this response.</p>
                ) : (
                  Object.entries(selectedResponse.answers).map(([questionKey, value]) => (
                    <div
                      key={questionKey}
                      className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50/40 p-3"
                    >
                      <p className="text-sm font-medium text-text-strong-950">
                        {questionMap.get(questionKey) ?? questionKey}
                      </p>
                      <p className="mt-1 text-xs text-text-soft-400">{questionKey}</p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-sm text-text-sub-600">
                        {typeof value === 'string'
                          ? value
                          : JSON.stringify(value, null, 2) ?? '—'}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
