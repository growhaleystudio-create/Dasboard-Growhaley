import { err, ok, type Result, type SurveyAnswerValue } from '@leads-generator/shared';
import type { SurveyRepository } from '../repository/survey-repository.js';
import type { SurveyQuestionRepository } from '../repository/survey-question-repository.js';
import type { SurveyResponseRepository } from '../repository/survey-response-repository.js';
import type { AuditLog } from '../privacy/audit-log.js';
import { toCsv } from '../privacy/csv.js';

interface SurveyExportServiceDeps {
  surveys: SurveyRepository;
  questions: SurveyQuestionRepository;
  responses: SurveyResponseRepository;
  audit: Pick<AuditLog, 'record'>;
}

export interface SurveyJsonExportArtifact {
  filename: string;
  contentType: 'application/json';
  body: string;
}

export interface SurveyCsvExportArtifact {
  filename: string;
  contentType: 'text/csv';
  body: string;
}

function normalizeFileNamePart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'survey'
  );
}

function flattenAnswer(questionKey: string, value: SurveyAnswerValue): Record<string, string> {
  if (value === null || value === undefined) {
    return { [`q_${questionKey}`]: '' };
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { [`q_${questionKey}`]: String(value) };
  }
  if (Array.isArray(value)) {
    return { [`q_${questionKey}`]: value.map((item) => String(item)).join('|') };
  }
  const result: Record<string, string> = {};
  for (const [rowKey, rowValue] of Object.entries(value)) {
    result[`q_${questionKey}__${rowKey}`] = rowValue === null ? '' : String(rowValue);
  }
  return result;
}

export class SurveyExportService {
  constructor(private readonly deps: SurveyExportServiceDeps) {}

  async exportJson(
    teamId: string,
    surveyId: string,
    actorId: string,
  ): Promise<Result<SurveyJsonExportArtifact>> {
    const survey = await this.deps.surveys.findById(teamId, surveyId);
    if (!survey) {
      return err({ code: 'NOT_FOUND', message: 'Survey not found' });
    }
    const questions = await this.deps.questions.listForSurvey(
      teamId,
      surveyId,
      survey.currentVersion,
    );
    const responses = await this.deps.responses.listForSurvey(teamId, surveyId);

    const filename = `${normalizeFileNamePart(survey.title)}-${survey.id}-export.json`;
    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        survey,
        questions,
        responses,
      },
      null,
      2,
    );

    await this.deps.audit.record({
      teamId,
      actorId,
      action: 'survey_export',
      objectType: 'survey_export_json',
      objectId: filename,
      metadata: { surveyId },
    });

    return ok({ filename, contentType: 'application/json', body });
  }

  async exportCsv(
    teamId: string,
    surveyId: string,
    actorId: string,
  ): Promise<Result<SurveyCsvExportArtifact>> {
    const survey = await this.deps.surveys.findById(teamId, surveyId);
    if (!survey) {
      return err({ code: 'NOT_FOUND', message: 'Survey not found' });
    }
    const questions = await this.deps.questions.listForSurvey(
      teamId,
      surveyId,
      survey.currentVersion,
    );
    const responses = await this.deps.responses.listForSurvey(teamId, surveyId);

    const headers = ['response_id', 'submitted_at', 'status'];
    const dynamicHeaders: string[] = [];
    for (const question of questions) {
      const sampleValues = responses
        .map((response) => response.answers[question.questionKey])
        .filter((value) => value !== undefined && value !== null);
      const objectValues = sampleValues.filter(
        (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
      ) as Array<Record<string, string | number | boolean | null>>;
      if (objectValues.length > 0) {
        const rowKeys = new Set<string>();
        for (const objectValue of objectValues) {
          for (const rowKey of Object.keys(objectValue)) rowKeys.add(rowKey);
        }
        for (const rowKey of Array.from(rowKeys).sort()) {
          dynamicHeaders.push(`q_${question.questionKey}__${rowKey}`);
        }
      } else {
        dynamicHeaders.push(`q_${question.questionKey}`);
      }
    }

    const rows = responses.map((response) => {
      const flattened: Record<string, string> = {};
      for (const question of questions) {
        Object.assign(
          flattened,
          flattenAnswer(question.questionKey, response.answers[question.questionKey] ?? null),
        );
      }
      return [
        response.id,
        response.submittedAt?.toISOString() ?? '',
        response.status,
        ...dynamicHeaders.map((header) => flattened[header] ?? ''),
      ];
    });

    const csv = toCsv([...headers, ...dynamicHeaders], rows);
    const filename = `${normalizeFileNamePart(survey.title)}-${survey.id}-responses.csv`;

    await this.deps.audit.record({
      teamId,
      actorId,
      action: 'survey_export',
      objectType: 'survey_export_csv',
      objectId: filename,
      metadata: { surveyId, responseCount: responses.length },
    });

    return ok({ filename, contentType: 'text/csv', body: csv });
  }
}
