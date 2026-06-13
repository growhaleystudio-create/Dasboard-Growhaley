/**
 * Unit tests for {@link LeadManager.addNote} and {@link LeadManager.deleteLead}
 * (Task 13.3, R8.3–R8.7).
 *
 * These example-based tests pin specific behaviours via in-memory fakes
 * injected through {@link LeadManagerDeps} (no real database):
 * - addNote: boundary lengths (1 and 2000) persist; out-of-range (0 and
 *   2001) are rejected with VALIDATION and write nothing (existing notes
 *   untouched, R8.4); a missing Lead yields NOT_FOUND.
 * - deleteLead: without confirmation the Lead is preserved and no delete /
 *   audit occurs (R8.6); with confirmation the Lead is deleted and a
 *   `delete` audit entry is recorded (R8.7); a missing Lead yields
 *   NOT_FOUND.
 */

import { describe, it, expect } from 'vitest';
import type { AuthSession, Lead, LeadStatus } from '@leads-generator/shared';

import { LeadManager } from '../../src/lead/index.js';
import type {
  ActivityWriter,
  AuditWriter,
  LeadManagerDeps,
  LeadStatusStore,
  NoteWriter,
} from '../../src/lead/index.js';
import type { NoteRow } from '../../src/lead/note-repository.js';
import type { AuditEntry } from '../../src/privacy/audit-log.js';
import type { Tx } from '../../src/db/transaction.js';

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const TEAM = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const LEAD = '33333333-3333-3333-3333-333333333333';
const REF = new Date('2024-01-01T00:00:00.000Z');

function makeLead(id: string, teamId: string, status: LeadStatus = 'New'): Lead {
  return {
    id,
    teamId,
    matchedKeywords: [],
    status,
    score: null,
    scoreState: 'unscored',
    isDuplicate: false,
    discoveredAt: REF,
    aiIntentScore: null,
    aiState: 'none',
    createdAt: REF,
  };
}

function makeSession(userId: string, teamId: string): AuthSession {
  return { userId, teamId, role: 'member', createdAt: REF, lastActivityAt: REF };
}

// ---------------------------------------------------------------------------
// In-memory fakes.
// ---------------------------------------------------------------------------

interface InsertNoteCall {
  leadId: string;
  authorId: string;
  body: string;
}

/** Fake note store recording every `insert` and returning a deterministic row. */
class FakeNoteRepository implements NoteWriter {
  readonly insertCalls: InsertNoteCall[] = [];

  async insert(leadId: string, authorId: string, body: string): Promise<NoteRow> {
    this.insertCalls.push({ leadId, authorId, body });
    return {
      id: 'note-1',
      lead_id: leadId,
      body,
      author_id: authorId,
      created_at: REF,
    };
  }
}

/** Fake Activity_Log writer recording `note_added` events. */
class FakeActivityRepository implements ActivityWriter {
  noteAddedCalls = 0;

  async recordStatusChange(): Promise<void> {}

  async recordNoteAdded(): Promise<void> {
    this.noteAddedCalls += 1;
  }
}

interface DeleteCall {
  teamId: string;
  leadId: string;
}

/**
 * Fake Lead store seeded with zero or one Lead. `findById` honours team
 * scoping; `delete` records the call and removes the seeded Lead.
 */
class FakeLeadRepository implements LeadStatusStore {
  readonly deleteCalls: DeleteCall[] = [];

  constructor(private lead: Lead | null) {}

  async findById(teamId: string, leadId: string): Promise<Lead | null> {
    if (this.lead === null) return null;
    if (this.lead.teamId !== teamId || this.lead.id !== leadId) return null;
    return this.lead;
  }

  async updateStatus(): Promise<Lead | null> {
    throw new Error('updateStatus must not be called in these tests');
  }

  async delete(teamId: string, leadId: string): Promise<boolean> {
    this.deleteCalls.push({ teamId, leadId });
    if (this.lead === null) return false;
    if (this.lead.teamId !== teamId || this.lead.id !== leadId) return false;
    this.lead = null;
    return true;
  }
}

/** Fake Audit_Log capturing `recordTx` entries. */
class FakeAuditLog implements AuditWriter {
  readonly entries: AuditEntry[] = [];

