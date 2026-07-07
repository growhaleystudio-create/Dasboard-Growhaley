import fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';

import authGuard, { type AuthGuardOptions } from './plugins/auth-guard.js';
import { errorHandler } from './error-handler.js';

import { authRoutes, type AuthRoutesDeps } from './routes/auth.routes.js';
import { teamRoutes, inviteAcceptRoutes, type TeamRoutesDeps } from './routes/team.routes.js';
import { connectorRoutes, type ConnectorRoutesDeps } from './routes/connector.routes.js';
import { scanRoutes, type ScanRoutesDeps } from './routes/scan.routes.js';
import { leadRoutes, type LeadRoutesDeps } from './routes/lead.routes.js';
import { metricsRoutes, type MetricsRoutesDeps } from './routes/metrics.routes.js';
import { privacyRoutes, type PrivacyRoutesDeps } from './routes/privacy.routes.js';
import { aiRoutes, type AiRoutesDeps } from './routes/ai.routes.js';
import { contentRoutes, type ContentRoutesDeps } from './routes/content.routes.js';
import { surveyRoutes, type SurveyRoutesDeps } from './routes/survey.routes.js';
import { surveyPublicRoutes, type SurveyPublicRoutesDeps } from './routes/survey-public.routes.js';

export interface AppDeps {
  authGuard: AuthGuardOptions;
  authRoutes: AuthRoutesDeps;
  teamRoutes: TeamRoutesDeps;
  connectorRoutes: ConnectorRoutesDeps;
  scanRoutes: ScanRoutesDeps;
  leadRoutes: LeadRoutesDeps;
  metricsRoutes: MetricsRoutesDeps;
  privacyRoutes: PrivacyRoutesDeps;
  aiRoutes: AiRoutesDeps;
  contentRoutes: ContentRoutesDeps;
  surveyRoutes: SurveyRoutesDeps;
  surveyPublicRoutes: SurveyPublicRoutesDeps;
}

export function buildServer(deps: AppDeps, opts: FastifyServerOptions = {}): FastifyInstance {
  const app = fastify({
    // Allow up to 20MB body — needed for base64 reference images (up to 4 × 1MB each + overhead)
    bodyLimit: 20 * 1024 * 1024,
    ...opts,
  });

  // Global Error Handler
  app.setErrorHandler(errorHandler);

  // Core Plugins
  app.register(cors, {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : process.env.NODE_ENV === 'production'
        ? []
        : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.register(cookie);

  // Custom auth plugin
  app.register(authGuard, deps.authGuard);

  // API Routes Registration
  app.register(
    async (api) => {
      api.register(authRoutes(deps.authRoutes), { prefix: '/auth' });
      api.register(teamRoutes(deps.teamRoutes), { prefix: '/teams' });
      api.register(inviteAcceptRoutes(deps.teamRoutes), { prefix: '/invites' });

      // Team-scoped resources
      api.register(connectorRoutes(deps.connectorRoutes), { prefix: '/teams/:id/connectors' });
      api.register(scanRoutes(deps.scanRoutes), { prefix: '/teams/:id/scans' });
      api.register(leadRoutes(deps.leadRoutes), { prefix: '/teams/:id/leads' });
      api.register(metricsRoutes(deps.metricsRoutes), { prefix: '/teams/:id/metrics' });
      api.register(privacyRoutes(deps.privacyRoutes), { prefix: '/teams/:id' });
      api.register(aiRoutes(deps.aiRoutes), { prefix: '/teams/:id/ai' });
      api.register(contentRoutes(deps.contentRoutes), { prefix: '/teams/:id/content' });
      api.register(surveyRoutes(deps.surveyRoutes), { prefix: '/teams/:id/surveys' });
      api.register(surveyPublicRoutes(deps.surveyPublicRoutes), { prefix: '/public/surveys' });
    },
    { prefix: '/api' },
  );

  // Redirect root to frontend to handle default port 3000 access gracefully
  app.get('/', async (request, reply) => {
    return reply.redirect(process.env.FRONTEND_URL || 'http://localhost:3001');
  });

  return app;
}
