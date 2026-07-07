import { loadEnv, getPool, createRedisClient, createRedisSessionClient } from './index.js';
import { buildServer } from './api/server.js';
import { CredentialVaultService } from './auth/credential-vault-service.js';
import { createCredentialVault } from './auth/credential-vault.js';
import { DbEffectiveRoleResolver } from './auth/effective-role.js';

// Repositories
import { AppUserRepository } from './auth/user-repository.js';
import { MembershipRepository } from './auth/membership-repository.js';
import { InMemorySessionStore, RedisSessionStore } from './auth/session-store.js';
import { InvitationRepository } from './team/invitation-repository.js';
import { LeadRepository } from './repository/lead-repository.js';
import { LeadScoringBreakdownRepository } from './repository/lead-scoring-breakdown-repository.js';
import { ScanConfigurationRepository } from './repository/scan-configuration-repository.js';
import { ScanJobRepository } from './repository/scan-job-repository.js';
import { TeamConnectorRepository } from './repository/team-connector-repository.js';
import { TeamAiSettingsRepository } from './repository/team-ai-settings-repository.js';
import { AiCallLogRepository } from './repository/ai-call-log-repository.js';
import { ScoringModelRepository } from './repository/scoring-model-repository.js';
import { DbAuditLog } from './privacy/audit-log.js';
import { MetricsRepository } from './metrics/metrics-repository.js';
import { ScoreContributionRepository } from './scoring/score-contribution-repository.js';
import { ScoringFailureRepository } from './scoring/scoring-failure-repository.js';
import { OutboxRepository } from './scoring/outbox-repository.js';
import type { ScorableLead } from './scoring/scorable-lead.js';

// Services
import { DefaultAuthService } from './auth/auth-service.js';
import { TeamService } from './team/team-service.js';
import { Connector_Registry } from './connector/registry.js';
import { ConnectorActivationService, type CredentialValidator } from './connector/activation.js';
import { ExampleGoogleSearchConnector } from './connector/example-google-search.js';
import { RapidApiGoogleConnector } from './connector/rapidapi-google.js';
import { ApifyGoogleMapsConnector } from './connector/apify-google-maps.js';
import { GoogleScraperConnector } from './connector/google-scraper.js';
import { SocialApiConnector } from './connector/social-api-connectors.js';
import { ScanConfigService } from './scan/scan-config-service.js';
import { LeadManager } from './lead/lead-manager.js';
import { LeadQueryService } from './lead-query/lead-query-service.js';
import { MetricsService } from './metrics/metrics-service.js';
import { ExportService } from './privacy/export-service.js';
import { SurveyAnalyticsService } from './survey/survey-analytics-service.js';
import { SurveyAnalysisService, sampleOpenEndedAnswers } from './survey/survey-analysis-service.js';
import { SurveyExportService } from './survey/survey-export-service.js';
import {
  SURVEY_ANALYSIS_QUEUE_NAME,
  type SurveyAnalysisJobData,
} from './survey/survey-analysis-worker.js';
import { generateSurveyAnalysisWithProvider } from './survey/survey-analysis-ai.js';
import { DsarService } from './privacy/dsar-service.js';
import { TeamAiSettingsService } from './auth/team-ai-settings-service.js';
import { AiReanalyzeService } from './ai/ai-reanalyze-service.js';
import { AiAnalyzerService } from './ai/ai-analyzer-service.js';
import { AiTextProviderClient } from './ai/ai-text-provider-client.js';
import { AiBudgetTracker } from './ai/ai-budget-tracker.js';
import { BasicHtmlWebsiteAuditor } from './audit/custom-website-auditor.js';
import { LeadOpportunityScorer } from './scoring/service/lead-opportunity-scorer.js';
import { Queue } from 'bullmq';
import { AI_ANALYSIS_QUEUE_NAME, type AiAnalysisJobData } from './ai/ai-worker.js';
import {
  GOOGLE_MAPS_SCRAPE_QUEUE_NAME,
  processGoogleMapsScrapeJob,
  type GoogleMapsScrapeJobData,
} from './scraping/google-maps-scrape-worker.js';

