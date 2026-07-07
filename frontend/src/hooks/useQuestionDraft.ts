import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { replaceSurveyQuestions } from '@/lib/surveys/api';
import { surveyKeys } from '@/lib/surveys/queryKeys';
import type { ReplaceSurveyQuestionInput, SurveyQuestion } from '@/lib/surveys/types';
import { getDirtyQuestions, mergeQuestionChanges } from '@/lib/surveys/questionsDiff';

export type QuestionDraftSaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface UseQuestionDraftResult {
  questions: ReplaceSurveyQuestionInput[];
  serverQuestions: ReplaceSurveyQuestionInput[];
  saveState: Map<string, QuestionDraftSaveState>;
  isDirty: (questionKey: string) => boolean;
  isAnyDirty: boolean;
  updateQuestion: (questionKey: string, nextQuestion: ReplaceSurveyQuestionInput) => void;
  replaceQuestions: (nextQuestions: ReplaceSurveyQuestionInput[]) => void;
  discardQuestion: (questionKey: string) => void;
  saveQuestion: (questionKey: string) => Promise<void>;
}

function toEditableQuestion(question: SurveyQuestion): ReplaceSurveyQuestionInput {
  return {
    questionKey: question.questionKey,
    type: question.type,
    title: question.title,
    required: question.required,
    displayOrder: question.displayOrder,
    config: question.config,
    ...(question.description ? { description: question.description } : {}),
    ...(question.logic ? { logic: question.logic } : {}),
  };
}

export function useQuestionDraft(
  teamId: string,
  surveyId: string,
  initialQuestions: ReplaceSurveyQuestionInput[],
): UseQuestionDraftResult {
  const queryClient = useQueryClient();
  const [questions, setQuestions] = useState(initialQuestions);
  const [saveState, setSaveState] = useState<Map<string, QuestionDraftSaveState>>(new Map());
  const serverQuestionsRef = useRef(initialQuestions);

  const dirtyQuestions = useMemo(
    () => getDirtyQuestions(questions, serverQuestionsRef.current),
    [questions],
  );

  useEffect(() => {
    setQuestions(initialQuestions);
    serverQuestionsRef.current = initialQuestions;
    setSaveState(new Map());
  }, [initialQuestions]);

  const mutation = useMutation({
    mutationFn: (nextQuestions: ReplaceSurveyQuestionInput[]) =>
      replaceSurveyQuestions(teamId, surveyId, { questions: nextQuestions }),
    onSuccess: async (responseQuestions) => {
      const normalizedQuestions = responseQuestions
        .map(toEditableQuestion)
        .sort((left, right) => left.displayOrder - right.displayOrder);

      serverQuestionsRef.current = normalizedQuestions;
      setQuestions(normalizedQuestions);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: surveyKeys.all(teamId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.detail(teamId, surveyId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.analytics(teamId, surveyId) }),
      ]);
    },
  });

  const updateQuestion = useCallback(
    (questionKey: string, nextQuestion: ReplaceSurveyQuestionInput) => {
      setQuestions((current) =>
        current.map((question) => (question.questionKey === questionKey ? nextQuestion : question)),
      );
      setSaveState((current) => {
        const next = new Map(current);
        next.set(questionKey, 'idle');
        return next;
      });
    },
    [],
  );

  const replaceQuestions = useCallback((nextQuestions: ReplaceSurveyQuestionInput[]) => {
    setQuestions(nextQuestions);
    setSaveState(new Map());
  }, []);

  const discardQuestion = useCallback((questionKey: string) => {
    const serverQuestion = serverQuestionsRef.current.find(
      (question) => question.questionKey === questionKey,
    );

    if (!serverQuestion) {
      return;
    }

    setQuestions((current) =>
      current.map((question) => (question.questionKey === questionKey ? serverQuestion : question)),
    );
    setSaveState((current) => {
      const next = new Map(current);
      next.set(questionKey, 'idle');
      return next;
    });
  }, []);

  const saveQuestion = useCallback(
    async (questionKey: string) => {
      const dirtyQuestion = dirtyQuestions.get(questionKey);

      if (!dirtyQuestion) {
        return;
      }

      setSaveState((current) => {
        const next = new Map(current);
        next.set(questionKey, 'saving');
        return next;
      });

      try {
        const nextQuestions = mergeQuestionChanges(
          serverQuestionsRef.current,
          questions,
          new Map([[questionKey, dirtyQuestion]]),
        );
        await mutation.mutateAsync(nextQuestions);
        setSaveState((current) => {
          const next = new Map(current);
          next.set(questionKey, 'saved');
          return next;
        });
      } catch (error) {
        setSaveState((current) => {
          const next = new Map(current);
          next.set(questionKey, 'error');
          return next;
        });
        throw error;
      }
    },
    [dirtyQuestions, mutation, questions],
  );

  const isDirty = useCallback(
    (questionKey: string) => dirtyQuestions.has(questionKey),
    [dirtyQuestions],
  );

  return {
    questions,
    serverQuestions: serverQuestionsRef.current,
    saveState,
    isDirty,
    isAnyDirty: dirtyQuestions.size > 0,
    updateQuestion,
    replaceQuestions,
    discardQuestion,
    saveQuestion,
  };
}
