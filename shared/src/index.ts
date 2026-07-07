/**
 * Public entrypoint for `@leads-generator/shared`.
 *
 * Re-exports the cross-package domain types defined under `./*`. Keep this
 * file as a pure barrel — no runtime logic should live here. The
 * property-based testing helper at `./testing/pbt` is intentionally not
 * re-exported from here so production code never accidentally pulls in
 * fast-check; consumers import it via the explicit subpath.
 */

export * from './result.js';
export * from './errors.js';
export * from './auth.js';
export * from './lead.js';
export * from './connector.js';
export * from './scan.js';
export * from './scoring.js';
export * from './lead-scoring.js';
export * from './content.js';
export * from './survey.js';
export * from './slide-layout-catalog.js';
export * from './layout-style-registry.js';
export * from './agent/types.js';
export * from './agent/dashboard-feature-registry.js';
// dashboard-feature-registry-freshness.js and -semantic.js use Node-only
// APIs (node:fs, node:url, node:path) to read repo files — they must never
// be barrel-exported here, since frontend bundles this entrypoint for the
// browser. Import them directly from their file path in Node-only tooling.
// export * from './agent/dashboard-feature-registry-freshness.js';
// export * from './agent/dashboard-feature-registry-semantic.js';