// Carousel / Content services
import { MasterTemplateRepository } from './repository/master-template-repository.js';
import { ContentGenerationJobRepository } from './repository/content-generation-job-repository.js';
import { ContentGenerationSlideRepository } from './repository/content-generation-slide-repository.js';
import { ApprovedExampleRepository } from './repository/approved-example-repository.js';
import { MasterTemplateService } from './content/master-template-service.js';
import { ContentGeneratorService } from './content/content-generator-service.js';
import { ApprovedExampleService } from './content/approved-example-service.js';
import { createObjectStorageFromEnv } from './storage/object-storage.js';
import { CONTENT_GENERATION_QUEUE_NAME } from './content/content-generator-service.js';
import { DefaultSduiPlanner } from './content/sdui-planner/index.js';
import { DefaultExampleRetriever } from './content/example-retriever.js';
import { VisualDnaExtractor } from './content/visual-dna-extractor.js';
import { VisualReferenceRepository } from './repository/visual-reference-repository.js';
import { AiCallWrapper } from './content/ai-call-wrapper.js';
import { DefaultBackgroundImageClient } from './content/background-image-client.js';
import { processSduiCarouselJob } from './content/sdui-carousel-worker.js';
import { SatoriRenderer } from './content/satori-renderer.js';
import { UrlSafetyGuardImpl } from './content/url-safety-guard.js';
import { SurveyRepository } from './repository/survey-repository.js';
import { SurveyQuestionRepository } from './repository/survey-question-repository.js';
import { SurveyResponseRepository } from './repository/survey-response-repository.js';
import { SurveyAnalysisRepository } from './repository/survey-analysis-repository.js';
import { SurveyLogicService } from './survey/survey-logic-service.js';
import { SurveyService } from './survey/survey-service.js';
import { SurveyPublicService } from './survey/survey-public-service.js';

// Scan engine collaborators
import { executeScan } from './scan/scan-engine.js';
import { DeduplicationService } from './dedup/dedup-service.js';
import { SqlCanonicalLeadFinder } from './dedup/canonical-finder.js';
import { LeadScoringPersister } from './scoring/score-and-persist.js';
import { withTransaction } from './db/transaction.js';

