import type { ReplaceSurveyQuestionInput } from './types';

function stableSerialize(question: ReplaceSurveyQuestionInput): string {
  return JSON.stringify(question);
}

export function getDirtyQuestions(
  current: ReplaceSurveyQuestionInput[],
  original: ReplaceSurveyQuestionInput[],
): Map<string, ReplaceSurveyQuestionInput> {
  const originalByKey = new Map(original.map((question) => [question.questionKey, question]));
  const dirtyQuestions = new Map<string, ReplaceSurveyQuestionInput>();

  for (const question of current) {
    const originalQuestion = originalByKey.get(question.questionKey);

    if (!originalQuestion) {
      dirtyQuestions.set(question.questionKey, question);
      continue;
    }

    if (stableSerialize(question) !== stableSerialize(originalQuestion)) {
      dirtyQuestions.set(question.questionKey, question);
    }
  }

  return dirtyQuestions;
}

export function applyChanges(
  original: ReplaceSurveyQuestionInput[],
  changes: Map<string, ReplaceSurveyQuestionInput>,
): ReplaceSurveyQuestionInput[] {
  const nextByKey = new Map(changes);

  return original.map((question) => nextByKey.get(question.questionKey) ?? question);
}

export function mergeQuestionChanges(
  original: ReplaceSurveyQuestionInput[],
  current: ReplaceSurveyQuestionInput[],
  changes: Map<string, ReplaceSurveyQuestionInput>,
): ReplaceSurveyQuestionInput[] {
  const nextByOriginalKey = new Map(original.map((question) => [question.questionKey, question]));
  const dirtyOriginalKeys = new Set(changes.keys());

  return current.filter((question) => {
    const originalQuestion = nextByOriginalKey.get(question.questionKey);
    if (!originalQuestion) return true;
    return !dirtyOriginalKeys.has(question.questionKey) || changes.has(question.questionKey);
  });
}
