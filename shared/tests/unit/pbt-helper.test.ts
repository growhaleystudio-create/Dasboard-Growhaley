import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  FEATURE_ID,
  defaultPbtParams,
  pbt,
  propertyTest,
  propertyTestName,
} from '../../src/testing/pbt.js';

describe('PBT helper', () => {
  it('exposes the canonical feature id', () => {
    expect(FEATURE_ID).toBe('leads-generator-dashboard');
  });

  it('builds the canonical property test name', () => {
    expect(propertyTestName(0, 'Smoke: PBT helper integration')).toBe(
      'Feature: leads-generator-dashboard, Property 0: Smoke: PBT helper integration',
    );
  });

  it('defaults to numRuns = 100 per property', () => {
    expect(defaultPbtParams.numRuns).toBe(100);
  });

  // Smoke property: integers from fast-check are integers.
  // Tag: Feature: leads-generator-dashboard, Property 0: Smoke: PBT helper integration
  propertyTest(it, 0, 'Smoke: PBT helper integration', () => {
    pbt.assert(
      pbt.property(fc.integer(), (n) => Number.isInteger(n)),
      defaultPbtParams,
    );
  });
});