  async recordTx(_tx: Tx, entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

/**
 * Build a manager wired to the supplied fakes plus a fake `runInTx` that
 * runs the unit of work directly.
 */
function makeManager(fakes: {
  leads: LeadStatusStore;
  notes?: NoteWriter;
  activities?: ActivityWriter;
  audit?: AuditWriter;
}): LeadManager {
  const deps: LeadManagerDeps = {
    runInTx: <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => fn({} as Tx),
    leads: () => fakes.leads,
    now: () => REF,
  };
  if (fakes.notes) deps.notes = () => fakes.notes!;
  if (fakes.activities) deps.activities = () => fakes.activities!;
  if (fakes.audit) deps.audit = () => fakes.audit!;
  return new LeadManager(deps);
}

// ---------------------------------------------------------------------------
// addNote.
// ---------------------------------------------------------------------------

describe('LeadManager.addNote', () => {
  it('persists a 1-character note (lower bound) and records a note_added Activity', async () => {
    const leads = new FakeLeadRepository(makeLead(LEAD, TEAM));
    const notes = new FakeNoteRepository();
    const activities = new FakeActivityRepository();
    const manager = makeManager({ leads, notes, activities });

    const result = await manager.addNote(makeSession(USER, TEAM), LEAD, 'x');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      id: 'note-1',
      leadId: LEAD,
      body: 'x',
      authorId: USER,
      createdAt: REF,
    });
    expect(notes.insertCalls).toEqual([{ leadId: LEAD, authorId: USER, body: 'x' }]);
    expect(activities.noteAddedCalls).toBe(1);
  });

  it('persists a 2000-character note (upper bound)', async () => {
    const body = 'a'.repeat(2000);
    const leads = new FakeLeadRepository(makeLead(LEAD, TEAM));
    const notes = new FakeNoteRepository();
    const manager = makeManager({ leads, notes, activities: new FakeActivityRepository() });

    const result = await manager.addNote(makeSession(USER, TEAM), LEAD, body);

    expect(result.ok).toBe(true);
    expect(notes.insertCalls).toHaveLength(1);
    expect(notes.insertCalls[0]!.body).toBe(body);
  });

  it('rejects an empty note (0 chars) with VALIDATION and writes nothing (R8.4)', async () => {
    const leads = new FakeLeadRepository(makeLead(LEAD, TEAM));
    const notes = new FakeNoteRepository();
    const activities = new FakeActivityRepository();
    const manager = makeManager({ leads, notes, activities });

    const result = await manager.addNote(makeSession(USER, TEAM), LEAD, '');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    // Existing notes untouched: no insert, no Activity.
    expect(notes.insertCalls).toHaveLength(0);
    expect(activities.noteAddedCalls).toBe(0);
  });

  it('rejects a 2001-character note with VALIDATION and writes nothing (R8.4)', async () => {
    const leads = new FakeLeadRepository(makeLead(LEAD, TEAM));
    const notes = new FakeNoteRepository();
    const activities = new FakeActivityRepository();
    const manager = makeManager({ leads, notes, activities });

    const result = await manager.addNote(makeSession(USER, TEAM), LEAD, 'a'.repeat(2001));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    if (result.error.code === 'VALIDATION') {
      expect(result.error.messages.join(' ')).toMatch(/2000/);
    }
    expect(notes.insertCalls).toHaveLength(0);
    expect(activities.noteAddedCalls).toBe(0);
  });

  it('returns NOT_FOUND when the Lead does not exist for the team', async () => {
    const leads = new FakeLeadRepository(null);
    const notes = new FakeNoteRepository();
    const manager = makeManager({ leads, notes, activities: new FakeActivityRepository() });

    const result = await manager.addNote(makeSession(USER, TEAM), LEAD, 'hello');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(notes.insertCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deleteLead.
// ---------------------------------------------------------------------------

describe('LeadManager.deleteLead', () => {
  it('does not delete or audit when not confirmed, preserving the Lead (R8.6)', async () => {
    const leads = new FakeLeadRepository(makeLead(LEAD, TEAM));
    const audit = new FakeAuditLog();
    const manager = makeManager({ leads, audit });

    const result = await manager.deleteLead(makeSession(USER, TEAM), LEAD, false);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ deleted: false });
    expect(leads.deleteCalls).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('permanently deletes the Lead and records a delete audit entry when confirmed (R8.7)', async () => {
    const leads = new FakeLeadRepository(makeLead(LEAD, TEAM));
    const audit = new FakeAuditLog();
    const manager = makeManager({ leads, audit });

    const result = await manager.deleteLead(makeSession(USER, TEAM), LEAD, true);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ deleted: true });
    expect(leads.deleteCalls).toEqual([{ teamId: TEAM, leadId: LEAD }]);
    expect(audit.entries).toEqual([
      {
        teamId: TEAM,
        actorId: USER,
        action: 'delete',
        objectType: 'lead',
        objectId: LEAD,
      },
    ]);
  });

  it('returns NOT_FOUND and does not delete when the Lead is missing', async () => {
    const leads = new FakeLeadRepository(null);
    const audit = new FakeAuditLog();
    const manager = makeManager({ leads, audit });

    const result = await manager.deleteLead(makeSession(USER, TEAM), LEAD, true);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(leads.deleteCalls).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });
});