async function start() {
  const env = loadEnv();

  // Database connection
  const dbPool = getPool();

  // Redis connections. In development, auth sessions stay in memory so a
  // flaky remote Redis URL does not randomly log the user out.
  const useRedisQueue = env.NODE_ENV !== 'development';
  const redisQueueClient = useRedisQueue ? createRedisClient(env.REDIS_URL) : null;
  const redisSessionClient =
    env.NODE_ENV === 'development' ? null : createRedisSessionClient(env.REDIS_URL);
  if (!redisQueueClient) {
    console.warn(
      '⚠️  Development mode: Redis queues are disabled; content jobs use the in-process fallback runner.',
    );
  }

  // Core Services & Repositories
  const vault = createCredentialVault(env);
  const usersRepo = new AppUserRepository(dbPool);
  const membershipsRepo = new MembershipRepository(dbPool);
  const sessionStore = redisSessionClient
    ? new RedisSessionStore(redisSessionClient)
    : new InMemorySessionStore();
  if (!redisSessionClient) {
    console.warn(
      '⚠️  Development mode: using in-memory session store because Redis session storage is disabled.',
    );
  }
  const invitationsRepo = new InvitationRepository(dbPool);

  const leadsRepo = new LeadRepository(dbPool);
  const scanConfigRepo = new ScanConfigurationRepository(dbPool);
  const scanJobRepo = new ScanJobRepository(dbPool);
  const connectorRepo = new TeamConnectorRepository(dbPool);

  const vaultService = new CredentialVaultService(connectorRepo, vault);

  const aiSettingsRepo = new TeamAiSettingsRepository(dbPool);
  const aiCallLogRepo = new AiCallLogRepository(dbPool);
  const scoringModelRepo = new ScoringModelRepository(dbPool);
  const auditRepo = new DbAuditLog(dbPool);
  const metricsRepo = new MetricsRepository(dbPool);

  const authService = new DefaultAuthService(usersRepo, sessionStore);
  const teamService = new TeamService(invitationsRepo, membershipsRepo);

  const connectorRegistry = new Connector_Registry(connectorRepo);
  // Register default connectors
  if (process.env.APIFY_TOKEN) {
    connectorRegistry.register(new ApifyGoogleMapsConnector());
  } else if (process.env.RAPIDAPI_KEY) {
    connectorRegistry.register(new RapidApiGoogleConnector());
  } else {
    connectorRegistry.register(new ExampleGoogleSearchConnector());
  }
  connectorRegistry.register(new GoogleScraperConnector());
  connectorRegistry.register(new SocialApiConnector('threads', 'Threads'));
  connectorRegistry.register(new SocialApiConnector('linkedin', 'LinkedIn'));
  connectorRegistry.register(new SocialApiConnector('instagram', 'Instagram'));

  const realValidator: CredentialValidator = {
    validate: async (sourceId: string, plaintext: string, signal: AbortSignal) => {
      const connector = connectorRegistry.get(sourceId);
      if (!connector) return { accepted: false };
      const status = await connector.checkAvailability();
      return { accepted: status === 'available' };
    },
  };
  const connectorActivation = new ConnectorActivationService({
    registry: connectorRegistry,
    vault: vaultService,
    repo: connectorRepo,
    validator: realValidator,
  });

  const scanConfigService = new ScanConfigService(scanConfigRepo, connectorRegistry);

  const leadManager = new LeadManager({ pool: dbPool });
  const scoringBreakdownRepo = new LeadScoringBreakdownRepository(dbPool);
  const leadQueryService = new LeadQueryService(leadsRepo, scoringBreakdownRepo);
  const metricsService = new MetricsService(metricsRepo);
  const exportService = new ExportService({ leads: leadsRepo, audit: auditRepo });
  const dsarService = new DsarService({ leads: leadsRepo, audit: auditRepo });
  const teamAiSettings = new TeamAiSettingsService(aiSettingsRepo, vault, env.CENTRAL_AI_TEAM_ID);

  const aiBudget = new AiBudgetTracker({
    settings: aiSettingsRepo,
    callLog: aiCallLogRepo,
  });
  const websiteAuditor = new BasicHtmlWebsiteAuditor();
  const leadOpportunityScorer = new LeadOpportunityScorer({
    pool: dbPool,
    leadReads: leadsRepo,
    auditor: websiteAuditor,
  });

  const aiAnalyzer = new AiAnalyzerService({
    pool: dbPool,
    settings: teamAiSettings,
    budget: aiBudget,
    providerFactory: (apiKey, apiBaseUrl, model) =>
      new AiTextProviderClient(apiKey, apiBaseUrl, model),
    leads: leadsRepo,
    breakdowns: scoringBreakdownRepo,
    audit: auditRepo,
    scorer: leadOpportunityScorer,
  });

  const aiQueue = redisQueueClient
    ? new Queue<AiAnalysisJobData>(AI_ANALYSIS_QUEUE_NAME, { connection: redisQueueClient })
    : ({
        add: async () => {
          throw new Error('ai_queue_unavailable_in_development');
        },
      } as unknown as Queue<AiAnalysisJobData>);
  const aiReanalyze = new AiReanalyzeService({
    leads: leadsRepo,
    settings: teamAiSettings,
    queue: aiQueue,
    scorer: leadOpportunityScorer,
  });

  // Real executeScan initialization
  const executeScanFn = async (input: any) => {
    return executeScan(
      {
        pool: dbPool,
        registry: connectorRegistry,
        loadModel: async (teamId) => {
          return scoringModelRepo.getForTeam(teamId);
        },
        pipeline: {
          dedup: (tx) =>
            new DeduplicationService({
              leads: new LeadRepository(tx),
              finder: new SqlCanonicalLeadFinder(tx),
            }),
          scorer: (tx) =>
            new LeadScoringPersister({
              leads: new LeadRepository(tx),
              contributions: new ScoreContributionRepository(),
              failures: new ScoringFailureRepository(),
              outbox: new OutboxRepository(),
            }),
          project: (leadId, normalized) => {
            const lead: ScorableLead = {
              teamId: normalized.teamId,
              matchedKeywords: normalized.matchedKeywords,
              sources: normalized.sources,
              discoveredAt: normalized.discoveredAt,
              referenceTime: new Date(),
              aiIntentScore: null,
            };
            if (normalized.location !== null && normalized.location !== undefined) {
              lead.location = normalized.location;
            }
            if (normalized.publicContact !== null && normalized.publicContact !== undefined) {
              lead.publicContact = normalized.publicContact;
            }
            return lead;
          },
        },
      },
      input,
    );
  };

  // Carousel / Content services
  // Object Storage hanya diinisialisasi bila Supabase credentials lengkap.
  // Bila belum dikonfigurasi, server tetap berjalan tapi endpoint upload akan
  // mengembalikan error INTERNAL yang informatif.
  let objectStorage: import('./storage/object-storage.js').ObjectStorage;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    objectStorage = createObjectStorageFromEnv({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_BUCKET: env.SUPABASE_BUCKET,
    } as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; SUPABASE_BUCKET: string });
  } else {
    console.warn(
      '⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi. ' +
        'Endpoint yang memerlukan Object Storage (brand-kit, carousel render) ' +
        'akan mengembalikan error. Isi .env untuk mengaktifkan fitur ini.',
    );
    // Stub that returns a clear error instead of crashing at startup.
    objectStorage = {
      async upload() {
        return {
          ok: false,
          error: {
            code: 'INTERNAL' as const,
            message: 'Object Storage belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY kosong)',
          },
        };
      },
      async resolveForTeam() {
        return { ok: false, error: { code: 'NOT_FOUND' as const, message: 'Resource not found' } };
      },
    };
  }
  const masterTemplateRepo = new MasterTemplateRepository(dbPool);
  const contentGenerationJobRepo = new ContentGenerationJobRepository(dbPool);
  const contentGenerationSlideRepo = new ContentGenerationSlideRepository(dbPool);
  const approvedExampleRepo = new ApprovedExampleRepository(dbPool);

  const masterTemplateService = new MasterTemplateService(masterTemplateRepo, auditRepo);
  const contentGenerationQueue = redisQueueClient
    ? new Queue(CONTENT_GENERATION_QUEUE_NAME, { connection: redisQueueClient })
    : undefined;
  const surveyAnalysisQueue = redisQueueClient
    ? new Queue<SurveyAnalysisJobData>(SURVEY_ANALYSIS_QUEUE_NAME, { connection: redisQueueClient })
    : ({
        add: async () => {
          throw new Error('survey_analysis_queue_unavailable_in_development');
        },
      } as unknown as Queue<SurveyAnalysisJobData>);
  const approvedExampleService = new ApprovedExampleService(
    approvedExampleRepo,
    contentGenerationJobRepo,
    contentGenerationSlideRepo,
    auditRepo,
  );
  const googleMapsScrapeQueue = redisQueueClient
    ? new Queue<GoogleMapsScrapeJobData>(GOOGLE_MAPS_SCRAPE_QUEUE_NAME, { connection: redisQueueClient })
    : ({
        add: async () => {
          throw new Error('google_maps_scrape_queue_unavailable_in_development');
        },
      } as unknown as Queue<GoogleMapsScrapeJobData>);
  const googleMapsScrapeInProcessRunner = async (data: GoogleMapsScrapeJobData) =>
    processGoogleMapsScrapeJob(
      {
        redisUrl: env.REDIS_URL,
        runInTx: async (fn) => withTransaction(dbPool, fn),
        loadModel: async (teamId) => scoringModelRepo.getForTeam(teamId),
        pipeline: {
          dedup: (tx) =>
            new DeduplicationService({
              leads: new LeadRepository(tx),
              finder: new SqlCanonicalLeadFinder(tx),
            }),
          scorer: (tx) =>
            new LeadScoringPersister({
              leads: new LeadRepository(tx),
              contributions: new ScoreContributionRepository(),
              failures: new ScoringFailureRepository(),
              outbox: new OutboxRepository(),
            }),
          project: (_leadId, normalized) => {
            const lead: ScorableLead = {
              teamId: normalized.teamId,
              matchedKeywords: normalized.matchedKeywords,
              sources: normalized.sources,
              discoveredAt: normalized.discoveredAt,
              referenceTime: new Date(),
              aiIntentScore: null,
            };
            if (normalized.location !== null && normalized.location !== undefined) {
              lead.location = normalized.location;
            }
            if (normalized.publicContact !== null && normalized.publicContact !== undefined) {
              lead.publicContact = normalized.publicContact;
            }
            return lead;
          },
        },
      },
      data,
    );

  const aiCallWrapper = new AiCallWrapper(
    { settings: teamAiSettings, budget: aiBudget, callLog: aiCallLogRepo, audit: auditRepo },
    dbPool,
  );
  const sduiPlanner = new DefaultSduiPlanner({
    wrapper: aiCallWrapper,
    settings: teamAiSettings,
    exampleRetriever: new DefaultExampleRetriever(approvedExampleRepo),
  });
  const bgClient = new DefaultBackgroundImageClient({
    wrapper: aiCallWrapper,
    settings: teamAiSettings,
    urlGuard: new UrlSafetyGuardImpl(),
  });
  const satoriRenderer = new SatoriRenderer();
  const processContentFallback = async (payload: {
    jobId: string;
    teamId: string;
    actorId: string;
  }) => {
    await processSduiCarouselJob(
      {
        planner: sduiPlanner,
        renderer: satoriRenderer,
        imageClient: bgClient,
        storage: objectStorage,
        jobRepo: contentGenerationJobRepo,
        slideRepo: contentGenerationSlideRepo,
        masterTemplateRepo,
        redisUrl: env.REDIS_URL,
      },
      payload,
    );
  };
  const contentGeneratorDeps: ConstructorParameters<typeof ContentGeneratorService>[0] = {
    jobRepo: contentGenerationJobRepo,
    slideRepo: contentGenerationSlideRepo,
    masterTemplateRepo,
    aiSettings: teamAiSettings,
    fallbackProcessor: processContentFallback,
    allowQueueFallback: env.NODE_ENV === 'development',
  };
  if (contentGenerationQueue) {
    contentGeneratorDeps.queue = contentGenerationQueue;
  }
  const contentGeneratorService = new ContentGeneratorService(contentGeneratorDeps);
  const visualRefRepo = new VisualReferenceRepository(dbPool);
  const visualDnaExtractor = new VisualDnaExtractor({
    wrapper: aiCallWrapper,
    settings: teamAiSettings,
  });

  const surveyRepo = new SurveyRepository(dbPool);
  const surveyQuestionRepo = new SurveyQuestionRepository(dbPool);
  const surveyResponseRepo = new SurveyResponseRepository(dbPool);
  const surveyAnalysisRepo = new SurveyAnalysisRepository(dbPool);
  const surveyLogicService = new SurveyLogicService();
  const surveyAnalyticsService = new SurveyAnalyticsService(
    surveyRepo,
    surveyQuestionRepo,
    surveyResponseRepo,
  );
  const surveyAnalysisService = new SurveyAnalysisService({
    surveys: surveyRepo,
    questions: surveyQuestionRepo,
    responses: surveyResponseRepo,
    analyses: surveyAnalysisRepo,
    analytics: surveyAnalyticsService,
    settings: teamAiSettings,
    audit: auditRepo,
    queue: surveyAnalysisQueue,
    generateResult: async (context) => {
      const questionKey =
        context.analysis.scope === 'question'
          ? context.questions.find((question) => question.id === context.analysis.questionId)
              ?.questionKey
          : undefined;
      return generateSurveyAnalysisWithProvider(teamAiSettings, {
        teamId: context.survey!.teamId,
        survey: {
          title: context.survey!.title,
          projectGoal: context.survey!.projectGoal,
          ...(context.survey!.description ? { description: context.survey!.description } : {}),
          ...(context.survey!.backgroundContext
            ? { backgroundContext: context.survey!.backgroundContext }
            : {}),
          ...(context.survey!.targetParticipant
            ? { targetParticipant: context.survey!.targetParticipant }
            : {}),
          ...(context.survey!.primaryDecision
            ? { primaryDecision: context.survey!.primaryDecision }
            : {}),
        },
        questions: context.questions.map((question) => ({
          id: question.id,
          key: question.questionKey,
          type: question.type,
          title: question.title,
          required: question.required,
          config: question.config,
        })),
        analytics: context.analytics,
        openEndedSamples: sampleOpenEndedAnswers(context.responses, questionKey),
        analysis: context.analysis,
      });
    },
    modelName: async (teamId) => (await teamAiSettings.getSettings(teamId)).textModel,
  });
  const surveyExportService = new SurveyExportService({
    surveys: surveyRepo,
    questions: surveyQuestionRepo,
    responses: surveyResponseRepo,
    audit: auditRepo,
  });
  const surveyService = new SurveyService(
    surveyRepo,
    surveyQuestionRepo,
    surveyLogicService,
    auditRepo,
  );
  const surveyPublicService = new SurveyPublicService(dbPool, surveyLogicService);

  // Initialize Fastify with route dependencies
  const server = buildServer(
    {
      authGuard: {
        sessions: sessionStore,
        effectiveRoleResolver: new DbEffectiveRoleResolver(membershipsRepo),
      },
      authRoutes: {
        authService,
        memberships: membershipsRepo,
        users: usersRepo,
      },
      teamRoutes: {
        teamService,
        users: usersRepo,
        memberships: membershipsRepo,
      },
      connectorRoutes: {
        registry: connectorRegistry,
        activation: connectorActivation,
        googleMapsScrapeQueue,
        googleMapsScrapeInProcessRunner,
        pool: dbPool,
        loadModel: async (teamId) => scoringModelRepo.getForTeam(teamId),
      },
      scanRoutes: {
        scanConfigService,
        configs: scanConfigRepo,
        executeScan: executeScanFn,
      },
      leadRoutes: {
        manager: leadManager,
        query: leadQueryService,
      },
      metricsRoutes: {
        metricsService,
      },
      privacyRoutes: {
        exportService,
        dsarService,
      },
      aiRoutes: {
        settings: teamAiSettings,
        reanalyze: aiReanalyze,
        callLog: aiCallLogRepo,
      },
      contentRoutes: {
        pool: dbPool,
        settings: teamAiSettings,
        budget: aiBudget,
        audit: auditRepo,
        masterTemplateService,
        contentGeneratorService,
        approvedExampleService,
        sduiPlanner,
        renderer: satoriRenderer,
        visualRefRepo,
        visualDnaExtractor,
        visualRefStorage: objectStorage,
      },
      surveyRoutes: {
        service: surveyService,
        analytics: surveyAnalyticsService,
        analysis: surveyAnalysisService,
        exportService: surveyExportService,
        responses: surveyResponseRepo,
      },
      surveyPublicRoutes: {
        service: surveyPublicService,
      },
    },
    {
      logger: true,
    },
  );

  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`🚀 API Server is running on port ${env.PORT}`);
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

start();
