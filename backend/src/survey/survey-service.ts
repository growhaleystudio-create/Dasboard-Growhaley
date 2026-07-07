import { randomUUID } from 'crypto';
import type { AppError, CreateSurveyInput, ReplaceSurveyQuestionsInput, Survey, UpdateSurveyInput } from '@leads-generator/shared';
import type { AuditLog } from '../privacy/audit-log.js';
import { SurveyRepository } from '../repository/survey-repository.js';
import { SurveyQuestionRepository } from '../repository/survey-question-repository.js';
import { SurveyLogicService } from './survey-logic-service.js';

function notFound(message: string): AppError {
  return { code: 'NOT_FOUND', message };
}

function conflict(message: string): AppError {
  return { code: 'CONFLICT', message };
}

export class SurveyService {
  constructor(
    private readonly surveys: SurveyRepository,
    private readonly questions: SurveyQuestionRepository,
    private readonly logic: SurveyLogicService,
    private readonly audit: Pick<AuditLog, 'record'>,
  ) {}

  async create(teamId: string, userId: string, input: CreateSurveyInput): Promise<Survey> {
    const survey = await this.surveys.create(teamId, userId, input);
    await this.audit.record({ teamId, actorId: userId, action: 'create', objectType: 'survey', objectId: survey.id });
    return survey;
  }

  list(teamId: string): Promise<Survey[]> {
    return this.surveys.listForTeam(teamId);
  }

  async get(teamId: string, surveyId: string) {
    const survey = await this.surveys.findById(teamId, surveyId);
    if (!survey) throw notFound('Survey not found');
    const questions = await this.questions.listForSurvey(teamId, surveyId, survey.currentVersion);
    return { survey, questions };
  }

  async update(teamId: string, surveyId: string, userId: string, input: UpdateSurveyInput): Promise<Survey> {
    const existing = await this.surveys.findById(teamId, surveyId);
    if (!existing) throw notFound('Survey not found');
    if (existing.status !== 'draft') throw conflict('Only draft surveys can be updated');
    const updated = await this.surveys.update(teamId, surveyId, userId, input);
    await this.audit.record({ teamId, actorId: userId, action: 'update', objectType: 'survey', objectId: surveyId });
    return updated!;
  }

  async replaceQuestions(teamId: string, surveyId: string, userId: string, input: ReplaceSurveyQuestionsInput) {
    const existing = await this.surveys.findById(teamId, surveyId);
    if (!existing) throw notFound('Survey not found');
    if (existing.status !== 'draft') throw conflict('Only draft surveys can be edited');
    this.logic.validateQuestionInputs(input.questions);
    const questions = await this.questions.replaceForSurvey(teamId, surveyId, existing.currentVersion, input.questions);
    await this.audit.record({ teamId, actorId: userId, action: 'update', objectType: 'survey', objectId: surveyId, metadata: { scope: 'questions_replaced', count: questions.length } });
    return questions;
  }

  async publish(teamId: string, surveyId: string, userId: string): Promise<Survey> {
    const existing = await this.surveys.findById(teamId, surveyId);
    if (!existing) throw notFound('Survey not found');
    if (existing.status !== 'draft') throw conflict('Only draft surveys can be published');
    const questions = await this.questions.listForSurvey(teamId, surveyId, existing.currentVersion);
    if (questions.length === 0) throw conflict('Survey must have at least one question before publish');
    const slug = `${surveyId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
    const updated = await this.surveys.setStatus(teamId, surveyId, 'published', { publicSlug: slug, updatedBy: userId });
    await this.audit.record({ teamId, actorId: userId, action: 'update', objectType: 'survey', objectId: surveyId, metadata: { status: 'published' } });
    return updated!;
  }

  async unpublish(teamId: string, surveyId: string, userId: string): Promise<Survey> {
    const existing = await this.surveys.findById(teamId, surveyId);
    if (!existing) throw notFound('Survey not found');
    const updated = await this.surveys.setStatus(teamId, surveyId, 'draft', { updatedBy: userId });
    await this.audit.record({ teamId, actorId: userId, action: 'update', objectType: 'survey', objectId: surveyId, metadata: { status: 'draft' } });
    return updated!;
  }

  async close(teamId: string, surveyId: string, userId: string): Promise<Survey> {
    const existing = await this.surveys.findById(teamId, surveyId);
    if (!existing) throw notFound('Survey not found');
    const updated = await this.surveys.setStatus(teamId, surveyId, 'closed', { updatedBy: userId, close: true });
    await this.audit.record({ teamId, actorId: userId, action: 'update', objectType: 'survey', objectId: surveyId, metadata: { status: 'closed' } });
    return updated!;
  }
}
