/**
 * Property-based tests for the Deduplication_Service ingest + attribute
 * merge flow (Task 9.3, R6.1–R6.7).
 *
 * Validates: Requirements 6.1, 6.2, 6.4, 6.5, 6.6, 6.7
 *
 * Four design-level Correctness Properties live here, each registered via
 * the shared {@link propertyTest} helper so they share `numRuns: 100` and
 * the canonical `Feature: leads-generator-dashboard, Property {n}: ...` tag:
 *
 * - **Property 10: Lead cocok digabung tanpa entri utama baru** (R6.1,
 *   R6.2) — a matched incoming Lead is recorded as a duplicate linked to
 *   the canonical, its Source is added to the canonical's `lead_source`,
 *   and the canonical (main) list does NOT grow.
 * - **Property 11: Lead tak cocok menjadi entri terpisah** (R6.4, R6.6) —
 *   an unmatched incoming Lead becomes a new canonical entry without
 *   sharing attributes with (or mutating) any other Lead.
 * - **Property 12: Idempotensi ingest** (R6.1, R6.4) — re-ingesting a Lead
 *   identical to an existing canonical changes neither the canonical's
 *   attributes nor the main-list count, and resolves to the same id.
 * - **Property 13: Aturan merge atribut (existing-wins, fill-empty)**
 *   (R6.5, R6.7) — `mergeAttributes` fills ONLY canonical-empty /
 *   incoming-non-empty fields and never overwrites a non-empty canonical
 *   value.
 *
 * The tests use lightweight in-memory fakes for the `LeadRepository` and
 * `CanonicalLeadFinder` collaborators (a `Map` of Leads + per-Lead Source
 * `Set`s). No real database or mocks of the unit-under-test are involved —
 * the fakes implement exactly the methods `ingest` calls so the observable
 * behaviour (insert / addSource / applyAttributePatch) is real.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { defaultPbtParams, pbt, propertyTest } from '@leads-generator/shared/testing/pbt';
import type { Lead, NormalizedLead } from '@leads-generator/shared';

import type { Tx } from '../../src/db/transaction.js';
import type {
  LeadAttributePatch,
  LeadInsert,
  LeadRepository,
} from '../../src/repository/lead-repository.js';
import {
  DeduplicationService,
  type CanonicalLeadFinder,
} from '../../src/dedup/dedup-service.js';
import { buildIdentityKeys } from '../../src/dedup/identity.js';

// ─────────────────────────────────────────────────────────────────────────
// In-memory fakes
// ─────────────────────────────────────────────────────────────────────────

const TEAM = 'team-1';

/** A dummy transaction handle — `ingest` never dereferences it. */
const TX = {} as unknown as Tx;

/**
 * In-memory stand-in for the parts of {@link LeadRepository} that `ingest`
 * exercises: `insert`, `addSource`, and `applyAttributePatch`. Keeps every
 * Lead (canonical and duplicate) in `leads` and the aggregated Source list
 * per Lead in `sources`.
 */
class InMemoryLeadStore {
  private seq = 0;
  readonly leads = new Map<string, Lead>();
  readonly sources = new Map<string, Set<string>>();

  /** Seed an existing canonical Lead directly (bypassing ingest). */
  seedCanonical(attrs: {
    name?: string;
    publicContact?: string;
    profileUrl?: string;
    location?: string;
    sources?: string[];
  }): Lead {
    const id = `lead-${(this.seq += 1)}`;
    const lead: Lead = {
      id,
      teamId: TEAM,
      matchedKeywords: [],
      status: 'New',
      score: null,
      scoreState: 'unscored',
      isDuplicate: false,
      discoveredAt: new Date('2024-01-01T00:00:00.000Z'),
      aiIntentScore: null,
      aiState: 'none',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      ...(attrs.name !== undefined ? { name: attrs.name } : {}),
      ...(attrs.publicContact !== undefined ? { publicContact: attrs.publicContact } : {}),
      ...(attrs.profileUrl !== undefined ? { profileUrl: attrs.profileUrl } : {}),
      ...(attrs.location !== undefined ? { location: attrs.location } : {}),
    };
    this.leads.set(id, lead);
    this.sources.set(id, new Set(attrs.sources ?? []));
    return lead;
  }

  insert(teamId: string, lead: LeadInsert): Promise<Lead> {
    const id = `lead-${(this.seq += 1)}`;
    const stored: Lead = {
      ...lead,
      teamId,
      id,
      createdAt: new Date('2024-06-01T00:00:00.000Z'),
    };
    this.leads.set(id, stored);
    const set = new Set<string>();
    if (stored.acquiredSource !== undefined) set.add(stored.acquiredSource);
    this.sources.set(id, set);
    return Promise.resolve(stored);
  }

