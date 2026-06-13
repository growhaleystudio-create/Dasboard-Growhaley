/**
 * Barrel for the Privacy_Service module (R11).
 *
 * Re-exports the Audit_Log writer (Task 16.1, R11.8), the Export_Service
 * (Task 16.2, R11.5/R11.6), the Retention_Worker plus its pure
 * eligibility helpers (Task 16.5, R11.7), and the DSAR Worker (Task 16.4,
 * R11.3/R11.4) so callers can reach them via
 * `@leads-generator/backend` → `privacy.DbAuditLog`, `privacy.ExportService`,
 * `privacy.RetentionWorker`, `privacy.DsarService`, etc.
 */

export {
  DbAuditLog,
  type AuditAction,
  type AuditEntry,
  type AuditLog,
} from './audit-log.js';

export {
  DsarService,
  type DsarRequest,
  type DsarResult,
  type DsarServiceDeps,
  type DsarFailureInfo,
  type DsarLeadFinder,
  type DsarLeadClearer,
  type DsarAuditWriter,
} from './dsar-service.js';

export {
  isRetentionEligible,
  selectExpired,
  type RetentionCandidate,
} from './retention.js';

export {
  RetentionWorker,
  type RetentionWorkerDeps,
  type RetentionAuditWriter,
  type RetentionSweepResult,
} from './retention-worker.js';

export {
  ExportService,
  type ExportArtifact,
  type ExportServiceDeps,
} from './export-service.js';

export { toCsv, escapeCsvField } from './csv.js';
