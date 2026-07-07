'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Typography';
import { Search } from 'lucide-react';
import { CreateSurveyModal } from '@/components/surveys/CreateSurveyModal';
import { SurveyListTable } from '@/components/surveys/SurveyListTable';
import { useSession } from '@/lib/useSession';
import { closeSurvey, createSurvey, listSurveys, publishSurvey, unpublishSurvey } from '@/lib/surveys/api';
import { surveyKeys } from '@/lib/surveys/queryKeys';
import type { CreateSurveyInput, SurveyListItem } from '@/lib/surveys/types';

function SurveysPageSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-[320px] w-full rounded-panel" />
    </div>
  );
}

export default function SurveysPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: sessionData, isLoading: isSessionLoading } = useSession();
  const teamId = sessionData?.session.teamId;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const surveysQuery = useQuery({
    queryKey: teamId ? surveyKeys.list(teamId) : ['surveys', 'no-team'],
    queryFn: () => listSurveys(teamId!),
    enabled: !!teamId,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateSurveyInput) => createSurvey(teamId!, input),
    onSuccess: async (survey) => {
      toast.success('Survey created');
      setIsCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: surveyKeys.all(teamId!) });
      router.push(`/dashboard/surveys/${survey.id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create survey');
    },
  });

  const publishMutation = useMutation({
    mutationFn: (surveyId: string) => publishSurvey(teamId!, surveyId),
    onSuccess: async () => {
      toast.success('Survey published');
      await queryClient.invalidateQueries({ queryKey: surveyKeys.all(teamId!) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to publish survey');
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: (surveyId: string) => unpublishSurvey(teamId!, surveyId),
    onSuccess: async () => {
      toast.success('Survey unpublished');
      await queryClient.invalidateQueries({ queryKey: surveyKeys.all(teamId!) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to unpublish survey');
    },
  });

  const closeMutation = useMutation({
    mutationFn: (surveyId: string) => closeSurvey(teamId!, surveyId),
    onSuccess: async () => {
      toast.success('Survey closed');
      await queryClient.invalidateQueries({ queryKey: surveyKeys.all(teamId!) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to close survey');
    },
  });

  const surveys = useMemo(() => surveysQuery.data ?? [], [surveysQuery.data]);
  const filteredSurveys = useMemo(() => {
    return surveys.filter((survey) => {
      const titleMatch = survey.title.toLowerCase().includes(search.toLowerCase());
      const goalMatch = (survey.projectGoal ?? '').toLowerCase().includes(search.toLowerCase());
      const matchesSearch = titleMatch || goalMatch;
      const matchesStatus = statusFilter === 'All' || survey.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [surveys, search, statusFilter]);

  const isMutating =
    createMutation.isPending ||
    publishMutation.isPending ||
    unpublishMutation.isPending ||
    closeMutation.isPending;

  if (isSessionLoading) {
    return <SurveysPageSkeleton />;
  }

  if (!teamId) {
    return <div className="p-4 text-sm text-text-soft-400">Error: No active team session.</div>;
  }

  return (
    <div className="flex w-full flex-col gap-5 pb-12">
      {/* Sub Header & Actions */}
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Research Surveys"
          description="Create, publish, and manage quantitative research surveys for your team."
          actions={
            <Button leftIcon={<Plus size={16} />} onClick={() => setIsCreateOpen(true)}>
              New Survey
            </Button>
          }
        />

        {/* Filter Bar */}
        <div className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-white p-4 shadow-none sm:grid-cols-2 xl:grid-cols-6">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { label: 'All statuses', value: 'All' },
              { label: 'Draft', value: 'draft' },
              { label: 'Published', value: 'published' },
              { label: 'Closed', value: 'closed' },
            ]}
          />
        </div>
      </div>

      {/* Table Area */}
      <div className="mt-2 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-[320px]">
            <Input
              placeholder="Search surveys by title or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>
        </div>

        <SurveyListTable
          surveys={filteredSurveys}
          isLoading={surveysQuery.isLoading}
          onPublish={(survey: SurveyListItem) => publishMutation.mutate(survey.id)}
          onUnpublish={(survey: SurveyListItem) => unpublishMutation.mutate(survey.id)}
          onCloseSurvey={(survey: SurveyListItem) => closeMutation.mutate(survey.id)}
        />
        {surveysQuery.isError ? <Text variant="body-s" color="danger" className="mt-4">Failed to load surveys.</Text> : null}
      </div>

      <CreateSurveyModal
        isOpen={isCreateOpen}
        isSubmitting={createMutation.isPending}
        errorMessage={createMutation.error ? createMutation.error.message : undefined}
        onClose={() => {
          if (isMutating) return;
          setIsCreateOpen(false);
        }}
        onSubmit={(input) => createMutation.mutate(input)}
      />
    </div>
  );
}
