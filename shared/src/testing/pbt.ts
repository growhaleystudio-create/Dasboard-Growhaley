/**
 * Property-based testing (PBT) helper for the
 * `leads-generator-dashboard` feature.
 *
 * This module standardises how every workspace writes property tests with
 * fast-check so that all 36 design-level Correctness Properties share a
 * single configuration and naming convention.
 *
 * Conventions enforced
 * --------------------
 * 1. **Minimum iterations**: every property runs with `{ numRuns: 100 }` by
 *    default (see {@link defaultPbtParams}). Callers may override to a
 *    higher count for slow properties; lowering is discouraged.
 * 2. **Canonical test name / tag**: every property test is registered with
 *    a name in the form
 *
 *      `Feature: leads-generator-dashboard, Property {n}: {text}`
 *
 *    The `{n}` matches the property number from `design.md` and `{text}` is
 *    a short human-readable label. Use {@link propertyTest} to register a
 *    test so the tag is produced automatically.
 *
 * Framework agnosticism
 * ---------------------
 * The shared package must not take a hard dependency on any test runner
 * (Vitest, Jest, etc.) at type level. Callers therefore pass their runner's
 * `it` (or `test`) function in as the first argument:
 *
 * ```ts
 * import { it } from 'vitest';
 * import fc from 'fast-check';
 * import { propertyTest, defaultPbtParams } from '@leads-generator/shared/testing/pbt';
 *
 * propertyTest(it, 1, 'Determinisme skoring', () => {
 *   fc.assert(
 *     fc.property(fc.integer(), (n) => Number.isInteger(n)),
 *     defaultPbtParams,
 *   );
 * });
 * ```
 *
 * Re-exports
 * ----------
 * For convenience this module also re-exports {@link pbt}, a tiny namespace
 * exposing `fc.assert` and `fc.property` so call sites do not have to also
 * import fast-check directly when they only need those two entry points.
 */

import fc from 'fast-check';

/**
 * Identifier of the feature these property tests belong to. Kept as a
 * constant so renames stay consistent across files.
 */
export const FEATURE_ID = 'leads-generator-dashboard' as const;

/**
 * Default fast-check `assert` parameters used by every property test in
 * this feature.
 *
 * - `numRuns: 100` matches the design's "minimum 100 iterations" rule.
 *
 * The object is exported as a frozen shape; callers should spread it when
 * they need to override individual fields, e.g.
 * `fc.assert(prop, { ...defaultPbtParams, numRuns: 500 })`.
 */
export const defaultPbtParams: Readonly<fc.Parameters<unknown>> = Object.freeze({
  numRuns: 100,
});

/**
 * Build the canonical property test name.
 *
 * Format: `Feature: leads-generator-dashboard, Property {n}: {text}`.
 */
export function propertyTestName(propertyNumber: number, propertyText: string): string {
  return `Feature: ${FEATURE_ID}, Property ${propertyNumber}: ${propertyText}`;
}

/**
 * Minimal shape of a test runner's `it` / `test` function. Both Vitest and
 * Jest satisfy this signature for the basic synchronous case used here.
 */
export type TestRegistrar = (name: string, fn: () => void | Promise<void>) => void;

/**
 * Register a property-based test with the canonical name and the shared
 * default fast-check parameters in scope.
 *
 * The `runner` callback should perform the actual `fc.assert(...)` call.
 * Keeping the assertion inside the callback (rather than building it
 * implicitly) lets callers compose generators freely while still benefiting
 * from the standard naming.
 *
 * @param it             The test runner's `it` / `test` function (e.g. Vitest's `it`).
 * @param propertyNumber The property number from `design.md` (1-based).
 * @param propertyText   Short human-readable label for the property.
 * @param runner         Callback that invokes `fc.assert(...)`.
 */
export function propertyTest(
  it: TestRegistrar,
  propertyNumber: number,
  propertyText: string,
  runner: () => void | Promise<void>,
): void {
  it(propertyTestName(propertyNumber, propertyText), runner);
}

/**
 * Convenience namespace re-exporting the most-used fast-check primitives.
 *
 * Most property tests only need `assert` and `property`; importing them via
 * this namespace keeps call sites short and avoids accidental drift to
 * other fast-check entry points that might bypass our conventions.
 */
export const pbt = {
  assert: fc.assert,
  property: fc.property,
} as const;

export type { fc };
