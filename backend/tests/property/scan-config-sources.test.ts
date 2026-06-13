/**
 * Property-based tests for the Source-filtering and schedule-interval
 * portions of the Scan_Config_Service pipeline (Task 8.3).
 *
 * Two design-level Correctness Properties are exercised here, both
 * registered through the shared {@link propertyTest} helper so they share
 * the canonical tag and `{ numRuns: 100 }` configuration:
 *
 * - **Property 18: Penyaringan Source non-available pada konfigurasi**
 *   (R4.6, R4.8) — for an arbitrary set of requested Sources with random
 *   per-Team connector statuses, `ScanConfigService.save` persists ONLY
 *   the `available` Sources, reports EXACTLY the non-`available` Sources
 *   in `excludedSources` (a warning, no confirmation required), and
 *   rejects the save when no `available` Source remains. A requested
 *   Source whose connector is not installed for the Team is treated as
 *   excluded with status `unavailable`.
 * - **Property 19: Validasi interval penjadwalan** (R5.6) — the pure
 *   {@link validateScanConfig} accepts a schedule interval IFF it lies in
 *   `60..43200` minutes inclusive; otherwise it rejects and surfaces the
 *   schedule-interval error message.
 *
 * Property 18 replaces the repository with an in-memory fake that captures
 * `insert` arguments and the connector registry with a fake whose
 * `listForTeam` returns a chosen status map. No real database or network
 * is involved — the properties constrain the service's filtering logic.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';

import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';
import type {
  ConnectorDescriptor,
  ConnectorStatus,
  ScanConfiguration,
} from '@leads-generator/shared';

import {
  ScanConfigService,
  validateScanConfig,
  VALIDATION_MESSAGES,
  SCHEDULE_INTERVAL_MIN,
  SCHEDULE_INTERVAL_MAX,
  type RawScanConfigInput,
} from '../../src/scan/index.js';
import type { Connector_Registry } from '../../src/connector/registry.js';
import type {
  ScanConfigurationInsert,
  ScanConfigurationRepository,
} from '../../src/repository/scan-configuration-repository.js';

// ---------------------------------------------------------------------------
// In-memory fakes for the Source-filtering property (Property 18).
// ---------------------------------------------------------------------------

interface InsertCall {
  teamId: string;
  insert: ScanConfigurationInsert;
}

/**
 * Fake {@link ScanConfigurationRepository} recording every `insert` call
 * and echoing back a {@link ScanConfiguration} with a synthetic id. Only
 * `insert` is exercised by `save`; other methods throw so an accidental
 * new dependency surfaces immediately.
 */
class FakeScanConfigurationRepository {
  readonly insertCalls: InsertCall[] = [];

  async insert(teamId: string, insert: ScanConfigurationInsert): Promise<ScanConfiguration> {
    this.insertCalls.push({ teamId, insert });
    return { id: 'cfg-generated', ...insert };
  }
}

/**
 * Build a fake {@link Connector_Registry} whose `listForTeam` returns the
 * supplied descriptors. The service only ever calls `listForTeam`, so the
 * rest of the registry surface is intentionally absent.
 */
function makeFakeRegistry(descriptors: ConnectorDescriptor[]): Connector_Registry {
  return {
    listForTeam: async (_teamId: string): Promise<ConnectorDescriptor[]> => descriptors,
  } as unknown as Connector_Registry;
}

/** The three real connector statuses plus an "uninstalled" marker. */
type RegistryStatus = ConnectorStatus | 'unknown';

/** Status assigned by the service to a Source with no installed connector. */
const UNKNOWN_AS: ConnectorStatus = 'unavailable';

/** A requested Source and the status its connector reports for the Team. */
interface SourceEntry {
  sourceId: string;
  registryStatus: RegistryStatus;
}

/**
 * Unique, non-empty set of requested Sources, each tagged with a random
 * per-Team status (or `unknown` to model an uninstalled connector). We
 * keep `minLength: 1` so this property focuses on availability filtering
 * (R4.6/R4.8) rather than the empty-selection rule (R4.3), which has its
 * own coverage.
 */
const sourcesArb: fc.Arbitrary<SourceEntry[]> = fc.uniqueArray(
  fc.record({
    sourceId: fc.stringMatching(/^[a-z]{3,10}$/),
    registryStatus: fc.constantFrom<RegistryStatus>(
      'available',
      'unavailable',
      'requires_configuration',
      'unknown',
    ),
  }),
  { minLength: 1, maxLength: 6, selector: (entry) => entry.sourceId },
);

/** A single always-valid keyword so the keyword rules never interfere. */
const validKeywordArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z]{2,20}$/);

