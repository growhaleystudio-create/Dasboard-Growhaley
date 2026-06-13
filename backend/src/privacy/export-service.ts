/**
 * Export_Service — produces a CSV export of a Team's canonical Leads, gated
 * by RBAC and recorded in the Audit_Log (R11.5, R11.6).
 *
 * Design references:
 * - design.md → Privacy_Service / Privacy → "Otorisasi ekspor": only an
 *   Admin (`rbacGuard.can(role, 'export.run')`, Admin-only per the RBAC
 *   matrix) may run an export; the result must never be handed to an
 *   unauthorized caller.
 * - design.md → Error Handling → Ekspor: an unauthorized attempt yields an
 *   `AUTHORIZATION` error with a user-facing message, distinct from a
 *   validation/not-found failure.
 * - requirements.md R11.5: "WHEN Admin mengekspor Lead, THE System SHALL
 *   menghasilkan ekspor dan mencatat aksi ekspor pada Audit_Log beserta
 *   pelaku dan waktu."
 * - requirements.md R11.6: "IF User tanpa peran yang berwenang mencoba
 *   mengekspor Lead, THEN THE System SHALL menolak akses User tersebut
 *   terhadap hasil ekspor dan menampilkan pesan kesalahan otorisasi,
 *   meskipun proses pembuatan ekspor telah dimulai atau selesai."
 *
 * Authorization is **fail-closed before generation**: the guard runs first
 * and an unauthorized role is rejected before any Lead is loaded or any CSV
 * byte is produced. This is the strongest possible reading of R11.6 — there
 * is no artifact to leak because none is created. (The requirement also
 * tolerates the artifact having been generated, but we never reach that
 * state for an unauthorized caller, so "menolak akses hasil" holds
 * strictly.) The audit entry (R11.5) is written only on the success path,
 * after the artifact exists, with the acting User as `actorId`; the row's
 * `at` timestamp is stamped by the database (see {@link AuditLog}).
 */

import type { AuthSession, Lead, Result } from '@leads-generator/shared';
import { err, ok } from '@leads-generator/shared';

import { rbacGuard } from '../auth/rbac.js';
import type { LeadRepository } from '../repository/lead-repository.js';

import { toCsv } from './csv.js';
import type { AuditLog } from './audit-log.js';

/**
 * Upper bound on the number of Leads pulled into a single export. Large
 * enough to cover any realistic Team while still bounding memory; the export
 * is a one-shot in-memory CSV build, not a stream.
 */
const EXPORT_LIMIT = 100_000;

/** Column order of the exported CSV. Stable so importers can rely on it. */
const CSV_HEADERS: readonly string[] = [
  'id',
  'name',
  'public_contact',
  'profile_url',
  'location',
  'status',
  'score',
  'discovered_at',
] as const;

/**
 * The produced export artifact. `csv` is the full document; `rowCount` is the
 * number of Lead rows (excluding the header).
 */
export interface ExportArtifact {
  filename: string;
  contentType: 'text/csv';
  rowCount: number;
  csv: string;
}

/**
 * Collaborators required by {@link ExportService}.
 */
export interface ExportServiceDeps {
  leads: LeadRepository;
  audit: AuditLog;
}

/**
 * Render a single Lead into the CSV field order declared by
 * {@link CSV_HEADERS}. Optional Personal_Data attributes (R11.1) collapse to
 * the empty string when absent; `score` is the empty string when the Lead is
 * unscored (`null`, R7.8); `discoveredAt` is serialized as an ISO-8601
 * instant. Escaping is handled by {@link toCsv}, so raw values are returned
 * here.
 */
function leadToRow(lead: Lead): string[] {
  return [
    lead.id,
    lead.name ?? '',
    lead.publicContact ?? '',
    lead.profileUrl ?? '',
    lead.location ?? '',
    lead.status,
    lead.score === null ? '' : String(lead.score),
    lead.discoveredAt.toISOString(),
  ];
}

/**
 * Service that turns a Team's canonical Leads into a downloadable CSV,
 * enforcing Admin-only authorization and writing the audit trail.
 */
export class ExportService {
  constructor(private readonly deps: ExportServiceDeps) {}

  /**
   * Export the acting Team's canonical Leads as CSV.
   *
   * R11.6: authorization is checked FIRST. A role without `export.run`
   * (Member, Viewer) is rejected with an `AUTHORIZATION` error and NO
   * artifact is generated or returned — the Lead data is never even loaded.
   *
   * R11.5: on success the export is recorded in the Audit_Log with the
   * acting User (`actorId`) and the DB-stamped time, using action `'export'`
   * and the generated filename as the object id.
   */
  async exportLeads(actor: AuthSession): Promise<Result<ExportArtifact>> {
    // Fail-closed: deny before any generation so an unauthorized caller can
    // never reach the artifact (R11.6).
    if (!rbacGuard.can(actor.role, 'export.run')) {
      return err({ code: 'AUTHORIZATION', message: 'Tidak berwenang mengekspor Lead' });
    }

    const leads = await this.deps.leads.listForTeam(actor.teamId, {
      includeDuplicates: false,
      limit: EXPORT_LIMIT,
      offset: 0,
    });

    const csv = toCsv(
      CSV_HEADERS,
      leads.map(leadToRow),
    );
    const filename = `leads-${actor.teamId}-${Date.now()}.csv`;

    // R11.5: record the export with actor + (DB-stamped) time. Written only
    // after the artifact exists, on the authorized success path.
    await this.deps.audit.record({
      teamId: actor.teamId,
      actorId: actor.userId,
      action: 'export',
      objectType: 'lead_export',
      objectId: filename,
    });

    return ok({ filename, contentType: 'text/csv', rowCount: leads.length, csv });
  }
}
