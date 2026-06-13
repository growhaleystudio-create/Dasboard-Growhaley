/**
 * Property-based test for `LeadManager.changeStatus` Activity logging
 * (Task 13.1).
 *
 * - **Property 23: Pencatatan Activity perubahan status** (R8.2) — for an
 *   arbitrary `(from, to)` status pair:
 *     - when `to !== from`, `changeStatus` persists the new status AND
 *       records EXACTLY ONE Activity with `{ fromStatus: from, toStatus:
 *       to, actorId, at }`;
 *     - when `to === from`, NO Activity is recorded and the status is left
 *       unchanged (no-op).
 *
 * No real database is used. In-memory fakes stand in for the Lead store and
 * the Activity_Log writer, capturing every call; a fake `runInTx` runs the
 * unit of work directly (the orchestration under test issues both writes in
 * one transaction, which the fake models as a single synchronous scope).
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';

import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';
import { LEAD_STATUSES } from '@leads-generator/shared';
import type { AuthSession, Lead, LeadStatus } from '@leads-generator/shared';

import { LeadManager } from '../../src/lead/index.js';
import type {
  ActivityWriter,
  LeadManagerDeps,
  LeadStatusStore,
} from '../../src/lead/index.js';
import type { Tx } from '../../src/db/transaction.js';

// ---------------------------------------------------------------------------
// In-memory fakes.
// ---------------------------------------------------------------------------

/** A recorded `recordStatusChange` call. */
interface StatusChangeCall {
  leadId: string;
  actorId: string;
  from: LeadStatus;
  to: LeadStatus;
  at: Date | undefined;
}

/** Fake Activity_Log writer capturing every status-change record. */
class FakeActivityRepository implements ActivityWriter {
  readonly calls: StatusChangeCall[] = [];

  async recordStatusChange(
    leadId: string,
    actorId: string,
    from: LeadStatus,
    to: LeadStatus,
    at?: Date,
  ): Promise<void> {
    this.calls.push({ leadId, actorId, from, to, at });
  }

  // Part of the broadened ActivityWriter surface (R8.3); unused by the
  // status-change property under test.
  async recordNoteAdded(): Promise<void> {}
}

/** A recorded `updateStatus` call. */
interface UpdateStatusCall {
  teamId: string;
  leadId: string;
  status: LeadStatus;
}

/**
 * Fake Lead store seeded with a single Lead. `findById` honours team
 * scoping; `updateStatus` mutates the stored status and records the call.
 */
class FakeLeadRepository implements LeadStatusStore {
  readonly updateCalls: UpdateStatusCall[] = [];

  constructor(private lead: Lead) {}

  async findById(teamId: string, leadId: string): Promise<Lead | null> {
    if (this.lead.teamId !== teamId || this.lead.id !== leadId) return null;
    return this.lead;
  }

  async updateStatus(
    teamId: string,
    leadId: string,
    status: LeadStatus,
  ): Promise<Lead | null> {
    this.updateCalls.push({ teamId, leadId, status });
    if (this.lead.teamId !== teamId || this.lead.id !== leadId) return null;
    this.lead = { ...this.lead, status };
    return this.lead;
  }

  // Part of the broadened LeadStatusStore surface (R8.7); unused by the
  // status-change property under test.
  async delete(): Promise<boolean> {
    return false;
  }

  current(): Lead {
    return this.lead;
  }
}

// ---------------------------------------------------------------------------
// Generators.
// ---------------------------------------------------------------------------

const statusArb: fc.Arbitrary<LeadStatus> = fc.constantFrom(...LEAD_STATUSES);

/** A minimal valid Lead carrying the generated `from` status. */
function makeLead(id: string, teamId: string, status: LeadStatus): Lead {
  return {
    id,
    teamId,
    matchedKeywords: [],
    status,
    score: null,
    scoreState: 'unscored',
    isDuplicate: false,
    discoveredAt: new Date('2024-01-01T00:00:00.000Z'),
    aiIntentScore: null,
    aiState: 'none',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };
}

function makeSession(userId: string, teamId: string): AuthSession {
  const t = new Date('2024-01-01T00:00:00.000Z');
  return { userId, teamId, role: 'member', createdAt: t, lastActivityAt: t };
}

// ---------------------------------------------------------------------------
// Property.
// ---------------------------------------------------------------------------

describe('LeadManager.changeStatus Activity logging (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 23: Pencatatan Activity perubahan status
  // Validates: Requirements 8.2
  propertyTest(it, 23, 'Pencatatan Activity perubahan status', async () => {
    await pbt.assert(
      fc.asyncProperty(
        statusArb,
        statusArb,
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.date({ min: new Date('2024-01-01T00:00:00.000Z'), max: new Date('2030-01-01T00:00:00.000Z') }),
        async (from, to, teamId, leadId, userId, at) => {
          const leads = new FakeLeadRepository(makeLead(leadId, teamId, from));
          const activities = new FakeActivityRepository();

          const deps: LeadManagerDeps = {
            runInTx: <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => fn({} as Tx),
            leads: () => leads,
            activities: () => activities,
            now: () => at,
          };
          const manager = new LeadManager(deps);
          const actor = makeSession(userId, teamId);

          const result = await manager.changeStatus(actor, leadId, to);
          if (!result.ok) return false;

          if (to === from) {
            // No-op: status unchanged, no Activity, no update issued.
            if (result.value.status !== from) return false;
            if (leads.current().status !== from) return false;
            if (leads.updateCalls.length !== 0) return false;
            return activities.calls.length === 0;
          }

          // Changed: new status persisted.
          if (result.value.status !== to) return false;
          if (leads.current().status !== to) return false;
          if (leads.updateCalls.length !== 1) return false;
          const update = leads.updateCalls[0]!;
          if (update.teamId !== teamId || update.leadId !== leadId || update.status !== to) {
            return false;
          }

          // Exactly one Activity with the right shape.
          if (activities.calls.length !== 1) return false;
          const activity = activities.calls[0]!;
          return (
            activity.leadId === leadId &&
            activity.actorId === userId &&
            activity.from === from &&
            activity.to === to &&
            activity.at?.getTime() === at.getTime()
          );
        },
      ),
      defaultPbtParams,
    );
  });
});
