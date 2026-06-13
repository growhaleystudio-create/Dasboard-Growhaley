/**
 * Public entrypoint for `@leads-generator/backend`.
 *
 * Re-exports infrastructure primitives (env, DB pool/transaction helper,
 * Redis clients, queue connection) so workers, API routes, and tests can
 * import them via the package root. Domain services and route handlers
 * will be added in subsequent tasks.
 */

export {
  loadEnv,
  resetEnvCache,
  decodeMasterKey,
  MASTER_KEY_BYTE_LENGTH,
  type Env,
} from './config/env.js';
export { CredentialVault, createCredentialVault } from './auth/credential-vault.js';
export { CredentialVaultService } from './auth/credential-vault-service.js';
export { getPool, createPgPool, closePool } from './db/pool.js';
export { withTransaction, type Tx } from './db/transaction.js';
export {
  createRedisClient,
  createRedisSessionClient,
  closeRedisClient,
} from './redis/client.js';
export { getQueueConnection, resetQueueConnection } from './queue/connection.js';

// Tenant-scoped repository layer (Task 2.4 / R2.8). Re-exported as a
// namespace so callers can write `repositories.LeadRepository` etc. without
// polluting the top-level surface with many class names.
export * as repositories from './repository/index.js';

// Pure Lead_Scoring_Engine (Task 10.1 / R7). Namespace export keeps the
// public surface small (`scoring.computeScore`, `scoring.ScorableLead`).
export * as scoring from './scoring/index.js';

// Deduplication_Service (R6). Exposed as a namespace so call sites read
// as `dedup.buildIdentityKeys(...)` etc.
export * as dedup from './dedup/index.js';

// Source_Connector contract and the default RawProspect → NormalizedLead
// helper (Task 7.1 / R5.2, R11.1, R11.9). Exposed as a namespace so
// callers reach the contract via `connector.Source_Connector` and the
// helper via `connector.normalizeRawProspect`.
export * as connector from './connector/index.js';

// Auth_Service primitives (Task 3.1 / R1.5). Namespaced for the same
// reason as `repositories` above — keeps the package root tidy as more
// auth-related symbols are added by subsequent tasks.
export * as auth from './auth/index.js';

// Team_Service primitives (Task 5.1 / R2.1, R2.9). The invite-only flow
// lives here; later sub-tasks (5.3) extend the namespace with accept &
// role-change operations.
export * as team from './team/index.js';

// Scan_Config_Service (Task 8.1 / R4). Namespaced so call sites reach the
// pure validator via `scan.validateScanConfig` and the orchestrator via
// `scan.ScanConfigService`.
export * as scan from './scan/index.js';

// Lead_Manager & Activity_Log (Task 13.1 / R8). Namespaced so callers reach
// the service via `lead.LeadManager` and the Activity_Log persistence via
// `lead.ActivityRepository`.
export * as lead from './lead/index.js';

// Metrics_Service (Task 15.1 / R10). Namespaced so call sites reach the
// pure aggregation via `metrics.computeMetrics` and the orchestrator via
// `metrics.MetricsService`.
export * as metrics from './metrics/index.js';

// Privacy_Service primitives (Task 16.1 / R11). The Audit_Log writer lives
// here; later sub-tasks (16.2–16.x) extend the namespace with export,
// retention, and DSAR operations. Reached via `privacy.DbAuditLog` etc.
export * as privacy from './privacy/index.js';

// Lead_Query_Service (Task 14.1 / R9, R7.4, R7.5). Namespaced so callers
// reach the pure default comparator via `leadQuery.compareLeadsDefault` and
// the service via `leadQuery.LeadQueryService`.
export * as leadQuery from './lead-query/index.js';

// AI_Analyzer_Service (Task 17 / R13).
export * as ai from './ai/index.js';
