/**
 * Scan configuration and execution domain types for the
 * `leads-generator-dashboard` feature.
 *
 * Mirrors the Scan_Config_Service / Scan_Engine / Job_Scheduler sections of
 * design.md (R4, R5, R12.3–R12.4).
 */

/**
 * Schedule specification attached to a Scan_Configuration.
 *
 * `intervalMinutes` is bounded to `60..43200` (1 hour..30 days) per R5.6.
 * The bound is enforced by `Scan_Config_Service.save`; this type only
 * carries the value.
 */
export interface ScheduleSpec {
  intervalMinutes: number;
}

/**
 * Persistent Scan_Configuration owned by a Team.
 *
 * `aiEnabled` may only be set to `true` when the Team has a Gemini API key
 * configured (R13.3, R13.4); the constraint is enforced by
 * `Scan_Config_Service.save`.
 */
export interface ScanConfiguration {
  id: string;
  teamId: string;
  keywords: string[];
  niche?: string;
  location?: string;
  sourceIds: string[];
  schedule?: ScheduleSpec;
  aiEnabled: boolean;
}

/**
 * Outcome reported by a single connector execution within a Scan_Job.
 *
 * - `ok`: completed within timeout, no errors.
 * - `partial`: rate-limited or partially fetched; remaining items skipped.
 * - `error`: connector raised a domain error (incl. provider error).
 * - `timeout`: connector exceeded the 60s budget (R5.1).
 * - `rate_limited`: external API rejected with 429 / equivalent (R5.5).
 */
export type ConnectorRunOutcome = 'ok' | 'partial' | 'error' | 'timeout' | 'rate_limited';

/**
 * Per-source result line included in {@link ScanSummary.connectorResults}.
 */
export interface ConnectorRunResult {
  sourceId: string;
  outcome: ConnectorRunOutcome;
  itemsFetched: number;
  error?: string;
}

/**
 * Aggregate summary persisted on a Scan_Job (R5.3).
 *
 * `excludedSources` records sources skipped because they were not
 * `available` at execution time (R3.8).
 */
export interface ScanSummary {
  newLeads: number;
  duplicateLeads: number;
  excludedSources: { sourceId: string; reason: string }[];
  connectorResults: ConnectorRunResult[];
  /** IDs of newly created Leads that were enqueued for AI analysis (R13.6). */
  aiEnqueuedLeadIds?: string[];
}

/**
 * Lifecycle status of a Scan_Job.
 *
 * - `running`: a single job per Configuration is allowed (R5.8 enforced by
 *   the `uniq_running_job` partial index).
 * - `succeeded`: pipeline completed without total failure.
 * - `failed`: total failure — Lead state is preserved (R12.3, R12.4).
 * - `skipped`: scheduler enqueued while another job was still running.
 */
export type ScanJobStatus = 'running' | 'succeeded' | 'failed' | 'skipped';

/**
 * Persistent record of a single Scan_Engine execution.
 */
export interface ScanJob {
  id: string;
  teamId: string;
  configurationId: string;
  trigger: 'manual' | 'scheduled';
  status: ScanJobStatus;
  startedAt: Date;
  finishedAt?: Date;
  summary: ScanSummary;
}
