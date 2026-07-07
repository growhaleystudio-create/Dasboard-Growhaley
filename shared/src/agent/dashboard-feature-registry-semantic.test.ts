import { describe, expect, it } from 'vitest';

import {
  checkDashboardFeatureRegistrySemantics,
  getDashboardFeatureSemanticDrift,
  listDashboardFeatureSemanticPointers,
} from './dashboard-feature-registry-semantic.js';

describe('dashboard feature registry semantic checks', () => {
  it('lists semantic pointers across dashboard features', () => {
    const items = listDashboardFeatureSemanticPointers();

    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => item.section === 'frontend')).toBe(true);
    expect(items.some((item) => item.section === 'backend')).toBe(true);
  });

  it('reports zero semantic drift for the current repository', () => {
    const drifts = getDashboardFeatureSemanticDrift();

    expect(drifts).toEqual([]);
  });

  it('returns a valid zero-drift semantic report for the current repository', () => {
    const report = checkDashboardFeatureRegistrySemantics();

    expect(report.totalPointers).toBeGreaterThan(0);
    expect(report.driftCount).toBe(0);
    expect(report.drifts).toEqual([]);
    expect(report.items.length).toBe(report.totalPointers);
  });

  it('marks every semantic pointer as drifted for an invalid repo root', () => {
    const report = checkDashboardFeatureRegistrySemantics('/tmp/dashboard-agent-semantic-missing');

    expect(report.totalPointers).toBeGreaterThan(0);
    expect(report.driftCount).toBe(report.totalPointers);
    expect(report.drifts).toHaveLength(report.totalPointers);
    expect(report.drifts[0]).toMatchObject({
      featureId: expect.any(String),
      section: expect.any(String),
      path: expect.any(String),
      missingAnchors: expect.any(Array),
    });
    expect(report.drifts[0]!.missingAnchors.length).toBeGreaterThan(0);
  });
});
