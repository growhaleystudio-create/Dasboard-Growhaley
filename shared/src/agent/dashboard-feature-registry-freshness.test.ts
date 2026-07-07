import { describe, expect, it } from 'vitest';

import {
  checkDashboardFeatureRegistryFreshness,
  getMissingDashboardFeaturePointers,
  listDashboardFeaturePointers,
} from './dashboard-feature-registry-freshness.js';

describe('dashboard feature registry freshness', () => {
  it('lists registry pointers before checking freshness', () => {
    const pointers = listDashboardFeaturePointers();

    expect(pointers.length).toBeGreaterThan(0);
    expect(pointers.some((pointer) => pointer.section === 'frontend')).toBe(true);
    expect(pointers.some((pointer) => pointer.section === 'backend')).toBe(true);
    expect(pointers.some((pointer) => pointer.section === 'sharedTypes')).toBe(true);
    expect(pointers.some((pointer) => pointer.section === 'docs')).toBe(true);
  });

  it('returns no missing pointers for current registry', () => {
    const missing = getMissingDashboardFeaturePointers();

    expect(missing).toEqual([]);
  });

  it('reports all current registry pointers as fresh', () => {
    const report = checkDashboardFeatureRegistryFreshness();

    expect(report.total).toBeGreaterThan(0);
    expect(report.invalidCount).toBe(0);
    expect(report.validCount).toBe(report.total);
    expect(report.missing).toEqual([]);
  });

  it('includes stale pointer details in failure report shape', () => {
    const report = checkDashboardFeatureRegistryFreshness('/definitely/missing/repo/root');

    expect(report.total).toBeGreaterThan(0);
    expect(report.invalidCount).toBe(report.total);
    expect(report.missing[0]).toMatchObject({
      exists: false,
    });
  });
});
