'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock, Lock, Loader2, Send, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { getPublicSurvey, submitPublicSurvey } from '@/lib/surveys/api';
import type {
  SurveyAnswerValue,
  SurveyLogicCondition,
  SurveyQuestion,
  SurveyQuestionType,
} from '@/lib/surveys/types';

type AnswerState = Record<string, SurveyAnswerValue>;

function useSurveySlug() {
  const params = useParams<{ slug: string | string[] }>();
  const rawSlug = params?.slug;
  return typeof rawSlug === 'string' ? rawSlug : Array.isArray(rawSlug) ? rawSlug[0] : undefined;
}

function evaluateCondition(condition: SurveyLogicCondition, answers: AnswerState) {
  const currentValue = answers[condition.sourceQuestionKey];
  switch (condition.operator) {
    case 'eq':
      return currentValue === condition.value;
    case 'neq':
      return currentValue !== condition.value;
    case 'includes':
      return Array.isArray(currentValue)
        ? currentValue.includes(String(condition.value ?? ''))
        : false;
    case 'not_includes':
      return Array.isArray(currentValue)
        ? !currentValue.includes(String(condition.value ?? ''))
        : true;
    case 'gt':
      return Number(currentValue) > Number(condition.value);
    case 'gte':
      return Number(currentValue) >= Number(condition.value);
    case 'lt':
      return Number(currentValue) < Number(condition.value);
    case 'lte':
      return Number(currentValue) <= Number(condition.value);
    case 'between': {
      const numericValue = Number(currentValue);
      const min = condition.range?.min ?? Number.NEGATIVE_INFINITY;
      const max = condition.range?.max ?? Number.POSITIVE_INFINITY;
      return numericValue >= min && numericValue <= max;
    }
    default:
      return true;
  }
}

function isQuestionVisible(question: SurveyQuestion, answers: AnswerState) {
  if (!question.logic || question.logic.effect !== 'show') return true;
  const matches = question.logic.conditions.map((condition) =>
    evaluateCondition(condition, answers),
  );
  return question.logic.match === 'all' ? matches.every(Boolean) : matches.some(Boolean);
}

function formatQuestionType(type: SurveyQuestionType) {
  return type.replaceAll('_', ' ');
}

