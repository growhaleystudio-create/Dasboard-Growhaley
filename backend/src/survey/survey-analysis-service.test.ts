import { describe, it, expect, vi } from 'vitest';
import { SurveyAnalysisService } from './survey-analysis-service.js';
import type { Survey, SurveyQuestion, SurveyResponse } from '@leads-generator/shared';

const survey: Survey = {
  id: 'survey-1',
  teamId: 'team-1',
  title: 'Customer Satisfaction Survey',
  projectGoal: 'Understand satisfaction',
  status: 'published',
  responseCount: 1,
  currentVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const question: SurveyQuestion = {
  id: 'q1',
  surveyId: 'survey-1',
  teamId: 'team-1',
  version: 1,
  questionKey: 'feedback',
  type: 'long_text',
  title: 'Feedback',
  required: false,
  displayOrder: 0,
  config: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const response: SurveyResponse = {
  id: 'r1',
  surveyId: 'survey-1',
  teamId: 'team-1',
  surveyVersion: 1,
  status: 'completed',
  answers: { feedback: 'Great product but checkout is confusing' },
  metadata: {},
  analysisState: 'none',
  startedAt: new Date('2026-01-02T00:00:00.000Z'),
  submittedAt: new Date('2026-01-02T01:00:00.000Z'),
  createdAt: new Date('2026-01-02T01:00:00.000Z'),
};

describe('SurveyAnalysisService', () => {
  it('sets response analysis state to pending when triggering analysis', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'analysis-1' });
    const setState = vi.fn().mockResolvedValue(undefined);
    const queueAdd = vi.fn().mockResolvedValue(undefined);
    const auditRecord = vi.fn().mockResolvedValue(undefined);

    const service = new SurveyAnalysisService({
      surveys: { findById: vi.fn().mockResolvedValue(survey) } as any,
      questions: { listForSurvey: vi.fn().mockResolvedValue([question]) } as any,
      responses: {
        listForSurvey: vi.fn().mockResolvedValue([response]),
        setAnalysisStateForSurvey: setState,
      } as any,
      analyses: { create } as any,
      analytics: {
        getSummary: vi
          .fn()
          .mockResolvedValue({
            totalResponses: 1,
            completedResponses: 1,
            completionRate: 100,
            questions: [],
          }),
      } as any,
      settings: { hasApiKey: vi.fn().mockResolvedValue(true) } as any,
      audit: { record: auditRecord },
      queue: { add: queueAdd } as any,
    });

    const result = await service.trigger('team-1', 'survey-1', 'user-1', { scope: 'overall' });
    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    expect(setState).toHaveBeenCalledWith('team-1', 'survey-1', 'pending');
    expect(queueAdd).toHaveBeenCalledOnce();
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'survey_analysis',
        metadata: expect.objectContaining({
          taxonomy: 'survey_analysis',
          event: 'triggered',
          trigger: 'manual',
          scope: 'overall',
        }),
      }),
    );
  });

  it('sets response analysis state to success after successful processing', async () => {
    const setState = vi.fn().mockResolvedValue(undefined);
    const markSuccess = vi.fn().mockResolvedValue(undefined);
    const auditRecord = vi.fn().mockResolvedValue(undefined);

    const service = new SurveyAnalysisService({
      surveys: { findById: vi.fn().mockResolvedValue(survey) } as any,
      questions: { listForSurvey: vi.fn().mockResolvedValue([question]) } as any,
      responses: {
        listForSurvey: vi.fn().mockResolvedValue([response]),
        setAnalysisStateForSurvey: setState,
      } as any,
      analyses: {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'analysis-1', scope: 'overall', inputSnapshot: {} }),
        markSuccess,
      } as any,
      analytics: {
        getSummary: vi
          .fn()
          .mockResolvedValue({
            totalResponses: 1,
            completedResponses: 1,
            completionRate: 100,
            questions: [],
          }),
      } as any,
      settings: {} as any,
      audit: { record: auditRecord },
      queue: {} as any,
      generateResult: vi.fn().mockResolvedValue({
        summary: 'ok',
        keyFindings: ['a'],
        recommendations: ['b'],
        generatedAt: new Date().toISOString(),
      }),
      modelName: vi.fn().mockResolvedValue('gemini-test'),
    });

    await service.processJob({
      teamId: 'team-1',
      surveyId: 'survey-1',
      analysisId: 'analysis-1',
      trigger: 'manual',
    });
    expect(markSuccess).toHaveBeenCalledOnce();
    expect(setState).toHaveBeenCalledWith('team-1', 'survey-1', 'success');
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'survey_analysis',
        metadata: expect.objectContaining({
          taxonomy: 'survey_analysis',
          event: 'completed',
          trigger: 'manual',
          scope: 'overall',
          model: 'gemini-test',
        }),
      }),
    );
  });
});
