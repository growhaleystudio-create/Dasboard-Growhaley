'use client';

import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  GitBranch,
  GripVertical,
  ListChecks,
  Plus,
  Scale,
} from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { QuestionCardFooter } from './QuestionCardFooter';
import type {
  ChoiceQuestionConfig,
  LinearScaleQuestionConfig,
  MatrixQuestionConfig,
  ReplaceSurveyQuestionInput,
  SurveyLogicCondition,
  SurveyLogicGroup,
  SurveyQuestionType,
} from '@/lib/surveys/types';

const QUESTION_TYPE_OPTIONS: { label: string; value: SurveyQuestionType }[] = [
  { label: 'Short text', value: 'short_text' },
  { label: 'Long text', value: 'long_text' },
  { label: 'Multiple choice', value: 'multiple_choice' },
  { label: 'Checkboxes', value: 'checkboxes' },
  { label: 'Dropdown', value: 'dropdown' },
  { label: 'Linear scale', value: 'linear_scale' },
  { label: 'Matrix', value: 'matrix' },
];

const LOGIC_OPERATOR_OPTIONS: { label: string; value: SurveyLogicCondition['operator'] }[] = [
  { label: 'Equals', value: 'eq' },
  { label: 'Not equals', value: 'neq' },
  { label: 'Includes', value: 'includes' },
  { label: 'Does not include', value: 'not_includes' },
  { label: 'Greater than', value: 'gt' },
  { label: 'Greater or equal', value: 'gte' },
  { label: 'Less than', value: 'lt' },
  { label: 'Less or equal', value: 'lte' },
  { label: 'Between', value: 'between' },
];

const LOGIC_MATCH_OPTIONS: { label: string; value: 'all' | 'any' }[] = [
  { label: 'Match all rules', value: 'all' },
  { label: 'Match any rule', value: 'any' },
];

interface QuestionEditorCardProps {
  question: ReplaceSurveyQuestionInput;
  index: number;
  disabled?: boolean;
  availableLogicSources: { label: string; value: string }[];
  onChange: (question: ReplaceSurveyQuestionInput) => void;
  onRemove: () => void;
  isDirty?: boolean;
  saveState?: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt?: Date | null;
  onSave?: () => void;
  onDiscard?: () => void;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
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
      return { options: [{ value: 'option_1', label: 'Option 1' }] } satisfies ChoiceQuestionConfig;
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
    default:
      return {};
  }
}

function setScaleStep(config: LinearScaleQuestionConfig, raw: string): LinearScaleQuestionConfig {
  if (!raw.trim()) {
    const { step: _step, ...rest } = config;
    return rest;
  }
  return { ...config, step: Number(raw) };
}

function setMatrixColumnValue(
  config: MatrixQuestionConfig,
  columnIndex: number,
  raw: string,
): MatrixQuestionConfig {
  return {
    ...config,
    columns: config.columns.map((column, idx) => {
      if (idx !== columnIndex) return column;
      if (!raw.trim()) {
        const { value: _value, ...rest } = column;
        return rest;
      }
      return { ...column, value: Number(raw) };
    }),
  };
}

function buildEnabledLogic(sourceQuestionKey: string): SurveyLogicGroup {
  return {
    effect: 'show',
    match: 'all',
    conditions: [{ sourceQuestionKey, operator: 'eq', value: '' }],
  };
}

