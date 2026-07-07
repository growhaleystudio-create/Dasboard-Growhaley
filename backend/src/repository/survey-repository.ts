import type { Survey, SurveyStatus, CreateSurveyInput, UpdateSurveyInput } from '@leads-generator/shared';
import { query, type DbExecutor } from './types.js';

interface SurveyRow {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  project_goal: string;
  background_context: string | null;
  target_participant: string | null;
  primary_decision: string | null;
  status: SurveyStatus;
  public_slug: string | null;
  response_quota: number | null;
  response_count: number;
  current_version: number;
  published_at: Date | string | null;
  closed_at: Date | string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function toDate(value: Date | string | null | undefined): Date | undefined {
  if (value === null || value === undefined) return undefined;
  return value instanceof Date ? value : new Date(value);
}

function mapSurveyRow(row: SurveyRow): Survey {
  const survey: Survey = {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    projectGoal: row.project_goal,
    status: row.status,
    responseCount: Number(row.response_count),
    currentVersion: Number(row.current_version),
    createdAt: toDate(row.created_at)!,
    updatedAt: toDate(row.updated_at)!,
  };
  if (row.description !== null) survey.description = row.description;
  if (row.background_context !== null) survey.backgroundContext = row.background_context;
  if (row.target_participant !== null) survey.targetParticipant = row.target_participant;
  if (row.primary_decision !== null) survey.primaryDecision = row.primary_decision;
  if (row.public_slug !== null) survey.publicSlug = row.public_slug;
  if (row.response_quota !== null) survey.responseQuota = Number(row.response_quota);
  if (row.created_by !== null) survey.createdBy = row.created_by;
  if (row.updated_by !== null) survey.updatedBy = row.updated_by;
  const publishedAt = toDate(row.published_at);
  if (publishedAt) survey.publishedAt = publishedAt;
  const closedAt = toDate(row.closed_at);
  if (closedAt) survey.closedAt = closedAt;
  return survey;
}

const SURVEY_COLUMNS = `
  id, team_id, title, description, project_goal, background_context,
  target_participant, primary_decision, status, public_slug,
  response_quota, response_count, current_version,
  published_at, closed_at, created_by, updated_by, created_at, updated_at
`;

export class SurveyRepository {
  constructor(private readonly db: DbExecutor) {}

  async create(teamId: string, createdBy: string, input: CreateSurveyInput): Promise<Survey> {
    const rows = await query<SurveyRow>(
      this.db,
      `INSERT INTO survey (
        team_id, title, description, project_goal, background_context,
        target_participant, primary_decision, response_quota, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING ${SURVEY_COLUMNS}`,
      [
        teamId,
        input.title,
        input.description ?? null,
        input.projectGoal,
        input.backgroundContext ?? null,
        input.targetParticipant ?? null,
        input.primaryDecision ?? null,
        input.responseQuota ?? null,
        createdBy,
        createdBy,
      ],
    );
    return mapSurveyRow(rows[0]!);
  }

  async listForTeam(teamId: string): Promise<Survey[]> {
    const rows = await query<SurveyRow>(
      this.db,
      `SELECT ${SURVEY_COLUMNS} FROM survey WHERE team_id = $1 ORDER BY created_at DESC`,
      [teamId],
    );
    return rows.map(mapSurveyRow);
  }

  async findById(teamId: string, surveyId: string): Promise<Survey | null> {
    const rows = await query<SurveyRow>(
      this.db,
      `SELECT ${SURVEY_COLUMNS} FROM survey WHERE team_id = $1 AND id = $2`,
      [teamId, surveyId],
    );
    return rows[0] ? mapSurveyRow(rows[0]) : null;
  }

  async findByPublicSlug(slug: string): Promise<Survey | null> {
    const rows = await query<SurveyRow>(
      this.db,
      `SELECT ${SURVEY_COLUMNS} FROM survey WHERE public_slug = $1`,
      [slug],
    );
    return rows[0] ? mapSurveyRow(rows[0]) : null;
  }

  async update(teamId: string, surveyId: string, updatedBy: string, input: UpdateSurveyInput): Promise<Survey | null> {
    const existing = await this.findById(teamId, surveyId);
    if (!existing) return null;
    const rows = await query<SurveyRow>(
      this.db,
      `UPDATE survey
          SET title = $3,
              description = $4,
              project_goal = $5,
              background_context = $6,
              target_participant = $7,
              primary_decision = $8,
              response_quota = $9,
              updated_by = $10,
              updated_at = now()
        WHERE team_id = $1 AND id = $2
        RETURNING ${SURVEY_COLUMNS}`,
      [
        teamId,
        surveyId,
        input.title ?? existing.title,
        input.description ?? existing.description ?? null,
        input.projectGoal ?? existing.projectGoal,
        input.backgroundContext ?? existing.backgroundContext ?? null,
        input.targetParticipant ?? existing.targetParticipant ?? null,
        input.primaryDecision ?? existing.primaryDecision ?? null,
        input.responseQuota === undefined ? existing.responseQuota ?? null : input.responseQuota,
        updatedBy,
      ],
    );
    return rows[0] ? mapSurveyRow(rows[0]) : null;
  }

  async setStatus(teamId: string, surveyId: string, status: SurveyStatus, fields?: { publicSlug?: string | null; updatedBy?: string | null; close?: boolean }): Promise<Survey | null> {
    const rows = await query<SurveyRow>(
      this.db,
      `UPDATE survey
          SET status = $3,
              public_slug = COALESCE($4, public_slug),
              published_at = CASE WHEN $3 = 'published' THEN now() ELSE published_at END,
              closed_at = CASE WHEN $5::boolean THEN now() WHEN $3 <> 'closed' THEN NULL ELSE closed_at END,
              updated_by = COALESCE($6, updated_by),
              updated_at = now()
        WHERE team_id = $1 AND id = $2
        RETURNING ${SURVEY_COLUMNS}`,
      [teamId, surveyId, status, fields?.publicSlug ?? null, fields?.close ?? false, fields?.updatedBy ?? null],
    );
    return rows[0] ? mapSurveyRow(rows[0]) : null;
  }

  async lockById(teamId: string, surveyId: string): Promise<Survey | null> {
    const rows = await query<SurveyRow>(this.db, `SELECT ${SURVEY_COLUMNS} FROM survey WHERE team_id = $1 AND id = $2 FOR UPDATE`, [teamId, surveyId]);
    return rows[0] ? mapSurveyRow(rows[0]) : null;
  }

  async incrementResponseCount(teamId: string, surveyId: string): Promise<Survey | null> {
    const rows = await query<SurveyRow>(
      this.db,
      `UPDATE survey SET response_count = response_count + 1, updated_at = now() WHERE team_id = $1 AND id = $2 RETURNING ${SURVEY_COLUMNS}`,
      [teamId, surveyId],
    );
    return rows[0] ? mapSurveyRow(rows[0]) : null;
  }
}
