import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import type { AuthService } from '../../auth/auth-service.js';
import type { MembershipRepository } from '../../auth/membership-repository.js';
import type { AppUserRepository } from '../../auth/user-repository.js';
import { type AppError } from '@leads-generator/shared';

export interface AuthRoutesDeps {
  authService: AuthService;
  memberships: Pick<MembershipRepository, 'listForUser'>;
  users: Pick<AppUserRepository, 'findByEmail' | 'findById'>;
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes = (deps: AuthRoutesDeps): FastifyPluginAsync => async (fastify) => {
  fastify.post('/login', async (request, reply) => {
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw { code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) } as AppError;
    }
    const input = parseResult.data;
    
    // We need the user's role and teamId for the session.
    const user = await deps.users.findByEmail(input.email);
    
    if (!user) {
      // User not found. Defer to authService.login with dummy values to trigger the timing delay (R1.2)
      await deps.authService.login(input, 'viewer', 'dummy-team').catch(() => {});
      throw { code: 'AUTH', message: 'Invalid email or password' } as AppError;
    }

    const memberships = await deps.memberships.listForUser(user!.id);
    if (memberships.length === 0) {
      // User exists but has no team. We can't log them into a team context.
      throw { code: 'AUTH', message: 'Invalid email or password' } as AppError;
    }

    // Auto-select the first team membership for MVP
    const activeMembership = memberships[0]!;
    
    const result = await deps.authService.login(input, activeMembership.role, activeMembership.teamId);
    if (!result.ok) throw result.error;

    const { sessionId, session } = result.value;
    
    reply.setCookie('sessionId', sessionId, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 60, // 30 minutes
    });

    return reply.status(200).send({
      message: 'Logged in successfully',
      session: {
        userId: session.userId,
        email: user!.email,
        teamId: session.teamId,
        role: session.role
      }
    });
  });

  fastify.post('/logout', {
    preHandler: [fastify.requireAuth]
  }, async (request, reply) => {
    await deps.authService.logout(request.sessionId!);
    reply.clearCookie('sessionId', { path: '/' });
    return reply.status(200).send({ message: 'Logged out successfully' });
  });

  fastify.get('/session', {
    preHandler: [fastify.requireAuth]
  }, async (request, reply) => {
    const user = await deps.users.findById(request.session!.userId);

    return reply.status(200).send({
      session: {
        userId: request.session!.userId,
        email: user?.email ?? null,
        teamId: request.session!.teamId,
        role: request.session!.role,
        createdAt: request.session!.createdAt,
        lastActivityAt: request.session!.lastActivityAt
      }
    });
  });
};