export function QuestionEditorCard({
  question,
  index,
  disabled = false,
  availableLogicSources,
  onChange,
  onRemove,
  isDirty = false,
  saveState = 'idle',
  lastSavedAt = null,
  onSave,
  onDiscard,
  dragHandleProps = {},
}: QuestionEditorCardProps) {
  const [expanded, setExpanded] = useState(true);

  const choiceConfig =
    question.type === 'multiple_choice' ||
    question.type === 'checkboxes' ||
    question.type === 'dropdown'
      ? (question.config as ChoiceQuestionConfig)
      : null;
  const scaleConfig =
    question.type === 'linear_scale' ? (question.config as LinearScaleQuestionConfig) : null;
  const matrixConfig =
    question.type === 'matrix' ? (question.config as MatrixQuestionConfig) : null;

  const keySuggestion = useMemo(() => {
    if (question.questionKey.startsWith('q_') && question.title.trim()) {
      const slug = makeSlug(question.title);
      return slug ? `q_${slug}` : question.questionKey;
    }
    return question.questionKey;
  }, [question.questionKey, question.title]);

  const update = (nextQuestion: ReplaceSurveyQuestionInput) => onChange(nextQuestion);

  const updateLogic = (nextLogic?: SurveyLogicGroup) => {
    if (nextLogic) return update({ ...question, logic: nextLogic });
    const { logic: _logic, ...rest } = question;
    return update(rest);
  };

  const updateLogicCondition = (conditionIndex: number, nextCondition: SurveyLogicCondition) => {
    if (!question.logic) return;
    updateLogic({
      ...question.logic,
      conditions: question.logic.conditions.map((condition, idx) =>
        idx === conditionIndex ? nextCondition : condition,
      ),
    });
  };

  const removeLogicCondition = (conditionIndex: number) => {
    if (!question.logic) return;
    const nextConditions = question.logic.conditions.filter((_, idx) => idx !== conditionIndex);
    if (nextConditions.length === 0) return updateLogic(undefined);
    updateLogic({ ...question.logic, conditions: nextConditions });
  };

  return (
    <Card>
      <CardHeader className="gap-4 border-b border-stroke-soft-200 bg-bg-weak-50/60 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              className="mt-1 h-auto cursor-grab p-1 text-text-soft-400 active:cursor-grabbing hover:bg-transparent hover:text-text-strong-950"
              aria-label={`Drag to reorder question ${index + 1}`}
              {...dragHandleProps}
            >
              <GripVertical size={20} />
            </Button>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Question {index + 1}</CardTitle>
                {isDirty && saveState === 'idle' ? (
                  <Badge variant="warning" showDot>
                    Unsaved
                  </Badge>
                ) : null}
              </div>
              <CardDescription>
                <span className="font-medium text-text-strong-950">{question.questionKey}</span>
                <span> · {question.type}</span>
                {question.required ? <span> · Required</span> : null}
                {keySuggestion !== question.questionKey ? (
                  <span className="ml-2 text-text-soft-400">Suggested: {keySuggestion}</span>
                ) : null}
              </CardDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            aria-label={`Toggle question ${index + 1}`}
            className="flex items-center gap-1.5 text-sm font-medium text-text-sub-600 transition-colors hover:text-text-strong-950 shrink-0"
          >
            <ChevronDown
              size={16}
              className={`shrink-0 transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}
            />
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </CardHeader>

      {expanded ? (
        <>
          <CardContent className="space-y-6 pt-6">
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-text-strong-950">Content</h3>
              </div>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-text-strong-950"
                  htmlFor={`question-title-${index}`}
                >
                  Question title
                </label>
                <Input
                  id={`question-title-${index}`}
                  aria-label="Question title"
                  value={question.title}
                  disabled={disabled}
                  onChange={(event) => update({ ...question, title: event.target.value })}
                  placeholder="What do you want to ask?"
                />
              </div>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-text-strong-950"
                  htmlFor={`question-description-${index}`}
                >
                  Description
                </label>
                <Textarea
                  id={`question-description-${index}`}
                  value={question.description ?? ''}
                  disabled={disabled}
                  onChange={(event) => update({ ...question, description: event.target.value })}
                  className="min-h-24"
                  placeholder="Optional helper text or clarification for respondents"
                />
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-text-strong-950">Type & settings</h3>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-strong-950">Question type</label>
                <Select
                  value={question.type}
                  disabled={disabled}
                  options={QUESTION_TYPE_OPTIONS}
                  onChange={(event) => {
                    const nextType = event.target.value as SurveyQuestionType;
                    update({ ...question, type: nextType, config: getDefaultConfig(nextType) });
                  }}
                />
              </div>
              <div className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-text-strong-950">Required response</p>
                    <p className="text-xs text-text-soft-400">
                      Respondents must answer this question when it is visible.
                    </p>
                  </div>
                  <Switch
                    checked={question.required ?? false}
                    disabled={disabled}
                    onCheckedChange={(checked) => update({ ...question, required: checked })}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-text-strong-950">Answer config</h3>
              </div>
              {choiceConfig ? (
                <div className="space-y-4 rounded-panel border border-stroke-soft-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-text-strong-950">Answer options</p>
                    <Button
                      variant="outline"
                      size="md"
                      leftIcon={<Plus size={14} />}
                      disabled={disabled}
                      onClick={() => {
                        const nextIndex = choiceConfig.options.length + 1;
                        update({
                          ...question,
                          config: {
                            ...choiceConfig,
                            options: [
                              ...choiceConfig.options,
                              { value: `option_${nextIndex}`, label: `Option ${nextIndex}` },
                            ],
                          },
                        });
                      }}
                    >
                      Add option
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {choiceConfig.options.map((option, optionIndex) => (
                      <div
                        key={`${question.questionKey}-option-${optionIndex}`}
                        className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]"
                      >
                        <Input
                          value={option.label}
                          disabled={disabled}
                          onChange={(event) => {
                            const nextOptions = choiceConfig.options.map((item, idx) =>
                              idx === optionIndex
                                ? {
                                    ...item,
                                    label: event.target.value,
                                    value: item.value || `option_${optionIndex + 1}`,
                                  }
                                : item,
                            );
                            update({
                              ...question,
                              config: { ...choiceConfig, options: nextOptions },
                            });
                          }}
                          placeholder="Option label"
                        />
                        <Button
                          variant="ghost"
                          size="md"
                          disabled={disabled || choiceConfig.options.length === 1}
                          onClick={() =>
                            update({
                              ...question,
                              config: {
                                ...choiceConfig,
                                options: choiceConfig.options.filter(
                                  (_, idx) => idx !== optionIndex,
                                ),
                              },
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {scaleConfig ? (
                <div className="space-y-4 rounded-panel border border-stroke-soft-200 p-4">
                  <div className="flex items-center gap-2">
                    <Scale size={16} className="text-text-sub-600" />
                    <p className="text-sm font-medium text-text-strong-950">
                      Linear scale settings
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input
                      type="number"
                      value={String(scaleConfig.min)}
                      disabled={disabled}
                      onChange={(event) =>
                        update({
                          ...question,
                          config: { ...scaleConfig, min: Number(event.target.value || 0) },
                        })
                      }
                      placeholder="Min"
                    />
                    <Input
                      type="number"
                      value={String(scaleConfig.max)}
                      disabled={disabled}
                      onChange={(event) =>
                        update({
                          ...question,
                          config: { ...scaleConfig, max: Number(event.target.value || 0) },
                        })
                      }
                      placeholder="Max"
                    />
                    <Input
                      type="number"
                      value={scaleConfig.step !== undefined ? String(scaleConfig.step) : ''}
                      disabled={disabled}
                      onChange={(event) =>
                        update({
                          ...question,
                          config: setScaleStep(scaleConfig, event.target.value),
                        })
                      }
                      placeholder="Step"
                    />
                  </div>
                </div>
              ) : null}
              {matrixConfig ? (
                <div className="space-y-4 rounded-panel border border-stroke-soft-200 p-4">
                  <div className="flex items-center gap-2">
                    <ListChecks size={16} className="text-text-sub-600" />
                    <p className="text-sm font-medium text-text-strong-950">Matrix settings</p>
                  </div>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-text-strong-950">Rows</p>
                        <Button
                          variant="outline"
                          size="md"
                          disabled={disabled}
                          onClick={() => {
                            const nextIndex = matrixConfig.rows.length + 1;
                            update({
                              ...question,
                              config: {
                                ...matrixConfig,
                                rows: [
                                  ...matrixConfig.rows,
                                  { key: `row_${nextIndex}`, label: `Statement ${nextIndex}` },
                                ],
                              },
                            });
                          }}
                        >
                          Add row
                        </Button>
                      </div>
                      {matrixConfig.rows.map((row, rowIndex) => (
                        <div
                          key={`${question.questionKey}-row-${rowIndex}`}
                          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
                        >
                          <Input
                            value={row.label}
                            disabled={disabled}
                            onChange={(event) => {
                              const nextRows = matrixConfig.rows.map((item, idx) =>
                                idx === rowIndex
                                  ? {
                                      ...item,
                                      label: event.target.value,
                                      key: makeSlug(event.target.value) || item.key,
                                    }
                                  : item,
                              );
                              update({ ...question, config: { ...matrixConfig, rows: nextRows } });
                            }}
                            placeholder="Row label"
                          />
                          <Button
                            variant="ghost"
                            size="md"
                            disabled={disabled || matrixConfig.rows.length === 1}
                            onClick={() =>
                              update({
                                ...question,
                                config: {
                                  ...matrixConfig,
                                  rows: matrixConfig.rows.filter((_, idx) => idx !== rowIndex),
                                },
                              })
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-text-strong-950">Columns</p>
                        <Button
                          variant="outline"
                          size="md"
                          disabled={disabled}
                          onClick={() => {
                            const nextIndex = matrixConfig.columns.length + 1;
                            update({
                              ...question,
                              config: {
                                ...matrixConfig,
                                columns: [
                                  ...matrixConfig.columns,
                                  {
                                    key: `col_${nextIndex}`,
                                    label: `Choice ${nextIndex}`,
                                    value: nextIndex,
                                  },
                                ],
                              },
                            });
                          }}
                        >
                          Add column
                        </Button>
                      </div>
                      {matrixConfig.columns.map((column, columnIndex) => (
                        <div
                          key={`${question.questionKey}-column-${columnIndex}`}
                          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_auto]"
                        >
                          <Input
                            value={column.label}
                            disabled={disabled}
                            onChange={(event) => {
                              const nextColumns = matrixConfig.columns.map((item, idx) =>
                                idx === columnIndex
                                  ? {
                                      ...item,
                                      label: event.target.value,
                                      key: makeSlug(event.target.value) || item.key,
                                    }
                                  : item,
                              );
                              update({
                                ...question,
                                config: { ...matrixConfig, columns: nextColumns },
                              });
                            }}
                            placeholder="Column label"
                          />
                          <Input
                            type="number"
                            value={column.value !== undefined ? String(column.value) : ''}
                            disabled={disabled}
                            onChange={(event) =>
                              update({
                                ...question,
                                config: setMatrixColumnValue(
                                  matrixConfig,
                                  columnIndex,
                                  event.target.value,
                                ),
                              })
                            }
                            placeholder="Value"
                          />
                          <Button
                            variant="ghost"
                            size="md"
                            disabled={disabled || matrixConfig.columns.length === 1}
                            onClick={() =>
                              update({
                                ...question,
                                config: {
                                  ...matrixConfig,
                                  columns: matrixConfig.columns.filter(
                                    (_, idx) => idx !== columnIndex,
                                  ),
                                },
                              })
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-text-strong-950">Conditional logic</h3>
              </div>
              <div className="space-y-4 rounded-panel border border-stroke-soft-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <GitBranch size={16} className="text-text-sub-600" />
                    <div>
                      <p className="text-sm font-medium text-text-strong-950">
                        Conditional visibility
                      </p>
                      <p className="text-xs text-text-soft-400">
                        Show this question only when earlier answers match selected rules.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={!!question.logic}
                    disabled={disabled || availableLogicSources.length === 0}
                    onCheckedChange={(checked) => {
                      if (!checked) return updateLogic(undefined);
                      const firstSource = availableLogicSources[0]?.value;
                      if (!firstSource) return;
                      updateLogic(buildEnabledLogic(firstSource));
                    }}
                  />
                </div>
                {availableLogicSources.length === 0 ? (
                  <p className="text-sm text-text-soft-400">
                    Add at least one earlier question before enabling conditional logic on this
                    item.
                  </p>
                ) : null}
                {question.logic ? (
                  <div className="space-y-4">
                    <div className="max-w-64 space-y-2">
                      <label className="text-sm font-medium text-text-strong-950">
                        Rule matching
                      </label>
                      <Select
                        value={question.logic.match}
                        disabled={disabled}
                        options={LOGIC_MATCH_OPTIONS}
                        onChange={(event) =>
                          updateLogic({
                            ...question.logic!,
                            match: event.target.value as 'all' | 'any',
                          })
                        }
                      />
                    </div>
                    <div className="space-y-3">
                      {question.logic.conditions.map((condition, conditionIndex) => (
                        <div
                          key={`${question.questionKey}-logic-${conditionIndex}`}
                          className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50/60 p-4"
                        >
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_auto]">
                            <Select
                              value={condition.sourceQuestionKey}
                              disabled={disabled}
                              options={availableLogicSources}
                              onChange={(event) =>
                                updateLogicCondition(conditionIndex, {
                                  ...condition,
                                  sourceQuestionKey: event.target.value,
                                })
                              }
                            />
                            <Select
                              value={condition.operator}
                              disabled={disabled}
                              options={LOGIC_OPERATOR_OPTIONS}
                              onChange={(event) => {
                                const nextOperator = event.target
                                  .value as SurveyLogicCondition['operator'];
                                if (nextOperator === 'between')
                                  return updateLogicCondition(conditionIndex, {
                                    sourceQuestionKey: condition.sourceQuestionKey,
                                    operator: nextOperator,
                                    range: {},
                                  });
                                updateLogicCondition(conditionIndex, {
                                  sourceQuestionKey: condition.sourceQuestionKey,
                                  operator: nextOperator,
                                  value: '',
                                });
                              }}
                            />
                            {condition.operator === 'between' ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Input
                                  type="number"
                                  value={
                                    condition.range?.min !== undefined
                                      ? String(condition.range.min)
                                      : ''
                                  }
                                  disabled={disabled}
                                  onChange={(event) =>
                                    updateLogicCondition(conditionIndex, {
                                      ...condition,
                                      range: {
                                        ...condition.range,
                                        ...(event.target.value.trim()
                                          ? { min: Number(event.target.value) }
                                          : {}),
                                      },
                                    })
                                  }
                                  placeholder="Min"
                                />
                                <Input
                                  type="number"
                                  value={
                                    condition.range?.max !== undefined
                                      ? String(condition.range.max)
                                      : ''
                                  }
                                  disabled={disabled}
                                  onChange={(event) =>
                                    updateLogicCondition(conditionIndex, {
                                      ...condition,
                                      range: {
                                        ...condition.range,
                                        ...(event.target.value.trim()
                                          ? { max: Number(event.target.value) }
                                          : {}),
                                      },
                                    })
                                  }
                                  placeholder="Max"
                                />
                              </div>
                            ) : (
                              <Input
                                value={condition.value !== undefined ? String(condition.value) : ''}
                                disabled={disabled}
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  const numericOperators = new Set<
                                    SurveyLogicCondition['operator']
                                  >(['gt', 'gte', 'lt', 'lte']);
                                  updateLogicCondition(conditionIndex, {
                                    ...condition,
                                    value: numericOperators.has(condition.operator)
                                      ? raw.trim()
                                        ? Number(raw)
                                        : ''
                                      : raw,
                                  });
                                }}
                                placeholder="Expected value"
                              />
                            )}
                            <Button
                              variant="ghost"
                              size="md"
                              disabled={disabled}
                              onClick={() => removeLogicCondition(conditionIndex)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="md"
                      leftIcon={<Plus size={14} />}
                      disabled={disabled || availableLogicSources.length === 0}
                      onClick={() => {
                        if (!question.logic) return;
                        const fallbackSource = availableLogicSources[0]?.value;
                        if (!fallbackSource) return;
                        updateLogic({
                          ...question.logic,
                          conditions: [
                            ...question.logic.conditions,
                            { sourceQuestionKey: fallbackSource, operator: 'eq', value: '' },
                          ],
                        });
                      }}
                    >
                      Add rule
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>
          </CardContent>
          <QuestionCardFooter
            saveState={saveState}
            isDirty={isDirty}
            lastSavedAt={lastSavedAt}
            onSave={onSave ?? (() => undefined)}
            onDiscard={onDiscard ?? (() => undefined)}
            onRemove={onRemove}
            canRemove={!disabled}
          />
        </>
      ) : null}
    </Card>
  );
}
