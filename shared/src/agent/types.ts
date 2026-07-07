export type AgentFeatureId = 'dashboard-shell' | 'leads' | 'content' | 'research';

export type AgentActionMode =
  | 'read'
  | 'propose'
  | 'mutate_with_confirm'
  | 'destructive_with_confirm';

export type FeaturePointerKind = 'page' | 'component' | 'route' | 'service' | 'repository' | 'type' | 'doc' | 'spec';

export type FeaturePointerMatchMode = 'all' | 'any';

export interface FeatureCodePointer {
  path: string;
  kind?: Exclude<FeaturePointerKind, 'doc' | 'spec'>;
  note?: string;
  semanticAnchors?: string[];
  matchMode?: FeaturePointerMatchMode;
}

export interface FeatureDocPointer {
  path: string;
  kind?: Extract<FeaturePointerKind, 'doc' | 'spec'>;
  note?: string;
  semanticAnchors?: string[];
  matchMode?: FeaturePointerMatchMode;
}

export interface FeatureActionDefinition {
  id: string;
  label: string;
  mode: AgentActionMode;
  description: string;
  touches?: string[];
}

export interface FeatureRegistryEntry {
  id: AgentFeatureId;
  label: string;
  summary: string;
  keywords: string[];
  exampleIntents: string[];
  frontend: FeatureCodePointer[];
  backend: FeatureCodePointer[];
  sharedTypes: FeatureCodePointer[];
  docs: FeatureDocPointer[];
  actions: FeatureActionDefinition[];
}
