import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import argon2 from 'argon2';
import type { AuthService } from '../../auth/auth-service.js';
import type { MembershipRepository } from '../../auth/membership-repository.js';
import type { AppUserRepository } from '../../auth/user-repository.js';
import { type AppError } from '@leads-generator/shared';
import type { DbExecutor } from '../../repository/types.js';
import { query } from '../../repository/types.js';

export interface AuthRoutesDeps {
  authService: AuthService;
  memberships: Pick<MembershipRepository, 'listForUser' | 'upsert'>;
  users: Pick<AppUserRepository, 'findByEmail' | 'findById' | 'create'>;
  dbPool?: DbExecutor;
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  teamName: z.string().min(1).optional(),
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

    const memberships = await deps.memberships.listForUser(user.id);
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
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 60, // 30 minutes
    });

    return reply.status(200).send({
      message: 'Logged in successfully',
      session: {
        userId: session.userId,
        email: user.email,
        teamId: session.teamId,
        role: session.role
      }
    });
  });

  fastify.post('/register', async (request, reply) => {
    const parseResult = RegisterSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw { code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) } as AppError;
    }
    const input = parseResult.data;

    const existingUser = await deps.users.findByEmail(input.email);
    if (existingUser) {
      throw { code: 'CONFLICT', message: 'Email is already registered' } as AppError;
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await deps.users.create({
      email: input.email,
      passwordHash,
    });

    const db = deps.dbPool ?? (deps.users as any).db;
    const teamName = input.teamName ?? `${input.email.split('@')[0]}'s Team`;
    const teamRows = await query<{ id: string }>(
      db,
      `INSERT INTO team (name) VALUES ($1) RETURNING id`,
      [teamName],
    );
    const teamId = teamRows[0]!.id;

    await deps.memberships.upsert({
      teamId,
      userId: user.id,
      role: 'admin',
      status: 'active',
    });

    const loginResult = await deps.authService.login(
      { email: input.email, password: input.password },
      'admin',
      teamId,
    );
    if (!loginResult.ok) throw loginResult.error;

    const { sessionId, session } = loginResult.value;

    reply.setCookie('sessionId', sessionId, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 60,
    });

    return reply.status(201).send({
      message: 'User registered and logged in successfully',
      session: {
        userId: session.userId,
        email: user.email,
        teamId: session.teamId,
        role: session.role,
      },
    });
  });

  fastify.post('/signup', async (request, reply) => {
    const parseResult = RegisterSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw { code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) } as AppError;
    }
    const input = parseResult.data;

    const existingUser = await deps.users.findByEmail(input.email);
    if (existingUser) {
      throw { code: 'CONFLICT', message: 'Email is already registered' } as AppError;
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await deps.users.create({
      email: input.email,
      passwordHash,
    });

    const db = deps.dbPool ?? (deps.users as any).db;
    const teamName = input.teamName ?? `${input.email.split('@')[0]}'s Team`;
    const teamRows = await query<{ id: string }>(
      db,
      `INSERT INTO team (name) VALUES ($1) RETURNING id`,
      [teamName],
    );
    const teamId = teamRows[0]!.id;

    await deps.memberships.upsert({
      teamId,
      userId: user.id,
      role: 'admin',
      status: 'active',
    });

    const loginResult = await deps.authService.login(
      { email: input.email, password: input.password },
      'admin',
      teamId,
    );
    if (!loginResult.ok) throw loginResult.error;

    const { sessionId, session } = loginResult.value;

    reply.setCookie('sessionId', sessionId, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 60,
    });

    return reply.status(201).send({
      message: 'User registered and logged in successfully',
      session: {
        userId: session.userId,
        email: user.email,
        teamId: session.teamId,
        role: session.role,
      },
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
