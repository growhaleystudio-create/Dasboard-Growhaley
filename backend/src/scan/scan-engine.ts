/**
 * Scan_Engine entry point: resolve `available` Source connectors at
 * execution time, enforce the "no Source available" guard (R5.7), and run
 * the scan pipeline inside a single transaction (Task 12.2).
 *
 * Design references:
 * - design.md → Alur Eksekusi Pemindaian: before any Lead is created the
 *   engine asks the Connector_Registry for the `available` Sources; if NONE
 *   are available the job is cancelled with an error and NO Lead is created
 *   (R5.7). Otherwise it opens a transaction and runs the pipeline.
 * - R3.8: a Source that is installed but NOT `available` at execution time
 *   is excluded from the run and recorded on the summary
 *   (`excludedSources`); a requested Source with no installed connector is
 *   likewise excluded.
 *
 * This module owns Source RESOLUTION and the R5.7 guard only. The
 * `normalize → dedup → score` accumulation lives in
 * {@link runScanPipeline}, and Scan_Job status/outbox persistence is Task
 * 12.4 — neither is performed here.
 */

import type { ConnectorStatus, Result, ScanSummary, ScoringModel } from '@leads-generator/shared';
import { err, ok } from '@leads-generator/shared';
import type { Pool } from 'pg';

import type { Connector_Registry } from '../connector/registry.js';
import type { Source_Connector, ScanQuery } from '../connector/source-connector.js';
import { withTransaction, type Tx } from '../db/transaction.js';

import {
  runScanPipeline,
  type RunPipelineInput,
  type ScanPipelineDeps,
} from './scan-pipeline.js';

/**
 * Validation message returned when a triggered scan has no `available`
 * Source to run against (R5.7).
 */
export const NO_SOURCE_AVAILABLE_MESSAGE = 'Tidak ada Source yang tersedia';

/**
 * Status assigned to an excluded Source whose connector is NOT installed in
 * the registry. The registry can only report statuses for installed
 * connectors, so an uninstalled-but-requested Source is recorded with this
 * sentinel reason (R3.8).
 */
export const NOT_INSTALLED_REASON = 'not_installed';

/**
 * Collaborators required by {@link executeScan}.
 *
 * `runInTx` is injectable (mirroring recompute) so the engine can be tested
 * without a real database; when omitted it falls back to
 * `withTransaction(pool, fn)` and `pool` becomes required.
 */
export interface ScanEngineDeps {
  /** Pool used to build the default `runInTx`. Required only when `runInTx` is absent. */
  pool?: Pool;
  /** Runs a unit of work in a transaction. Defaults to `withTransaction(pool, fn)`. */
  runInTx?: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  /** Registry used to resolve per-Team connector statuses (R3.8). */
  registry: Connector_Registry;
  /** Pipeline collaborators threaded into {@link runScanPipeline}. */
  pipeline: ScanPipelineDeps;
  /** Loads the Team's {@link ScoringModel}; `null` when none is configured. */
  loadModel: (teamId: string) => Promise<ScoringModel | null>;
}

/** Inputs to {@link executeScan}. */
export interface ExecuteScanInput {
  teamId: string;
  query: ScanQuery;
  /** The Scan_Configuration's selected Source ids. */
  sourceIds: string[];
  /** Whether AI analysis is enabled for this scan (R13.6). */
  aiEnabled?: boolean;
}

/**
 * Resolve the transaction runner, falling back to the real
 * {@link withTransaction} bound to `deps.pool`.
 */
function resolveRunInTx(deps: ScanEngineDeps): <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> {
  if (deps.runInTx !== undefined) return deps.runInTx;
  const pool = deps.pool;
  if (pool === undefined) {
    throw new Error('executeScan requires either `pool` or `runInTx` in its deps');
  }
  return (fn) => withTransaction(pool, fn);
}

/** Partition of requested Sources into runnable connectors vs exclusions. */
interface ResolvedSources {
  availableConnectors: Source_Connector[];
  excluded: { sourceId: string; reason: string }[];
}

