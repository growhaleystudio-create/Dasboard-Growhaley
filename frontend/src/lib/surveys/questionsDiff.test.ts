import { describe, expect, it } from 'vitest';

import type { ReplaceSurveyQuestionInput } from './types';
import { applyChanges, getDirtyQuestions, mergeQuestionChanges } from './questionsDiff';

function buildQuestion(
  overrides: Partial<ReplaceSurveyQuestionInput> = {},
): ReplaceSurveyQuestionInput {
  return {
    questionKey: 'q1',
    title: 'Question 1',
    type: 'short_text',
    displayOrder: 0,
    config: {},
    ...overrides,
  };
}

describe('getDirtyQuestions', () => {
  it('returns empty map when no changes', () => {
    const original = [buildQuestion()];
    const current = structuredClone(original);

    const dirty = getDirtyQuestions(current, original);

    expect(dirty.size).toBe(0);
  });

  it('detects title change', () => {
    const original = [buildQuestion({ title: 'Old title' })];
    const current = [buildQuestion({ title: 'New title' })];

    const dirty = getDirtyQuestions(current, original);

    expect(dirty.size).toBe(1);
    expect(dirty.has('q1')).toBe(true);
    expect(dirty.get('q1')?.title).toBe('New title');
  });

  it('detects nested config change', () => {
    const original = [
      buildQuestion({
        type: 'multiple_choice',
        config: { options: [{ value: 'a', label: 'Option A' }] },
      }),
    ];
    const current = [
      buildQuestion({
        type: 'multiple_choice',
        config: { options: [{ value: 'b', label: 'Option B' }] },
      }),
    ];

    const dirty = getDirtyQuestions(current, original);

    expect(dirty.size).toBe(1);
    expect(dirty.get('q1')?.config).toEqual({ options: [{ value: 'b', label: 'Option B' }] });
  });

  it('treats reordered array with unchanged question content as clean', () => {
    const original = [
      buildQuestion({ questionKey: 'q1', title: 'Question 1', displayOrder: 0 }),
      buildQuestion({ questionKey: 'q2', title: 'Question 2', displayOrder: 1 }),
    ];
    const current = [
      buildQuestion({ questionKey: 'q2', title: 'Question 2', displayOrder: 1 }),
      buildQuestion({ questionKey: 'q1', title: 'Question 1', displayOrder: 0 }),
    ];

    const dirty = getDirtyQuestions(current, original);

    expect(dirty.size).toBe(0);
  });

  it('marks new questions as dirty', () => {
    const original = [buildQuestion({ questionKey: 'q1' })];
    const current = [
      buildQuestion({ questionKey: 'q1' }),
      buildQuestion({ questionKey: 'q2', title: 'Question 2', displayOrder: 1 }),
    ];

    const dirty = getDirtyQuestions(current, original);

    expect(dirty.size).toBe(1);
    expect(dirty.get('q2')?.title).toBe('Question 2');
  });
});

describe('applyChanges', () => {
  it('replaces dirty questions in original array', () => {
    const original = [
      buildQuestion({ questionKey: 'q1', title: 'Old 1', displayOrder: 0 }),
      buildQuestion({ questionKey: 'q2', title: 'Old 2', displayOrder: 1 }),
    ];
    const changes = new Map<string, ReplaceSurveyQuestionInput>([
      ['q1', buildQuestion({ questionKey: 'q1', title: 'New 1', displayOrder: 0 })],
    ]);

    const result = applyChanges(original, changes);

    expect(result).toHaveLength(2);
    expect(result[0]?.title).toBe('New 1');
    expect(result[1]?.title).toBe('Old 2');
  });

  it('preserves original order', () => {
    const original = [
      buildQuestion({ questionKey: 'q1', title: 'Question 1', displayOrder: 0 }),
      buildQuestion({ questionKey: 'q2', title: 'Question 2', displayOrder: 1 }),
      buildQuestion({ questionKey: 'q3', title: 'Question 3', displayOrder: 2 }),
    ];
    const changes = new Map<string, ReplaceSurveyQuestionInput>([
      ['q2', buildQuestion({ questionKey: 'q2', title: 'Question 2 updated', displayOrder: 1 })],
    ]);

    const result = applyChanges(original, changes);

    expect(result.map((question) => question.questionKey)).toEqual(['q1', 'q2', 'q3']);
    expect(result[1]?.title).toBe('Question 2 updated');
  });
});

describe('mergeQuestionChanges', () => {
  it('keeps newly added questions when saving another question', () => {
    const original = [buildQuestion({ questionKey: 'q1', title: 'Question 1', displayOrder: 0 })];
    const current = [
      buildQuestion({ questionKey: 'q1', title: 'Question 1 updated', displayOrder: 0 }),
      buildQuestion({ questionKey: 'q2', title: 'Question 2', displayOrder: 1 }),
    ];
    const changes = new Map<string, ReplaceSurveyQuestionInput>([['q1', current[0]!]]);

    const result = mergeQuestionChanges(original, current, changes);

    expect(result.map((question) => question.questionKey)).toEqual(['q1', 'q2']);
  });

  it('removes deleted questions from current draft when save succeeds', () => {
    const original = [
      buildQuestion({ questionKey: 'q1', title: 'Question 1', displayOrder: 0 }),
      buildQuestion({ questionKey: 'q2', title: 'Question 2', displayOrder: 1 }),
    ];
    const current = [
      buildQuestion({ questionKey: 'q1', title: 'Question 1 updated', displayOrder: 0 }),
    ];
    const changes = new Map<string, ReplaceSurveyQuestionInput>([['q1', current[0]!]]);

    const result = mergeQuestionChanges(original, current, changes);

    expect(result.map((question) => question.questionKey)).toEqual(['q1']);
  });
});
