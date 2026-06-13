import { loadEnv, getPool } from '../index.js';
import { createCredentialVault } from '../auth/credential-vault.js';
import { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';
import { TeamAiSettingsRepository } from '../repository/team-ai-settings-repository.js';
import { AiCallLogRepository } from '../repository/ai-call-log-repository.js';
import { DbAuditLog } from '../privacy/audit-log.js';
import { AiBudgetTracker } from '../ai/ai-budget-tracker.js';
import { BrandKitRepository } from '../repository/brand-kit-repository.js';
import { MasterTemplateRepository } from '../repository/master-template-repository.js';
import { ContentGenerationJobRepository } from '../repository/content-generation-job-repository.js';
import { ContentGenerationSlideRepository } from '../repository/content-generation-slide-repository.js';
import { AiCallWrapper } from '../content/ai-call-wrapper.js';
import { DefaultSduiPlanner } from '../content/sdui-planner.js';
import { SatoriRenderer } from '../content/satori-renderer.js';
import { processSduiCarouselJob } from '../content/sdui-carousel-worker.js';
import { createObjectStorageFromEnv } from '../storage/object-storage.js';
import { DefaultBackgroundImageClient } from '../content/background-image-client.js';
import { UrlSafetyGuardImpl } from '../content/url-safety-guard.js';

async function main() {
  const [, , teamId, jobId] = process.argv;
  if (!teamId || !jobId) {
    throw new Error('Usage: node dist/dev/process-content-job.js <teamId> <jobId>');
  }

  const env = loadEnv();
  const dbPool = getPool();
  const vault = createCredentialVault(env);
  const aiSettingsRepo = new TeamAiSettingsRepository(dbPool);
  const teamAiSettings = new TeamAiSettingsService(aiSettingsRepo, vault);
  const aiBudget = new AiBudgetTracker({
    settings: aiSettingsRepo,
    callLog: new AiCallLogRepository(dbPool),
  });
  const aiCallWrapper = new AiCallWrapper(
    { settings: teamAiSettings, budget: aiBudget, callLog: new AiCallLogRepository(dbPool), audit: new DbAuditLog(dbPool) },
    dbPool,
  );

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to render/upload carousel slides.');
  }

  await processSduiCarouselJob({
    planner: new DefaultSduiPlanner({ wrapper: aiCallWrapper, settings: teamAiSettings }),
    renderer: new SatoriRenderer(),
    imageClient: new DefaultBackgroundImageClient({ wrapper: aiCallWrapper, settings: teamAiSettings, urlGuard: new UrlSafetyGuardImpl() }),
    storage: createObjectStorageFromEnv({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_BUCKET: env.SUPABASE_BUCKET,
    } as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; SUPABASE_BUCKET: string }),
    jobRepo: new ContentGenerationJobRepository(dbPool),
    slideRepo: new ContentGenerationSlideRepository(dbPool),
    masterTemplateRepo: new MasterTemplateRepository(dbPool),
    brandKitRepo: new BrandKitRepository(dbPool),
    redisUrl: env.REDIS_URL,
  }, { teamId, jobId, actorId: 'dev-manual' });

  await dbPool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
