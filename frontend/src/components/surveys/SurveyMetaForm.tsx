'use client';

import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import type { SurveyListItem } from '@/lib/surveys/types';

export interface SurveyMetaFormValues {
  title: string;
  description: string;
  projectGoal: string;
  backgroundContext: string;
  targetParticipant: string;
  primaryDecision: string;
  responseQuota: string;
}

interface SurveyMetaFormProps {
  survey: SurveyListItem & {
    backgroundContext?: string;
    targetParticipant?: string;
    primaryDecision?: string;
  };
  isSaving?: boolean;
  onSubmit: (values: SurveyMetaFormValues) => void;
}

function toFormValues(survey: SurveyMetaFormProps['survey']): SurveyMetaFormValues {
  return {
    title: survey.title,
    description: survey.description ?? '',
    projectGoal: survey.projectGoal,
    backgroundContext: survey.backgroundContext ?? '',
    targetParticipant: survey.targetParticipant ?? '',
    primaryDecision: survey.primaryDecision ?? '',
    responseQuota: survey.responseQuota ? String(survey.responseQuota) : '',
  };
}

export function SurveyMetaForm({ survey, isSaving = false, onSubmit }: SurveyMetaFormProps) {
  const [values, setValues] = useState<SurveyMetaFormValues>(() => toFormValues(survey));
  const isDraft = survey.status === 'draft';

  useEffect(() => {
    setValues(toFormValues(survey));
  }, [survey]);

  const isDirty = useMemo(() => {
    const initial = toFormValues(survey);
    return JSON.stringify(initial) !== JSON.stringify(values);
  }, [survey, values]);

  const updateField = <K extends keyof SurveyMetaFormValues>(
    key: K,
    value: SurveyMetaFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Survey overview</CardTitle>
        <CardDescription>
          Define the research objective, context, and participant framing before editing deeper
          survey structure.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isDraft ? (
          <div className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50 px-4 py-3 text-sm text-text-sub-600">
            Survey metadata is locked while the survey is not in draft state. Unpublish to edit
            these fields again.
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-strong-950">Survey title</label>
              <Input
                value={values.title}
                disabled={!isDraft || isSaving}
                onChange={(event) => updateField('title', event.target.value)}
                placeholder="e.g. New user onboarding satisfaction"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-strong-950">Research objective</label>
              <Textarea
                value={values.projectGoal}
                disabled={!isDraft || isSaving}
                onChange={(event) => updateField('projectGoal', event.target.value)}
                className="min-h-36"
                placeholder="What should the team learn or decide from this survey?"
              />
              <p className="text-xs text-text-soft-400">
                This field is also used as context for V1 AI post-response analysis.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-strong-950">Description</label>
              <Textarea
                value={values.description}
                disabled={!isDraft || isSaving}
                onChange={(event) => updateField('description', event.target.value)}
                className="min-h-30"
                placeholder="Internal summary or notes for the research team"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-strong-950">Background context</label>
              <Textarea
                value={values.backgroundContext}
                disabled={!isDraft || isSaving}
                onChange={(event) => updateField('backgroundContext', event.target.value)}
                className="min-h-30"
                placeholder="Recent findings, constraints, context, or assumptions"
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-strong-950">Target participant</label>
              <Input
                value={values.targetParticipant}
                disabled={!isDraft || isSaving}
                onChange={(event) => updateField('targetParticipant', event.target.value)}
                placeholder="e.g. Active customers who signed up in the last 30 days"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-strong-950">
                Primary decision to support
              </label>
              <Input
                value={values.primaryDecision}
                disabled={!isDraft || isSaving}
                onChange={(event) => updateField('primaryDecision', event.target.value)}
                placeholder="e.g. Decide whether onboarding copy needs revision"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-strong-950">Response quota</label>
              <Input
                type="number"
                min={1}
                value={values.responseQuota}
                disabled={!isDraft || isSaving}
                onChange={(event) => updateField('responseQuota', event.target.value)}
                placeholder="Optional"
              />
              <p className="text-xs text-text-soft-400">
                Leave empty for no quota. When reached, the public survey auto-closes.
              </p>
            </div>

            <div className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50/70 p-4 text-sm text-text-sub-600">
              <p className="font-medium text-text-strong-950">Current state</p>
              <ul className="mt-2 space-y-2">
                <li>
                  • Status:{' '}
                  <span className="font-medium text-text-strong-950">{survey.status}</span>
                </li>
                <li>
                  • Response count:{' '}
                  <span className="font-medium text-text-strong-950">{survey.responseCount}</span>
                </li>
                <li>
                  • Public link:{' '}
                  <span className="font-medium text-text-strong-950">
                    {survey.publicSlug ? 'Reserved / generated' : 'Not generated yet'}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-stroke-soft-200 pt-4">
          <Button
            leftIcon={<Save size={16} />}
            disabled={
              !isDraft ||
              !isDirty ||
              values.title.trim().length === 0 ||
              values.projectGoal.trim().length === 0
            }
            loading={isSaving}
            onClick={() => onSubmit(values)}
          >
            {isSaving ? 'Saving...' : 'Save overview'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