  addSource(teamId: string, leadId: string, sourceId: string): Promise<boolean> {
    const lead = this.leads.get(leadId);
    if (lead === undefined || lead.teamId !== teamId) return Promise.resolve(false);
    const set = this.sources.get(leadId) ?? new Set<string>();
    const had = set.has(sourceId);
    set.add(sourceId);
    this.sources.set(leadId, set);
    return Promise.resolve(!had);
  }

  applyAttributePatch(
    teamId: string,
    leadId: string,
    patch: LeadAttributePatch,
  ): Promise<void> {
    const lead = this.leads.get(leadId);
    if (lead === undefined || lead.teamId !== teamId) return Promise.resolve();
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) lead.name = patch.name;
    if (Object.prototype.hasOwnProperty.call(patch, 'publicContact')) {
      lead.publicContact = patch.publicContact;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'profileUrl')) {
      lead.profileUrl = patch.profileUrl;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'location')) lead.location = patch.location;
    return Promise.resolve();
  }

  /** Count canonical (main-list) Leads for the Team (R6.1 / R10.1). */
  canonicalCount(): number {
    let count = 0;
    for (const lead of this.leads.values()) {
      if (lead.teamId === TEAM && !lead.isDuplicate) count += 1;
    }
    return count;
  }

  asRepository(): LeadRepository {
    return this as unknown as LeadRepository;
  }
}

/** Convert a stored {@link Lead} into a NormalizedLead-shaped identity carrier. */
function leadToNormalized(lead: Lead): NormalizedLead {
  return {
    teamId: lead.teamId,
    sources: [],
    matchedKeywords: lead.matchedKeywords,
    discoveredAt: lead.discoveredAt,
    ...(lead.name !== undefined ? { name: lead.name } : {}),
    ...(lead.publicContact !== undefined ? { publicContact: lead.publicContact } : {}),
    ...(lead.profileUrl !== undefined ? { profileUrl: lead.profileUrl } : {}),
    ...(lead.location !== undefined ? { location: lead.location } : {}),
  };
}

/**
 * In-memory {@link CanonicalLeadFinder} backed by an {@link InMemoryLeadStore}.
 * Matches an incoming key set against the identity keys of every canonical
 * Lead — exactly the R6.3 matching contract the SQL finder implements.
 */
class InMemoryFinder implements CanonicalLeadFinder {
  constructor(private readonly store: InMemoryLeadStore) {}

  findByIdentityKeys(
    teamId: string,
    keys: { kind: string; value: string }[],
  ): Promise<Lead | null> {
    for (const lead of this.store.leads.values()) {
      if (lead.teamId !== teamId || lead.isDuplicate) continue;
      const leadKeys = buildIdentityKeys(leadToNormalized(lead));
      const matches = leadKeys.some((lk) =>
        keys.some((k) => k.kind === lk.kind && k.value === lk.value),
      );
      if (matches) return Promise.resolve(lead);
    }
    return Promise.resolve(null);
  }
}

/** A finder that never matches — models "identitas tidak cocok" (R6.4/R6.6). */
const nullFinder: CanonicalLeadFinder = {
  findByIdentityKeys: () => Promise.resolve(null),
};

// ─────────────────────────────────────────────────────────────────────────
// Generators
// ─────────────────────────────────────────────────────────────────────────

/** A non-empty (after trim) public attribute token. */
const nonEmptyToken = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);

/** Source id token. */
const sourceArb = fc.stringMatching(/^[a-z]{3,8}$/);

/** Non-empty array (1–3) of distinct-ish Source ids. */
const sourcesArb = fc.array(sourceArb, { minLength: 1, maxLength: 3 });

