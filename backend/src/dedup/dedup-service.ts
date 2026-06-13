/**
 * Deduplication_Service ingest + attribute-merge flow (Task 9.3, R6).
 *
 * Design references:
 * - design.md → Algoritma Deduplikasi → flow (the create/merge decision
 *   tree) and Aturan Merge Atribut (the existing-wins / fill-empty table).
 *
 * Responsibilities (per the design flowchart):
 * - Build identity keys for an incoming {@link NormalizedLead} via
 *   {@link buildIdentityKeys} (R6.3, implemented in Task 9.1).
 * - No keys OR no match → create a brand-new canonical Lead
 *   (`is_duplicate = false`, status `'New'`) (R6.4, R6.6).
 * - Match found → insert the incoming as a duplicate row linked to the
 *   canonical (`is_duplicate = true`, `duplicate_of = canonical.id`),
 *   add its Source to the canonical's `lead_source` (R6.1, R6.2), then
 *   merge attributes into the canonical using fill-empty / existing-wins
 *   rules (R6.5, R6.7).
 *
 * The service is a thin orchestrator over the {@link LeadRepository} (data
 * access) and a {@link CanonicalLeadFinder} (identity lookup). It performs
 * no clock reads of its own beyond reusing the incoming `discoveredAt`, so
 * the create path is deterministic given its inputs (excluding DB-assigned
 * ids/timestamps).
 *
 * All work runs inside a caller-supplied transaction (`tx`) so the whole
 * ingest is atomic — a partially-merged Lead is never observable.
 */

import type { Lead, NormalizedLead } from '@leads-generator/shared';

import type { Tx } from '../db/transaction.js';
import type { LeadAttributePatch, LeadInsert, LeadRepository } from '../repository/lead-repository.js';

import { buildIdentityKeys, type IdentityKey } from './identity.js';

/** Outcome discriminant returned by {@link DeduplicationService.ingest}. */
export type DedupOutcome = 'created' | 'merged';

/**
 * Result of an {@link DeduplicationService.ingest} call.
 *
 * - `outcome: 'created'` — a new canonical Lead was inserted; `leadId` is
 *   the new canonical id.
 * - `outcome: 'merged'` — the incoming matched an existing canonical Lead;
 *   `leadId` is that canonical's id (NOT the duplicate row's id).
 */
export interface DedupResult {
  outcome: DedupOutcome;
  leadId: string;
}

/**
 * A lookup port the dedup service uses to find an existing canonical Lead
 * by identity key. Implemented over the {@link LeadRepository} / SQL in
 * production (see {@link import('./canonical-finder.js').SqlCanonicalLeadFinder});
 * mockable in tests.
 */
export interface CanonicalLeadFinder {
  /**
   * Find a canonical (non-duplicate) Lead for the Team whose identity
   * matches ANY of the given normalized keys. Returns the existing Lead or
   * `null` when none match.
   */
  findByIdentityKeys(
    teamId: string,
    keys: { kind: string; value: string }[],
  ): Promise<Lead | null>;
}

/** Collaborators required by {@link DeduplicationService}. */
export interface DeduplicationServiceDeps {
  leads: LeadRepository;
  finder: CanonicalLeadFinder;
}

/**
 * Decide whether an attribute value counts as "empty" for merge purposes
 * (R6.5 / R6.7). A value is empty when it is `undefined`, `null`, or
 * becomes the empty string after `trim()` — mirroring the identity-key
 * rule that whitespace-only values carry no information.
 */
function isEmptyAttr(value: string | null | undefined): boolean {
  return value === undefined || value === null || value.trim().length === 0;
}

/**
 * Narrow an attribute value to a non-empty string, or `null` when it is
 * `undefined` / `null` / whitespace-only. Returns the value verbatim (not
 * trimmed) so the canonical Lead keeps the incoming representation when a
 * field is filled — only the emptiness decision uses `trim()`.
 */
function nonEmpty(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value.trim().length === 0 ? null : value;
}

/**
 * Deduplication_Service — ingest a normalized Lead, creating a new
 * canonical entry or merging into an existing one (R6).
 */
export class DeduplicationService {
  constructor(private readonly deps: DeduplicationServiceDeps) {}

  /**
   * Ingest a {@link NormalizedLead} within an existing transaction `tx`.
   *
   * - No identity keys OR no match → create a new canonical Lead
   *   (`is_duplicate = false`, status `'New'`). Returns
   *   `{ outcome: 'created', leadId }`.
   * - Match found → insert the incoming as a duplicate row linked to the
   *   canonical (`is_duplicate = true`, `duplicate_of = canonical.id`),
   *   add its Source to the canonical's `lead_source`, and merge attributes
   *   into the canonical using fill-empty / existing-wins rules. Returns
   *   `{ outcome: 'merged', leadId: canonical.id }`.
   *
   * The `tx` parameter documents that this method must run inside a
   * transaction so the multi-step merge is atomic; the repository / finder
   * instances supplied to the service are expected to be bound to the same
   * executor as `tx`.
   */
  async ingest(tx: Tx, incoming: NormalizedLead): Promise<DedupResult> {
    // `tx` is accepted to make the transactional contract explicit at the
    // call site; the repository/finder collaborators carry the executor.
    void tx;

    const keys = buildIdentityKeys(incoming);

    // R6.4 / R6.6: a Lead with no usable identity key can never match an
    // existing canonical, so skip the lookup and create directly.
    const canonical =
      keys.length === 0 ? null : await this.deps.finder.findByIdentityKeys(incoming.teamId, keys);

    if (canonical === null) {
      const created = await this.deps.leads.insert(
        incoming.teamId,
        this.buildCanonicalInsert(incoming),
      );
      return { outcome: 'created', leadId: created.id };
    }

    return this.merge(canonical, incoming, keys);
  }

