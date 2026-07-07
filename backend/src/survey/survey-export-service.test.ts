import { describe, it, expect, vi } from 'vitest';
import { SurveyExportService } from './survey-export-service.js';
import type { Survey, SurveyQuestion, SurveyResponse } from '@leads-generator/shared';

const survey: Survey = {
  id: 'survey-1',
  teamId: 'team-1',
  title: 'Customer Satisfaction Survey',
  projectGoal: 'Understand satisfaction',
  status: 'published',
  responseCount: 2,
  currentVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const questions: SurveyQuestion[] = [
  {
    id: 'q1',
    surveyId: 'survey-1',
    teamId: 'team-1',
    version: 1,
    questionKey: 'satisfaction',
    type: 'linear_scale',
    title: 'How satisfied are you?',
    required: true,
    displayOrder: 0,
    config: { min: 1, max: 5 },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'q2',
    surveyId: 'survey-1',
    teamId: 'team-1',
    version: 1,
    questionKey: 'feature_rating',
    type: 'matrix',
    title: 'Rate features',
    required: false,
    displayOrder: 1,
    config: { rows: [{ key: 'checkout', label: 'Checkout' }], columns: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'q3',
    surveyId: 'survey-1',
    teamId: 'team-1',
    version: 1,
    questionKey: 'channels',
    type: 'checkboxes',
    title: 'Channels',
    required: false,
    displayOrder: 2,
    config: { options: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const responses: SurveyResponse[] = [
  {
    id: 'r1',
    surveyId: 'survey-1',
    teamId: 'team-1',
    surveyVersion: 1,
    status: 'completed',
    answers: {
      satisfaction: 4,
      feature_rating: { checkout: 5 },
      channels: ['email', 'whatsapp'],
    },
    metadata: {},
    analysisState: 'none',
    startedAt: new Date('2026-01-02T00:00:00.000Z'),
    submittedAt: new Date('2026-01-02T01:00:00.000Z'),
    createdAt: new Date('2026-01-02T01:00:00.000Z'),
  },
];

describe('SurveyExportService', () => {
  it('exports CSV with flattened scalar, matrix, and checkbox answers', async () => {
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new SurveyExportService({
      surveys: { findById: vi.fn().mockResolvedValue(survey) } as any,
      questions: { listForSurvey: vi.fn().mockResolvedValue(questions) } as any,
      responses: { listForSurvey: vi.fn().mockResolvedValue(responses) } as any,
      audit,
    });

    const result = await service.exportCsv('team-1', 'survey-1', 'user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.contentType).toBe('text/csv');
    expect(result.value.body).toContain('response_id,submitted_at,status,q_satisfaction,q_feature_rating__checkout,q_channels');
    expect(result.value.body).toContain('r1,2026-01-02T01:00:00.000Z,completed,4,5,email|whatsapp');
    expect(audit.record).toHaveBeenCalledOnce();
  });

  it('exports JSON with survey, questions, responses payload', async () => {
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new SurveyExportService({
      surveys: { findById: vi.fn().mockResolvedValue(survey) } as any,
      questions: { listForSurvey: vi.fn().mockResolvedValue(questions) } as any,
      responses: { listForSurvey: vi.fn().mockResolvedValue(responses) } as any,
      audit,
    });

    const result = await service.exportJson('team-1', 'survey-1', 'user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed = JSON.parse(result.value.body) as any;
    expect(parsed.survey.id).toBe('survey-1');
    expect(parsed.questions).toHaveLength(3);
    expect(parsed.responses).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledOnce();
  });
});
