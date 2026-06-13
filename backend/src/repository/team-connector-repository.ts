/**
 * Tenant-scoped repository for `team_connector` rows.
 *
 * Design references:
 * - design.md → Components and Interfaces → Connector_Registry & Credential_Vault
 * - design.md → Security → Kredensial connector (R3.4): plaintext credentials
 *   never leak. This repository writes the encrypted blob but never reads it
 *   back — credential decryption is the exclusive responsibility of the
 *   Credential_Vault module (Task 6.1).
 *
 * Methods exposed here cover what the Connector_Registry / Connector Admin
 * UI needs (list, get, status updates, write/clear encrypted credentials).
 * Conspicuously absent: a method that returns `encrypted_credentials` —
 * Task 6.1 introduces a separate, audited path for that.
 */

import type { ConnectorDescriptor, ConnectorStatus } from '@leads-generator/shared';

import { mapTeamConnectorRow, type TeamConnectorRow } from './mapping.js';
import { query, type DbExecutor } from './types.js';

/**
 * Columns selected for the public-facing {@link ConnectorDescriptor}.
 *
 * Note: `encrypted_credentials` is NOT included. Even reading it as a typed
 * column would let it leak through `mapTeamConnectorRow`'s output shape if
 * the type were ever widened — keeping it out of the projection is the
 * simplest enforcement.
 */
const CONNECTOR_DESCRIPTOR_COLUMNS = `
  team_id,
  source_id,
  status,
  unavailable_reason,
  usage_policy
`;

/**
 * Repository for the `team_connector` table. All methods are team-scoped.
 *
 * Lifecycle of an entry: a row is INSERTed when an Admin first registers a
 * connector for the Team; subsequent activation/validation flows mutate
 * `status`, `unavailable_reason`, and `encrypted_credentials` via the
 * dedicated methods below.
 */
export class TeamConnectorRepository {
  constructor(private readonly db: DbExecutor) {}

  /** List all connector descriptors registered for a Team. */
  async listForTeam(teamId: string): Promise<ConnectorDescriptor[]> {
    const rows = await query<TeamConnectorRow>(
      this.db,
      `SELECT ${CONNECTOR_DESCRIPTOR_COLUMNS}
         FROM team_connector
        WHERE team_id = $1
        ORDER BY source_id ASC`,
      [teamId],
    );
    return rows.map(mapTeamConnectorRow);
  }

  async listCredentialPresence(teamId: string): Promise<Array<{ sourceId: string; connected: boolean }>> {
    const rows = await query<{ source_id: string; connected: boolean }>(
      this.db,
      `SELECT source_id,
              encrypted_credentials IS NOT NULL AS connected
         FROM team_connector
        WHERE team_id = $1`,
      [teamId],
    );
    return rows.map((row) => ({
      sourceId: row.source_id,
      connected: row.connected,
    }));
  }

  /** Look up a single connector descriptor by Source id. */
  async get(teamId: string, sourceId: string): Promise<ConnectorDescriptor | null> {
    const rows = await query<TeamConnectorRow>(
      this.db,
      `SELECT ${CONNECTOR_DESCRIPTOR_COLUMNS}
         FROM team_connector
        WHERE team_id = $1 AND source_id = $2`,
      [teamId, sourceId],
    );
    if (rows.length === 0) return null;
    const row = rows[0]!;
    if (row.team_id !== teamId) return null;
    return mapTeamConnectorRow(row);
  }

  /**
   * Upsert the connector status (and optional `unavailable_reason`) for a
   * given Team + Source. Inserts a new row when the connector is
   * registered for the first time; updates the existing one otherwise.
   *
   * Does NOT touch `encrypted_credentials` — credentials are managed
   * separately via {@link setEncryptedCredentials} / {@link clearEncryptedCredentials}.
   */
  async upsertStatus(
    teamId: string,
    sourceId: string,
    status: ConnectorStatus,
    unavailableReason?: string,
  ): Promise<void> {
    await query(
      this.db,
      `INSERT INTO team_connector (
         team_id, source_id, status, unavailable_reason
       ) VALUES (
         $1, $2, $3, $4
       )
       ON CONFLICT (team_id, source_id) DO UPDATE
         SET status = EXCLUDED.status,
             unavailable_reason = EXCLUDED.unavailable_reason,
             updated_at = now()`,
      [teamId, sourceId, status, unavailableReason ?? null],
    );
  }

  /**
   * Persist (or replace) the encrypted credential blob for a connector.
   *
   * The caller is responsible for envelope-encrypting the secret before
   * passing it in — this method never sees plaintext (R3.4).
   */
  async setEncryptedCredentials(
    teamId: string,
    sourceId: string,
    encrypted: Buffer | null,
  ): Promise<void> {
    await query(
      this.db,
      `UPDATE team_connector
          SET encrypted_credentials = $3,
              updated_at = now()
        WHERE team_id = $1 AND source_id = $2`,
      [teamId, sourceId, encrypted],
    );
  }

  /**
   * Convenience method that nulls out `encrypted_credentials` — equivalent
   * to `setEncryptedCredentials(teamId, sourceId, null)` but expresses
   * intent clearly when revoking access.
   */
  async clearEncryptedCredentials(teamId: string, sourceId: string): Promise<void> {
    await this.setEncryptedCredentials(teamId, sourceId, null);
  }

  async remove(teamId: string, sourceId: string): Promise<void> {
    await query(
      this.db,
      `DELETE FROM team_connector
        WHERE team_id = $1 AND source_id = $2`,
      [teamId, sourceId],
    );
  }

  /**
   * INTERNAL: only call from {@link CredentialVaultService}.
   *
   * Reads the raw `encrypted_credentials` blob for a given Team + Source.
   * This is the ONE access path that exposes the encrypted payload, and
   * it exists solely so the Credential_Vault layer can decrypt it. It
   * MUST NOT be re-exported from the repository barrel (`./index.ts`)
   * and MUST NOT be called from API handlers, services, or workers
   * other than the vault service. There is no language-level package
   * scoping in TypeScript, so this convention is enforced by review and
   * by the JSDoc warning.
   *
   * Returns `null` when the connector row exists but has no credentials
   * stored, OR when no row exists at all. Callers should treat both
   * cases as "no credentials configured for this team+source".
   */
  async getEncryptedCredentialsForVault(
    teamId: string,
    sourceId: string,
  ): Promise<Buffer | null> {
    const rows = await query<{ encrypted_credentials: Buffer | null }>(
      this.db,
      `SELECT encrypted_credentials
         FROM team_connector
        WHERE team_id = $1 AND source_id = $2`,
      [teamId, sourceId],
    );
    if (rows.length === 0) return null;
    const row = rows[0]!;
    return row.encrypted_credentials ?? null;
  }
}