const discoveredAtArb = fc
  .integer({ min: 1_700_000_000_000, max: 1_800_000_000_000 })
  .map((ms) => new Date(ms));

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe('Deduplication ingest & merge (R6)', () => {
  // Tag: Feature: leads-generator-dashboard, Property 10: Lead cocok
  // digabung tanpa entri utama baru
  // Validates: Requirements 6.1, 6.2
  propertyTest(it, 10, 'Lead cocok digabung tanpa entri utama baru', async () => {
    await pbt.assert(
      fc.asyncProperty(
        nonEmptyToken, // shared profile_url → guarantees an identity match
        sourcesArb,
        discoveredAtArb,
        async (profileUrl, incomingSources, discoveredAt) => {
          const store = new InMemoryLeadStore();
          const canonical = store.seedCanonical({ profileUrl, sources: ['seed-src'] });
          const service = new DeduplicationService({
            leads: store.asRepository(),
            finder: new InMemoryFinder(store),
          });

          const beforeCanonicalCount = store.canonicalCount();

          const incoming: NormalizedLead = {
            teamId: TEAM,
            profileUrl,
            sources: incomingSources,
            matchedKeywords: [],
            discoveredAt,
          };

          const result = await service.ingest(TX, incoming);

          // Marked duplicate & linked to the canonical (R6.1).
          if (result.outcome !== 'merged') return false;
          if (result.leadId !== canonical.id) return false;

          // No new entry on the main (canonical) list (R6.1).
          if (store.canonicalCount() !== beforeCanonicalCount) return false;

          // The incoming Source(s) are added to the canonical (R6.2).
          const canonicalSources = store.sources.get(canonical.id);
          if (canonicalSources === undefined) return false;
          return incomingSources.every((s) => canonicalSources.has(s));
        },
      ),
      defaultPbtParams,
    );
  });

  // Tag: Feature: leads-generator-dashboard, Property 11: Lead tak cocok
  // menjadi entri terpisah
  // Validates: Requirements 6.4, 6.6
  propertyTest(it, 11, 'Lead tak cocok menjadi entri terpisah', async () => {
    await pbt.assert(
      fc.asyncProperty(
        // Pre-existing unrelated canonicals (their attributes must survive).
        fc.array(nonEmptyToken, { minLength: 0, maxLength: 3 }),
        fc.record({
          name: fc.option(nonEmptyToken, { nil: undefined }),
          profileUrl: fc.option(nonEmptyToken, { nil: undefined }),
          location: fc.option(nonEmptyToken, { nil: undefined }),
        }),
        sourcesArb,
        discoveredAtArb,
        async (seedNames, incomingAttrs, incomingSources, discoveredAt) => {
          const store = new InMemoryLeadStore();
          const seeded = seedNames.map((name) => store.seedCanonical({ name }));
          // Snapshot the seeded attributes to prove they are not shared/mutated.
          const seededNamesBefore = seeded.map((l) => l.name);

          const service = new DeduplicationService({
            leads: store.asRepository(),
            finder: nullFinder, // identity matches nothing (R6.4 / R6.6)
          });

          const beforeCanonicalCount = store.canonicalCount();

          const incoming: NormalizedLead = {
            teamId: TEAM,
            sources: incomingSources,
            matchedKeywords: [],
            discoveredAt,
            ...(incomingAttrs.name !== undefined ? { name: incomingAttrs.name } : {}),
            ...(incomingAttrs.profileUrl !== undefined
              ? { profileUrl: incomingAttrs.profileUrl }
              : {}),
            ...(incomingAttrs.location !== undefined ? { location: incomingAttrs.location } : {}),
          };

          const result = await service.ingest(TX, incoming);

          // A separate canonical entry is created (R6.4).
          if (result.outcome !== 'created') return false;
          if (store.canonicalCount() !== beforeCanonicalCount + 1) return false;

          const created = store.leads.get(result.leadId);
          if (created === undefined) return false;
          if (created.isDuplicate) return false;

          // The created Lead carries the incoming attributes.
          if (created.name !== incomingAttrs.name) return false;
          if (created.profileUrl !== incomingAttrs.profileUrl) return false;
          if (created.location !== incomingAttrs.location) return false;

          // No attribute sharing / mutation with the pre-existing Leads (R6.6).
          return seeded.every((lead, i) => lead.name === seededNamesBefore[i]);
        },
      ),
      defaultPbtParams,
    );
  });

  // Tag: Feature: leads-generator-dashboard, Property 12: Idempotensi ingest
  // Validates: Requirements 6.1, 6.4
  propertyTest(it, 12, 'Idempotensi ingest', async () => {
    await pbt.assert(
      fc.asyncProperty(
        fc.record({
          name: nonEmptyToken,
          profileUrl: nonEmptyToken,
          location: nonEmptyToken,
        }),
        sourceArb,
        discoveredAtArb,
        async (attrs, source, discoveredAt) => {
          const store = new InMemoryLeadStore();
          const canonical = store.seedCanonical({
            name: attrs.name,
            profileUrl: attrs.profileUrl,
            location: attrs.location,
            sources: [source],
          });
          const service = new DeduplicationService({
            leads: store.asRepository(),
            finder: new InMemoryFinder(store),
          });

          // Snapshot canonical attributes + main-list size up front.
          const snapshot = {
            name: canonical.name,
            profileUrl: canonical.profileUrl,
            location: canonical.location,
          };
          const canonicalCount = store.canonicalCount();

          const incoming: NormalizedLead = {
            teamId: TEAM,
            name: attrs.name,
            profileUrl: attrs.profileUrl,
            location: attrs.location,
            sources: [source],
            matchedKeywords: [],
            discoveredAt,
          };

          // Ingest the identical Lead twice.
          for (let i = 0; i < 2; i += 1) {
            const result = await service.ingest(TX, incoming);
            if (result.outcome !== 'merged') return false;
            if (result.leadId !== canonical.id) return false;

            // Main-list count never grows (R6.1 / R6.4).
            if (store.canonicalCount() !== canonicalCount) return false;

            // Canonical attributes are unchanged (existing-wins, idempotent).
            const current = store.leads.get(canonical.id);
            if (current === undefined) return false;
            if (
              current.name !== snapshot.name ||
              current.profileUrl !== snapshot.profileUrl ||
              current.location !== snapshot.location
            ) {
              return false;
            }
          }
          return true;
        },
      ),
      defaultPbtParams,
    );
  });

  // Tag: Feature: leads-generator-dashboard, Property 13: Aturan merge
  // atribut (existing-wins, fill-empty)
  // Validates: Requirements 6.5, 6.7
  propertyTest(it, 13, 'Aturan merge atribut (existing-wins, fill-empty)', () => {
    // Each attribute is either absent (undefined), empty-ish (blank /
    // whitespace-only), or genuinely non-empty.
    const attrArb: fc.Arbitrary<string | undefined> = fc.oneof(
      fc.constantFrom<string | undefined>(undefined, '', '   ', '\t', '\n '),
      nonEmptyToken,
    );

    const attrsArb = fc.record({
      name: attrArb,
      publicContact: attrArb,
      profileUrl: attrArb,
      location: attrArb,
    });

    /** Local emptiness predicate mirroring the service semantics. */
    const isEmpty = (v: string | undefined): boolean =>
      v === undefined || v.trim().length === 0;

    // mergeAttributes is pure; deps are never touched on this path.
    const store = new InMemoryLeadStore();
    const service = new DeduplicationService({
      leads: store.asRepository(),
      finder: nullFinder,
    });

    pbt.assert(
      pbt.property(attrsArb, attrsArb, (canonAttrs, incomingAttrs) => {
        const canonical: Lead = {
          id: 'canon',
          teamId: TEAM,
          matchedKeywords: [],
          status: 'New',
          score: null,
          scoreState: 'unscored',
          isDuplicate: false,
          discoveredAt: new Date('2024-01-01T00:00:00.000Z'),
          aiIntentScore: null,
          aiState: 'none',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          ...(canonAttrs.name !== undefined ? { name: canonAttrs.name } : {}),
          ...(canonAttrs.publicContact !== undefined
            ? { publicContact: canonAttrs.publicContact }
            : {}),
          ...(canonAttrs.profileUrl !== undefined ? { profileUrl: canonAttrs.profileUrl } : {}),
          ...(canonAttrs.location !== undefined ? { location: canonAttrs.location } : {}),
        };

        const incoming: NormalizedLead = {
          teamId: TEAM,
          sources: [],
          matchedKeywords: [],
          discoveredAt: new Date('2024-01-01T00:00:00.000Z'),
          ...(incomingAttrs.name !== undefined ? { name: incomingAttrs.name } : {}),
          ...(incomingAttrs.publicContact !== undefined
            ? { publicContact: incomingAttrs.publicContact }
            : {}),
          ...(incomingAttrs.profileUrl !== undefined
            ? { profileUrl: incomingAttrs.profileUrl }
            : {}),
          ...(incomingAttrs.location !== undefined ? { location: incomingAttrs.location } : {}),
        };

        const patch = service.mergeAttributes(canonical, incoming);

        const fields = ['name', 'publicContact', 'profileUrl', 'location'] as const;
        for (const field of fields) {
          const canonEmpty = isEmpty(canonAttrs[field]);
          const incomingVal = incomingAttrs[field];
          const fillExpected = canonEmpty && !isEmpty(incomingVal);
          const hasField = Object.prototype.hasOwnProperty.call(patch, field);

          if (fillExpected) {
            // Fill-empty (R6.5): patch carries the incoming value verbatim.
            if (!hasField) return false;
            if (patch[field] !== incomingVal) return false;
          } else {
            // existing-wins (R6.7): never overwrite — field omitted.
            if (hasField) return false;
          }
        }
        return true;
      }),
      defaultPbtParams,
    );
  });
});
