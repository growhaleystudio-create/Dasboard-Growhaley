/**
 * Tenant-scoped repository for `scan_job` rows.
 *
 * Design references:
 * - design.md → Components and Interfaces → Scan_Engine & Job_Scheduler
 * - design.md → Alur Eksekusi Pemindaian (R5, R12.3, R12.4)
 *
 * The `uniq_running_job` partial index (created in Task 2.1) enforces the
 * "single running job per Configuration" invariant (R5.8); this repository
 * does not duplicate that check in application code.
 */

import type { ScanJob, ScanJobStatus, ScanSummary } from '@leads-generator/shared';

import { mapScanJobRow, type ScanJobRow } from './mapping.js';
import { query, type DbExecutor } from './types.js';

const SCAN_JOB_COLUMNS = `
  id,
  team_id,
  configuration_id,
  trigger,
  status,
  summary,
  started_at,
  finished_at
`;

/**
 * Insert payload — `id` is filled by `gen_random_uuid()`, `started_at` by
 * `now()`. The `summary` is initialized to an empty {@link ScanSummary}
 * unless the caller provides one.
 */
export interface ScanJobInsert {
  teamId: string;
  configurationId: string;
  trigger: ScanJob['trigger'];
  status: ScanJobStatus;
  summary?: ScanSummary;
}

/**
 * Repository for the `scan_job` table. All methods are team-scoped.
 */
export class ScanJobRepository {
  constructor(private readonly db: DbExecutor) {}

  /** Look up a Scan_Job by id within the caller's Team. */
  async findById(teamId: string, jobId: string): Promise<ScanJob | null> {
    const rows = await query<ScanJobRow>(
      this.db,
      `SELECT ${SCAN_JOB_COLUMNS}
         FROM scan_job
        WHERE team_id = $1 AND id = $2`,
      [teamId, jobId],
    );
    if (rows.length === 0) return null;
    const row = rows[0]!;
    if (row.team_id !== teamId) return null;
    return mapScanJobRow(row);
  }

  /** List Scan_Jobs for a Team, most recent first. */
  async listForTeam(teamId: string): Promise<ScanJob[]> {
    const rows = await query<ScanJobRow>(
      this.db,
      `SELECT ${SCAN_JOB_COLUMNS}
         FROM scan_job
        WHERE team_id = $1
        ORDER BY started_at DESC, id ASC`,
      [teamId],
    );
    return rows.map(mapScanJobRow);
  }

  /**
   * List currently-running Scan_Jobs for a single Configuration. The DB's
   * `uniq_running_job` index limits this to at most one row, but the
   * application still scopes by `team_id` for defense in depth (R2.8).
   */
  async listRunningForConfiguration(
    teamId: string,
    configurationId: string,
  ): Promise<ScanJob[]> {
    const rows = await query<ScanJobRow>(
      this.db,
      `SELECT ${SCAN_JOB_COLUMNS}
         FROM scan_job
        WHERE team_id = $1
          AND configuration_id = $2
          AND status = 'running'`,
      [teamId, configurationId],
    );
    return rows.map(mapScanJobRow);
  }

  /** Insert a new Scan_Job. */
  async insert(input: ScanJobInsert): Promise<ScanJob> {
    const summary = input.summary ?? {
      newLeads: 0,
      duplicateLeads: 0,
      excludedSources: [],
      connectorResults: [],
    };
    const rows = await query<ScanJobRow>(
      this.db,
      `INSERT INTO scan_job (
         team_id, configuration_id, trigger, status, summary
       ) VALUES (
         $1, $2, $3, $4, $5::jsonb
       )
       RETURNING ${SCAN_JOB_COLUMNS}`,
      [
        input.teamId,
        input.configurationId,
        input.trigger,
        input.status,
        JSON.stringify(summary),
      ],
    );
    return mapScanJobRow(rows[0]!);
  }

  /** Update the lifecycle status of a Scan_Job. */
  async setStatus(teamId: string, jobId: string, status: ScanJobStatus): Promise<void> {
    await query(
      this.db,
      `UPDATE scan_job
          SET status = $3
        WHERE team_id = $1 AND id = $2`,
      [teamId, jobId, status],
    );
  }

  /** Replace the `summary` jsonb on a Scan_Job. */
  async setSummary(teamId: string, jobId: string, summary: ScanSummary): Promise<void> {
    await query(
      this.db,
      `UPDATE scan_job
          SET summary = $3::jsonb
        WHERE team_id = $1 AND id = $2`,
      [teamId, jobId, JSON.stringify(summary)],
    );
  }

  /**
   * Mark a Scan_Job as finished at the given timestamp. Pass `null` to
   * clear the value (rarely needed; primarily for tests).
   */
  async setFinishedAt(teamId: string, jobId: string, finishedAt: Date | null): Promise<void> {
    await query(
      this.db,
      `UPDATE scan_job
          SET finished_at = $3
        WHERE team_id = $1 AND id = $2`,
      [teamId, jobId, finishedAt],
    );
  }
}
