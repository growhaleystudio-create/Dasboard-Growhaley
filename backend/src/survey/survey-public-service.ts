import type { AppError, SubmitSurveyResponseInput } from '@leads-generator/shared';
import type { Pool } from 'pg';
import { withTransaction } from '../db/transaction.js';
import { SurveyRepository } from '../repository/survey-repository.js';
import { SurveyQuestionRepository } from '../repository/survey-question-repository.js';
import { SurveyResponseRepository } from '../repository/survey-response-repository.js';
import { SurveyLogicService } from './survey-logic-service.js';

function notFound(message: string): AppError {
  return { code: 'NOT_FOUND', message };
}

function conflict(message: string): AppError {
  return { code: 'CONFLICT', message };
}

export class SurveyPublicService {
  constructor(
    private readonly pool: Pool,
    private readonly logic: SurveyLogicService,
  ) {}

  async getBySlug(slug: string) {
    const surveys = new SurveyRepository(this.pool);
    const survey = await surveys.findByPublicSlug(slug);
    if (!survey || survey.status !== 'published') throw notFound('Survey not found');
    if (survey.closedAt) throw conflict('Survey is closed');
    const questions = await new SurveyQuestionRepository(this.pool).listForSurvey(survey.teamId, survey.id, survey.currentVersion);
    return {
      survey: {
        id: survey.id,
        title: survey.title,
        description: survey.description,
        projectGoal: survey.projectGoal,
        status: survey.status,
        publicSlug: survey.publicSlug,
        responseQuota: survey.responseQuota,
        responseCount: survey.responseCount,
      },
      questions,
    };
  }

  async submitBySlug(slug: string, input: SubmitSurveyResponseInput) {
    return withTransaction(this.pool, async (tx) => {
      const surveys = new SurveyRepository(tx);
      const survey = await surveys.findByPublicSlug(slug);
      if (!survey || survey.status !== 'published') throw notFound('Survey not found');
      const locked = await surveys.lockById(survey.teamId, survey.id);
      if (!locked || locked.status !== 'published') throw conflict('Survey is not available');
      if (locked.closedAt) throw conflict('Survey is closed');
      if (locked.responseQuota !== undefined && locked.responseCount >= locked.responseQuota) {
        throw conflict('Survey quota reached');
      }
      const questionsRepo = new SurveyQuestionRepository(tx);
      const responseRepo = new SurveyResponseRepository(tx);
      const questions = await questionsRepo.listForSurvey(locked.teamId, locked.id, locked.currentVersion);
      const sanitizedAnswers = this.logic.sanitizeAndValidateAnswers(questions, input.answers);
      const response = await responseRepo.insertCompleted(locked.teamId, locked.id, locked.currentVersion, sanitizedAnswers, input.metadata ?? {});
      await responseRepo.insertAnswerRows(locked.teamId, locked.id, response.id, questions, sanitizedAnswers);
      const updated = await surveys.incrementResponseCount(locked.teamId, locked.id);
      if (updated?.responseQuota !== undefined && updated.responseCount >= updated.responseQuota) {
        await surveys.setStatus(locked.teamId, locked.id, 'closed', { close: true });
      }
      return { responseId: response.id, status: response.status };
    });
  }
}
