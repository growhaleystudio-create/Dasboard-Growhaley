import { describe, it, expect, vi } from 'vitest';
import fastify from 'fastify';
import { surveyPublicRoutes, type SurveyPublicRoutesDeps } from './survey-public.routes.js';
import type { SurveyPublicService } from '../../survey/survey-public-service.js';

function makeApp() {
  const app = fastify();
  const deps: SurveyPublicRoutesDeps = {
    service: {
      getBySlug: vi
        .fn()
        .mockResolvedValue({ survey: { id: 'survey-1', title: 'Survey' }, questions: [] }),
      submitBySlug: vi.fn().mockResolvedValue({ id: 'response-1' }),
    } as unknown as SurveyPublicService,
  };

  app.register(surveyPublicRoutes(deps), { prefix: '/public/surveys' });
  return { app, deps };
}

describe('surveyPublicRoutes integration', () => {
  it('returns public survey by slug', async () => {
    const { app, deps } = makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/public/surveys/survey-slug',
    });

    expect(response.statusCode).toBe(200);
    expect(deps.service.getBySlug).toHaveBeenCalledWith('survey-slug');
    await app.close();
  });

  it('submits public response', async () => {
    const { app, deps } = makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/public/surveys/survey-slug/responses',
      payload: { answers: { q_1: 'ok' }, metadata: { source: 'public-survey' } },
    });

    expect(response.statusCode).toBe(201);
    expect(deps.service.submitBySlug).toHaveBeenCalledWith('survey-slug', {
      answers: { q_1: 'ok' },
      metadata: { source: 'public-survey' },
    });
    await app.close();
  });

  it('rejects response submit when answers payload is missing', async () => {
    const { app, deps } = makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/public/surveys/survey-slug/responses',
      payload: { metadata: { source: 'public-survey' } },
    });

    expect(response.statusCode).toBe(400);
    expect(deps.service.submitBySlug).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects response submit when answers object is empty', async () => {
    const { app, deps } = makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/public/surveys/survey-slug/responses',
      payload: { answers: {}, metadata: { source: 'public-survey' } },
    });

    expect(response.statusCode).toBe(400);
    expect(deps.service.submitBySlug).not.toHaveBeenCalled();
    await app.close();
  });
});