  /**
   * Merge an incoming duplicate into an existing canonical Lead (R6.1,
   * R6.2, R6.5, R6.7).
   *
   * Steps mirror the design flowchart:
   * 1. Insert the incoming as a duplicate row capturing provenance
   *    (`is_duplicate = true`, `duplicate_of = canonical.id`).
   * 2. Add the incoming's Source(s) to the canonical's `lead_source`.
   * 3. Apply the attribute-merge patch (fill-empty only).
   */
  private async merge(
    canonical: Lead,
    incoming: NormalizedLead,
    keys: IdentityKey[],
  ): Promise<DedupResult> {
    void keys;

    // 1. Record the duplicate row so provenance is preserved (R6.1).
    const duplicateInsert: LeadInsert = {
      ...this.buildCanonicalInsert(incoming),
      isDuplicate: true,
      duplicateOf: canonical.id,
    };
    await this.deps.leads.insert(incoming.teamId, duplicateInsert);

    // 2. Add every Source carried by the incoming Lead to the canonical's
    //    aggregated Source list (R6.2). `addSource` is idempotent.
    for (const sourceId of incoming.sources) {
      await this.deps.leads.addSource(incoming.teamId, canonical.id, sourceId);
    }

    // 3. Fill-empty / existing-wins attribute merge (R6.5, R6.7).
    const patch = this.mergeAttributes(canonical, incoming);
    await this.deps.leads.applyAttributePatch(incoming.teamId, canonical.id, patch);

    return { outcome: 'merged', leadId: canonical.id };
  }

  /**
   * Build a {@link LeadInsert} for a NEW canonical Lead from a
   * {@link NormalizedLead}.
   *
   * Maps lifecycle defaults per Property 14 / R5.2:
   * - `status: 'New'`, `score: null`, `scoreState: 'unscored'`.
   * - `isDuplicate: false` (canonical by default; the merge path overrides).
   * - AI fields default to the unanalyzed state.
   * - `discoveredAt` is preserved from the incoming Lead; `acquiredSource`
   *   is the first listed Source and `acquiredAt` mirrors `discoveredAt`
   *   for traceability (R11.2).
   *
   * Optional public attributes are only set when present so that
   * `exactOptionalPropertyTypes` stays satisfied (no `undefined` writes).
   */
  private buildCanonicalInsert(incoming: NormalizedLead): LeadInsert {
    const firstSource = incoming.sources[0];

    const insert: LeadInsert = {
      teamId: incoming.teamId,
      matchedKeywords: incoming.matchedKeywords,
      status: 'New',
      score: null,
      scoreState: 'unscored',
      isDuplicate: false,
      discoveredAt: incoming.discoveredAt,
      aiIntentScore: null,
      aiState: 'none',
      ...(incoming.name !== undefined ? { name: incoming.name } : {}),
      ...(incoming.publicContact !== undefined ? { publicContact: incoming.publicContact } : {}),
      ...(incoming.profileUrl !== undefined ? { profileUrl: incoming.profileUrl } : {}),
      ...(incoming.location !== undefined ? { location: incoming.location } : {}),
      ...(firstSource !== undefined
        ? { acquiredSource: firstSource, acquiredAt: incoming.discoveredAt }
        : {}),
    };

    return insert;
  }

  /**
   * Pure attribute-merge helper (R6.5 / R6.7).
   *
   * Returns the patch to apply to the canonical Lead: for each of `name`,
   * `publicContact`, `profileUrl`, and `location`, the incoming value is
   * included ONLY when the canonical field is empty (null / undefined /
   * whitespace-only) AND the incoming value is non-empty. Fields that are
   * already non-empty on the canonical are never overwritten (existing-wins)
   * and are omitted from the patch entirely.
   *
   * Exported on the instance (not static) for unit / property testing.
   */
  mergeAttributes(canonical: Lead, incoming: NormalizedLead): LeadAttributePatch {
    const patch: LeadAttributePatch = {};

    const name = nonEmpty(incoming.name);
    if (isEmptyAttr(canonical.name) && name !== null) {
      patch.name = name;
    }
    const publicContact = nonEmpty(incoming.publicContact);
    if (isEmptyAttr(canonical.publicContact) && publicContact !== null) {
      patch.publicContact = publicContact;
    }
    const profileUrl = nonEmpty(incoming.profileUrl);
    if (isEmptyAttr(canonical.profileUrl) && profileUrl !== null) {
      patch.profileUrl = profileUrl;
    }
    const location = nonEmpty(incoming.location);
    if (isEmptyAttr(canonical.location) && location !== null) {
      patch.location = location;
    }

    return patch;
  }
}
