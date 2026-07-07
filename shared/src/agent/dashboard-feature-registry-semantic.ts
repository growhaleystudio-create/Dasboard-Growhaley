import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listDashboardFeatures } from './dashboard-feature-registry.js';
import type {
  AgentFeatureId,
  FeatureCodePointer,
  FeatureDocPointer,
  FeaturePointerMatchMode,
} from './types.js';

export type FeaturePointerSection = 'frontend' | 'backend' | 'sharedTypes' | 'docs';

type SemanticFeaturePointer = FeatureCodePointer | FeatureDocPointer;

export interface SemanticCheckItem {
  featureId: AgentFeatureId;
  section: FeaturePointerSection;
  path: string;
  matchMode: FeaturePointerMatchMode;
  semanticAnchors: string[];
}

export interface SemanticDriftItem extends SemanticCheckItem {
  missingAnchors: string[];
}

export interface SemanticCheckReport {
  checkedAt: string;
  repoRoot: string;
  totalPointers: number;
  driftCount: number;
  items: Array<SemanticCheckItem | SemanticDriftItem>;
  drifts: SemanticDriftItem[];
}

const DEFAULT_MATCH_MODE: FeaturePointerMatchMode = 'all';

function getDefaultRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

function normalizeContent(value: string): string {
  return value.toLowerCase();
}

function isSemanticPointer(pointer: SemanticFeaturePointer): pointer is SemanticFeaturePointer & { semanticAnchors: string[] } {
  return Array.isArray(pointer.semanticAnchors) && pointer.semanticAnchors.length > 0;
}

function evaluateAnchors(
  fileContent: string,
  semanticAnchors: string[],
  matchMode: FeaturePointerMatchMode,
): string[] {
  const normalizedContent = normalizeContent(fileContent);
  const missingAnchors = semanticAnchors.filter((anchor) => !normalizedContent.includes(anchor.toLowerCase()));

  if (matchMode === 'any') {
    return missingAnchors.length === semanticAnchors.length ? missingAnchors : [];
  }

  return missingAnchors;
}

export function listDashboardFeatureSemanticPointers(): SemanticCheckItem[] {
  return listDashboardFeatures().flatMap((feature) => {
    const sections: Array<[FeaturePointerSection, SemanticFeaturePointer[]]> = [
      ['frontend', feature.frontend],
      ['backend', feature.backend],
      ['sharedTypes', feature.sharedTypes],
      ['docs', feature.docs],
    ];

    return sections.flatMap(([section, pointers]) =>
      pointers
        .filter(isSemanticPointer)
        .map((pointer) => ({
          featureId: feature.id,
          section,
          path: pointer.path,
          matchMode: pointer.matchMode ?? DEFAULT_MATCH_MODE,
          semanticAnchors: pointer.semanticAnchors,
        })),
    );
  });
}

export function checkDashboardFeatureRegistrySemantics(repoRoot?: string): SemanticCheckReport {
  const resolvedRepoRoot = repoRoot ? path.resolve(repoRoot) : getDefaultRepoRoot();
  const items = listDashboardFeatureSemanticPointers();

  const evaluatedItems = items.map((item) => {
    const absolutePath = path.resolve(resolvedRepoRoot, item.path);

    try {
      const fileContent = readFileSync(absolutePath, 'utf8');
      const missingAnchors = evaluateAnchors(fileContent, item.semanticAnchors, item.matchMode);

      if (missingAnchors.length === 0) {
        return item;
      }

      return {
        ...item,
        missingAnchors,
      } satisfies SemanticDriftItem;
    } catch {
      return {
        ...item,
        missingAnchors: [...item.semanticAnchors],
      } satisfies SemanticDriftItem;
    }
  });

  const drifts = evaluatedItems.filter((item): item is SemanticDriftItem => 'missingAnchors' in item);

  return {
    checkedAt: new Date().toISOString(),
    repoRoot: resolvedRepoRoot,
    totalPointers: items.length,
    driftCount: drifts.length,
    items: evaluatedItems,
    drifts,
  };
}

export function getDashboardFeatureSemanticDrift(repoRoot?: string): SemanticDriftItem[] {
  return checkDashboardFeatureRegistrySemantics(repoRoot).drifts;
}
