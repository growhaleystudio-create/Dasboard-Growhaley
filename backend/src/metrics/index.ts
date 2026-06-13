/**
 * Barrel for the Metrics_Service module (R10).
 *
 * Exposes the pure aggregation ({@link computeMetrics}) used by both the
 * production SQL path and property tests, the tenant-scoped
 * {@link MetricsRepository} that loads non-duplicate lead facts, and the
 * orchestrating {@link MetricsService}.
 */

export {
  computeMetrics,
  isValidRange,
  withinRange,
  type MetricLead,
  type DashboardMetrics,
  type DateRange,
} from './metrics-compute.js';
export { MetricsRepository, type LeadFact } from './metrics-repository.js';
export { MetricsService } from './metrics-service.js';
