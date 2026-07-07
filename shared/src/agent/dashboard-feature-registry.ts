import type { AgentFeatureId, FeatureRegistryEntry } from './types.js';

const DASHBOARD_FEATURE_REGISTRY: Record<AgentFeatureId, FeatureRegistryEntry> = {
  'dashboard-shell': {
    id: 'dashboard-shell',
    label: 'Dashboard Shell',
    summary: 'Authenticated dashboard shell with shared navigation, route framing, and cross-feature entry points.',
    keywords: ['dashboard', 'shell', 'layout', 'navigation', 'sidebar', 'header'],
    exampleIntents: [
      'Pahami struktur dashboard utama',
      'Ubah navigasi sidebar dashboard',
      'Cari entry point semua feature dashboard',
    ],
    frontend: [
      {
        path: 'frontend/src/app/dashboard/layout.tsx',
        kind: 'page',
        note: 'Route-group layout that mounts dashboard shell.',
      },
      {
        path: 'frontend/src/components/layout/DashboardLayout.tsx',
        kind: 'component',
        note: 'Primary shell, navigation, auth/session handling, and responsive dashboard chrome.',
        semanticAnchors: ['DashboardLayout', '/dashboard/leads', '/dashboard/content', '/dashboard/surveys'],
        matchMode: 'all',
      },
      {
        path: 'frontend/src/app/dashboard/page.tsx',
        kind: 'page',
        note: 'Dashboard landing page with high-level lead metrics and deep links.',
      },
    ],
    backend: [
      {
        path: 'backend/src/api/server.ts',
        kind: 'route',
        note: 'Registers dashboard-related route groups under team-scoped API.',
        semanticAnchors: ['teams/:id/leads', 'teams/:id/scans', 'teams/:id/content', 'teams/:id/surveys'],
        matchMode: 'all',
      },
      {
        path: 'backend/src/api/plugins/auth-guard.ts',
        kind: 'service',
        note: 'Auth, team, and role guard chain applied to dashboard APIs.',
      },
      {
        path: 'backend/src/auth/rbac.ts',
        kind: 'service',
        note: 'Action-to-role permission matrix used by dashboard mutations.',
      },
    ],
    sharedTypes: [
      {
        path: 'shared/src/auth.ts',
        kind: 'type',
        note: 'Shared RBAC action definitions and auth domain types.',
      },
    ],
    docs: [
      {
        path: 'docs/ARCHITECTURE.md',
        kind: 'doc',
        note: 'Current implementation map and module overview for dashboard platform.',
      },
      {
        path: 'docs/superpowers/specs/2026-06-26-voit-ds-dashboard-redesign-design.md',
        kind: 'doc',
        note: 'Frontend redesign constraints and shell migration direction.',
      },
    ],
    actions: [
      {
        id: 'inspect-dashboard-shell',
        label: 'Inspect dashboard shell',
        mode: 'read',
        description: 'Read dashboard layout, navigation, and route-entry structure.',
        touches: ['frontend/src/components/layout/DashboardLayout.tsx', 'frontend/src/app/dashboard/layout.tsx'],
      },
      {
        id: 'propose-dashboard-ia',
        label: 'Propose dashboard IA changes',
        mode: 'propose',
        description: 'Draft information architecture or navigation changes before implementation.',
        touches: ['frontend/src/components/layout/DashboardLayout.tsx'],
      },
    ],
  },
  leads: {
    id: 'leads',
    label: 'Leads Generator',
    summary: 'Lead discovery, listing, filtering, AI enrichment, lifecycle updates, export, and scan execution workflow.',
    keywords: ['lead', 'leads', 'scan', 'prospect', 'fiverr', 'linkedin', 'threads', 'reanalyze', 'export'],
    exampleIntents: [
      'Pahami flow leads generator',
      'Tambah filter baru di halaman leads',
      'Ubah action AI reanalyze lead',
      'Cek flow create scan dan run scan',
    ],
    frontend: [
      {
        path: 'frontend/src/app/dashboard/leads/page.tsx',
        kind: 'page',
        note: 'Primary leads management page with filters, table actions, modal detail, and export.',
        semanticAnchors: ['LeadsPage', 'Acquired Leads', 'Lead Details', 'Run AI Scan'],
        matchMode: 'all',
      },
      {
        path: 'frontend/src/app/dashboard/scans/page.tsx',
        kind: 'page',
        note: 'Scan configuration and execution workflow for acquiring new leads.',
        semanticAnchors: ['ScansPage', 'Recent Scans', 'Create New Scan', 'Run Again'],
        matchMode: 'all',
      },
      {
        path: 'frontend/src/app/dashboard/scan-leads/page.tsx',
        kind: 'page',
        note: 'Alias route that redirects into scans workflow.',
      },
      {
        path: 'frontend/src/app/dashboard/page.tsx',
        kind: 'page',
        note: 'Landing metrics and recent-leads entry point into leads workflow.',
      },
    ],
    backend: [
      {
        path: 'backend/src/api/routes/lead.routes.ts',
        kind: 'route',
        note: 'Lead list, status update, notes, delete, and related request validation.',
        semanticAnchors: ['leadRoutes', '/:leadId/status', '/:leadId/notes'],
        matchMode: 'all',
      },
      {
        path: 'backend/src/api/routes/scan.routes.ts',
        kind: 'route',
        note: 'Scan configuration listing, creation, detail, and run endpoints.',
        semanticAnchors: ['scanRoutes', '/:configId/run'],
        matchMode: 'all',
      },
      {
        path: 'backend/src/api/routes/ai.routes.ts',
        kind: 'route',
        note: 'AI settings, usage, model listing, and manual lead reanalysis endpoints.',
      },
      {
        path: 'backend/src/lead/lead-manager.ts',
        kind: 'service',
        note: 'Lead mutations: status changes, notes, delete, and audit/activity behavior.',
      },
      {
        path: 'backend/src/scan/scan-config-service.ts',
        kind: 'service',
        note: 'Validates and persists scan configurations with connector availability checks.',
      },
      {
        path: 'backend/src/scan/scan-engine.ts',
        kind: 'service',
        note: 'Runs scan pipeline, resolves connectors, and persists summary.',
      },
      {
        path: 'backend/src/scan/scan-job-runner.ts',
        kind: 'service',
        note: 'Background scan job lifecycle, status finalization, and outbox notifications.',
      },
      {
        path: 'backend/src/ai/ai-reanalyze-service.ts',
        kind: 'service',
        note: 'Manual AI reanalysis trigger that marks lead pending and enqueues worker job.',
      },
    ],
    sharedTypes: [
      {
        path: 'shared/src/lead.ts',
        kind: 'type',
        note: 'Lead domain DTOs and status-related shared contracts.',
      },
      {
        path: 'shared/src/scan.ts',
        kind: 'type',
        note: 'Scan configuration and job-related shared contracts.',
      },
      {
        path: 'shared/src/auth.ts',
        kind: 'type',
        note: 'Permissions used by lead/scan/AI mutations.',
      },
    ],
    docs: [
      {
        path: 'docs/ARCHITECTURE.md',
        kind: 'doc',
        note: 'Current leads platform architecture and implementation status.',
      },
      {
        path: '.kiro/specs/leads-generator-dashboard/requirements.md',
        kind: 'spec',
        note: 'Canonical requirements for leads platform behavior.',
      },
      {
        path: '.kiro/specs/leads-generator-dashboard/design.md',
        kind: 'spec',
        note: 'Canonical design for scan, dedup, scoring, AI, and privacy behavior.',
      },
    ],
    actions: [
      {
        id: 'list-filter-leads',
        label: 'List and filter leads',
        mode: 'read',
        description: 'Inspect lead table, filter options, pagination, and current query behavior.',
        touches: ['frontend/src/app/dashboard/leads/page.tsx', 'backend/src/api/routes/lead.routes.ts'],
      },
      {
        id: 'update-lead-status',
        label: 'Update lead status',
        mode: 'mutate_with_confirm',
        description: 'Change a lead status and track resulting activity updates.',
        touches: ['frontend/src/app/dashboard/leads/page.tsx', 'backend/src/lead/lead-manager.ts'],
      },
      {
        id: 'add-lead-note',
        label: 'Add lead note',
        mode: 'mutate_with_confirm',
        description: 'Append a follow-up note to a lead record.',
        touches: ['frontend/src/app/dashboard/leads/page.tsx', 'backend/src/lead/lead-manager.ts'],
      },
      {
        id: 'rerun-lead-ai-analysis',
        label: 'Rerun lead AI analysis',
        mode: 'mutate_with_confirm',
        description: 'Trigger manual AI reanalysis for a specific lead.',
        touches: ['frontend/src/app/dashboard/leads/page.tsx', 'backend/src/ai/ai-reanalyze-service.ts'],
      },
      {
        id: 'delete-lead',
        label: 'Delete lead',
        mode: 'destructive_with_confirm',
        description: 'Delete a lead after explicit confirmation and audit logging.',
        touches: ['frontend/src/app/dashboard/leads/page.tsx', 'backend/src/lead/lead-manager.ts'],
      },
      {
        id: 'export-leads',
        label: 'Export leads',
        mode: 'mutate_with_confirm',
        description: 'Run lead export flow or update export behavior.',
        touches: ['frontend/src/app/dashboard/leads/page.tsx', 'backend/src/api/routes/lead.routes.ts'],
      },
      {
        id: 'create-scan-config',
        label: 'Create scan configuration',
        mode: 'mutate_with_confirm',
        description: 'Create or update scan configuration inputs before execution.',
        touches: ['frontend/src/app/dashboard/scans/page.tsx', 'backend/src/scan/scan-config-service.ts'],
      },
      {
        id: 'run-scan-config',
        label: 'Run scan configuration',
        mode: 'mutate_with_confirm',
        description: 'Execute a scan configuration and track resulting job state.',
        touches: ['frontend/src/app/dashboard/scans/page.tsx', 'backend/src/scan/scan-job-runner.ts'],
      },
    ],
  },
  content: {
    id: 'content',
    label: 'Content Generator',
    summary: 'Planner-driven content workspace for brand-aware carousel drafts, revisions, rendering, examples, and references.',
    keywords: ['content', 'carousel', 'brand kit', 'template', 'draft', 'render', 'slide', 'reference'],
    exampleIntents: [
      'Pahami content generator yang sekarang',
      'Tambah flow planning baru buat content',
      'Ubah brand kit atau template behavior',
      'Cek revise draft dan render job flow',
    ],
    frontend: [
      {
        path: 'frontend/src/app/dashboard/content/page.tsx',
        kind: 'page',
        note: 'Main content workspace with generate, brand kit, references, and history tabs.',
        semanticAnchors: ['ContentGeneratorPage', 'Generate', 'Brand Kit', 'Referensi', 'History'],
        matchMode: 'all',
      },
      {
        path: 'frontend/src/app/dashboard/content/components/ChatMessages.tsx',
        kind: 'component',
        note: 'Reusable chat transcript rendering for draft and revise interactions.',
        semanticAnchors: ['ChatMessages', 'typingLabel'],
        matchMode: 'all',
      },
    ],
    backend: [
      {
        path: 'backend/src/api/routes/content.routes.ts',
        kind: 'route',
        note: 'Brand kit, templates, generation jobs, examples, draft/revise, and references endpoints.',
        semanticAnchors: ['contentRoutes', '/carousel/generate', '/carousel/draft', '/carousel/references'],
        matchMode: 'all',
      },
      {
        path: 'backend/src/content/content-generator-service.ts',
        kind: 'service',
        note: 'Trigger/get content generation jobs with prerequisite validation.',
      },
      {
        path: 'backend/src/content/sdui-carousel-worker.ts',
        kind: 'service',
        note: 'Worker pipeline for planning, repair, rendering, image generation, and final job status.',
      },
      {
        path: 'backend/src/repository/content-generation-job-repository.ts',
        kind: 'repository',
        note: 'Team-scoped content generation job persistence.',
      },
      {
        path: 'backend/src/repository/content-generation-slide-repository.ts',
        kind: 'repository',
        note: 'Per-slide state storage for content generation jobs.',
      },
    ],
    sharedTypes: [
      {
        path: 'shared/src/content.ts',
        kind: 'type',
        note: 'Shared content, job, slide, and workflow contracts.',
      },
      {
        path: 'shared/src/auth.ts',
        kind: 'type',
        note: 'Permissions used by content manage/generate actions.',
      },
    ],
    docs: [
      {
        path: '.kiro/specs/ai-content-carousel-generator/requirements.md',
        kind: 'spec',
        note: 'Canonical content generator requirements.',
      },
      {
        path: '.kiro/specs/ai-content-carousel-generator/design.md',
        kind: 'spec',
        note: 'Canonical content planner/validator/renderer design and job semantics.',
      },
      {
        path: 'ANALISIS_CONTENT_GENERATOR.md',
        kind: 'doc',
        note: 'Implementation-vs-workflow analysis of current content generator behavior.',
      },
    ],
    actions: [
      {
        id: 'inspect-content-workspace',
        label: 'Inspect content workspace',
        mode: 'read',
        description: 'Review tabs, planner flow, chat history behavior, and async job polling.',
        touches: ['frontend/src/app/dashboard/content/page.tsx', 'backend/src/content/content-generator-service.ts'],
      },
      {
        id: 'update-brand-kit',
        label: 'Update brand kit',
        mode: 'mutate_with_confirm',
        description: 'Change brand kit fields or related persistence flow.',
        touches: ['frontend/src/app/dashboard/content/page.tsx', 'backend/src/api/routes/content.routes.ts'],
      },
      {
        id: 'update-master-template',
        label: 'Update master template',
        mode: 'mutate_with_confirm',
        description: 'Edit master template settings or server-side validation path.',
        touches: ['frontend/src/app/dashboard/content/page.tsx', 'backend/src/api/routes/content.routes.ts'],
      },
      {
        id: 'create-content-draft',
        label: 'Create content draft',
        mode: 'mutate_with_confirm',
        description: 'Trigger planning-first content draft creation.',
        touches: ['frontend/src/app/dashboard/content/page.tsx', 'backend/src/api/routes/content.routes.ts'],
      },
      {
        id: 'generate-content-carousel',
        label: 'Generate content carousel',
        mode: 'mutate_with_confirm',
        description: 'Trigger direct generation or final render for content carousel output.',
        touches: ['frontend/src/app/dashboard/content/page.tsx', 'backend/src/content/content-generator-service.ts'],
      },
      {
        id: 'revise-content-draft',
        label: 'Revise content draft',
        mode: 'mutate_with_confirm',
        description: 'Send chat feedback or slide revision requests to adjust draft output.',
        touches: ['frontend/src/app/dashboard/content/page.tsx', 'backend/src/api/routes/content.routes.ts'],
      },
      {
        id: 'approve-content-example',
        label: 'Approve content example',
        mode: 'mutate_with_confirm',
        description: 'Approve or unapprove generated content into example library.',
        touches: ['frontend/src/app/dashboard/content/page.tsx', 'backend/src/api/routes/content.routes.ts'],
      },
      {
        id: 'upload-reference',
        label: 'Upload reference',
        mode: 'mutate_with_confirm',
        description: 'Add new visual or content references used by the generator.',
        touches: ['frontend/src/app/dashboard/content/page.tsx', 'backend/src/api/routes/content.routes.ts'],
      },
      {
        id: 'delete-reference',
        label: 'Delete reference',
        mode: 'destructive_with_confirm',
        description: 'Remove an existing reference asset or example after explicit confirmation.',
        touches: ['frontend/src/app/dashboard/content/page.tsx', 'backend/src/api/routes/content.routes.ts'],
      },
    ],
  },
  research: {
    id: 'research',
    label: 'Analysis & Research',
    summary: 'Survey-driven research workspace with publishing lifecycle, responses, analytics, exports, and queued AI analysis runs.',
    keywords: ['research', 'analysis', 'survey', 'response', 'analytics', 'segment', 'question'],
    exampleIntents: [
      'Pahami feature analysis research',
      'Tambah tab baru di detail survey',
      'Ubah AI analysis run workflow',
      'Cek publish/unpublish survey behavior',
    ],
    frontend: [
      {
        path: 'frontend/src/app/dashboard/surveys/page.tsx',
        kind: 'page',
        note: 'Survey index page with list, create, publish, unpublish, and close actions.',
        semanticAnchors: ['SurveysPage', 'Research surveys', 'New survey'],
        matchMode: 'all',
      },
      {
        path: 'frontend/src/app/dashboard/surveys/[surveyId]/page.tsx',
        kind: 'page',
        note: 'Detailed research workspace with responses, analytics, and analysis runs.',
        semanticAnchors: ['SurveyDetailPage', 'Overview', 'Questions', 'Responses', 'Analytics', 'AI Analysis'],
        matchMode: 'all',
      },
      {
        path: 'frontend/src/components/surveys/SurveyListTable.tsx',
        kind: 'component',
        note: 'Survey listing table and public-link interaction surface.',
      },
      {
        path: 'frontend/src/components/surveys/SurveyAIAnalysisPanel.tsx',
        kind: 'component',
        note: 'Queued AI analysis orchestration and result inspection UI.',
        semanticAnchors: ['SurveyAIAnalysisPanel', 'Trigger analysis', 'Analysis runs'],
        matchMode: 'all',
      },
    ],
    backend: [
      {
        path: 'backend/src/api/server.ts',
        kind: 'route',
        note: 'Mounts survey route group under team-scoped dashboard API.',
      },
      {
        path: 'backend/src/api/routes/survey.routes.ts',
        kind: 'route',
        note: 'Survey CRUD, questions, responses, analytics, export, and AI analysis endpoints.',
        semanticAnchors: ['surveyRoutes', '/:surveyId/analysis', '/:surveyId/export/csv'],
        matchMode: 'all',
      },
      {
        path: 'backend/src/worker.ts',
        kind: 'service',
        note: 'Worker wiring for survey analysis jobs and related async processing.',
      },
    ],
    sharedTypes: [
      {
        path: 'shared/src/survey.ts',
        kind: 'type',
        note: 'Shared survey, response, and analysis-related contracts.',
      },
      {
        path: 'shared/src/auth.ts',
        kind: 'type',
        note: 'Permissions and auth contracts reused by survey actions.',
      },
    ],
    docs: [
      {
        path: 'docs/leads-generator-feature-analysis.md',
        kind: 'doc',
        note: 'Survey/research module analysis mapped to current dashboard code.',
      },
      {
        path: 'docs/ARCHITECTURE.md',
        kind: 'doc',
        note: 'Current platform map and async worker patterns relevant to research flows.',
      },
    ],
    actions: [
      {
        id: 'inspect-research-workspace',
        label: 'Inspect research workspace',
        mode: 'read',
        description: 'Read survey list/detail flows, analytics tabs, and analysis inspection surfaces.',
        touches: ['frontend/src/app/dashboard/surveys/page.tsx', 'frontend/src/app/dashboard/surveys/[surveyId]/page.tsx'],
      },
      {
        id: 'create-survey',
        label: 'Create survey',
        mode: 'mutate_with_confirm',
        description: 'Create a new survey or modify survey-creation flow.',
        touches: ['frontend/src/app/dashboard/surveys/page.tsx', 'shared/src/survey.ts'],
      },
      {
        id: 'publish-survey',
        label: 'Publish survey',
        mode: 'mutate_with_confirm',
        description: 'Publish or unpublish a survey as part of research lifecycle.',
        touches: ['frontend/src/app/dashboard/surveys/page.tsx', 'frontend/src/app/dashboard/surveys/[surveyId]/page.tsx'],
      },
      {
        id: 'close-survey',
        label: 'Close survey',
        mode: 'mutate_with_confirm',
        description: 'Close an active survey and preserve research state.',
        touches: ['frontend/src/app/dashboard/surveys/page.tsx', 'frontend/src/app/dashboard/surveys/[surveyId]/page.tsx'],
      },
      {
        id: 'run-survey-ai-analysis',
        label: 'Run survey AI analysis',
        mode: 'mutate_with_confirm',
        description: 'Queue AI analysis runs by scope and inspect resulting run lifecycle.',
        touches: ['frontend/src/components/surveys/SurveyAIAnalysisPanel.tsx', 'backend/src/worker.ts'],
      },
      {
        id: 'export-survey-responses',
        label: 'Export survey responses',
        mode: 'mutate_with_confirm',
        description: 'Export responses or analysis data from research workflow.',
        touches: ['frontend/src/app/dashboard/surveys/[surveyId]/page.tsx', 'shared/src/survey.ts'],
      },
    ],
  },
};

export function listDashboardFeatures(): FeatureRegistryEntry[] {
  return Object.values(DASHBOARD_FEATURE_REGISTRY);
}

export function getDashboardFeature(featureId: AgentFeatureId): FeatureRegistryEntry {
  return DASHBOARD_FEATURE_REGISTRY[featureId];
}

export function matchDashboardFeature(query: string): FeatureRegistryEntry | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  const ranked = listDashboardFeatures()
    .map((entry) => {
      const exactKeywordMatch = entry.keywords.some((keyword) => normalizedQuery === keyword.toLowerCase());
      const directKeywordMatch = entry.keywords.some((keyword) => normalizedQuery.includes(keyword.toLowerCase()));
      const labelMatch = normalizedQuery.includes(entry.label.toLowerCase());
      const intentMatch = entry.exampleIntents.some((intent) => normalizedQuery.includes(intent.toLowerCase()));

      let score = 0;
      if (exactKeywordMatch) score += 5;
      if (directKeywordMatch) score += 3;
      if (labelMatch) score += 2;
      if (intentMatch) score += 1;

      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.entry ?? null;
}
