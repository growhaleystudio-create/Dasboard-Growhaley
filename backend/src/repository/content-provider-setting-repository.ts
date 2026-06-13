/**
 * Tenant-scoped repository for the `content_provider_setting` table.
 *
 * Design references:
 * - design.md → Components and Interfaces → ContentProviderSettingService (R14, R16)
 * - design.md → Desain Keamanan dan Privasi → Tenant Guard
 *
 * All methods accept `teamId` as first argument and scope every query to
 * `team_id`. No cross-team access is possible (R16.2).
 *
 * Requirements: 16.1, 16.2
 */

import type { ProviderSetting } from '@leads-generator/shared';

import { query, type DbExecutor } from './types.js';

// ---------------------------------------------------------------------------
// Internal DB row shape
// ---------------------------------------------------------------------------

interface ContentProviderSettingRow {
  team_id: string;
  kind: 'google_official' | 'third_party_proxy';
  base_url: string;
  updated_at: Date | string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(row: ContentProviderSettingRow): ProviderSetting {
  return {
    teamId: row.team_id,
    kind: row.kind,
    baseUrl: row.base_url,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Repository for the `content_provider_setting` table.
 * All methods are team-scoped (Tenant Guard, R16.2).
 */
export class ContentProviderSettingRepository {
  constructor(private readonly db: DbExecutor) {}

  /** Return the provider setting for a Team, or `null` if not yet configured. */
  async findByTeam(teamId: string): Promise<ProviderSetting | null> {
    const rows = await query<ContentProviderSettingRow>(
      this.db,
      `SELECT team_id, kind, base_url, updated_at
         FROM content_provider_setting
        WHERE team_id = $1`,
      [teamId],
    );
    if (rows.length === 0) return null;
    return mapRow(rows[0]!);
  }

  /**
   * Upsert the provider setting for a Team.
   * ON CONFLICT (team_id) updates `kind`, `base_url`, and `updated_at`.
   */
  async upsert(
    teamId: string,
    kind: 'google_official' | 'third_party_proxy',
    baseUrl: string,
  ): Promise<ProviderSetting> {
    const rows = await query<ContentProviderSettingRow>(
      this.db,
      `INSERT INTO content_provider_setting (team_id, kind, base_url, updated_at)
            VALUES ($1, $2, $3, now())
       ON CONFLICT (team_id)
       DO UPDATE SET
           kind       = EXCLUDED.kind,
           base_url   = EXCLUDED.base_url,
           updated_at = now()
       RETURNING team_id, kind, base_url, updated_at`,
      [teamId, kind, baseUrl],
    );
    return mapRow(rows[0]!);
  }
}
