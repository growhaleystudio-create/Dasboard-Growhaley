import { describe, it, expect, vi } from 'vitest';
import { buildServer, type AppDeps } from '../../src/api/server.js';

describe('API Server', () => {
  it('should build and register routes successfully', async () => {
    // We just provide dummy dependencies to ensure all routes register without throwing
    const deps: AppDeps = {
      authGuard: {
        verifySession: vi.fn(),
      } as any,
      authRoutes: {
        authService: {} as any,
      },
      teamRoutes: {
        teamService: {} as any,
      },
      connectorRoutes: {
        activation: {} as any,
        vault: {} as any,
      },
      scanRoutes: {
        scanConfigService: {} as any,
        configs: {} as any,
      },
      leadRoutes: {
        manager: {} as any,
        query: {} as any,
      },
      metricsRoutes: {
        metricsService: {} as any,
      },
      privacyRoutes: {
        exportService: {} as any,
        dsarService: {} as any,
      },
      aiRoutes: {
        settings: {} as any,
        reanalyze: {} as any,
        callLog: {} as any,
      },
      contentRoutes: {
        pool: {} as any,
        settings: {} as any,
        budget: {} as any,
        audit: {} as any,
        masterTemplateService: {} as any,
        contentGeneratorService: {} as any,
        approvedExampleService: {} as any,
      }
    };

    const server = buildServer(deps);
    
    // We can inject a dummy request to ensure server runs
    const response = await server.inject({
      method: 'GET',
      url: '/api/not-found'
    });

    expect(response.statusCode).toBe(404);
  });
});