/**
 * Partition the requested `sourceIds` into `available` connectors (kept)
 * and exclusions (recorded), using the per-Team statuses from the registry
 * at execution time (R3.8).
 *
 * Rules, evaluated in the encounter order of `sourceIds`:
 * - status `available` AND an installed connector instance exists → keep.
 * - status present but not `available` → exclude with the status as reason.
 * - no descriptor for the Source (not installed for the Team) → exclude
 *   with {@link NOT_INSTALLED_REASON}.
 */
async function resolveSources(
  deps: ScanEngineDeps,
  input: ExecuteScanInput,
): Promise<ResolvedSources> {
  const descriptors = await deps.registry.listForTeam(input.teamId);
  const statusBySource = new Map<string, ConnectorStatus>();
  for (const descriptor of descriptors) {
    statusBySource.set(descriptor.sourceId, descriptor.status);
  }

  const availableConnectors: Source_Connector[] = [];
  const excluded: { sourceId: string; reason: string }[] = [];

  for (const sourceId of input.sourceIds) {
    const status = statusBySource.get(sourceId);
    if (status === undefined) {
      excluded.push({ sourceId, reason: NOT_INSTALLED_REASON });
      continue;
    }
    if (status !== 'available') {
      excluded.push({ sourceId, reason: status });
      continue;
    }
    const connector = deps.registry.get(sourceId);
    if (connector === null) {
      // Descriptor said `available` but no instance is installed — treat as
      // not runnable rather than crashing the scan.
      excluded.push({ sourceId, reason: NOT_INSTALLED_REASON });
      continue;
    }
    availableConnectors.push(connector);
  }

  return { availableConnectors, excluded };
}

/**
 * Execute a scan for `teamId` over the configuration's `sourceIds`.
 *
 * Flow (design.md → Alur Eksekusi Pemindaian):
 * 1. Resolve `available` connectors and exclusions from the registry (R3.8).
 * 2. If NO connector is available → return a `VALIDATION` error WITHOUT
 *    opening a transaction or creating any Lead (R5.7).
 * 3. Otherwise load the Team's model (empty model when none is configured,
 *    so new Leads persist as `unscored`), open a transaction, and run
 *    {@link runScanPipeline}; return the accumulated {@link ScanSummary}.
 *
 * Job status/outbox persistence is intentionally not performed here (Task
 * 12.4 wraps this).
 */
export async function executeScan(
  deps: ScanEngineDeps,
  input: ExecuteScanInput,
): Promise<Result<ScanSummary>> {
  const { availableConnectors, excluded } = await resolveSources(deps, input);

  // R5.7: no available Source → cancel the job, create no Lead. We return
  // before resolving `runInTx` so no transaction is ever opened.
  if (availableConnectors.length === 0) {
    return err({ code: 'VALIDATION', messages: [NO_SOURCE_AVAILABLE_MESSAGE] });
  }

  // An absent model is represented as an empty model so scoreAndPersist
  // marks freshly-created Leads `unscored` (model not configured) rather
  // than failing the scan.
  const loaded = await deps.loadModel(input.teamId);
  const model: ScoringModel = loaded ?? { teamId: input.teamId, version: 0, factors: [] };

  const runInTx = resolveRunInTx(deps);

  const pipelineInput: RunPipelineInput = {
    teamId: input.teamId,
    query: input.query,
    availableConnectors,
    excluded,
    model,
  };
  if (input.aiEnabled !== undefined) {
    pipelineInput.aiEnabled = input.aiEnabled;
  }

  const aiEnqueuedLeadIds: string[] = [];
  const pipelineDeps: ScanPipelineDeps = {
    ...deps.pipeline,
    aiEnqueue: (leadId) => aiEnqueuedLeadIds.push(leadId),
  };

  const summary = await runInTx((tx) => runScanPipeline(tx, pipelineDeps, pipelineInput));
  
  if (input.aiEnabled) {
    summary.aiEnqueuedLeadIds = aiEnqueuedLeadIds;
  }

  return ok(summary);
}
