import { describe, expect, it } from 'vitest';

import {
  getDashboardFeature,
  listDashboardFeatures,
  matchDashboardFeature,
} from './dashboard-feature-registry.js';

describe('dashboard feature registry', () => {
  it('contains complete metadata for every feature', () => {
    const features = listDashboardFeatures();

    expect(features.length).toBeGreaterThanOrEqual(4);

    for (const feature of features) {
      expect(feature.id).toBeTruthy();
      expect(feature.label).toBeTruthy();
      expect(feature.summary).toBeTruthy();
      expect(feature.keywords.length).toBeGreaterThan(0);
      expect(feature.exampleIntents.length).toBeGreaterThan(0);
      expect(feature.frontend.length).toBeGreaterThan(0);
      expect(feature.backend.length).toBeGreaterThan(0);
      expect(feature.sharedTypes.length).toBeGreaterThan(0);
      expect(feature.docs.length).toBeGreaterThan(0);
      expect(feature.actions.length).toBeGreaterThan(0);
    }
  });

  it('requires confirmation for mutation and destructive actions', () => {
    const features = listDashboardFeatures();

    for (const feature of features) {
      for (const action of feature.actions) {
        if (action.mode === 'mutate_with_confirm' || action.mode === 'destructive_with_confirm') {
          expect(action.mode.includes('confirm')).toBe(true);
        }
      }
    }
  });

  it('matches known feature keywords consistently', () => {
    expect(matchDashboardFeature('lead')?.id).toBe('leads');
    expect(matchDashboardFeature('scan')?.id).toBe('leads');
    expect(matchDashboardFeature('content')?.id).toBe('content');
    expect(matchDashboardFeature('carousel')?.id).toBe('content');
    expect(matchDashboardFeature('survey')?.id).toBe('research');
    expect(matchDashboardFeature('research')?.id).toBe('research');
    expect(matchDashboardFeature('analysis')?.id).toBe('research');
    expect(matchDashboardFeature('dashboard layout')?.id).toBe('dashboard-shell');
  });

  it('returns stable feature ids through direct lookup', () => {
    expect(getDashboardFeature('dashboard-shell').id).toBe('dashboard-shell');
    expect(getDashboardFeature('leads').id).toBe('leads');
    expect(getDashboardFeature('content').id).toBe('content');
    expect(getDashboardFeature('research').id).toBe('research');
  });

  it('returns null for blank or unrelated queries', () => {
    expect(matchDashboardFeature('')).toBeNull();
    expect(matchDashboardFeature('totally unrelated infra topic')).toBeNull();
  });
});
