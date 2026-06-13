/**
 * Tenant-scoped repository for `scan_configuration` rows.
 *
 * Design references:
 * - design.md → Components and Interfaces → Scan_Config_Service
 * - design.md → Data Models → Skema PostgreSQL: column names
 *
 * This repository is purely persistence — input validation (keyword
 * count/length, niche/location bounds, schedule interval) belongs to
 * `Scan_Config_Service` (Task 8.x).
 */

import type { ScanConfiguration } from '@leads-generator/shared';

import { mapScanConfigurationRow, type ScanConfigurationRow } from './mapping.js';
import { query, type DbExecutor } from './types.js';

const SCAN_CONFIGURATION_COLUMNS = `
  id,
  team_id,
  keywords,
  niche,
  location,
  source_ids,
  schedule_interval_minutes,
  ai_enabled,
  created_at
`;

/** Insert payload — `id` is filled by `gen_random_uuid()`. */
export type ScanConfigurationInsert = Omit<ScanConfiguration, 'id'>;

/** Mutable subset of a Scan_Configuration accepted by `update`. */
export type ScanConfigurationUpdate = Omit<ScanConfiguration, 'id' | 'teamId'>;

/**
 * Repository for the `scan_configuration` table. All methods are
 * team-scoped.
 */
export class ScanConfigurationRepository {
  constructor(private readonly db: DbExecutor) {}

  /** Look up a Scan_Configuration by id within the caller's Team. */
  async findById(teamId: string, configurationId: string): Promise<ScanConfiguration | null> {
    const rows = await query<ScanConfigurationRow>(
      this.db,
      `SELECT ${SCAN_CONFIGURATION_COLUMNS}
         FROM scan_configuration
        WHERE team_id = $1 AND id = $2`,
      [teamId, configurationId],
    );
    if (rows.length === 0) return null;
    const row = rows[0]!;
    if (row.team_id !== teamId) return null;
    return mapScanConfigurationRow(row);
  }

  /** List all Scan_Configurations for a Team, newest first. */
  async listForTeam(teamId: string): Promise<ScanConfiguration[]> {
    const rows = await query<ScanConfigurationRow>(
      this.db,
      `SELECT ${SCAN_CONFIGURATION_COLUMNS}
         FROM scan_configuration
        WHERE team_id = $1
        ORDER BY created_at DESC, id ASC`,
      [teamId],
    );
    return rows.map(mapScanConfigurationRow);
  }

  /** Insert a new Scan_Configuration scoped to `teamId`. */
  async insert(teamId: string, input: ScanConfigurationInsert): Promise<ScanConfiguration> {
    const rows = await query<ScanConfigurationRow>(
      this.db,
      `INSERT INTO scan_configuration (
         team_id, keywords, niche, location, source_ids,
         schedule_interval_minutes, ai_enabled
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7
       )
       RETURNING ${SCAN_CONFIGURATION_COLUMNS}`,
      [
        teamId,
        input.keywords,
        input.niche ?? null,
        input.location ?? null,
        input.sourceIds,
        input.schedule?.intervalMinutes ?? null,
        input.aiEnabled,
      ],
    );
    return mapScanConfigurationRow(rows[0]!);
  }

  /**
   * Replace the mutable fields of a Scan_Configuration. Returns the
   * updated row, or `null` when no row matched (wrong Team or unknown id).
   */
  async update(
    teamId: string,
    configurationId: string,
    update: ScanConfigurationUpdate,
  ): Promise<ScanConfiguration | null> {
    const rows = await query<ScanConfigurationRow>(
      this.db,
      `UPDATE scan_configuration
          SET keywords = $3,
              niche = $4,
              location = $5,
              source_ids = $6,
              schedule_interval_minutes = $7,
              ai_enabled = $8
        WHERE team_id = $1 AND id = $2
        RETURNING ${SCAN_CONFIGURATION_COLUMNS}`,
      [
        teamId,
        configurationId,
        update.keywords,
        update.niche ?? null,
        update.location ?? null,
        update.sourceIds,
        update.schedule?.intervalMinutes ?? null,
        update.aiEnabled,
      ],
    );
    if (rows.length === 0) return null;
    return mapScanConfigurationRow(rows[0]!);
  }

  /** Delete a Scan_Configuration. Returns `true` if a row was removed. */
  async delete(teamId: string, configurationId: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM scan_configuration
        WHERE team_id = $1 AND id = $2`,
      [teamId, configurationId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Load all scheduled Scan_Configurations for the job scheduler (R5.6). */
  async loadScheduled(): Promise<any[]> {
    const rows = await query<any>(
      this.db,
      `SELECT c.id, c.team_id, c.keywords, c.niche, c.location, c.source_ids, c.schedule_interval_minutes, c.ai_enabled,
              (SELECT MAX(j.started_at)
                 FROM scan_job j
                WHERE j.configuration_id = c.id
                  AND j.status != 'skipped') as last_run_started_at
         FROM scan_configuration c
        WHERE c.schedule_interval_minutes IS NOT NULL
          AND c.schedule_interval_minutes > 0`
    );
    return rows.map((row) => ({
      teamId: row.team_id,
      configurationId: row.id,
      intervalMinutes: row.schedule_interval_minutes,
      lastRunStartedAt: row.last_run_started_at ? new Date(row.last_run_started_at) : null,
      query: {
        keywords: row.keywords,
        ...(row.niche !== null ? { niche: row.niche } : {}),
        ...(row.location !== null ? { location: row.location } : {}),
      },
      sourceIds: row.source_ids,
    }));
  }
}
