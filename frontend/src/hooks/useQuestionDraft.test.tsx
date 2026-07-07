import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as surveyApi from '@/lib/surveys/api';
import type { ReplaceSurveyQuestionInput, SurveyQuestion } from '@/lib/surveys/types';

import { useQuestionDraft } from './useQuestionDraft';

vi.mock('@/lib/surveys/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/surveys/api')>('@/lib/surveys/api');
  return {
    ...actual,
    replaceSurveyQuestions: vi.fn(),
  };
});

function buildEditableQuestion(
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

function buildSurveyQuestion(overrides: Partial<SurveyQuestion> = {}): SurveyQuestion {
  return {
    id: 'survey-question-1',
    surveyId: 'survey-1',
    teamId: 'team-1',
    version: 1,
    questionKey: 'q1',
    type: 'short_text',
    title: 'Question 1',
    required: false,
    displayOrder: 0,
    config: {},
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useQuestionDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with server questions', () => {
    const initial = [buildEditableQuestion()];

    const { result } = renderHook(() => useQuestionDraft('team-1', 'survey-1', initial), {
      wrapper: createWrapper(),
    });

    expect(result.current.questions).toEqual(initial);
    expect(result.current.serverQuestions).toEqual(initial);
    expect(result.current.isAnyDirty).toBe(false);
  });

  it('marks question dirty after updateQuestion', () => {
    const initial = [buildEditableQuestion({ title: 'Old title' })];

    const { result } = renderHook(() => useQuestionDraft('team-1', 'survey-1', initial), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.updateQuestion(
        'q1',
        buildEditableQuestion({ title: 'New title' }),
      );
    });

    expect(result.current.questions[0]?.title).toBe('New title');
    expect(result.current.isDirty('q1')).toBe(true);
    expect(result.current.isAnyDirty).toBe(true);
    expect(result.current.saveState.get('q1')).toBe('idle');
  });

  it('reverts question to server version on discardQuestion', () => {
    const initial = [buildEditableQuestion({ title: 'Server title' })];

    const { result } = renderHook(() => useQuestionDraft('team-1', 'survey-1', initial), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.updateQuestion('q1', buildEditableQuestion({ title: 'Local title' }));
    });

    act(() => {
      result.current.discardQuestion('q1');
    });

    expect(result.current.questions[0]?.title).toBe('Server title');
    expect(result.current.isDirty('q1')).toBe(false);
  });

  it('calls API and updates state on saveQuestion success', async () => {
    vi.mocked(surveyApi.replaceSurveyQuestions).mockResolvedValueOnce([
      buildSurveyQuestion({ title: 'Saved title' }),
    ]);

    const initial = [buildEditableQuestion({ title: 'Old title' })];

    const { result } = renderHook(() => useQuestionDraft('team-1', 'survey-1', initial), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.updateQuestion('q1', buildEditableQuestion({ title: 'Saved title' }));
    });

    await act(async () => {
      await result.current.saveQuestion('q1');
    });

    await waitFor(() => {
      expect(result.current.saveState.get('q1')).toBe('saved');
    });

    expect(result.current.isDirty('q1')).toBe(false);
    expect(result.current.questions[0]?.title).toBe('Saved title');
    expect(surveyApi.replaceSurveyQuestions).toHaveBeenCalledWith('team-1', 'survey-1', {
      questions: [buildEditableQuestion({ title: 'Saved title' })],
    });
  });

  it('sets error state on saveQuestion failure', async () => {
    vi.mocked(surveyApi.replaceSurveyQuestions).mockRejectedValueOnce(new Error('Network error'));

    const initial = [buildEditableQuestion({ title: 'Old title' })];

    const { result } = renderHook(() => useQuestionDraft('team-1', 'survey-1', initial), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.updateQuestion('q1', buildEditableQuestion({ title: 'Changed title' }));
    });

    await act(async () => {
      await expect(result.current.saveQuestion('q1')).rejects.toThrow('Network error');
    });

    await waitFor(() => {
      expect(result.current.saveState.get('q1')).toBe('error');
    });

    expect(result.current.isDirty('q1')).toBe(true);
  });
});
