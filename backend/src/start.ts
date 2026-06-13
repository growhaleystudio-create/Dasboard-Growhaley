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
import { DsarService } from './privacy/dsar-service.js';
import { TeamAiSettingsService } from './auth/team-ai-settings-service.js';
import { AiReanalyzeService } from './ai/ai-reanalyze-service.js';
import { AiAnalyzerService } from './ai/ai-analyzer-service.js';
import { GeminiClient } from './ai/gemini-client.js';
import { AiBudgetTracker } from './ai/ai-budget-tracker.js';
import { Queue } from 'bullmq';
import { AI_ANALYSIS_QUEUE_NAME, type AiAnalysisJobData } from './ai/ai-worker.js';

// Carousel / Content services
import { BrandKitRepository } from './repository/brand-kit-repository.js';
import { MasterTemplateRepository } from './repository/master-template-repository.js';
import { ContentGenerationJobRepository } from './repository/content-generation-job-repository.js';
import { ContentGenerationSlideRepository } from './repository/content-generation-slide-repository.js';
import { ApprovedExampleRepository } from './repository/approved-example-repository.js';
import { BrandKitService } from './content/brand-kit-service.js';
import { MasterTemplateService } from './content/master-template-service.js';
import { ContentGeneratorService } from './content/content-generator-service.js';
import { ApprovedExampleService } from './content/approved-example-service.js';
import { createObjectStorageFromEnv } from './storage/object-storage.js';
import { CONTENT_GENERATION_QUEUE_NAME } from './content/content-generator-service.js';
import { DefaultPlanner } from './content/planner.js';
import { DefaultSduiPlanner } from './content/sdui-planner.js';
import { VisualDnaExtractor } from './content/visual-dna-extractor.js';
import { VisualReferenceRepository } from './repository/visual-reference-repository.js';
import { AiCallWrapper } from './content/ai-call-wrapper.js';
import { DefaultBackgroundImageClient } from './content/background-image-client.js';
import { processSduiCarouselJob } from './content/sdui-carousel-worker.js';
import { SatoriRenderer } from './content/satori-renderer.js';
import { UrlSafetyGuardImpl } from './content/url-safety-guard.js';

// Scan engine collaborators
import { executeScan } from './scan/scan-engine.js';
import { DeduplicationService } from './dedup/dedup-service.js';
import { SqlCanonicalLeadFinder } from './dedup/canonical-finder.js';
import { LeadScoringPersister } from './scoring/score-and-persist.js';

