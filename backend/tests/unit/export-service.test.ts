/**
 * Locks in the authorization, audit, and CSV-shape behavior of
 * `ExportService` (Task 16.2, R11.5/R11.6) plus the pure `toCsv` helper.
 *
 * - R11.6: only an Admin (`export.run`) may export. A Member or Viewer is
 *   rejected with an `AUTHORIZATION` error, the Lead repository is never
 *   queried, the Audit_Log is never written, and no artifact is returned —
 *   the export fails closed BEFORE generation.
 * - R11.5: a successful Admin export returns a CSV (header + one row per
 *   Lead) and records exactly one `export` audit entry carrying the acting
 *   User and Team.
 * - CSV escaping: fields containing commas/quotes/newlines are quoted and
 *   internal quotes doubled (verified both end-to-end and via `toCsv`).
 */

import { describe, it, expect, vi } from 'vitest';
import type { AuthSession, Lead, Role } from '@leads-generator/shared';

import { ExportService } from '../../src/privacy/export-service.js';
import { toCsv, escapeCsvField } from '../../src/privacy/csv.js';
import type { LeadRepository } from '../../src/repository/lead-repository.js';
import type { AuditLog, AuditEntry } from '../../src/privacy/audit-log.js';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/** Build an AuthSession for a given role bound to the fixed Team/User. */
function session(role: Role): AuthSession {
  return {
    userId: USER_ID,
    teamId: TEAM_ID,
    role,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    lastActivityAt: new Date('2024-01-01T00:00:00.000Z'),
  };
}

/** A minimal canonical Lead with overridable fields. */
function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    teamId: TEAM_ID,
    name: 'Acme Co',
    publicContact: 'hello@acme.test',
    profileUrl: 'https://example.test/acme',
    location: 'Jakarta',
    matchedKeywords: ['saas'],
    status: 'New',
    score: 87,
    scoreState: 'scored',
    isDuplicate: false,
    discoveredAt: new Date('2024-03-04T05:06:07.000Z'),
    aiIntentScore: null,
    aiState: 'none',
    createdAt: new Date('2024-03-04T05:06:07.000Z'),
    ...overrides,
  };
}

/** Fake LeadRepository capturing listForTeam calls and returning fixtures. */
function makeFakeLeads(leads: Lead[]) {
  const listForTeam = vi.fn().mockResolvedValue(leads);
  return { repo: { listForTeam } as unknown as LeadRepository, listForTeam };
}

/** Fake AuditLog capturing record() entries. */
function makeFakeAudit() {
  const record = vi.fn().mockResolvedValue(undefined);
  const recordTx = vi.fn().mockResolvedValue(undefined);
  return { audit: { record, recordTx } as unknown as AuditLog, record, recordTx };
}

describe('ExportService.exportLeads — authorized (Admin, R11.5)', () => {
  it('returns a CSV with a header row plus one row per Lead', async () => {
    const leads = [
      makeLead({ id: 'lead-1', name: 'Alpha' }),
      makeLead({ id: 'lead-2', name: 'Beta', score: null, scoreState: 'unscored' }),
    ];
    const { repo, listForTeam } = makeFakeLeads(leads);
    const { audit } = makeFakeAudit();
    const service = new ExportService({ leads: repo, audit });

    const result = await service.exportLeads(session('admin'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.contentType).toBe('text/csv');
    expect(result.value.rowCount).toBe(2);

    const lines = result.value.csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(3); // header + 2 leads
    expect(lines[0]).toBe('id,name,public_contact,profile_url,location,status,score,discovered_at');
    expect(lines[1]).toContain('lead-1');
    expect(lines[1]).toContain('Alpha');
    expect(lines[1]).toContain('87');
    // Unscored lead → empty score field, ISO discoveredAt present.
    expect(lines[2]).toContain('lead-2');
    expect(lines[2]).toContain('2024-03-04T05:06:07.000Z');

    // Canonical-only export (no duplicates).
    expect(listForTeam).toHaveBeenCalledTimes(1);
    expect(listForTeam).toHaveBeenCalledWith(
      TEAM_ID,
      expect.objectContaining({ includeDuplicates: false }),
    );

    expect(result.value.filename.startsWith(`leads-${TEAM_ID}-`)).toBe(true);
    expect(result.value.filename.endsWith('.csv')).toBe(true);
  });

  it('records exactly one export audit entry with actor + team', async () => {
    const { repo } = makeFakeLeads([makeLead()]);
    const { audit, record } = makeFakeAudit();
    const service = new ExportService({ leads: repo, audit });

    const result = await service.exportLeads(session('admin'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(record).toHaveBeenCalledTimes(1);
    const entry = record.mock.calls[0]![0] as AuditEntry;
    expect(entry.action).toBe('export');
    expect(entry.actorId).toBe(USER_ID);
    expect(entry.teamId).toBe(TEAM_ID);
    expect(entry.objectType).toBe('lead_export');
    // Object id ties the audit row to the produced artifact.
    expect(entry.objectId).toBe(result.value.filename);
  });

  it('exports an empty leads set as a header-only CSV with rowCount 0', async () => {
    const { repo } = makeFakeLeads([]);
    const { audit, record } = makeFakeAudit();
    const service = new ExportService({ leads: repo, audit });

    const result = await service.exportLeads(session('admin'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rowCount).toBe(0);
    const lines = result.value.csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    // Even an empty export is an audited action.
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('CSV-escapes fields containing commas and quotes', async () => {
    const leads = [makeLead({ id: 'lead-x', name: 'Smith, "Bob" & Co' })];
    const { repo } = makeFakeLeads(leads);
    const { audit } = makeFakeAudit();
    const service = new ExportService({ leads: repo, audit });

    const result = await service.exportLeads(session('admin'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Field is wrapped in quotes and internal quotes doubled.
    expect(result.value.csv).toContain('"Smith, ""Bob"" & Co"');
  });
});

describe('ExportService.exportLeads — unauthorized (R11.6)', () => {
  it('rejects a Member with AUTHORIZATION and never loads leads or audits', async () => {
    const { repo, listForTeam } = makeFakeLeads([makeLead()]);
    const { audit, record } = makeFakeAudit();
    const service = new ExportService({ leads: repo, audit });

    const result = await service.exportLeads(session('member'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AUTHORIZATION');
    // No artifact, no generation, no audit — fail-closed before generation.
    expect(listForTeam).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('value');
  });

  it('rejects a Viewer with AUTHORIZATION and never loads leads or audits', async () => {
    const { repo, listForTeam } = makeFakeLeads([makeLead()]);
    const { audit, record } = makeFakeAudit();
    const service = new ExportService({ leads: repo, audit });

    const result = await service.exportLeads(session('viewer'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AUTHORIZATION');
    expect(listForTeam).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});

describe('toCsv / escapeCsvField (pure CSV helper)', () => {
  it('leaves plain fields unquoted and joins with comma + CRLF', () => {
    const csv = toCsv(['a', 'b'], [['1', '2']]);
    expect(csv).toBe('a,b\r\n1,2\r\n');
  });

  it('quotes fields containing a comma', () => {
    expect(escapeCsvField('x,y')).toBe('"x,y"');
  });

  it('quotes and doubles internal quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes fields containing newlines', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('escapes special characters inside a full document', () => {
    const csv = toCsv(['name', 'note'], [['Acme, Inc', 'a "quote"']]);
    expect(csv).toBe('name,note\r\n"Acme, Inc","a ""quote"""\r\n');
  });
});
