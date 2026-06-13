/**
 * In-process registry of installed Source_Connector implementations.
 *
 * Design references:
 * - design.md → Components and Interfaces → Connector_Registry &
 *   Credential_Vault (R3, R11.9).
 * - design.md → Architecture → Landskap Ketersediaan API: connector
 *   availability is not hard-coded; each connector reports its own status
 *   and per-Team rows in `team_connector` may override it.
 *
 * The registry holds the static "code-side" connectors (Fiverr, Threads,
 * Google, …) that the running backend ships with. Per-Team activation
 * state lives in PostgreSQL (`team_connector`). When the API or UI asks
 * "what connectors does Team X have?", we overlay the installed
 * connectors with the team-scoped rows from
 * {@link TeamConnectorRepository}:
 *
 * - A connector that has NO row for the Team yet falls back to the
 *   default status `available` (R3.2: a freshly-added connector starts
 *   `available` until validation says otherwise). The static connector's
 *   `displayName` and `usagePolicy` are authoritative — the
 *   `team_connector` row only contributes `status` /
 *   `unavailableReason`.
 * - A connector WITH a row inherits the row's `status` and
 *   `unavailableReason` (which is how an Admin can mark a Source
 *   `unavailable` with a human-readable reason for the UI per R3.3),
 *   while the displayName / usagePolicy still come from the installed
 *   connector.
 *
 * `register` is non-disruptive (R3.9): adding a new connector never
 * mutates entries that already exist in the map, and it never touches
 * `team_connector` rows of other connectors. To make this explicit we
 * throw on duplicate registration instead of silently overwriting.
 *
 * `register`, `get`, and `listInstalled` perform NO I/O — they only read
 * the in-process map. `listForTeam` and `getForTeam` are the only methods
 * that hit the repository.
 */
import type { ConnectorDescriptor, ConnectorStatus } from '@leads-generator/shared';

import type { TeamConnectorRepository } from '../repository/team-connector-repository.js';
import type { Source_Connector } from './source-connector.js';

/**
 * Default connector status applied when no `team_connector` row exists
 * yet for a (Team, Source) pair (R3.2).
 *
 * Connectors whose Source has no usable API may still surface as
 * `unavailable` to a Team — that is expressed by inserting a
 * `team_connector` row with `status = 'unavailable'` and a populated
 * `unavailable_reason`. The registry intentionally does NOT call
 * `checkAvailability()` from `listForTeam` because that method is
 * allowed to do network I/O; we keep `listForTeam` cheap and free of
 * side effects.
 */
const DEFAULT_STATUS: ConnectorStatus = 'available';

export class Connector_Registry {
  /**
   * Insertion-ordered map of installed connectors keyed by `sourceId`.
   * `Map` preserves insertion order, which lets {@link listForTeam}
   * return descriptors in a stable, predictable sequence (handy for
   * deterministic tests and snapshot tests downstream).
   */
  private readonly connectors = new Map<string, Source_Connector>();

  constructor(private readonly repo: TeamConnectorRepository) {}

  /**
   * Install a new {@link Source_Connector}.
   *
   * R3.9 (non-interference): registration of a new connector MUST NOT
   * change any other already-registered connector. The map is keyed by
   * `sourceId`, and we explicitly reject duplicate `sourceId`s with a
   * thrown error so a misconfigured boot can't silently overwrite an
   * existing connector. This is also the simplest way to guarantee that
   * a second call to `register` cannot leak into descriptors returned
   * for the first.
   *
   * R3.2 (default available): the connector itself does not carry a
   * status here. The default `available` status is materialized on
   * demand by {@link listForTeam} / {@link getForTeam} when no
   * `team_connector` row exists yet.
   */
  register(connector: Source_Connector): void {
    if (this.connectors.has(connector.sourceId)) {
      throw new Error(
        `connector already registered: ${connector.sourceId}`,
      );
    }
    this.connectors.set(connector.sourceId, connector);
  }

  /**
   * Retrieve the installed connector for `sourceId`, or `null` if no
   * connector with that id has been registered.
   *
   * Pure in-memory lookup: no I/O.
   */
  get(sourceId: string): Source_Connector | null {
    return this.connectors.get(sourceId) ?? null;
  }

  /**
   * Snapshot of installed connectors in insertion order.
   *
   * Returns a fresh array so callers cannot mutate the internal map by
   * reference.
   */
  listInstalled(): Source_Connector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Per-Team list of {@link ConnectorDescriptor} entries.
   *
   * Combines the installed connectors (source of truth for `displayName`
   * and `usagePolicy`) with the per-Team `team_connector` rows (source
   * of truth for `status` and `unavailableReason`). Connectors without
   * a row default to {@link DEFAULT_STATUS} (R3.2). Order matches
   * registration order so the UI can present a stable list.
   *
   * Note: only connectors that exist in this registry's `connectors`
   * map are returned. Stale rows in `team_connector` referring to a
   * connector that has since been removed from the codebase are
   * intentionally ignored — the Connector Admin is concerned with the
   * connectors the running build can actually exercise.
   */
  async listForTeam(teamId: string): Promise<ConnectorDescriptor[]> {
    const rows = await this.repo.listForTeam(teamId);
    const rowsByKey = new Map<string, ConnectorDescriptor>();
    for (const row of rows) rowsByKey.set(row.sourceId, row);

    const result: ConnectorDescriptor[] = [];
    for (const connector of this.connectors.values()) {
      result.push(this.buildDescriptor(connector, rowsByKey.get(connector.sourceId)));
    }
    return result;
  }

  /**
   * Per-Team lookup for a single connector. Returns `null` when the
   * connector with `sourceId` is not installed in this registry.
   *
   * Mirrors {@link listForTeam} for a single source: the installed
   * connector supplies `displayName` and `usagePolicy`, the
   * `team_connector` row (if any) supplies `status` and
   * `unavailableReason`.
   */
  async getForTeam(
    teamId: string,
    sourceId: string,
  ): Promise<ConnectorDescriptor | null> {
    const connector = this.connectors.get(sourceId);
    if (!connector) return null;
    const row = await this.repo.get(teamId, sourceId);
    return this.buildDescriptor(connector, row);
  }

  /**
   * Build a {@link ConnectorDescriptor} from an installed
   * {@link Source_Connector} and an optional per-Team row.
   *
   * Field provenance:
   * - `sourceId`, `displayName`, `usagePolicy` ← installed connector
   *   (the running build is the source of truth for code-side metadata).
   * - `status`, `unavailableReason` ← `team_connector` row when present,
   *   otherwise default to {@link DEFAULT_STATUS} with no reason.
   *
   * We construct the object key-by-key rather than spreading because
   * `exactOptionalPropertyTypes` forbids assigning `undefined` to an
   * optional property — only present keys are added.
   */
  private buildDescriptor(
    connector: Source_Connector,
    row: ConnectorDescriptor | null | undefined,
  ): ConnectorDescriptor {
    const descriptor: ConnectorDescriptor = {
      sourceId: connector.sourceId,
      displayName: connector.displayName,
      status: row?.status ?? DEFAULT_STATUS,
    };
    if (row?.unavailableReason !== undefined) {
      descriptor.unavailableReason = row.unavailableReason;
    }
    if (connector.usagePolicy !== undefined) {
      descriptor.usagePolicy = connector.usagePolicy;
    }
    return descriptor;
  }
}
