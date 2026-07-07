'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent } from '@/components/ui/Tabs';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { QuestionListEditor } from '@/components/surveys/QuestionListEditor';
import { SurveyAIAnalysisPanel } from '@/components/surveys/SurveyAIAnalysisPanel';
import { SurveyAnalyticsPanel } from '@/components/surveys/SurveyAnalyticsPanel';
import { SurveyDetailHeader } from '@/components/surveys/SurveyDetailHeader';
import { SurveyResponsesPanel } from '@/components/surveys/SurveyResponsesPanel';
import { SurveyMetaForm, type SurveyMetaFormValues } from '@/components/surveys/SurveyMetaForm';
import { useSession } from '@/lib/useSession';
import { fetchApi } from '@/lib/api';
import {
  closeSurvey,
  downloadSurveyExport,
  getSurvey,
  getSurveyAnalysis,
  getSurveyAnalytics,
  listSurveyAnalyses,
  listSurveyResponses,
  publishSurvey,
  replaceSurveyQuestions,
  triggerSurveyAnalysis,
  unpublishSurvey,
} from '@/lib/surveys/api';
import { surveyKeys } from '@/lib/surveys/queryKeys';
import { getSurveyErrorMessage } from '@/lib/surveys/utils';
import type { ReplaceSurveyQuestionInput, TriggerSurveyAnalysisInput } from '@/lib/surveys/types';

