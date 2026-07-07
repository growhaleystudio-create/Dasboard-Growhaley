import type { ReplaceSurveyQuestionInput, SurveyQuestion, SurveyQuestionType } from '@leads-generator/shared';
import { query, type DbExecutor } from './types.js';

interface SurveyQuestionRow {
  id: string;
  survey_id: string;
  team_id: string;
  version: number;
  question_key: string;
  type: SurveyQuestionType;
  title: string;
  description: string | null;
  required: boolean;
  display_order: number;
  config: Record<string, unknown> | string;
  logic_rules: Record<string, unknown> | string | null;
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

function mapRow(row: SurveyQuestionRow): SurveyQuestion {
  const question: SurveyQuestion = {
    id: row.id,
    surveyId: row.survey_id,
    teamId: row.team_id,
    version: Number(row.version),
    questionKey: row.question_key,
    type: row.type,
    title: row.title,
    required: row.required,
    displayOrder: Number(row.display_order),
    config: parseJson(row.config, {}),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
  if (row.description !== null) question.description = row.description;
  const logic = parseJson<Record<string, unknown> | null>(row.logic_rules, null);
  if (logic) question.logic = logic as any;
  return question;
}

const QUESTION_COLUMNS = `id, survey_id, team_id, version, question_key, type, title, description, required, display_order, config, logic_rules, created_at, updated_at`;

export class SurveyQuestionRepository {
  constructor(private readonly db: DbExecutor) {}

  async listForSurvey(teamId: string, surveyId: string, version: number): Promise<SurveyQuestion[]> {
    const rows = await query<SurveyQuestionRow>(
      this.db,
      `SELECT ${QUESTION_COLUMNS} FROM survey_question WHERE team_id = $1 AND survey_id = $2 AND version = $3 ORDER BY display_order ASC, created_at ASC`,
      [teamId, surveyId, version],
    );
    return rows.map(mapRow);
  }

  async replaceForSurvey(teamId: string, surveyId: string, version: number, questions: ReplaceSurveyQuestionInput[]): Promise<SurveyQuestion[]> {
    await query(this.db, `DELETE FROM survey_question WHERE team_id = $1 AND survey_id = $2 AND version = $3`, [teamId, surveyId, version]);
    for (const question of questions) {
      await query(
        this.db,
        `INSERT INTO survey_question (survey_id, team_id, version, question_key, type, title, description, required, display_order, config, logic_rules)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)`,
        [
          surveyId,
          teamId,
          version,
          question.questionKey,
          question.type,
          question.title,
          question.description ?? null,
          question.required ?? false,
          question.displayOrder,
          JSON.stringify(question.config),
          question.logic ? JSON.stringify(question.logic) : null,
        ],
      );
    }
    return this.listForSurvey(teamId, surveyId, version);
  }
}