async function start() {
  const env = loadEnv();
  
  // Database connection
  const dbPool = getPool();
  
  // Redis connections. In development, auth sessions stay in memory so a
  // flaky remote Redis URL does not randomly log the user out.
  const useRedisQueue = env.NODE_ENV !== 'development';
  const redisQueueClient = useRedisQueue ? createRedisClient(env.REDIS_URL) : null;
  const redisSessionClient = env.NODE_ENV === 'development' ? null : createRedisSessionClient(env.REDIS_URL);
  if (!redisQueueClient) {
    console.warn('⚠️  Development mode: Redis queues are disabled; content jobs use the in-process fallback runner.');
  }

  // Core Services & Repositories
  const vault = createCredentialVault(env);
  const usersRepo = new AppUserRepository(dbPool);
  const membershipsRepo = new MembershipRepository(dbPool);
  const sessionStore = redisSessionClient ? new RedisSessionStore(redisSessionClient) : new InMemorySessionStore();
  if (!redisSessionClient) {
    console.warn('⚠️  Development mode: using in-memory session store because Redis session storage is disabled.');
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
    }
  };
  const connectorActivation = new ConnectorActivationService({
    registry: connectorRegistry,
    vault: vaultService,
    repo: connectorRepo,
    validator: realValidator
  });
  
  const scanConfigService = new ScanConfigService(scanConfigRepo, connectorRegistry);
  
  const leadManager = new LeadManager({ pool: dbPool });
  const leadQueryService = new LeadQueryService(leadsRepo);
  const metricsService = new MetricsService(metricsRepo);
  const exportService = new ExportService({ leads: leadsRepo, audit: auditRepo });
  const dsarService = new DsarService({ leads: leadsRepo, audit: auditRepo });
  const teamAiSettings = new TeamAiSettingsService(aiSettingsRepo, vault);
  
  const aiBudget = new AiBudgetTracker({
    settings: aiSettingsRepo,
    callLog: aiCallLogRepo,
  });

  const aiAnalyzer = new AiAnalyzerService({
    pool: dbPool,
    settings: teamAiSettings,
    budget: aiBudget,
    providerFactory: (apiKey, apiBaseUrl, model) => new GeminiClient(apiKey, apiBaseUrl, model),
    leads: leadsRepo,
    audit: auditRepo,
    models: scoringModelRepo,
    projectScorable: async (leadId: string) => null
  });
  
  const aiQueue = redisQueueClient
    ? new Queue<AiAnalysisJobData>(AI_ANALYSIS_QUEUE_NAME, { connection: redisQueueClient })
    : {
        add: async () => {
          throw new Error('ai_queue_unavailable_in_development');
        },
      } as unknown as Queue<AiAnalysisJobData>;
  const aiReanalyze = new AiReanalyzeService({ leads: leadsRepo, settings: teamAiSettings, queue: aiQueue });

  // Real executeScan initialization
  const executeScanFn = async (input: any) => {
    return executeScan({
      pool: dbPool,
      registry: connectorRegistry,
      loadModel: async (teamId) => {
        return scoringModelRepo.getForTeam(teamId);
      },
      pipeline: {
        dedup: (tx) => new DeduplicationService({
          leads: new LeadRepository(tx),
          finder: new SqlCanonicalLeadFinder(tx)
        }),
        scorer: (tx) => new LeadScoringPersister({
          leads: new LeadRepository(tx),
          contributions: new ScoreContributionRepository(),
          failures: new ScoringFailureRepository(),
          outbox: new OutboxRepository()
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
        }
      }
    }, input);
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
        return { ok: false, error: { code: 'INTERNAL' as const, message: 'Object Storage belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY kosong)' } };
      },
      async resolveForTeam() {
        return { ok: false, error: { code: 'NOT_FOUND' as const, message: 'Resource not found' } };
      },
    };
  }
  const brandKitRepo = new BrandKitRepository(dbPool);
  const masterTemplateRepo = new MasterTemplateRepository(dbPool);
  const contentGenerationJobRepo = new ContentGenerationJobRepository(dbPool);
  const contentGenerationSlideRepo = new ContentGenerationSlideRepository(dbPool);
  const approvedExampleRepo = new ApprovedExampleRepository(dbPool);

  const brandKitService = new BrandKitService(dbPool, brandKitRepo, objectStorage, auditRepo);
  const masterTemplateService = new MasterTemplateService(masterTemplateRepo, brandKitRepo, auditRepo);
  const contentGenerationQueue = redisQueueClient
    ? new Queue(CONTENT_GENERATION_QUEUE_NAME, { connection: redisQueueClient })
    : undefined;
  const approvedExampleService = new ApprovedExampleService(
    approvedExampleRepo,
    contentGenerationJobRepo,
    contentGenerationSlideRepo,
    auditRepo,
  );

  // Planner for preview-planning endpoint
  const aiCallWrapper = new AiCallWrapper(
    { settings: teamAiSettings, budget: aiBudget, callLog: aiCallLogRepo, audit: auditRepo },
    dbPool,
  );
  const carouselPlanner = new DefaultPlanner({
    wrapper: aiCallWrapper,
    settings: teamAiSettings,
  });
  const sduiPlanner = new DefaultSduiPlanner({
    wrapper: aiCallWrapper,
    settings: teamAiSettings,
  });
  const bgClient = new DefaultBackgroundImageClient({ wrapper: aiCallWrapper, settings: teamAiSettings, urlGuard: new UrlSafetyGuardImpl() });
  const satoriRenderer = new SatoriRenderer();
  const processContentFallback = async (payload: { jobId: string; teamId: string; actorId: string }) => {
    await processSduiCarouselJob({
      planner: sduiPlanner,
      renderer: satoriRenderer,
      imageClient: bgClient,
      storage: objectStorage,
      jobRepo: contentGenerationJobRepo,
      slideRepo: contentGenerationSlideRepo,
      masterTemplateRepo,
      brandKitRepo,
      redisUrl: env.REDIS_URL,
    }, payload);
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

  // Initialize Fastify with route dependencies
  const server = buildServer({
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
      brandKitService,
      masterTemplateService,
      contentGeneratorService,
      approvedExampleService,
      planner: carouselPlanner,
      sduiPlanner,
      visualRefRepo,
      visualDnaExtractor,
      visualRefStorage: objectStorage,
    },
  }, {
    logger: true
  });

  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`🚀 API Server is running on port ${env.PORT}`);
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

start();
