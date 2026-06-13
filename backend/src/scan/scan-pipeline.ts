/**
 * Scan pipeline orchestration: the `normalize → dedup → score` core of a
 * Scan_Job (Task 12.2, R5.2, R5.3).
 *
 * Design references:
 * - design.md → Alur Eksekusi Pemindaian: for each `available` connector
 *   the Scan_Engine runs `fetch` (isolated, time-bounded — see
 *   {@link runConnectorsIsolated}), then for each returned RawProspect it
 *   applies `normalize` → `Deduplication_Service.ingest` →
 *   `Lead_Scoring_Engine.scoreAndPersist`, accumulating a {@link ScanSummary}
 *   (`newLeads`, `duplicateLeads`, `excludedSources`, `connectorResults`).
 *
 * Responsibilities and boundaries:
 * - This module is intentionally decoupled from Scan_Job persistence
 *   (status transitions, outbox notifications) — that wrapper is Task 12.4.
 *   `runScanPipeline` neither opens a transaction nor decides job status;
 *   it operates on a caller-supplied transaction and returns the accumulated
 *   summary so the caller can record it.
 * - Source selection (which connectors are `available`, which are excluded)
 *   is resolved by {@link import('./scan-engine.js').executeScan} and passed
 *   in via {@link RunPipelineInput}. The pipeline simply records
 *   `excludedSources` on the summary (R3.8).
 *
 * Transaction scope (acceptable for 12.2): every prospect's
 * `normalize + ingest + score` runs on the SAME passed-in `tx`. A failure
 * therefore rolls back the entire scan batch rather than a single prospect.
 * Finer-grained per-prospect isolation is not required by R5.2/R5.3 and is
 * intentionally out of scope here; connector-level isolation (one Source's
 * failure not aborting another's) is already provided upstream by
 * {@link runConnectorsIsolated} (R5.4).
 *
 * Scoring vs merge: only a `created` outcome is scored here. A `merged`
 * outcome means the prospect collapsed into an existing canonical Lead;
 * re-scoring that canonical is the recompute path's job (R7.3) and is
 * deliberately NOT triggered per-merge to avoid redundant writes during a
 * scan.
 */

import type { NormalizedLead, ScanSummary, ScoringModel } from '@leads-generator/shared';

import type { Source_Connector, ScanQuery } from '../connector/source-connector.js';
import type { Tx } from '../db/transaction.js';
import type { DeduplicationService } from '../dedup/dedup-service.js';
import type { ScorableLead } from '../scoring/scorable-lead.js';
import type { LeadScoringPersister } from '../scoring/score-and-persist.js';

import { runConnectorsIsolated } from './connector-runner.js';

/**
 * Collaborators required by {@link runScanPipeline}.
 *
 * `dedup` and `scorer` are FACTORIES that take the active transaction and
 * return a service bound to it. This mirrors how the rest of the backend
 * threads `tx` through repositories (e.g. recompute's `txLeads`): the
 * caller decides how a service is wired to the transaction, and the pipeline
 * stays agnostic to persistence wiring.
 */
export interface ScanPipelineDeps {
  /** Build a transaction-bound {@link DeduplicationService}. */
  dedup: (tx: Tx) => DeduplicationService;
  /** Build a transaction-bound {@link LeadScoringPersister}. */
  scorer: (tx: Tx) => LeadScoringPersister;
  /**
   * Project a freshly-created Lead + its {@link NormalizedLead} into the
   * {@link ScorableLead} the engine consumes. The caller supplies this so
   * the pipeline does not need to know how `referenceTime` and other
   * scoring inputs are derived.
   */
  project: (leadId: string, normalized: NormalizedLead) => ScorableLead;
  /** Clock injection point (unused by the core loop; reserved for parity). */
  now?: () => Date;
  /** Callback to enqueue a Lead ID for AI analysis if AI is enabled (R13.6). */
  aiEnqueue?: (leadId: string) => void;
}

/**
 * Inputs to a single pipeline run.
 *
 * `availableConnectors` are the connectors resolved as `available` at
 * execution time; `excluded` is the complementary set of requested Sources
 * that were skipped (with a human-readable reason) and recorded on the
 * summary per R3.8. `model` is the Team's {@link ScoringModel} (an empty
 * model drives new Leads to `unscored`).
 */
export interface RunPipelineInput {
  teamId: string;
  query: ScanQuery;
  availableConnectors: Source_Connector[];
  excluded: { sourceId: string; reason: string }[];
  model: ScoringModel;
  /** Whether AI analysis is enabled for this scan (R13.6). */
  aiEnabled?: boolean;
}

/**
 * Run the scan pipeline on `tx`: execute the available connectors in
 * isolation, then for every RawProspect they returned apply
 * `normalize → dedup.ingest → (if created) scoreAndPersist`, accumulating a
 * {@link ScanSummary}.
 *
 * The whole per-prospect loop shares `tx` (see the module header for the
 * transaction-scope rationale). Connector outcomes are folded verbatim into
 * `connectorResults` (R5.3) and the supplied `excluded` list becomes
 * `excludedSources` (R3.8).
 */
export async function runScanPipeline(
  tx: Tx,
  deps: ScanPipelineDeps,
  input: RunPipelineInput,
): Promise<ScanSummary> {
  const { teamId, query, availableConnectors, excluded, model } = input;

  // Connector-level isolation happens here: one Source's
  // failure/timeout/rate-limit never aborts the others (R5.4). Output order
  // matches `availableConnectors`.
  const outputs = await runConnectorsIsolated(availableConnectors, query);
  const connectorResults = outputs.map((output) => output.result);

  // Index connectors by sourceId so each prospect can be normalized by the
  // connector that produced it.
  const connectorBySource = new Map<string, Source_Connector>();
  for (const connector of availableConnectors) {
    connectorBySource.set(connector.sourceId, connector);
  }

  const dedup = deps.dedup(tx);
  const scorer = deps.scorer(tx);

  let newLeads = 0;
  let duplicateLeads = 0;

  for (const output of outputs) {
    const connector = connectorBySource.get(output.result.sourceId);
    // A result with no matching connector would be a wiring bug; skip its
    // prospects defensively rather than throwing mid-batch.
    if (connector === undefined) continue;

    for (const raw of output.prospects) {
      const normalized = connector.normalize(raw, teamId);
      const result = await dedup.ingest(tx, normalized);

      if (result.outcome === 'created') {
        newLeads += 1;
        // Only newly-created canonical Leads are scored during a scan; a
        // merge is left for the recompute path (R7.3).
        await scorer.scoreAndPersist(
          tx,
          result.leadId,
          teamId,
          deps.project(result.leadId, normalized),
          model,
        );
        if (input.aiEnabled && deps.aiEnqueue) {
          deps.aiEnqueue(result.leadId);
        }
      } else {
        duplicateLeads += 1;
      }
    }
  }

  return { newLeads, duplicateLeads, excludedSources: excluded, connectorResults };
}
