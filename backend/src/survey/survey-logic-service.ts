import z from 'zod';
import type {
  AppError,
  ReplaceSurveyQuestionInput,
  SurveyAnswerValue,
  SurveyLogicCondition,
  SurveyQuestion,
} from '@leads-generator/shared';

const ChoiceConfigSchema = z.object({
  options: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
  randomizeOptions: z.boolean().optional(),
});

const LinearScaleConfigSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().optional(),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
});

const MatrixConfigSchema = z.object({
  rows: z.array(z.object({ key: z.string(), label: z.string() })).min(1),
  columns: z
    .array(z.object({ key: z.string(), label: z.string(), value: z.number().optional() }))
    .min(1),
});

function validationError(message: string): Error & AppError {
  return Object.assign(new Error(message), {
    code: 'VALIDATION' as const,
    messages: [message],
  });
}

export class SurveyLogicService {
  validateQuestionInputs(questions: ReplaceSurveyQuestionInput[]): void {
    const keys = new Set<string>();
    for (const question of questions) {
      if (keys.has(question.questionKey)) {
        throw validationError(`Duplicate questionKey: ${question.questionKey}`);
      }
      keys.add(question.questionKey);
      if (!question.title.trim()) {
        throw validationError(`Question ${question.questionKey} title is required`);
      }
      if (
        question.type === 'multiple_choice' ||
        question.type === 'checkboxes' ||
        question.type === 'dropdown'
      ) {
        const parsed = ChoiceConfigSchema.safeParse(question.config);
        if (!parsed.success)
          throw validationError(`Question ${question.questionKey} requires non-empty options`);
      }
      if (question.type === 'linear_scale') {
        const parsed = LinearScaleConfigSchema.safeParse(question.config);
        if (!parsed.success || parsed.data.min >= parsed.data.max) {
          throw validationError(
            `Question ${question.questionKey} requires valid linear scale range`,
          );
        }
      }
      if (question.type === 'matrix') {
        const parsed = MatrixConfigSchema.safeParse(question.config);
        if (!parsed.success)
          throw validationError(`Question ${question.questionKey} requires rows and columns`);
      }
    }
  }

  evaluateVisibility(
    question: SurveyQuestion,
    answers: Record<string, SurveyAnswerValue>,
  ): boolean {
    if (!question.logic) return true;
    const results = question.logic.conditions.map((condition) =>
      this.evaluateCondition(condition, answers[condition.sourceQuestionKey] ?? null),
    );
    return question.logic.match === 'all' ? results.every(Boolean) : results.some(Boolean);
  }

  private evaluateCondition(
    condition: SurveyLogicCondition,
    sourceValue: SurveyAnswerValue,
  ): boolean {
    switch (condition.operator) {
      case 'eq':
        return sourceValue === (condition.value ?? null);
      case 'neq':
        return sourceValue !== (condition.value ?? null);
      case 'includes':
        return Array.isArray(sourceValue) && typeof condition.value === 'string'
          ? sourceValue.includes(condition.value)
          : false;
      case 'not_includes':
        return Array.isArray(sourceValue) && typeof condition.value === 'string'
          ? !sourceValue.includes(condition.value)
          : true;
      case 'gt':
        return typeof sourceValue === 'number' && typeof condition.value === 'number'
          ? sourceValue > condition.value
          : false;
      case 'gte':
        return typeof sourceValue === 'number' && typeof condition.value === 'number'
          ? sourceValue >= condition.value
          : false;
      case 'lt':
        return typeof sourceValue === 'number' && typeof condition.value === 'number'
          ? sourceValue < condition.value
          : false;
      case 'lte':
        return typeof sourceValue === 'number' && typeof condition.value === 'number'
          ? sourceValue <= condition.value
          : false;
      case 'between':
        return typeof sourceValue === 'number'
          ? sourceValue >= (condition.range?.min ?? Number.NEGATIVE_INFINITY) &&
              sourceValue <= (condition.range?.max ?? Number.POSITIVE_INFINITY)
          : false;
      default:
        return false;
    }
  }

  sanitizeAndValidateAnswers(
    questions: SurveyQuestion[],
    answers: Record<string, SurveyAnswerValue>,
  ): Record<string, SurveyAnswerValue> {
    const sanitized: Record<string, SurveyAnswerValue> = {};
    for (const question of questions) {
      const visible = this.evaluateVisibility(question, answers);
      const answer = answers[question.questionKey];
      if (!visible) continue;
      if (question.required && (answer === undefined || answer === null || answer === '')) {
        throw validationError(`Question ${question.questionKey} is required`);
      }
      if (answer === undefined || answer === null) continue;
      this.validateAnswerType(question, answer);
      sanitized[question.questionKey] = answer;
    }
    return sanitized;
  }

  private validateAnswerType(question: SurveyQuestion, answer: SurveyAnswerValue): void {
    if (question.type === 'short_text' || question.type === 'long_text') {
      if (typeof answer !== 'string')
        throw validationError(`Question ${question.questionKey} expects text`);
      return;
    }

    if (question.type === 'multiple_choice' || question.type === 'dropdown') {
      if (typeof answer !== 'string')
        throw validationError(`Question ${question.questionKey} expects a string option`);
      const parsed = ChoiceConfigSchema.parse(question.config);
      const options = parsed.options.map((option) => option.value);
      if (!options.includes(answer))
        throw validationError(`Question ${question.questionKey} has invalid option`);
      return;
    }

    if (question.type === 'checkboxes') {
      if (!Array.isArray(answer) || !answer.every((item) => typeof item === 'string')) {
        throw validationError(`Question ${question.questionKey} expects an array of strings`);
      }
      const parsed = ChoiceConfigSchema.parse(question.config);
      const options = parsed.options.map((option) => option.value);
      if (answer.some((item) => !options.includes(item))) {
        throw validationError(`Question ${question.questionKey} has invalid checkbox option`);
      }
      return;
    }

    if (question.type === 'linear_scale') {
      if (typeof answer !== 'number')
        throw validationError(`Question ${question.questionKey} expects a number`);
      const parsed = LinearScaleConfigSchema.parse(question.config);
      if (answer < parsed.min || answer > parsed.max) {
        throw validationError(`Question ${question.questionKey} is out of range`);
      }
      return;
    }

    if (question.type === 'matrix') {
      if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
        throw validationError(`Question ${question.questionKey} expects a matrix object`);
      }
      const parsed = MatrixConfigSchema.parse(question.config);
      const rowKeys = new Set(parsed.rows.map((row) => row.key));
      for (const [rowKey, value] of Object.entries(answer)) {
        if (!rowKeys.has(rowKey))
          throw validationError(`Question ${question.questionKey} has invalid matrix row`);
        if (
          !(
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            value === null
          )
        ) {
          throw validationError(`Question ${question.questionKey} has invalid matrix value`);
        }
      }
    }
  }
}
