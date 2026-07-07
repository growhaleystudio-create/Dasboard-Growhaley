import { describe, it, expect, vi, beforeEach } from 'vitest';
import fastify from 'fastify';
import { surveyRoutes, type SurveyRoutesDeps } from './survey.routes.js';
import type { SurveyAnalyticsService } from '../../survey/survey-analytics-service.js';
import type { SurveyAnalysisService } from '../../survey/survey-analysis-service.js';
import type { SurveyExportService } from '../../survey/survey-export-service.js';
import type { SurveyResponseRepository } from '../../repository/survey-response-repository.js';

function makeApp(role: 'admin' | 'member' | 'viewer' = 'admin') {
  const app = fastify();
  app.decorate('requireAuth', async () => undefined);
  app.decorate('requireTeamId', async () => undefined);
  app.decorate('requireRole', (action: string) => async (_request: any, reply: any) => {
    if (action === 'survey.export' && role !== 'admin') {
      return reply.status(403).send({ code: 'AUTHORIZATION', message: 'forbidden' });
    }
    if ((action === 'survey.analyze' || action === 'survey.write') && role === 'viewer') {
      return reply.status(403).send({ code: 'AUTHORIZATION', message: 'forbidden' });
    }
  });

  app.addHook('preHandler', async (request: any) => {
    request.session = {
      userId: 'user-1',
      teamId: 'team-1',
      role,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };
  });

  const deps: SurveyRoutesDeps = {
    service: {} as any,
    analytics: {
      getSummary: vi.fn().mockResolvedValue({
        totalResponses: 1,
        completedResponses: 1,
        completionRate: 100,
        questions: [],
      }),
    } as unknown as SurveyAnalyticsService,
    analysis: {
      trigger: vi
        .fn()
        .mockResolvedValue({ ok: true, value: { id: 'analysis-1', status: 'pending' } }),
      list: vi.fn().mockResolvedValue([{ id: 'analysis-1', status: 'pending' }]),
      get: vi.fn().mockResolvedValue({ id: 'analysis-1', status: 'success' }),
    } as unknown as SurveyAnalysisService,
    exportService: {
      exportJson: vi.fn().mockResolvedValue({
        ok: true,
        value: { filename: 'survey.json', contentType: 'application/json', body: '{"ok":true}' },
      }),
      exportCsv: vi.fn().mockResolvedValue({
        ok: true,
        value: { filename: 'survey.csv', contentType: 'text/csv', body: 'a,b\r\n1,2\r\n' },
      }),
    } as unknown as SurveyExportService,
    responses: {
      listForSurvey: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as SurveyResponseRepository,
  };

  app.register(surveyRoutes(deps), { prefix: '/teams/:id/surveys' });
  return { app, deps };
}

describe('surveyRoutes integration', () => {
  it('allows member to trigger analysis', async () => {
    const { app, deps } = makeApp('member');
    const response = await app.inject({
      method: 'POST',
      url: '/teams/team-1/surveys/survey-1/analysis',
      payload: { scope: 'overall' },
    });

    expect(response.statusCode).toBe(202);
    expect(deps.analysis.trigger).toHaveBeenCalledOnce();
    await app.close();
  });

  it('blocks viewer from analysis endpoint', async () => {
    const { app } = makeApp('viewer');
    const response = await app.inject({
      method: 'POST',
      url: '/teams/team-1/surveys/survey-1/analysis',
      payload: { scope: 'overall' },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns JSON export for admin', async () => {
    const { app, deps } = makeApp('admin');
    const response = await app.inject({
      method: 'GET',
      url: '/teams/team-1/surveys/survey-1/export/json',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['content-disposition']).toContain('survey.json');
    expect(deps.exportService.exportJson).toHaveBeenCalledOnce();
    await app.close();
  });

  it('blocks member from export endpoint', async () => {
    const { app } = makeApp('member');
    const response = await app.inject({
      method: 'GET',
      url: '/teams/team-1/surveys/survey-1/export/csv',
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('lists analyses for the survey', async () => {
    const { app, deps } = makeApp('admin');
    const response = await app.inject({
      method: 'GET',
      url: '/teams/team-1/surveys/survey-1/analysis',
    });

    expect(response.statusCode).toBe(200);
    expect(deps.analysis.list).toHaveBeenCalledWith('team-1', 'survey-1');
    await app.close();
  });

  it('fetches a single analysis by id', async () => {
    const { app, deps } = makeApp('admin');
    const response = await app.inject({
      method: 'GET',
      url: '/teams/team-1/surveys/survey-1/analysis/analysis-1',
    });

    expect(response.statusCode).toBe(200);
    expect(deps.analysis.get).toHaveBeenCalledWith('team-1', 'survey-1', 'analysis-1');
    await app.close();
  });

  it('rejects invalid analysis scope', async () => {
    const { app, deps } = makeApp('admin');
    const response = await app.inject({
      method: 'POST',
      url: '/teams/team-1/surveys/survey-1/analysis',
      payload: { scope: 'unsupported' },
    });

    expect(response.statusCode).toBe(400);
    expect(deps.analysis.trigger).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects question scope without questionId', async () => {
    const { app, deps } = makeApp('admin');
    const response = await app.inject({
      method: 'POST',
      url: '/teams/team-1/surveys/survey-1/analysis',
      payload: { scope: 'question' },
    });

    expect(response.statusCode).toBe(400);
    expect(deps.analysis.trigger).not.toHaveBeenCalled();
    await app.close();
  });

  it('accepts question scope with questionId', async () => {
    const { app, deps } = makeApp('admin');
    const response = await app.inject({
      method: 'POST',
      url: '/teams/team-1/surveys/survey-1/analysis',
      payload: { scope: 'question', questionId: '11111111-1111-1111-1111-111111111111' },
    });

    expect(response.statusCode).toBe(202);
    expect(deps.analysis.trigger).toHaveBeenCalledWith('team-1', 'survey-1', 'user-1', {
      scope: 'question',
      questionId: '11111111-1111-1111-1111-111111111111',
    });
    await app.close();
  });

  it('lists responses for the survey', async () => {
    const { app, deps } = makeApp('admin');
    const response = await app.inject({
      method: 'GET',
      url: '/teams/team-1/surveys/survey-1/responses',
    });

    expect(response.statusCode).toBe(200);
    expect(deps.responses.listForSurvey).toHaveBeenCalledWith('team-1', 'survey-1');
    await app.close();
  });
});