export default function SurveyDetailPage() {
  const params = useParams<{ surveyId: string | string[] }>();
  const rawSurveyId = params?.surveyId;
  const surveyId =
    typeof rawSurveyId === 'string'
      ? rawSurveyId
      : Array.isArray(rawSurveyId)
        ? rawSurveyId[0]
        : undefined;
  const queryClient = useQueryClient();
  const { data: sessionData, isLoading: isSessionLoading } = useSession();
  const teamId = sessionData?.session.teamId;

  const requireContext = () => {
    if (!teamId || !surveyId) throw new Error('Missing survey context');
    return { teamId, surveyId };
  };

  const surveyQuery = useQuery({
    queryKey:
      teamId && surveyId ? surveyKeys.detail(teamId, surveyId) : ['surveys', 'detail', 'missing'],
    queryFn: () => {
      const ctx = requireContext();
      return getSurvey(ctx.teamId, ctx.surveyId);
    },
    enabled: !!teamId && !!surveyId,
  });

  const responsesQuery = useQuery({
    queryKey:
      teamId && surveyId
        ? surveyKeys.responses(teamId, surveyId)
        : ['surveys', 'responses', 'missing'],
    queryFn: () => {
      const ctx = requireContext();
      return listSurveyResponses(ctx.teamId, ctx.surveyId);
    },
    enabled: !!teamId && !!surveyId,
  });

  const analyticsQuery = useQuery({
    queryKey:
      teamId && surveyId
        ? surveyKeys.analytics(teamId, surveyId)
        : ['surveys', 'analytics', 'missing'],
    queryFn: () => {
      const ctx = requireContext();
      return getSurveyAnalytics(ctx.teamId, ctx.surveyId);
    },
    enabled: !!teamId && !!surveyId,
  });

  const analysesQuery = useQuery({
    queryKey:
      teamId && surveyId
        ? surveyKeys.analysis(teamId, surveyId)
        : ['surveys', 'analysis', 'missing'],
    queryFn: () => {
      const ctx = requireContext();
      return listSurveyAnalyses(ctx.teamId, ctx.surveyId);
    },
    enabled: !!teamId && !!surveyId,
    refetchInterval: 15000,
  });

  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const firstAnalysisId = analysesQuery.data?.[0]?.id;
    if (selectedAnalysisId === null && firstAnalysisId) setSelectedAnalysisId(firstAnalysisId);
  }, [analysesQuery.data, selectedAnalysisId]);

  const selectedAnalysisQuery = useQuery({
    queryKey:
      teamId && surveyId && selectedAnalysisId
        ? [...surveyKeys.analysis(teamId, surveyId), selectedAnalysisId]
        : ['surveys', 'analysis-detail', 'missing'],
    queryFn: () => {
      const ctx = requireContext();
      if (!selectedAnalysisId) throw new Error('Missing analysis id');
      return getSurveyAnalysis(ctx.teamId, ctx.surveyId, selectedAnalysisId);
    },
    enabled: !!teamId && !!surveyId && !!selectedAnalysisId,
  });

  const updateMetaMutation = useMutation({
    mutationFn: async (values: SurveyMetaFormValues) => {
      const responseQuota =
        values.responseQuota.trim().length > 0 ? Number(values.responseQuota) : null;
      const ctx = requireContext();
      return fetchApi<unknown>(`/api/teams/${ctx.teamId}/surveys/${ctx.surveyId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: values.title,
          description: values.description || undefined,
          projectGoal: values.projectGoal,
          backgroundContext: values.backgroundContext || undefined,
          targetParticipant: values.targetParticipant || undefined,
          primaryDecision: values.primaryDecision || undefined,
          responseQuota,
        }),
      });
    },
    onSuccess: async () => {
      toast.success('Survey overview saved');
      const ctx = requireContext();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: surveyKeys.all(ctx.teamId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.detail(ctx.teamId, ctx.surveyId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.analytics(ctx.teamId, ctx.surveyId) }),
      ]);
    },
    onError: (error) => {
      toast.error(getSurveyErrorMessage(error, 'Failed to save survey overview'));
    },
  });

  const questionsMutation = useMutation({
    mutationFn: (questions: ReplaceSurveyQuestionInput[]) => {
      const ctx = requireContext();
      return replaceSurveyQuestions(ctx.teamId, ctx.surveyId, { questions });
    },
    onSuccess: async () => {
      toast.success('Survey questions saved');
      const ctx = requireContext();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: surveyKeys.all(ctx.teamId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.detail(ctx.teamId, ctx.surveyId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.analytics(ctx.teamId, ctx.surveyId) }),
      ]);
    },
    onError: (error) => {
      toast.error(getSurveyErrorMessage(error, 'Failed to save survey questions'));
    },
  });

  const exportMutation = useMutation({
    mutationFn: ({ format }: { format: 'json' | 'csv' }) => {
      const ctx = requireContext();
      return downloadSurveyExport(ctx.teamId, ctx.surveyId, format);
    },
    onSuccess: (fileName, variables) => {
      toast.success(`${variables.format.toUpperCase()} export downloaded: ${fileName}`);
    },
    onError: (error, variables) => {
      toast.error(
        getSurveyErrorMessage(
          error,
          `Failed to export survey as ${variables.format.toUpperCase()}`,
        ),
      );
    },
  });

  const analysisMutation = useMutation({
    mutationFn: (input: TriggerSurveyAnalysisInput) => {
      const ctx = requireContext();
      return triggerSurveyAnalysis(ctx.teamId, ctx.surveyId, input);
    },
    onSuccess: async (analysis) => {
      toast.success('Analysis queued');
      const ctx = requireContext();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: surveyKeys.analysis(ctx.teamId, ctx.surveyId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.detail(ctx.teamId, ctx.surveyId) }),
      ]);
      setSelectedAnalysisId(analysis.id);
    },
    onError: (error) => {
      toast.error(getSurveyErrorMessage(error, 'Failed to trigger analysis'));
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => {
      const ctx = requireContext();
      return publishSurvey(ctx.teamId, ctx.surveyId);
    },
    onSuccess: async () => {
      toast.success('Survey published');
      const ctx = requireContext();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: surveyKeys.all(ctx.teamId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.detail(ctx.teamId, ctx.surveyId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.responses(ctx.teamId, ctx.surveyId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.analytics(ctx.teamId, ctx.surveyId) }),
      ]);
    },
    onError: (error) => {
      toast.error(getSurveyErrorMessage(error, 'Failed to publish survey'));
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: () => {
      const ctx = requireContext();
      return unpublishSurvey(ctx.teamId, ctx.surveyId);
    },
    onSuccess: async () => {
      toast.success('Survey unpublished');
      const ctx = requireContext();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: surveyKeys.all(ctx.teamId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.detail(ctx.teamId, ctx.surveyId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.responses(ctx.teamId, ctx.surveyId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.analytics(ctx.teamId, ctx.surveyId) }),
      ]);
    },
    onError: (error) => {
      toast.error(getSurveyErrorMessage(error, 'Failed to unpublish survey'));
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => {
      const ctx = requireContext();
      return closeSurvey(ctx.teamId, ctx.surveyId);
    },
    onSuccess: async () => {
      toast.success('Survey closed');
      const ctx = requireContext();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: surveyKeys.all(ctx.teamId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.detail(ctx.teamId, ctx.surveyId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.responses(ctx.teamId, ctx.surveyId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.analytics(ctx.teamId, ctx.surveyId) }),
      ]);
    },
    onError: (error) => {
      toast.error(getSurveyErrorMessage(error, 'Failed to close survey'));
    },
  });

  const isBusy =
    updateMetaMutation.isPending ||
    questionsMutation.isPending ||
    exportMutation.isPending ||
    publishMutation.isPending ||
    unpublishMutation.isPending ||
    closeMutation.isPending;

  const detail = useMemo(() => surveyQuery.data, [surveyQuery.data]);

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Public link copied');
    } catch {
      toast.error('Failed to copy public link');
    }
  };

  if (isSessionLoading || surveyQuery.isLoading) {
    return (
      <div className="flex w-full flex-col gap-5 pb-12">
        <Skeleton className="h-48 w-full rounded-panel" />
        <Skeleton className="h-12 w-105 max-w-full rounded-ui" />
        <Skeleton className="h-130 w-full rounded-panel" />
      </div>
    );
  }

  if (!teamId || !surveyId) {
    return (
      <div className="p-4 text-sm text-text-soft-400">Error: Missing team or survey context.</div>
    );
  }

  if (surveyQuery.isError || !detail) {
    return <div className="p-4 text-sm text-state-danger-base">Failed to load survey detail.</div>;
  }

  const { survey, questions } = detail;

  return (
    <div className="flex w-full flex-col gap-5 pb-12">
      <SurveyDetailHeader
        survey={survey}
        isUpdating={isBusy}
        isExporting={exportMutation.isPending}
        onPublish={() => publishMutation.mutate()}
        onUnpublish={() => unpublishMutation.mutate()}
        onCloseSurvey={() => closeMutation.mutate()}
        onCopyLink={handleCopyLink}
        onExportJson={() => exportMutation.mutate({ format: 'json' })}
        onExportCsv={() => exportMutation.mutate({ format: 'csv' })}
      />

      <Tabs value={activeTab}>
        <SegmentedControl
          className="mb-4"
          options={[
            { label: 'Overview', value: 'overview' },
            { label: 'Questions', value: 'questions' },
            { label: 'Responses', value: 'responses' },
            { label: 'Analytics', value: 'analytics' },
            { label: 'AI Analysis', value: 'analysis' }
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />

        <TabsContent value="overview" className="space-y-5">
          <SurveyMetaForm
            survey={survey}
            isSaving={updateMetaMutation.isPending}
            onSubmit={(values) => updateMetaMutation.mutate(values)}
          />
        </TabsContent>

        <TabsContent value="questions" className="space-y-5">
          <QuestionListEditor
            teamId={teamId}
            surveyId={surveyId}
            questions={questions}
            surveyStatus={survey.status}
            isSaving={questionsMutation.isPending}
            onSave={(nextQuestions) => questionsMutation.mutate(nextQuestions)}
          />
        </TabsContent>

        <TabsContent value="responses" className="space-y-5">
          <SurveyResponsesPanel
            questions={questions}
            responses={responsesQuery.data ?? []}
            isLoading={responsesQuery.isLoading}
          />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-5">
          <SurveyAnalyticsPanel
            {...(analyticsQuery.data ? { analytics: analyticsQuery.data } : {})}
            isLoading={analyticsQuery.isLoading}
          />
        </TabsContent>

        <TabsContent value="analysis" className="space-y-5">
          <SurveyAIAnalysisPanel
            questions={questions}
            analyses={analysesQuery.data ?? []}
            {...(selectedAnalysisQuery.data
              ? { selectedAnalysis: selectedAnalysisQuery.data }
              : {})}
            isLoading={analysesQuery.isLoading}
            isDetailLoading={selectedAnalysisQuery.isLoading}
            isTriggering={analysisMutation.isPending}
            onRefresh={() => {
              void analysesQuery.refetch();
              if (selectedAnalysisId) void selectedAnalysisQuery.refetch();
            }}
            onSelectAnalysis={(analysisId) => setSelectedAnalysisId(analysisId)}
            onTriggerAnalysis={(input) => analysisMutation.mutate(input)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
