/**
 * Barrel for the Deduplication_Service module.
 *
 * Re-exports identity-key utilities (Task 9.1, R6.3) and the ingest /
 * attribute-merge flow (Task 9.3, R6.1–R6.7) so callers can import them via
 * `@leads-generator/backend` → `dedup.buildIdentityKeys`,
 * `dedup.DeduplicationService`, etc.
 */

export {
  buildIdentityKeys,
  isEmailLike,
  normalizeForIdentity,
  type IdentityKey,
} from './identity.js';

export {
  DeduplicationService,
  type CanonicalLeadFinder,
  type DedupOutcome,
  type DedupResult,
  type DeduplicationServiceDeps,
} from './dedup-service.js';

export { SqlCanonicalLeadFinder } from './canonical-finder.js';
