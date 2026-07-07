/**
 * SQL-backed {@link CanonicalLeadFinder} for the Deduplication_Service
 * (Task 9.3, R6.1–R6.3).
 *
 * Given the normalized identity keys produced by {@link buildIdentityKeys},
 * this finder locates the existing canonical (`is_duplicate = false`) Lead
 * for a Team whose identity matches ANY of the three R6.3 rules:
 *
 * 1. `phone`         — digits-only `public_contact` = key
 * 2. `profile_url`   — `lower(btrim(profile_url)) = key`
 * 3. `email`         — `lower(btrim(public_contact)) = key`
 * 4. `name_location` — `lower(btrim(name)) || '|' || lower(btrim(location)) = key`
 *
 * The comparison applies `lower(btrim(...))` in SQL to mirror the
 * `trim()` + `toLowerCase()` normalization the key builder uses, so the
 * incoming (already-normalized) key matches the canonical row's stored
 * value. `NULL` columns concatenate / compare to `NULL` and therefore
 * never match — empty values are never used as a matching key (R6.3).
 *
 * Tenant isolation: every query filters by `team_id = $1`, so a Lead from
 * another Team can never be returned (R2.8).
 */

import type { Lead } from '@leads-generator/shared';

import { mapLeadRow, type LeadRow } from '../repository/mapping.js';
import { query, type DbExecutor } from '../repository/types.js';

import type { CanonicalLeadFinder } from './dedup-service.js';

/** Columns selected for the canonical lookup — matches {@link mapLeadRow}. */
const LEAD_COLUMNS = `
  id,
  team_id,
  name,
  public_contact,
  profile_url,
  location,
  whatsapp_url,
  whatsapp_number,
  matched_keywords,
  status,
  score,
  score_state,
  is_duplicate,
  duplicate_of,
  discovered_at,
  acquired_source,
  acquired_at,
  ai_intent_score,
  ai_insight,
  ai_state,
  ai_unavailable_reason,
  ai_analyzed_at,
  created_at
`;

/** SQL expression building the normalized `name|location` composite key. */
const NAME_LOCATION_EXPR = `lower(btrim(name)) || '|' || lower(btrim(location))`;
const PHONE_EXPR = `regexp_replace(coalesce(public_contact, ''), '[^0-9]', '', 'g')`;

/**
 * {@link CanonicalLeadFinder} implemented over a {@link DbExecutor}
 * (`Pool` for one-shot reads, or a transactional `PoolClient` so the
 * lookup participates in the ingest transaction).
 */
export class SqlCanonicalLeadFinder implements CanonicalLeadFinder {
  constructor(private readonly db: DbExecutor) {}

  /**
   * Find the canonical Lead for `teamId` matching ANY of `keys`.
   *
   * Builds one parameterized predicate per key (grouped by kind) and ORs
   * them together. When `keys` is empty there is nothing to match, so the
   * method short-circuits to `null` without touching the database.
   *
   * Ties (multiple canonical Leads matching) resolve deterministically to
   * the oldest row (`created_at ASC, id ASC`) so repeated ingests always
   * collapse onto the same canonical.
   */
  async findByIdentityKeys(
    teamId: string,
    keys: { kind: string; value: string }[],
  ): Promise<Lead | null> {
    if (keys.length === 0) return null;

    const params: unknown[] = [teamId];
    const predicates: string[] = [];

    for (const key of keys) {
      // Skip blank values defensively — they would compare against NULL/''
      // and could cause false matches if a canonical column were empty.
      if (key.value.length === 0) continue;

      params.push(key.value);
      const placeholder = `$${params.length}`;

      switch (key.kind) {
        case 'phone':
          predicates.push(`${PHONE_EXPR} = ${placeholder}`);
          break;
        case 'profile_url':
          predicates.push(`lower(btrim(profile_url)) = ${placeholder}`);
          break;
        case 'email':
          predicates.push(`lower(btrim(public_contact)) = ${placeholder}`);
          break;
        case 'name_location':
          predicates.push(`${NAME_LOCATION_EXPR} = ${placeholder}`);
          break;
        default:
          // Unknown key kind — drop the just-pushed param so placeholder
          // numbering stays consistent with the predicates we keep.
          params.pop();
          break;
      }
    }

    if (predicates.length === 0) return null;

    const rows = await query<LeadRow>(
      this.db,
      `SELECT ${LEAD_COLUMNS}
         FROM lead
        WHERE team_id = $1
          AND is_duplicate = false
          AND (${predicates.join(' OR ')})
        ORDER BY created_at ASC, id ASC
        LIMIT 1`,
      params,
    );

    if (rows.length === 0) return null;
    return mapLeadRow(rows[0]!);
  }
}
