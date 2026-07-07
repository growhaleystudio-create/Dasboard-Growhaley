import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listDashboardFeatures } from './dashboard-feature-registry.js';
import type { AgentFeatureId, FeatureCodePointer, FeatureDocPointer } from './types.js';

export type FeaturePointerSection = 'frontend' | 'backend' | 'sharedTypes' | 'docs';

export interface FreshnessCheckItem {
  featureId: AgentFeatureId;
  section: FeaturePointerSection;
  path: string;
  exists: boolean;
}

export interface FreshnessCheckReport {
  checkedAt: string;
  repoRoot: string;
  total: number;
  validCount: number;
  invalidCount: number;
  items: FreshnessCheckItem[];
  missing: FreshnessCheckItem[];
}

const CURRENT_FILE_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = path.resolve(path.dirname(CURRENT_FILE_PATH), '../../..');

function toFreshnessItem(
  featureId: AgentFeatureId,
  section: FeaturePointerSection,
  pointer: FeatureCodePointer | FeatureDocPointer,
  repoRoot: string,
): FreshnessCheckItem {
  return {
    featureId,
    section,
    path: pointer.path,
    exists: existsSync(path.resolve(repoRoot, pointer.path)),
  };
}

export function listDashboardFeaturePointers(): Array<
  Omit<FreshnessCheckItem, 'exists'>
> {
  return listDashboardFeatures().flatMap((feature) => [
    ...feature.frontend.map((pointer) => ({
      featureId: feature.id,
      section: 'frontend' as const,
      path: pointer.path,
    })),
    ...feature.backend.map((pointer) => ({
      featureId: feature.id,
      section: 'backend' as const,
      path: pointer.path,
    })),
    ...feature.sharedTypes.map((pointer) => ({
      featureId: feature.id,
      section: 'sharedTypes' as const,
      path: pointer.path,
    })),
    ...feature.docs.map((pointer) => ({
      featureId: feature.id,
      section: 'docs' as const,
      path: pointer.path,
    })),
  ]);
}

export function checkDashboardFeatureRegistryFreshness(repoRoot = DEFAULT_REPO_ROOT): FreshnessCheckReport {
  const items = listDashboardFeatures().flatMap((feature) => [
    ...feature.frontend.map((pointer) => toFreshnessItem(feature.id, 'frontend', pointer, repoRoot)),
    ...feature.backend.map((pointer) => toFreshnessItem(feature.id, 'backend', pointer, repoRoot)),
    ...feature.sharedTypes.map((pointer) => toFreshnessItem(feature.id, 'sharedTypes', pointer, repoRoot)),
    ...feature.docs.map((pointer) => toFreshnessItem(feature.id, 'docs', pointer, repoRoot)),
  ]);
  const missing = items.filter((item) => !item.exists);

  return {
    checkedAt: new Date().toISOString(),
    repoRoot,
    total: items.length,
    validCount: items.length - missing.length,
    invalidCount: missing.length,
    items,
    missing,
  };
}

export function getMissingDashboardFeaturePointers(repoRoot = DEFAULT_REPO_ROOT): FreshnessCheckItem[] {
  return checkDashboardFeatureRegistryFreshness(repoRoot).missing;
}
