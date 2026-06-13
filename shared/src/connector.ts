/**
 * Source connector domain types for the `leads-generator-dashboard`
 * feature.
 *
 * Mirrors the Connector_Registry section of design.md (R3, R11.9). The
 * actual `Source_Connector` interface (with `fetch`/`normalize` signatures)
 * lives in the backend package because it depends on platform types like
 * `AbortSignal`. This module keeps only the data contracts that frontend +
 * backend agree on.
 */

/**
 * Activation status of a Source connector for a given Team.
 *
 * Exactly one status is active at a time per Team (R3.1).
 */
export type ConnectorStatus = 'available' | 'unavailable' | 'requires_configuration';

/**
 * Per-Source ToS-driven policy enforced inside `normalize` (R11.9).
 *
 * - `allowedRetentionDays`: optional cap that overrides the Team default.
 * - `disallowFields`: keys of {@link import('./lead.js').NormalizedLead}
 *   that the Source forbids storing — they are stripped before persistence.
 *
 * `disallowFields` is intentionally typed as `string[]` here to keep this
 * type independent of the lead module; backend code may narrow it.
 */
export interface UsagePolicy {
  allowedRetentionDays?: number;
  disallowFields?: string[];
}

/**
 * Public-facing description of a Source connector for a Team.
 *
 * Returned by `Connector_Registry.list` and used by the UI to render the
 * connector status surface (R3.1, R3.3).
 */
export interface ConnectorDescriptor {
  sourceId: string;
  displayName: string;
  status: ConnectorStatus;
  /** Required when `status === 'unavailable'` (R3.3). */
  unavailableReason?: string;
  usagePolicy?: UsagePolicy;
}
