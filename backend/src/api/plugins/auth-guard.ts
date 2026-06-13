import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthSession, Action, AppError } from '@leads-generator/shared';
import { rbacGuard } from '../../auth/rbac.js';
import type { SessionStore } from '../../auth/session-store.js';
import type { EffectiveRoleResolver } from '../../auth/effective-role.js';

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    session?: AuthSession;
    sessionId?: string;
  }

  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (action: Action) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireTeamId: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthGuardOptions {
  sessions: SessionStore;
  /**
   * Per-request effective role resolver (R2.3, R12.1–R12.6).
   * Reads the user's current role from the source of truth on every
   * authorized request — never from the role frozen in the session — so
   * role changes (Admin promotes/demotes a Member/Viewer) take effect
   * immediately without forcing a re-login.
   *
   * When `null` is returned (user no longer a team member), `requireRole`
   * responds with 403.
   */
  effectiveRoleResolver: EffectiveRoleResolver;
}

const authGuardPlugin: FastifyPluginAsync<AuthGuardOptions> = async (fastify, opts) => {
  // 1. requireAuth: Verifies session cookie and populates request.session
  fastify.decorate(
    'requireAuth',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessionId = request.cookies['sessionId'];
      if (!sessionId) {
        throw { code: 'AUTH', errorCode: 'AUTH_SESSION_MISSING', message: 'Missing session' } as AppError;
      }

      // touch validates and extends idle timeout in one operation
      const session = await opts.sessions.touch(sessionId);
      if (!session) {
        reply.clearCookie('sessionId', { path: '/' });
        throw { code: 'AUTH', errorCode: 'AUTH_SESSION_EXPIRED', message: 'Session expired or invalid' } as AppError;
      }

      request.session = session;
      request.sessionId = sessionId;
    }
  );

  // 2. requireRole: Enforces RBAC matrix for the current action.
  // Reads the effective role per-request via EffectiveRoleResolver (R2.3, R12.1–R12.6)
  // rather than using the role frozen in the session at login time.
  // If effectiveRole is null the user is no longer a team member → 403.
  // A denied request never mutates any data — the handler is not called.
  fastify.decorate(
    'requireRole',
    (action: Action) => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        // Assume requireAuth has been called before this
        const { userId, teamId } = request.session!;

        // R2.3: resolve effective role from the source of truth, not from
        // the potentially-stale session.role frozen at login.
        const effectiveRole = await opts.effectiveRoleResolver.get(userId, teamId);

        if (effectiveRole === null) {
          // User is no longer a member of this team.
          throw { code: 'AUTHORIZATION', errorCode: 'AUTH_FORBIDDEN', message: 'Forbidden' } as AppError;
        }

        if (!rbacGuard.can(effectiveRole, action)) {
          throw {
            code: 'AUTHORIZATION',
            errorCode: 'AUTH_FORBIDDEN',
            message: `Role ${effectiveRole} cannot perform ${action}`,
          } as AppError;
        }
      };
    }
  );

  // 3. requireTeamId: Enforces Tenant Guard (ensures request teamId matches session teamId)
  fastify.decorate(
    'requireTeamId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Fastify params are any, extract id (which is our standard param for teamId)
      const params = request.params as { id?: string };
      const requestedTeamId = params.id;
      
      if (!requestedTeamId) {
        throw { code: 'VALIDATION', errorCode: 'API_VALIDATION_FAILED', messages: ['Missing team ID in URL'] } as AppError;
      }

      if (request.session!.teamId !== requestedTeamId) {
        // Do not leak existence of other teams by returning 404 instead of 403
        throw { code: 'NOT_FOUND', errorCode: 'AUTH_TEAM_MISMATCH', message: 'Resource not found' } as AppError;
      }
    }
  );
};

export default fp(authGuardPlugin, {
  name: 'auth-guard',
  dependencies: ['@fastify/cookie']
});
