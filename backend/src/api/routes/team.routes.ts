import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import type { TeamService } from '../../team/team-service.js';
import type { AppError } from '@leads-generator/shared';
import argon2 from 'argon2';
import type { AppUserRepository } from '../../auth/user-repository.js';
import type { MembershipRepository } from '../../auth/membership-repository.js';

export interface TeamRoutesDeps {
  teamService: TeamService;
  users: AppUserRepository;
  memberships: MembershipRepository;
}

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']),
});

const AcceptSchema = z.object({
  token: z.string().min(1),
});

const ChangeRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer']),
});

const CreateMemberSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'member', 'viewer']).default('viewer'),
});

export const teamRoutes = (deps: TeamRoutesDeps): FastifyPluginAsync => async (fastify) => {
  fastify.get('/:id/members', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId]
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const members = await deps.memberships.listForTeamMembers(params.id);
    return reply.status(200).send(
      members.map((member) => ({
        id: member.userId,
        email: member.email,
        role: member.role,
        status: member.status,
      })),
    );
  });

  fastify.post('/:id/members', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('team.manage')]
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const parseResult = CreateMemberSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw { code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) } as AppError;
    }

    const input = parseResult.data;
    const existing = await deps.users.findByEmail(input.email);
    const user = existing ?? await deps.users.create({
      email: input.email,
      passwordHash: await argon2.hash(input.password),
    });

    await deps.memberships.upsert({
      teamId: params.id,
      userId: user.id,
      role: input.role,
      status: 'active',
    });

    return reply.status(existing ? 200 : 201).send({
      id: user.id,
      email: user.email,
      role: input.role,
      status: 'active',
    });
  });

  fastify.post('/:id/invites', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('team.manage')]
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const parseResult = InviteSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw { code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) } as AppError;
    }

    const input = parseResult.data;
    const result = await deps.teamService.invite(params.id, input.email, input.role);
    if (!result.ok) throw result.error;

    return reply.status(201).send(result.value);
  });

  fastify.put('/:id/members/:userId/role', {
    preHandler: [fastify.requireAuth, fastify.requireTeamId, fastify.requireRole('team.manage')]
  }, async (request, reply) => {
    const params = request.params as { id: string; userId: string };
    const parseResult = ChangeRoleSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw { code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) } as AppError;
    }

    const input = parseResult.data;
    const result = await deps.teamService.changeRole(params.id, params.userId, input.role);
    if (!result.ok) throw result.error;

    return reply.status(200).send({ message: 'Role updated successfully' });
  });
};

// Accept route is NOT bound to a specific team ID param in the URL, as the token identifies the invitation.
export const inviteAcceptRoutes = (deps: TeamRoutesDeps): FastifyPluginAsync => async (fastify) => {
  fastify.post('/accept', {
    preHandler: [fastify.requireAuth] // Needs to be authenticated, but team context comes from the token
  }, async (request, reply) => {
    const parseResult = AcceptSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw { code: 'VALIDATION', messages: parseResult.error.errors.map(e => e.message) } as AppError;
    }

    const input = parseResult.data;
    const result = await deps.teamService.acceptInvitation({
      token: input.token,
      userId: request.session!.userId,
    });
    if (!result.ok) throw result.error;

    return reply.status(200).send(result.value);
  });
};
