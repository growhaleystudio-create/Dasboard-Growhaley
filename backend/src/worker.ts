import { loadEnv, getPool, createRedisClient } from './index.js';
import { Worker, Queue } from 'bullmq';
import { createCredentialVault } from './auth/credential-vault.js';
import { TeamAiSettingsService } from './auth/team-ai-settings-service.js';
import { TeamAiSettingsRepository } from './repository/team-ai-settings-repository.js';
import { AiCallLogRepository } from './repository/ai-call-log-repository.js';
import { ScoringModelRepository } from './repository/scoring-model-repository.js';
import { LeadRepository } from './repository/lead-repository.js';
import { DbAuditLog } from './privacy/audit-log.js';
import { AiBudgetTracker } from './ai/ai-budget-tracker.js';
import { AiAnalyzerService } from './ai/ai-analyzer-service.js';
import { GeminiClient } from './ai/gemini-client.js';
import { createAiWorker, AI_ANALYSIS_QUEUE_NAME, type AiAnalysisJobData, enqueueAiAnalysis } from './ai/ai-worker.js';

import { Connector_Registry } from './connector/registry.js';
import { TeamConnectorRepository } from './repository/team-connector-repository.js';
import { ApifyGoogleMapsConnector } from './connector/apify-google-maps.js';
import { RapidApiGoogleConnector } from './connector/rapidapi-google.js';
import { ExampleGoogleSearchConnector } from './connector/example-google-search.js';
import { GoogleScraperConnector } from './connector/google-scraper.js';
import { SocialApiConnector } from './connector/social-api-connectors.js';

import { ScanJobRepository } from './repository/scan-job-repository.js';
import { OutboxRepository } from './scoring/outbox-repository.js';
import type { ScorableLead } from './scoring/scorable-lead.js';
import { ScanConfigurationRepository } from './repository/scan-configuration-repository.js';
import { DeduplicationService } from './dedup/dedup-service.js';
import { SqlCanonicalLeadFinder } from './dedup/canonical-finder.js';
import { LeadScoringPersister } from './scoring/score-and-persist.js';
import { ScoreContributionRepository } from './scoring/score-contribution-repository.js';
import { ScoringFailureRepository } from './scoring/scoring-failure-repository.js';
import { runScanJob } from './scan/scan-job-runner.js';
import { JobScheduler } from './scan/job-scheduler.js';

// Carousel content generation worker
import { BrandKitRepository } from './repository/brand-kit-repository.js';
import { MasterTemplateRepository } from './repository/master-template-repository.js';
import { ContentGenerationJobRepository } from './repository/content-generation-job-repository.js';
import { ContentGenerationSlideRepository } from './repository/content-generation-slide-repository.js';
import { AiCallWrapper } from './content/ai-call-wrapper.js';
import { DefaultSduiPlanner } from './content/sdui-planner.js';
import { SatoriRenderer } from './content/satori-renderer.js';
import { createSduiCarouselWorker } from './content/sdui-carousel-worker.js';
import { createObjectStorageFromEnv } from './storage/object-storage.js';
import { DefaultBackgroundImageClient } from './content/background-image-client.js';
import { UrlSafetyGuardImpl } from './content/url-safety-guard.js';