describe('ScanConfigService source filtering (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 18: Penyaringan Source non-available pada konfigurasi
  // Validates: Requirements 4.6, 4.8
  propertyTest(it, 18, 'Penyaringan Source non-available pada konfigurasi', async () => {
    await pbt.assert(
      fc.asyncProperty(
        sourcesArb,
        validKeywordArb,
        fc.uuid(),
        async (entries, keyword, teamId) => {
          // Descriptors for installed connectors only (skip 'unknown').
          const descriptors: ConnectorDescriptor[] = entries
            .filter((entry) => entry.registryStatus !== 'unknown')
            .map((entry) => ({
              sourceId: entry.sourceId,
              displayName: `${entry.sourceId} display`,
              status: entry.registryStatus as ConnectorStatus,
            }));

          const repo = new FakeScanConfigurationRepository();
          const registry = makeFakeRegistry(descriptors);
          const service = new ScanConfigService(
            repo as unknown as ScanConfigurationRepository,
            registry,
          );

          const input: RawScanConfigInput = {
            keywords: [keyword],
            sourceIds: entries.map((entry) => entry.sourceId),
          };

          // Independent reference partition (encounter order preserved).
          const expectedKept = entries
            .filter((entry) => entry.registryStatus === 'available')
            .map((entry) => entry.sourceId);
          const expectedExcluded = entries
            .filter((entry) => entry.registryStatus !== 'available')
            .map((entry) => ({
              sourceId: entry.sourceId,
              status: entry.registryStatus === 'unknown' ? UNKNOWN_AS : entry.registryStatus,
            }));

          const result = await service.save(teamId, input);

          if (expectedKept.length === 0) {
            // R4.8 — no available Source remains → reject, never persist.
            if (result.ok) return false;
            if (result.error.code !== 'VALIDATION') return false;
            if (
              JSON.stringify(result.error.messages) !==
              JSON.stringify(['minimal satu Source berstatus available wajib dipilih'])
            ) {
              return false;
            }
            return repo.insertCalls.length === 0;
          }

          // R4.6 — persisted config keeps ONLY available Sources, and the
          // warning lists EXACTLY the non-available ones (no confirmation).
          if (!result.ok) return false;
          if (repo.insertCalls.length !== 1) return false;

          const persisted = repo.insertCalls[0]!.insert;
          if (JSON.stringify(persisted.sourceIds) !== JSON.stringify(expectedKept)) {
            return false;
          }
          if (
            result.value.configuration === undefined ||
            JSON.stringify(result.value.configuration.sourceIds) !==
              JSON.stringify(expectedKept)
          ) {
            return false;
          }
          if (
            JSON.stringify(result.value.excludedSources) !== JSON.stringify(expectedExcluded)
          ) {
            return false;
          }
          // Success path carries no validation errors.
          return result.value.validationErrors.length === 0;
        },
      ),
      defaultPbtParams,
    );
  });
});

// ---------------------------------------------------------------------------
// Schedule-interval validation property (Property 19).
// ---------------------------------------------------------------------------

/**
 * Interval candidates spanning below-min, the exact bounds, in-range, and
 * above-max so the IFF condition is exercised on both sides.
 */
const intervalArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: -120, max: 100_000 }),
  fc.constantFrom(
    SCHEDULE_INTERVAL_MIN - 1,
    SCHEDULE_INTERVAL_MIN,
    SCHEDULE_INTERVAL_MIN + 1,
    SCHEDULE_INTERVAL_MAX - 1,
    SCHEDULE_INTERVAL_MAX,
    SCHEDULE_INTERVAL_MAX + 1,
  ),
);

describe('validateScanConfig schedule interval (PBT)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 19: Validasi interval penjadwalan
  // Validates: Requirements 5.6
  propertyTest(it, 19, 'Validasi interval penjadwalan', () => {
    pbt.assert(
      pbt.property(intervalArb, (interval) => {
        // All other fields are valid so only the interval can fail.
        const input: RawScanConfigInput = {
          keywords: ['valid'],
          sourceIds: ['fiverr'],
          scheduleIntervalMinutes: interval,
        };

        const outcome = validateScanConfig(input);
        const inRange =
          interval >= SCHEDULE_INTERVAL_MIN && interval <= SCHEDULE_INTERVAL_MAX;

        if (inRange) {
          // Accepted: normalized present, no schedule error, value kept.
          if (outcome.normalized === undefined) return false;
          if (outcome.errors.includes(VALIDATION_MESSAGES.scheduleInterval)) return false;
          return outcome.normalized.scheduleIntervalMinutes === interval;
        }

        // Rejected: normalized absent and the schedule error surfaced.
        if (outcome.normalized !== undefined) return false;
        return outcome.errors.includes(VALIDATION_MESSAGES.scheduleInterval);
      }),
      defaultPbtParams,
    );
  });
});
