import type {
  RunSurveyAnalysisInput,
  SurveyAnalysis,
  SurveyAnalysisScope,
  SurveyAnalysisStatus,
} from '@leads-generator/shared';
import { query, type DbExecutor } from './types.js';

interface SurveyAnalysisRow {
  id: string;
  survey_id: string;
  team_id: string;
  scope: SurveyAnalysisScope;
  question_id: string | null;
  filter_hash: string | null;
  status: SurveyAnalysisStatus;
  input_snapshot: Record<string, unknown> | string;
  result_json: Record<string, unknown> | string | null;
  model: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function parseJson<T>(value: T | string | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value;
}

function mapRow(row: SurveyAnalysisRow): SurveyAnalysis {
  return {
    id: row.id,
    surveyId: row.survey_id,
    teamId: row.team_id,
    scope: row.scope,
    ...(row.question_id !== null ? { questionId: row.question_id } : {}),
    ...(row.filter_hash !== null ? { filterHash: row.filter_hash } : {}),
    status: row.status,
    inputSnapshot: parseJson(row.input_snapshot, {}),
    ...(row.result_json !== null ? { result: parseJson(row.result_json, {}) } : {}),
    ...(row.model !== null ? { model: row.model } : {}),
    ...(row.error_message !== null ? { errorMessage: row.error_message } : {}),
    ...(row.created_by !== null ? { createdBy: row.created_by } : {}),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export class SurveyAnalysisRepository {
  constructor(private readonly db: DbExecutor) {}

  async create(
    teamId: string,
    surveyId: string,
    createdBy: string,
    input: RunSurveyAnalysisInput,
    inputSnapshot: Record<string, unknown>,
    filterHash?: string,
  ): Promise<SurveyAnalysis> {
    const rows = await query<SurveyAnalysisRow>(
      this.db,
      `INSERT INTO survey_analysis (
        survey_id, team_id, scope, question_id, filter_hash, status, input_snapshot, created_by
      ) VALUES ($1,$2,$3,$4,$5,'pending',$6::jsonb,$7)
      RETURNING id, survey_id, team_id, scope, question_id, filter_hash, status, input_snapshot, result_json, model, error_message, created_by, created_at, updated_at`,
      [
        surveyId,
        teamId,
        input.scope,
        input.questionId ?? null,
        filterHash ?? null,
        JSON.stringify(inputSnapshot),
        createdBy,
      ],
    );
    return mapRow(rows[0]!);
  }

  async findById(
    teamId: string,
    surveyId: string,
    analysisId: string,
  ): Promise<SurveyAnalysis | null> {
    const rows = await query<SurveyAnalysisRow>(
      this.db,
      `SELECT id, survey_id, team_id, scope, question_id, filter_hash, status, input_snapshot, result_json, model, error_message, created_by, created_at, updated_at
       FROM survey_analysis WHERE team_id = $1 AND survey_id = $2 AND id = $3`,
      [teamId, surveyId, analysisId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async listForSurvey(teamId: string, surveyId: string): Promise<SurveyAnalysis[]> {
    const rows = await query<SurveyAnalysisRow>(
      this.db,
      `SELECT id, survey_id, team_id, scope, question_id, filter_hash, status, input_snapshot, result_json, model, error_message, created_by, created_at, updated_at
       FROM survey_analysis WHERE team_id = $1 AND survey_id = $2 ORDER BY created_at DESC`,
      [teamId, surveyId],
    );
    return rows.map(mapRow);
  }

  async markSuccess(
    teamId: string,
    surveyId: string,
    analysisId: string,
    result: Record<string, unknown>,
    model: string,
  ): Promise<void> {
    await query(
      this.db,
      `UPDATE survey_analysis
       SET status = 'success', result_json = $4::jsonb, model = $5, error_message = NULL, updated_at = now()
       WHERE team_id = $1 AND survey_id = $2 AND id = $3`,
      [teamId, surveyId, analysisId, JSON.stringify(result), model],
    );
  }

  async markFailed(
    teamId: string,
    surveyId: string,
    analysisId: string,
    errorMessage: string,
  ): Promise<void> {
    await query(
      this.db,
      `UPDATE survey_analysis
       SET status = 'failed', error_message = $4, updated_at = now()
       WHERE team_id = $1 AND survey_id = $2 AND id = $3`,
      [teamId, surveyId, analysisId, errorMessage],
    );
  }
}