function startWorker() {
  const env = loadEnv();
  const dbPool = getPool();
  const redisClient = createRedisClient(env.REDIS_URL);

  console.log('Starting BullMQ workers...');

  // Set up registries & repositories for scans
  const connectorRepo = new TeamConnectorRepository(dbPool);
  const connectorRegistry = new Connector_Registry(connectorRepo);

  // Register default connectors (same as start.ts)
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

  const scanJobRepo = new ScanJobRepository(dbPool);
  const outboxRepo = new OutboxRepository();
  const scoringModelRepo = new ScoringModelRepository(dbPool);
  const scanConfigRepo = new ScanConfigurationRepository(dbPool);

  const aiQueue = new Queue<AiAnalysisJobData>(AI_ANALYSIS_QUEUE_NAME, { connection: redisClient });
  const enqueueAi = async (teamId: string, leadId: string, trigger: 'scan' | 'manual') => {
    await enqueueAiAnalysis(aiQueue, { teamId, leadId, trigger });
  };

  const scheduler = new JobScheduler({
    loadScheduled: () => scanConfigRepo.loadScheduled(),
    jobs: scanJobRepo,
    runScan: (input) => runScanJob({
      pool: dbPool,
      jobs: scanJobRepo,
      outbox: outboxRepo,
      enqueueAi,
      scan: {
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
      }
    }, input)
  });

  const scanWorker = new Worker(
    'scans',
    async (job) => {
      console.log(`Processing scan job ${job.id}`);
      const result = await scheduler.tick();
      console.log(`Sweep completed:`, result);
      return result;
    },
    { connection: redisClient },
  );

  const vault = createCredentialVault(env);
  const aiSettingsRepo = new TeamAiSettingsRepository(dbPool);
  const teamAiSettings = new TeamAiSettingsService(aiSettingsRepo, vault);
  const leadsRepo = new LeadRepository(dbPool);

  const aiAnalyzer = new AiAnalyzerService({
    pool: dbPool,
    settings: teamAiSettings,
    budget: new AiBudgetTracker({
      settings: aiSettingsRepo,
      callLog: new AiCallLogRepository(dbPool),
    }),
    providerFactory: (apiKey, apiBaseUrl, model) => new GeminiClient(apiKey, apiBaseUrl, model),
    leads: leadsRepo,
    audit: new DbAuditLog(dbPool),
    models: scoringModelRepo,
    projectScorable: async (leadId) => null,
  });

  const aiWorker = createAiWorker({
    analyzer: aiAnalyzer,
    redisUrl: env.REDIS_URL,
  });

  scanWorker.on('completed', (job) => {
    console.log(`Scan job ${job.id} completed successfully`);
  });

  scanWorker.on('failed', (job, err) => {
    console.log(`Scan job ${job?.id} failed with error: ${err.message}`);
  });

  aiWorker.on('completed', (job) => {
    console.log(`AI analysis job ${job.id} completed successfully`);
  });

  aiWorker.on('failed', (job, err) => {
    console.log(`AI analysis job ${job?.id} failed with error: ${err.message}`);
  });

  // ---------------------------------------------------------------------------
  // Carousel Content Generation Worker
  // ---------------------------------------------------------------------------
  const carouselObjectStorage = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createObjectStorageFromEnv({
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_BUCKET: env.SUPABASE_BUCKET,
      } as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; SUPABASE_BUCKET: string })
    : null;

  if (!carouselObjectStorage) {
    console.warn('⚠️  Carousel worker: SUPABASE credentials missing — carousel rendering disabled');
  } else {
    const aiBudget = new AiBudgetTracker({
      settings: aiSettingsRepo,
      callLog: new AiCallLogRepository(dbPool),
    });
    const aiCallWrapper = new AiCallWrapper(
      { settings: teamAiSettings, budget: aiBudget, callLog: new AiCallLogRepository(dbPool), audit: new DbAuditLog(dbPool) },
      dbPool,
    );
    const sduiPlanner = new DefaultSduiPlanner({ wrapper: aiCallWrapper, settings: teamAiSettings });
    const brandKitRepo = new BrandKitRepository(dbPool);
    const masterTemplateRepo = new MasterTemplateRepository(dbPool);
    const contentGenerationJobRepo = new ContentGenerationJobRepository(dbPool);
    const contentGenerationSlideRepo = new ContentGenerationSlideRepository(dbPool);
    const bgClient = new DefaultBackgroundImageClient({ wrapper: aiCallWrapper, settings: teamAiSettings, urlGuard: new UrlSafetyGuardImpl() });
    const satoriRenderer = new SatoriRenderer();

    const carouselWorker = createSduiCarouselWorker({
      planner: sduiPlanner,
      renderer: satoriRenderer,
      imageClient: bgClient,
      storage: carouselObjectStorage,
      jobRepo: contentGenerationJobRepo,
      slideRepo: contentGenerationSlideRepo,
      masterTemplateRepo,
      brandKitRepo,
      redisUrl: env.REDIS_URL,
    });

    carouselWorker.on('completed', (job) => {
      console.log(`Carousel job ${job.id} completed`);
    });
    carouselWorker.on('failed', (job, err) => {
      console.log(`Carousel job ${job?.id} failed: ${err.message}`);
    });

    console.log('✅ Carousel content generation worker started');
  }

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });

  async function shutdown() {
    console.log('Shutting down workers...');
    await Promise.all([scanWorker.close(), aiWorker.close(), aiQueue.close()]);
    await dbPool.end();
    redisClient.disconnect();
    process.exit(0);
  }
}

try {
  startWorker();
} catch (error: unknown) {
  console.error('Error starting worker:', error);
  process.exit(1);
}
