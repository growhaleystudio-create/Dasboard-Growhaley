import type { SurveyAnswerValue, SurveyQuestion, SurveyResponse } from '@leads-generator/shared';
import { query, type DbExecutor } from './types.js';

interface SurveyResponseRow {
  id: string;
  survey_id: string;
  team_id: string;
  survey_version: number;
  status: 'in_progress' | 'completed' | 'abandoned';
  answers_json: Record<string, SurveyAnswerValue> | string;
  metadata: Record<string, unknown> | string;
  analysis_state: 'none' | 'pending' | 'success' | 'failed';
  started_at: Date | string;
  submitted_at: Date | string | null;
  created_at: Date | string;
}

function toDate(value: Date | string | null | undefined): Date | undefined {
  if (value === null || value === undefined) return undefined;
  return value instanceof Date ? value : new Date(value);
}

function parseJson<T>(value: T | string | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value;
}

function mapRow(row: SurveyResponseRow): SurveyResponse {
  const result: SurveyResponse = {
    id: row.id,
    surveyId: row.survey_id,
    teamId: row.team_id,
    surveyVersion: Number(row.survey_version),
    status: row.status,
    answers: parseJson(row.answers_json, {}),
    metadata: parseJson(row.metadata, {}),
    analysisState: row.analysis_state,
    startedAt: toDate(row.started_at)!,
    createdAt: toDate(row.created_at)!,
  };
  const submittedAt = toDate(row.submitted_at);
  if (submittedAt) result.submittedAt = submittedAt;
  return result;
}

const RESPONSE_COLUMNS = `id, survey_id, team_id, survey_version, status, answers_json, metadata, analysis_state, started_at, submitted_at, created_at`;

export class SurveyResponseRepository {
  constructor(private readonly db: DbExecutor) {}

  async setAnalysisStateForSurvey(
    teamId: string,
    surveyId: string,
    state: 'pending' | 'success' | 'failed',
  ): Promise<void> {
    await query(
      this.db,
      `UPDATE survey_response SET analysis_state = $3 WHERE team_id = $1 AND survey_id = $2`,
      [teamId, surveyId, state],
    );
  }

  async insertCompleted(
    teamId: string,
    surveyId: string,
    surveyVersion: number,
    answers: Record<string, SurveyAnswerValue>,
    metadata: Record<string, unknown>,
  ): Promise<SurveyResponse> {
    const rows = await query<SurveyResponseRow>(
      this.db,
      `INSERT INTO survey_response (survey_id, team_id, survey_version, status, answers_json, metadata, submitted_at)
       VALUES ($1,$2,$3,'completed',$4::jsonb,$5::jsonb,now())
       RETURNING ${RESPONSE_COLUMNS}`,
      [surveyId, teamId, surveyVersion, JSON.stringify(answers), JSON.stringify(metadata)],
    );
    return mapRow(rows[0]!);
  }

  async insertAnswerRows(
    teamId: string,
    surveyId: string,
    responseId: string,
    questions: SurveyQuestion[],
    answers: Record<string, SurveyAnswerValue>,
  ): Promise<void> {
    for (const question of questions) {
      const answer = answers[question.questionKey];
      if (answer === undefined || answer === null) continue;
      const isArray = Array.isArray(answer);
      const isObject = typeof answer === 'object' && answer !== null && !isArray;
      await query(
        this.db,
        `INSERT INTO survey_response_answer (
          response_id, survey_id, team_id, question_id, question_key, question_type,
          answer_text, answer_number, answer_option, answer_options, answer_matrix, normalized_value
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12)`,
        [
          responseId,
          surveyId,
          teamId,
          question.id,
          question.questionKey,
          question.type,
          typeof answer === 'string' ? answer : null,
          typeof answer === 'number' ? answer : null,
          typeof answer === 'string' && ['multiple_choice', 'dropdown'].includes(question.type)
            ? answer
            : null,
          isArray ? JSON.stringify(answer) : null,
          isObject ? JSON.stringify(answer) : null,
          typeof answer === 'string' || typeof answer === 'number' ? String(answer) : null,
        ],
      );
    }
  }

  async listForSurvey(teamId: string, surveyId: string): Promise<SurveyResponse[]> {
    const rows = await query<SurveyResponseRow>(
      this.db,
      `SELECT ${RESPONSE_COLUMNS} FROM survey_response WHERE team_id = $1 AND survey_id = $2 ORDER BY created_at DESC`,
      [teamId, surveyId],
    );
    return rows.map(mapRow);
  }

  async findById(
    teamId: string,
    surveyId: string,
    responseId: string,
  ): Promise<SurveyResponse | null> {
    const rows = await query<SurveyResponseRow>(
      this.db,
      `SELECT ${RESPONSE_COLUMNS} FROM survey_response WHERE team_id = $1 AND survey_id = $2 AND id = $3`,
      [teamId, surveyId, responseId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }
}
