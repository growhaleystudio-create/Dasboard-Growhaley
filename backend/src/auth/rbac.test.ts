/**
 * Property + unit tests for the content RBAC matrix.
 *
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 *
 * The decision function under test is `rbacGuard.can(role, action)` from
 * `./rbac.ts` — a pure lookup over `RBAC_MATRIX`. The effective-role
 * resolution layer (`authorizeAction` + `EffectiveRoleResolver`) is what
 * feeds the *effective* role into this guard on every request, so the
 * denied-request example below drives `authorizeAction` directly to show a
 * rejected authorization short-circuits with 403 and mutates no downstream
 * request context.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Action, AuthSession, Role } from '@leads-generator/shared';

import { rbacGuard } from './rbac.js';
import { authorizeAction } from './authorize.js';
import type { EffectiveRoleResolver } from './effective-role.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROLES: readonly Role[] = ['admin', 'member', 'viewer'];
const CONTENT_ACTIONS: readonly Action[] = ['content.manage', 'content.generate'];

/**
 * The exact expected decision matrix from the spec (R12.1–R12.4):
 *   - content.manage  : admin only
 *   - content.generate: admin + member
 */
const EXPECTED: Record<Role, Record<'content.manage' | 'content.generate', boolean>> = {
  admin: { 'content.manage': true, 'content.generate': true },
  member: { 'content.manage': false, 'content.generate': true },
  viewer: { 'content.manage': false, 'content.generate': false },
};

// ---------------------------------------------------------------------------
// Property-based tests — Property 24
// ---------------------------------------------------------------------------

describe('rbacGuard — Property 24: Matriks RBAC konten per-aksi', () => {
  // Feature: ai-content-carousel-generator, Property 24: Matriks RBAC konten per-aksi
  // **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6**

  // Property A — over the full cartesian product of roles × content actions,
  // the guard returns EXACTLY the matrix decision (R12.1–R12.4).
  it('A) returns exactly the content matrix decision for every (role, action) pair', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.constantFrom('content.manage' as const, 'content.generate' as const),
        (role, action) => {
          expect(rbacGuard.can(role, action)).toBe(EXPECTED[role][action]);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property B — NON-IMPLICATION: owning one content action never grants the
  // other (R12.5). `content.manage` is strictly more privileged than
  // `content.generate`, so for every role:
  //   - manage ⇒ generate (manage holders may also generate), but
  //   - generate does NOT ⇒ manage (member is the witness: generate=true,
  //     manage=false), so the two permissions are independent lookups and
  //     holding `content.generate` can never imply `content.manage`.
  it('B) holding one content action never grants the other (independent lookups)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ROLES), (role) => {
        const canManage = rbacGuard.can(role, 'content.manage');
        const canGenerate = rbacGuard.can(role, 'content.generate');
        // manage is the higher privilege: anyone who can manage can also generate.
        if (canManage) {
          expect(canGenerate).toBe(true);
        }
        // generate must never silently imply manage for non-admin roles.
        if (canGenerate && role !== 'admin') {
          expect(canManage).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Property C — cross-action isolation: a content decision for a role is
  // never influenced by any unrelated (non-content) action's matrix entry.
  // The guard is a pure per-action lookup, so evaluating other actions first
  // cannot change the content-action outcome (R12.5/R12.6 — actions are
  // decided independently).
  it('C) content decisions are isolated from unrelated action lookups', () => {
    const otherActions: Action[] = [
      'lead.read',
      'lead.write',
      'scan.execute',
      'ai.read_insight',
      'team.manage',
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.constantFrom('content.manage' as const, 'content.generate' as const),
        fc.subarray(otherActions),
        (role, contentAction, probed) => {
          // Probe unrelated actions first; they must not perturb the lookup.
          for (const a of probed) rbacGuard.can(role, a);
          expect(rbacGuard.can(role, contentAction)).toBe(EXPECTED[role][contentAction]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests — explicit matrix witnesses + read access for Viewer
// ---------------------------------------------------------------------------

describe('rbacGuard — content matrix witnesses', () => {
  it('Admin is allowed both content.manage and content.generate', () => {
    expect(rbacGuard.can('admin', 'content.manage')).toBe(true);
    expect(rbacGuard.can('admin', 'content.generate')).toBe(true);
  });

  it('Member is allowed content.generate but denied content.manage', () => {
    expect(rbacGuard.can('member', 'content.generate')).toBe(true);
    expect(rbacGuard.can('member', 'content.manage')).toBe(false);
  });

  it('Viewer is denied both content actions', () => {
    expect(rbacGuard.can('viewer', 'content.manage')).toBe(false);
    expect(rbacGuard.can('viewer', 'content.generate')).toBe(false);
  });

  it('Viewer retains read access (lead.read / ai.read_insight) while content actions are denied', () => {
    // R12: Viewer is denied content mutation/generation but may still read
    // Carousel/status surfaces, which are gated by the read-shaped actions.
    expect(rbacGuard.can('viewer', 'lead.read')).toBe(true);
    expect(rbacGuard.can('viewer', 'ai.read_insight')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Example — a denied authorization mutates no downstream request context
// ---------------------------------------------------------------------------

/** Minimal FastifyReply double that records the status code it was sent. */
function makeReply(): { reply: FastifyReply; calls: { code?: number; sent?: unknown } } {
  const calls: { code?: number; sent?: unknown } = {};
  const reply = {
    code(c: number) {
      calls.code = c;
      return reply;
    },
    async send(payload: unknown) {
      calls.sent = payload;
    },
  };
  return { reply: reply as unknown as FastifyReply, calls };
}

function makeSession(): AuthSession {
  return {
    userId: 'user-1',
    teamId: 'team-1',
    role: 'viewer',
    createdAt: new Date(0),
    lastActivityAt: new Date(0),
  };
}

describe('authorizeAction — denied request performs no data mutation', () => {
  it('short-circuits with 403 and never sets teamId/effectiveRole on the request', async () => {
    // Effective role resolves to viewer, who is denied content.manage.
    const resolver: EffectiveRoleResolver = {
      async get(): Promise<Role | null> {
        return 'viewer';
      },
    };

    const preHandler = authorizeAction({ resolver }, 'content.manage');

    const req = { session: makeSession() } as unknown as FastifyRequest;
    const { reply, calls } = makeReply();

    await preHandler(req, reply);

    // Rejected with 403 — the downstream pipeline is short-circuited.
    expect(calls.code).toBe(403);
    // No downstream context mutated: the Tenant Guard / domain handlers that
    // would mutate data never receive the resolved context.
    expect(req.teamId).toBeUndefined();
    expect(req.effectiveRole).toBeUndefined();
  });

  it('allows the request (sets context, no 403) when the effective role is permitted', async () => {
    const resolver: EffectiveRoleResolver = {
      async get(): Promise<Role | null> {
        return 'admin';
      },
    };

    const preHandler = authorizeAction({ resolver }, 'content.manage');

    const session = makeSession();
    const req = { session } as unknown as FastifyRequest;
    const { reply, calls } = makeReply();

    await preHandler(req, reply);

    expect(calls.code).toBeUndefined();
    expect(req.teamId).toBe(session.teamId);
    expect(req.effectiveRole).toBe('admin');
  });
});
