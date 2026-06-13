import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for the @leads-generator/shared workspace.
 *
 * The shared package owns the PBT helper used by all other workspaces; its
 * own tests verify the helper itself plus any pure domain logic added later.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
