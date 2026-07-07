import { Worker, type Job, type Queue } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import type { NormalizedLead, ScoringModel } from '@leads-generator/shared';
import type { ScorableLead } from '../scoring/scorable-lead.js';
import { GoogleMapsHeadlessConnector } from '../connector/google-maps-headless.js';
import { runScanPipeline } from '../scan/scan-pipeline.js';
import type { ScanPipelineDeps } from '../scan/scan-pipeline.js';
import type { Tx } from '../db/transaction.js';

export const GOOGLE_MAPS_SCRAPE_QUEUE_NAME = 'google-maps-scrape';

export interface GoogleMapsScrapeJobData {
  teamId: string;
  keyword: string;
  location?: string;
  actorId?: string;
}

export interface GoogleMapsScrapeWorkerDeps {
  redisUrl: string;
  runInTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  loadModel: (teamId: string) => Promise<ScoringModel | null>;
  pipeline: ScanPipelineDeps;
}

export type GoogleMapsScrapeInProcessRunner = (data: GoogleMapsScrapeJobData) => Promise<unknown>;

export async function processGoogleMapsScrapeJob(
  deps: GoogleMapsScrapeWorkerDeps,
  data: GoogleMapsScrapeJobData,
) {
  console.info('[google-maps-scrape] job started', {
    teamId: data.teamId,
    keyword: data.keyword,
    ...(data.location ? { location: data.location } : {}),
    ...(data.actorId ? { actorId: data.actorId } : {}),
  });

  try {
    const connector = new GoogleMapsHeadlessConnector();
    const model = (await deps.loadModel(data.teamId)) ?? emptyScoringModel(data.teamId);

    const summary = await deps.runInTx((tx) =>
      runScanPipeline(tx, deps.pipeline, {
        teamId: data.teamId,
        query: {
          keywords: [data.keyword],
          ...(data.location ? { location: data.location } : {}),
        },
        availableConnectors: [connector],
        excluded: [],
        model,
        aiEnabled: false,
      }),
    );

    console.info('[google-maps-scrape] job completed', {
      teamId: data.teamId,
      keyword: data.keyword,
      ...(data.location ? { location: data.location } : {}),
      summary,
    });

    return summary;
  } catch (error) {
    console.error('[google-maps-scrape] job failed', {
      teamId: data.teamId,
      keyword: data.keyword,
      ...(data.location ? { location: data.location } : {}),
      error,
    });
    throw error;
  }
}

export interface GoogleMapsScrapeEnqueueOptions {
  /**
   * In-process runner used when BullMQ is unavailable (e.g. development mode
   * without a running Redis). The runner is invoked synchronously and the
   * promise it returns is awaited before `enqueueGoogleMapsScrape` resolves.
   *
   * When omitted, the job is queued normally and errors surface immediately
   * if the queue is not configured.
   */
  inProcessRunner?: GoogleMapsScrapeInProcessRunner;
}

export async function enqueueGoogleMapsScrape(
  queue: Queue<GoogleMapsScrapeJobData>,
  data: GoogleMapsScrapeJobData,
  options: GoogleMapsScrapeEnqueueOptions = {},
): Promise<void> {
  try {
    await queue.add('scrape', data, {
      jobId: `${data.teamId}:${data.keyword}:${data.location ?? ''}:${Date.now()}`,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    });
  } catch (error) {
    if (options.inProcessRunner) {
      console.warn(
        `[google-maps-scrape] BullMQ enqueue failed (${(error as Error).message ?? 'unknown'}). ` +
          `Falling back to in-process runner.`,
      );
      // Fire-and-forget: scrape is intentionally long-running, so do not
      // block the API response. Errors are logged for visibility.
      void options.inProcessRunner(data).catch((runnerError) => {
        console.error('[google-maps-scrape] in-process runner failed:', runnerError);
      });
      return;
    }
    throw error;
  }
}

export function createGoogleMapsScrapeWorker(deps: GoogleMapsScrapeWorkerDeps): Worker<GoogleMapsScrapeJobData> {
  const connection = new URL(deps.redisUrl);

  const connectionOptions: RedisOptions = {
    host: connection.hostname,
    port: Number(connection.port || 6379),
    maxRetriesPerRequest: null,
  };
  if (connection.username) connectionOptions.username = connection.username;
  if (connection.password) connectionOptions.password = connection.password;
  if (connection.protocol === 'rediss:') connectionOptions.tls = {};

  return new Worker<GoogleMapsScrapeJobData>(
    GOOGLE_MAPS_SCRAPE_QUEUE_NAME,
    async (job: Job<GoogleMapsScrapeJobData>) => processGoogleMapsScrapeJob(deps, job.data),
    {
      connection: connectionOptions,
      concurrency: 1,
    },
  );
}

function emptyScoringModel(teamId: string): ScoringModel {
  return { teamId, version: 0, factors: [] };
}

export function projectScorableLead(leadId: string, normalized: NormalizedLead): ScorableLead {
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
