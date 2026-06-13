import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for the @leads-generator/backend workspace.
 *
 * Tests live alongside source files (`src/**\/*.test.ts`) for unit-level
 * coverage and under `tests/{unit,integration,property}` for higher-level
 * suites. Property-based tests (PBT) are written with fast-check and the
 * shared helper at `@leads-generator/shared/testing/pbt`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
    },
  },
});
