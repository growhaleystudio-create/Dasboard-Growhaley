/**
 * Scan_Config_Service — orchestrates Scan_Configuration validation and
 * persistence (Task 8.1 + Task 8.3, R4, R5.6).
 *
 * This service wires the pure {@link validateScanConfig} pipeline
 * (steps 1–5 of design.md → Scan_Config_Service) to the tenant-scoped
 * {@link ScanConfigurationRepository}. Task 8.3 adds the
 * availability-aware portion of the pipeline (design steps 5–6): it
 * filters the requested Sources against the per-Team
 * {@link Connector_Registry}, surfaces every non-`available` Source as a
 * warning in `excludedSources` WITHOUT requiring confirmation (R4.6), and
 * rejects the save when no `available` Source remains (R4.8).
 *
 * Invalid input is reported as a `VALIDATION` {@link AppError} carrying
 * every applicable message (R4.7) so callers branch on the `Result`.
 */

import {
  err,
  ok,
  type AppError,
  type ConnectorStatus,
  type Result,
  type ScanConfiguration,
} from '@leads-generator/shared';

import type { Connector_Registry } from '../connector/registry.js';
import type {
  ScanConfigurationInsert,
  ScanConfigurationRepository,
} from '../repository/scan-configuration-repository.js';

import { validateScanConfig, type RawScanConfigInput } from './scan-config-validation.js';

/**
 * Status assigned to a requested Source whose connector is not installed
 * in the {@link Connector_Registry} for the Team. An unknown connector
 * cannot be exercised, so it is treated as excluded with `unavailable`.
 */
const UNKNOWN_CONNECTOR_STATUS: ConnectorStatus = 'unavailable';

/** A Source excluded from a saved Scan_Configuration (R4.6). */
export interface ExcludedSource {
  sourceId: string;
  status: ConnectorStatus;
}

/**
 * Result payload of {@link ScanConfigService.save} on the success branch.
 *
 * `excludedSources` lists every requested Source whose connector is not
 * `available` for the Team (R4.6); it is a non-blocking warning the UI
 * surfaces and never requires confirmation. `validationErrors` is always
 * empty on success; invalid input is reported via a `VALIDATION`
 * {@link AppError} on the failure branch so callers consistently branch
 * on the {@link Result}.
 */
export interface SaveScanConfigResult {
  configuration?: ScanConfiguration;
  excludedSources: ExcludedSource[];
  validationErrors: string[];
}

/**
 * Domain service that validates and persists Scan_Configurations for a
 * Team. Construction takes the tenant-scoped repository so every write is
 * Team-scoped (R2.8) and the per-Team {@link Connector_Registry} so Source
 * availability can be resolved during the save pipeline (R4.6, R4.8).
 */
export class ScanConfigService {
  constructor(
    private readonly repo: ScanConfigurationRepository,
    private readonly registry: Connector_Registry,
  ) {}

  /**
   * Validate `input` and, when valid, persist it as a new
   * Scan_Configuration for `teamId`.
   *
   * On validation failure returns `err({ code: 'VALIDATION', messages })`
   * carrying every applicable message collected by
   * {@link validateScanConfig} (R4.1, R4.2, R4.3, R4.4, R4.7, R5.6).
   *
   * On success it resolves the per-Team connector statuses, filters the
   * requested Sources (design steps 5–6):
   * - Sources whose status is `available` are KEPT and persisted.
   * - Sources whose status is anything else — or whose connector is not
   *   installed for the Team — are recorded in `excludedSources` as a
   *   warning, WITHOUT requiring confirmation (R4.6).
   * - When NO `available` Source remains, the save is rejected with a
   *   `VALIDATION` error (R4.8).
   *
   * `aiEnabled` defaults to `false` (AI is opt-in, R13).
   */
  async save(
    teamId: string,
    input: RawScanConfigInput,
  ): Promise<Result<SaveScanConfigResult, AppError>> {
    // Steps 1–5: validate + normalize keywords / niche / location /
    // source-presence / schedule interval.
    const outcome = validateScanConfig(input);
    if (outcome.normalized === undefined) {
      return err({ code: 'VALIDATION', messages: outcome.errors });
    }

    const normalized = outcome.normalized;

    // Step 5 (design) — resolve per-Team connector statuses and partition
    // the requested Sources into kept (`available`) and excluded
    // (everything else). A requested Source with no installed connector
    // for the Team is treated as excluded with `unavailable` status.
    const descriptors = await this.registry.listForTeam(teamId);
    const statusBySource = new Map<string, ConnectorStatus>();
    for (const descriptor of descriptors) {
      statusBySource.set(descriptor.sourceId, descriptor.status);
    }

    const kept: string[] = [];
    const excludedSources: ExcludedSource[] = [];
    for (const sourceId of normalized.sourceIds) {
      const status = statusBySource.get(sourceId) ?? UNKNOWN_CONNECTOR_STATUS;
      if (status === 'available') {
        kept.push(sourceId);
      } else {
        excludedSources.push({ sourceId, status });
      }
    }

    // Step 6 (design) — reject when filtering leaves no available Source
    // (R4.8). The warning Sources are intentionally NOT surfaced here;
    // the caller already failed validation.
    if (kept.length === 0) {
      return err({
        code: 'VALIDATION',
        messages: ['minimal satu Source berstatus available wajib dipilih'],
      });
    }

    const insert: ScanConfigurationInsert = {
      teamId,
      keywords: normalized.keywords,
      sourceIds: kept,
      aiEnabled: false,
      ...(normalized.niche !== undefined ? { niche: normalized.niche } : {}),
      ...(normalized.location !== undefined ? { location: normalized.location } : {}),
      ...(normalized.scheduleIntervalMinutes !== undefined
        ? { schedule: { intervalMinutes: normalized.scheduleIntervalMinutes } }
        : {}),
    };

    const configuration = await this.repo.insert(teamId, insert);

    return ok({
      configuration,
      excludedSources,
      validationErrors: [],
    });
  }
}
