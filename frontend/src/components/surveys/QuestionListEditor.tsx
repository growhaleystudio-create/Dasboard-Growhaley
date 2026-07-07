'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { QuestionEditorCard } from '@/components/surveys/QuestionEditorCard';
import { useQuestionDraft } from '@/hooks/useQuestionDraft';
import type {
  ChoiceQuestionConfig,
  LinearScaleQuestionConfig,
  MatrixQuestionConfig,
  ReplaceSurveyQuestionInput,
  SurveyQuestion,
  SurveyQuestionType,
  SurveyStatus,
} from '@/lib/surveys/types';

interface QuestionListEditorProps {
  teamId: string;
  surveyId: string;
  questions: SurveyQuestion[];
  surveyStatus: SurveyStatus;
  isSaving?: boolean;
  onSave: (questions: ReplaceSurveyQuestionInput[]) => void;
}

interface SortableQuestionCardProps {
  question: ReplaceSurveyQuestionInput;
  index: number;
  disabled: boolean;
  availableLogicSources: { label: string; value: string }[];
  isDirty: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: Date | null;
  onChange: (nextQuestion: ReplaceSurveyQuestionInput) => void;
  onRemove: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

function SortableQuestionCard({
  question,
  index,
  disabled,
  availableLogicSources,
  isDirty,
  saveState,
  lastSavedAt,
  onChange,
  onRemove,
  onSave,
  onDiscard,
}: SortableQuestionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.questionKey,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <QuestionEditorCard
        question={question}
        index={index}
        disabled={disabled}
        availableLogicSources={availableLogicSources}
        onChange={onChange}
        onRemove={onRemove}
        isDirty={isDirty}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        onSave={onSave}
        onDiscard={onDiscard}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function makeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function getDefaultConfig(type: SurveyQuestionType): ReplaceSurveyQuestionInput['config'] {
  switch (type) {
    case 'multiple_choice':
    case 'checkboxes':
    case 'dropdown':
      return {
        options: [{ value: 'option_1', label: 'Option 1' }],
      } satisfies ChoiceQuestionConfig;
    case 'linear_scale':
      return {
        min: 1,
        max: 5,
        step: 1,
        minLabel: 'Low',
        maxLabel: 'High',
      } satisfies LinearScaleQuestionConfig;
    case 'matrix':
      return {
        rows: [{ key: 'row_1', label: 'Statement 1' }],
        columns: [
          { key: 'col_1', label: 'Strongly disagree', value: 1 },
          { key: 'col_2', label: 'Strongly agree', value: 5 },
        ],
      } satisfies MatrixQuestionConfig;
    case 'short_text':
    case 'long_text':
    default:
      return {};
  }
}

function normalizeQuestions(questions: ReplaceSurveyQuestionInput[]) {
  return questions.map((question, index) => ({
    ...question,
    displayOrder: index,
    required: question.required ?? false,
    description: question.description ?? '',
  }));
}

function toEditableQuestion(question: SurveyQuestion): ReplaceSurveyQuestionInput {
  return {
    questionKey: question.questionKey,
    type: question.type,
    title: question.title,
    description: question.description ?? '',
    required: question.required,
    displayOrder: question.displayOrder,
    config: question.config,
    ...(question.logic ? { logic: question.logic } : {}),
  };
}

function buildDefaultQuestion(index: number): ReplaceSurveyQuestionInput {
  return {
    questionKey: `question_${index + 1}`,
    type: 'short_text',
    title: '',
    description: '',
    required: false,
    displayOrder: index,
    config: getDefaultConfig('short_text'),
  };
}

function validateQuestions(questions: ReplaceSurveyQuestionInput[]) {
  const messages: string[] = [];
  const seenKeys = new Set<string>();

  questions.forEach((question, index) => {
    const position = index + 1;

    if (!question.title.trim()) {
      messages.push(`Question ${position} title is required.`);
    }

    if (!question.questionKey.trim()) {
      messages.push(`Question ${position} key is missing.`);
    } else if (seenKeys.has(question.questionKey)) {
      messages.push(`Question key ${question.questionKey} is duplicated.`);
    } else {
      seenKeys.add(question.questionKey);
    }

    if (
      question.type === 'multiple_choice' ||
      question.type === 'checkboxes' ||
      question.type === 'dropdown'
    ) {
      const config = question.config as ChoiceQuestionConfig;
      if (!config.options.length) {
        messages.push(`Question ${position} needs at least one option.`);
      }
      if (config.options.some((option) => !option.label.trim())) {
        messages.push(`Question ${position} has an empty option label.`);
      }
    }

    if (question.type === 'linear_scale') {
      const config = question.config as LinearScaleQuestionConfig;
      if (config.min >= config.max) {
        messages.push(`Question ${position} linear scale min must be less than max.`);
      }
    }

    if (question.type === 'matrix') {
      const config = question.config as MatrixQuestionConfig;
      if (!config.rows.length || !config.columns.length) {
        messages.push(`Question ${position} matrix needs at least one row and one column.`);
      }
      if (config.rows.some((row) => !row.label.trim() || !row.key.trim())) {
        messages.push(`Question ${position} has an invalid matrix row.`);
      }
      if (config.columns.some((column) => !column.label.trim() || !column.key.trim())) {
        messages.push(`Question ${position} has an invalid matrix column.`);
      }
    }

    if (question.logic) {
      if (!question.logic.conditions.length) {
        messages.push(`Question ${position} has conditional logic enabled without rules.`);
      }
      question.logic.conditions.forEach((condition, conditionIndex) => {
        if (!condition.sourceQuestionKey.trim()) {
          messages.push(
            `Question ${position} rule ${conditionIndex + 1} is missing source question.`,
          );
        }
        if (condition.operator === 'between') {
          if (
            condition.range?.min === undefined ||
            condition.range?.max === undefined ||
            condition.range.min > condition.range.max
          ) {
            messages.push(
              `Question ${position} rule ${conditionIndex + 1} has an invalid between range.`,
            );
          }
        } else if (condition.value === undefined || condition.value === '') {
          messages.push(`Question ${position} rule ${conditionIndex + 1} needs an expected value.`);
        }
      });
    }
  });

  return messages;
}

export function QuestionListEditor({
  teamId,
  surveyId,
  questions,
  surveyStatus,
  isSaving = false,
  onSave: _onSave,
}: QuestionListEditorProps) {
  const isDraft = surveyStatus === 'draft';
  const initialQuestions = useMemo(
    () => normalizeQuestions(questions.map(toEditableQuestion)),
    [questions],
  );
  const {
    questions: draftQuestions,
    isAnyDirty,
    isDirty,
    saveState,
    updateQuestion,
    replaceQuestions,
    discardQuestion,
    saveQuestion,
  } = useQuestionDraft(teamId, surveyId, initialQuestions);

  const [lastSavedAt, setLastSavedAt] = useState<Map<string, Date>>(new Map());

  useEffect(() => {
    setLastSavedAt(new Map());
  }, [questions]);

  useEffect(() => {
    if (!isAnyDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAnyDirty]);

  const validationMessages = useMemo(() => validateQuestions(draftQuestions), [draftQuestions]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const renameQuestionKey = (question: ReplaceSurveyQuestionInput, index: number) => {
    const isAutoGenerated = /^question_\d+$/.test(question.questionKey);
    if (isAutoGenerated && question.title.trim()) {
      return `question_${makeSlug(question.title) || index + 1}`;
    }

    return question.questionKey;
  };

  const syncQuestions = (nextQuestions: ReplaceSurveyQuestionInput[]) => {
    const normalized = normalizeQuestions(nextQuestions).map((question, index) => ({
      ...question,
      questionKey: renameQuestionKey(question, index),
    }));

    replaceQuestions(normalized);
  };

  const addQuestion = () => {
    const nextIndex = draftQuestions.length;
    const nextQuestion = buildDefaultQuestion(nextIndex);
    syncQuestions([...draftQuestions, nextQuestion]);
  };

  const handleQuestionChange = (index: number, nextQuestion: ReplaceSurveyQuestionInput) => {
    const currentQuestion = draftQuestions[index];
    if (!currentQuestion) return;

    const updatedQuestion: ReplaceSurveyQuestionInput = {
      ...nextQuestion,
      displayOrder: index,
      required: nextQuestion.required ?? false,
      description: nextQuestion.description ?? '',
      questionKey: currentQuestion.questionKey,
    };

    updateQuestion(currentQuestion.questionKey, updatedQuestion);
  };

  const removeQuestion = (index: number) => {
    syncQuestions(draftQuestions.filter((_, questionIndex) => questionIndex !== index));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = draftQuestions.findIndex((question) => question.questionKey === active.id);
    const newIndex = draftQuestions.findIndex((question) => question.questionKey === over.id);

    if (oldIndex < 0 || newIndex < 0) return;

    syncQuestions(arrayMove(draftQuestions, oldIndex, newIndex));
  };

  const handleSaveQuestion = async (questionKey: string) => {
    await saveQuestion(questionKey);
    setLastSavedAt((current) => {
      const next = new Map(current);
      next.set(questionKey, new Date());
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle>Question builder</CardTitle>
            <CardDescription>
              Manage the ordered survey schema, type-specific settings, and simple conditional
              visibility rules.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              leftIcon={<Plus size={16} />}
              disabled={!isDraft || isSaving}
              onClick={addQuestion}
            >
              Add question
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {!isDraft ? (
          <div className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50 px-4 py-3 text-sm text-text-sub-600">
            Questions are locked while the survey is not in draft state. Unpublish to edit the
            survey schema again.
          </div>
        ) : null}

        {validationMessages.length > 0 ? (
          <div className="rounded-panel border border-state-warning-base/30 bg-state-warning-base/5 px-4 py-3 text-sm text-text-sub-600">
            <p className="font-medium text-text-strong-950">Fix these before saving</p>
            <ul className="mt-2 space-y-1">
              {validationMessages.map((message) => (
                <li key={message}>• {message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {draftQuestions.length === 0 ? (
          <div className="rounded-panel border border-dashed border-stroke-soft-200 bg-bg-weak-50/50 px-6 py-10 text-center">
            <p className="text-sm font-medium text-text-strong-950">No questions yet</p>
            <p className="mt-1 text-sm text-text-soft-400">
              Start by adding the first question for this survey.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={draftQuestions.map((question) => question.questionKey)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {draftQuestions.map((question, index) => (
                  <SortableQuestionCard
                    key={question.questionKey}
                    question={question}
                    index={index}
                    disabled={!isDraft || isSaving}
                    availableLogicSources={draftQuestions
                      .slice(0, index)
                      .map((item, sourceIndex) => ({
                        label: item.title.trim() || `Question ${sourceIndex + 1}`,
                        value: item.questionKey,
                      }))}
                    onChange={(nextQuestion: ReplaceSurveyQuestionInput) =>
                      handleQuestionChange(index, nextQuestion)
                    }
                    onRemove={() => removeQuestion(index)}
                    isDirty={isDirty(question.questionKey)}
                    saveState={saveState.get(question.questionKey) ?? 'idle'}
                    lastSavedAt={lastSavedAt.get(question.questionKey) ?? null}
                    onSave={() => {
                      void handleSaveQuestion(question.questionKey);
                    }}
                    onDiscard={() => discardQuestion(question.questionKey)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