function hasAnswered(value: SurveyAnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function isQuotaReached(responseQuota: number | undefined, responseCount: number) {
  return typeof responseQuota === 'number' && responseCount >= responseQuota;
}

type SurveyAvailability =
  | { kind: 'live' }
  | { kind: 'unpublished' }
  | { kind: 'closed' }
  | { kind: 'quota_full' };

function classifyAvailability(
  status: 'draft' | 'published' | 'closed',
  responseQuota: number | undefined,
  responseCount: number,
): SurveyAvailability {
  if (status === 'closed') return { kind: 'closed' };
  if (isQuotaReached(responseQuota, responseCount)) return { kind: 'quota_full' };
  if (status === 'published') return { kind: 'live' };
  return { kind: 'unpublished' };
}

export default function PublicSurveyPage() {
  const slug = useSurveySlug();
  const [answers, setAnswers] = useState<AnswerState>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const surveyQuery = useQuery({
    queryKey: ['public-survey', slug],
    queryFn: () => {
      if (!slug) throw new Error('Missing survey slug');
      return getPublicSurvey(slug);
    },
    enabled: !!slug,
  });

  const visibleQuestions = useMemo(() => {
    const questions = surveyQuery.data?.questions ?? [];
    return questions.filter((question) => isQuestionVisible(question, answers));
  }, [answers, surveyQuery.data?.questions]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!slug) throw new Error('Missing survey slug');
      return submitPublicSurvey(slug, { answers, metadata: { source: 'public-survey' } });
    },
    onSuccess: () => {
      toast.success('Response submitted');
      setHasSubmitted(true);
      setValidationErrors({});
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to submit response');
    },
  });

  const handleSubmit = () => {
    const errors: Record<string, string> = {};
    for (const question of visibleQuestions) {
      if (!question.required) continue;
      if (!hasAnswered(answers[question.questionKey])) {
        errors[question.questionKey] = 'This question is required.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.error('Please answer all required questions before submitting.');
      return;
    }

    setValidationErrors({});
    submitMutation.mutate();
  };

  if (!slug) {
    return <div className="p-6 text-sm text-state-danger-base">Missing survey slug.</div>;
  }

  if (surveyQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Skeleton className="h-24 rounded-panel" />
        <Skeleton className="h-48 rounded-panel" />
        <Skeleton className="h-48 rounded-panel" />
      </div>
    );
  }

  if (surveyQuery.isError || !surveyQuery.data) {
    return (
      <UnavailableState
        title="Survey unavailable"
        description="The link may be invalid or no longer reachable."
      />
    );
  }

  const { survey, questions } = surveyQuery.data;
  const availability = classifyAvailability(
    survey.status,
    survey.responseQuota,
    survey.responseCount,
  );

  if (hasSubmitted) {
    return <SubmittedState />;
  }

  if (availability.kind === 'unpublished') {
    return (
      <UnavailableState
        title="Survey not accepting responses"
        description="This survey is currently unpublished. The team that owns it needs to publish it before responses can be collected."
      />
    );
  }

  if (availability.kind === 'closed') {
    return (
      <UnavailableState
        title="Survey closed"
        description="This survey is no longer accepting responses."
        icon={<Lock size={20} />}
      />
    );
  }

  if (availability.kind === 'quota_full') {
    return (
      <UnavailableState
        title="Response quota reached"
        description={`This survey has reached its response quota of ${survey.responseQuota ?? 0}. New responses can no longer be submitted.`}
        icon={<ShieldOff size={20} />}
      />
    );
  }

  const setAnswer = (questionKey: string, nextValue: SurveyAnswerValue) => {
    setAnswers((current) => ({ ...current, [questionKey]: nextValue }));
    if (validationErrors[questionKey]) {
      setValidationErrors((current) => {
        const next = { ...current };
        delete next[questionKey];
        return next;
      });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 pb-14">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success" showDot>
                  Live survey
                </Badge>
                {survey.responseQuota ? (
                  <Badge variant="neutral">
                    Quota {survey.responseCount}/{survey.responseQuota}
                  </Badge>
                ) : null}
              </div>
              <h1 className="text-3xl font-semibold text-text-strong-950">{survey.title}</h1>
              <p className="max-w-3xl text-sm leading-6 text-text-sub-600">{survey.projectGoal}</p>
            </div>
          </div>
          {survey.description ? (
            <p className="text-sm text-text-sub-600">{survey.description}</p>
          ) : null}
        </CardContent>
      </Card>

      {questions.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-text-soft-400">
            This survey does not have any questions yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {questions.map((question, index) => {
            if (!visibleQuestions.some((item) => item.id === question.id)) return null;
            return (
              <QuestionBlock
                key={question.id}
                question={question}
                index={index}
                value={answers[question.questionKey]}
                {...(validationErrors[question.questionKey]
                  ? { error: validationErrors[question.questionKey] }
                  : {})}
                onChange={(nextValue) => setAnswer(question.questionKey, nextValue)}
              />
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button
          leftIcon={
            submitMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )
          }
          disabled={submitMutation.isPending || questions.length === 0}
          onClick={handleSubmit}
        >
          {submitMutation.isPending ? 'Submitting...' : 'Submit response'}
        </Button>
      </div>
    </div>
  );
}

function UnavailableState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardContent className="pt-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#fef3f2] text-state-danger-base">
            {icon ?? <AlertCircle size={20} />}
          </div>
          <p className="mt-4 text-lg font-semibold text-text-strong-950">{title}</p>
          <p className="mt-2 text-sm text-text-soft-400">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SubmittedState() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardContent className="pt-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#ecfdf3] text-[#027a48]">
            <CheckCircle2 size={20} />
          </div>
          <p className="mt-4 text-lg font-semibold text-text-strong-950">
            Thanks for your response
          </p>
          <p className="mt-2 text-sm text-text-soft-400">
            Your submission has been sent successfully.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function QuestionBlock({
  question,
  index,
  value,
  error,
  onChange,
}: {
  question: SurveyQuestion;
  index: number;
  value: SurveyAnswerValue | undefined;
  error?: string;
  onChange: (value: SurveyAnswerValue) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {index + 1}. {question.title}
        </CardTitle>
        <CardDescription>
          {formatQuestionType(question.type)}
          {question.required ? (
            <span className="ml-2 text-state-danger-base">• Required</span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {question.description ? (
          <p className="text-sm text-text-sub-600">{question.description}</p>
        ) : null}
        <QuestionInput question={question} value={value} onChange={onChange} />
        {error ? (
          <p className="flex items-center gap-1.5 text-xs text-state-danger-base">
            <Clock size={12} />
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  value: SurveyAnswerValue | undefined;
  onChange: (value: SurveyAnswerValue) => void;
}) {
  switch (question.type) {
    case 'short_text':
      return (
        <Input
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'long_text':
      return (
        <Textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-32"
        />
      );
    case 'dropdown':
    case 'multiple_choice': {
      const options = (question.config as { options: { label: string; value: string }[] }).options;
      return (
        <Select
          value={typeof value === 'string' ? value : ''}
          options={options}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    }
    case 'checkboxes': {
      const options = (question.config as { options: { label: string; value: string }[] }).options;
      const selectedValues = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-2">
          {options.map((option) => {
            const checked = selectedValues.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex items-center gap-3 rounded-panel border border-stroke-soft-200 px-4 py-3 text-sm text-text-strong-950"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const nextValues = event.target.checked
                      ? [...selectedValues, option.value]
                      : selectedValues.filter((item) => item !== option.value);
                    onChange(nextValues);
                  }}
                  className="size-4 rounded border-stroke-soft-200 text-primary-base accent-primary-base"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      );
    }
    case 'linear_scale': {
      const config = question.config as {
        min: number;
        max: number;
        step?: number;
        minLabel?: string;
        maxLabel?: string;
      };
      return (
        <div className="space-y-3">
          <input
            type="range"
            min={config.min}
            max={config.max}
            step={config.step ?? 1}
            value={typeof value === 'number' ? value : config.min}
            onChange={(event) => onChange(Number(event.target.value))}
            className="w-full"
          />
          <div className="flex items-center justify-between text-xs text-text-soft-400">
            <span>{config.minLabel ?? config.min}</span>
            <span>{config.maxLabel ?? config.max}</span>
          </div>
        </div>
      );
    }
    case 'matrix': {
      const config = question.config as {
        rows: { key: string; label: string }[];
        columns: { key: string; label: string; value?: number }[];
      };
      const matrixValue = (typeof value === 'object' && value !== null ? value : {}) as Record<
        string,
        string | number | boolean | null
      >;
      return (
        <div className="space-y-3 overflow-x-auto">
          {config.rows.map((row) => (
            <div
              key={row.key}
              className="space-y-2 rounded-panel border border-stroke-soft-200 p-4"
            >
              <p className="text-sm font-medium text-text-strong-950">{row.label}</p>
              <div className="flex flex-wrap gap-2">
                {config.columns.map((column) => (
                  <Button
                    key={column.key}
                    variant={
                      matrixValue[row.key] === column.key || matrixValue[row.key] === column.value
                        ? 'primary'
                        : 'outline'
                    }
                    size="md"
                    onClick={() =>
                      onChange({ ...matrixValue, [row.key]: column.value ?? column.key })
                    }
                  >
                    {column.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    default:
      return (
        <Input
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
