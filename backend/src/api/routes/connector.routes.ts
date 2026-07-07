import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import z from 'zod';
import type { Queue } from 'bullmq';
import type { RawProspect, ScoringModel, ScanSummary } from '@leads-generator/shared';
import type { ConnectorActivationService } from '../../connector/activation.js';
import type { Connector_Registry } from '../../connector/registry.js';
import { normalizeRawProspect } from '../../connector/normalize.js';
import type { Source_Connector, ScanQuery } from '../../connector/source-connector.js';
import type { Tx } from '../../db/transaction.js';
import { withTransaction } from '../../db/transaction.js';
import { DeduplicationService } from '../../dedup/dedup-service.js';
import { SqlCanonicalLeadFinder } from '../../dedup/canonical-finder.js';
import { LeadRepository } from '../../repository/lead-repository.js';
import { query } from '../../repository/types.js';
import { ScoreContributionRepository } from '../../scoring/score-contribution-repository.js';
import { ScoringFailureRepository } from '../../scoring/scoring-failure-repository.js';
import { OutboxRepository } from '../../scoring/outbox-repository.js';
import { LeadScoringPersister } from '../../scoring/score-and-persist.js';
import type { ScorableLead } from '../../scoring/scorable-lead.js';
import { runScanPipeline } from '../../scan/scan-pipeline.js';
import type { AppError } from '@leads-generator/shared';
import {
  enqueueGoogleMapsScrape,
  type GoogleMapsScrapeInProcessRunner,
  type GoogleMapsScrapeJobData,
} from '../../scraping/google-maps-scrape-worker.js';

export interface ConnectorRoutesDeps {
  registry: Connector_Registry;
  activation: ConnectorActivationService;
  googleMapsScrapeQueue: Queue<GoogleMapsScrapeJobData>;
  /**
   * Optional in-process runner used as a fallback when BullMQ is unavailable
   * (e.g. development mode without Redis). If the BullMQ `add` call fails
   * and this is provided, it will be invoked as fire-and-forget.
   */
  googleMapsScrapeInProcessRunner?: GoogleMapsScrapeInProcessRunner;
  pool: import('pg').Pool;
  loadModel: (teamId: string) => Promise<ScoringModel | null>;
}

const ActivateSchema = z.object({
  apiKey: z.string().min(1),
});

const ScrapeSchema = z.object({
  keyword: z.string().trim().min(1).max(100),
  location: z.string().trim().max(200).optional(),
});

const ScrapeImportItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(50).optional(),
  website: z.string().trim().max(500).optional(),
});

const ScrapeImportSchema = ScrapeSchema.extend({
  items: z.array(ScrapeImportItemSchema).min(1).max(200),
});

const ScrapeSessionResultsSchema = z.object({
  items: z.array(ScrapeImportItemSchema).min(1).max(200),
});

export type GoogleMapsScrapeSessionStatus =
  | 'waiting_browser'
  | 'collecting_results'
  | 'importing'
  | 'done'
  | 'failed';

interface GoogleMapsScrapeSession {
  id: string;
  teamId: string;
  keyword: string;
  location?: string;
  status: GoogleMapsScrapeSessionStatus;
  googleMapsUrl: string;
  summary?: ScanSummary;
  error?: string;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string;
  completedAt?: string;
}

interface GoogleMapsScrapeSessionRow {
  id: string;
  team_id: string;
  keyword: string;
  location: string | null;
  status: GoogleMapsScrapeSessionStatus;
  google_maps_url: string;
  capture_token_hash: string;
  summary: ScanSummary | string | null;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  received_at: Date | string | null;
  completed_at: Date | string | null;
}

export const connectorRoutes =
  (deps: ConnectorRoutesDeps): FastifyPluginAsync =>
  async (fastify) => {
    fastify.get(
      '/',
      {
        preHandler: [fastify.requireAuth, fastify.requireTeamId],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const connectors = await deps.registry.listForTeam(params.id);
        const credentialPresence = await deps.activation.listCredentialPresence(params.id);
        const connectedBySource = new Map(
          credentialPresence.map((item) => [item.sourceId, item.connected]),
        );
        return reply.status(200).send(
          connectors.map((connector) => ({
            ...connector,
            connected:
              (connectedBySource.get(connector.sourceId) ?? false) ||
              hasServerManagedCredential(connector.sourceId),
          })),
        );
      },
    );

    fastify.post(
      '/:sourceId/activate',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('connector.manage'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string; sourceId: string };
        const parseResult = ActivateSchema.safeParse(request.body);

        if (!parseResult.success) {
          throw {
            code: 'VALIDATION',
            messages: parseResult.error.errors.map((e) => e.message),
          } as AppError;
        }

        const input = parseResult.data;
        const result = await deps.activation.activate(params.id, params.sourceId, input.apiKey);

        if (!result.ok) throw result.error;

        return reply.status(200).send(result.value);
      },
    );

    fastify.delete(
      '/:sourceId',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('connector.manage'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string; sourceId: string };
        await deps.activation.remove(params.id, params.sourceId);
        return reply.status(204).send();
      },
    );

    fastify.post(
      '/scrape',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('scan.execute'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const parseResult = ScrapeSchema.safeParse(request.body);

        if (!parseResult.success) {
          throw {
            code: 'VALIDATION',
            messages: parseResult.error.errors.map((e) => e.message),
          } as AppError;
        }

        const input = parseResult.data;
        await enqueueGoogleMapsScrape(
          deps.googleMapsScrapeQueue,
          {
            teamId: params.id,
            keyword: input.keyword,
            ...(input.location ? { location: input.location } : {}),
            ...(request.session?.userId ? { actorId: request.session.userId } : {}),
          },
          deps.googleMapsScrapeInProcessRunner
            ? { inProcessRunner: deps.googleMapsScrapeInProcessRunner }
            : {},
        );

        return reply.status(202).send({ status: 'queued' });
      },
    );

    fastify.post(
      '/scrape/import',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('scan.execute'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const parseResult = ScrapeImportSchema.safeParse(request.body);

        if (!parseResult.success) {
          throw {
            code: 'VALIDATION',
            messages: parseResult.error.errors.map((e) => e.message),
          } as AppError;
        }

        const input = parseResult.data;
        const summary = await importGoogleMapsItems(
          deps,
          params.id,
          input.keyword,
          input.location,
          input.items,
        );
        return reply.status(200).send(summary);
      },
    );

    fastify.post(
      '/scrape/session',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('scan.execute'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string };
        const parseResult = ScrapeSchema.safeParse(request.body);

        if (!parseResult.success) {
          throw {
            code: 'VALIDATION',
            messages: parseResult.error.errors.map((e) => e.message),
          } as AppError;
        }

        const input = parseResult.data;
        const created = await createScrapeSession(deps.pool, {
          teamId: params.id,
          keyword: input.keyword,
          ...(input.location ? { location: input.location } : {}),
          googleMapsUrl: buildGoogleMapsUrl(input.keyword, input.location),
        });
        const { session, captureToken } = created;

        return reply.status(201).send({
          sessionId: session.id,
          status: session.status,
          googleMapsUrl: session.googleMapsUrl,
          captureToken,
          captureUrl: `/dashboard/connectors/capture?sessionId=${encodeURIComponent(session.id)}`,
        });
      },
    );

    fastify.get(
      '/scrape/session/:sessionId',
      {
        preHandler: [
          fastify.requireAuth,
          fastify.requireTeamId,
          fastify.requireRole('scan.execute'),
        ],
      },
      async (request, reply) => {
        const params = request.params as { id: string; sessionId: string };
        const found = await findScrapeSession(deps.pool, params.id, params.sessionId);
        if (!found) {
          return reply.status(404).send({ code: 'NOT_FOUND', message: 'Scrape session not found' });
        }

        return reply.status(200).send(found.session);
      },
    );

    fastify.post('/scrape/session/:sessionId/collecting', async (request, reply) => {
      const params = request.params as { id: string; sessionId: string };
      const auth = await authenticateScrapeSessionRequest(
        fastify,
        deps.pool,
        request,
        reply,
        params.id,
        params.sessionId,
      );
      if (!auth.ok) {
        return reply.status(auth.statusCode).send(auth.body);
      }

      const currentSession = auth.session;
      const nextSession =
        currentSession.status === 'waiting_browser'
          ? await updateScrapeSession(deps.pool, params.id, params.sessionId, {
              status: 'collecting_results',
            })
          : currentSession;

      return reply.status(200).send({ status: nextSession.status });
    });

    fastify.post('/scrape/session/:sessionId/results', async (request, reply) => {
      const params = request.params as { id: string; sessionId: string };
      const parseResult = ScrapeSessionResultsSchema.safeParse(request.body);

      if (!parseResult.success) {
        throw {
          code: 'VALIDATION',
          messages: parseResult.error.errors.map((e) => e.message),
        } as AppError;
      }

      const auth = await authenticateScrapeSessionRequest(
        fastify,
        deps.pool,
        request,
        reply,
        params.id,
        params.sessionId,
      );
      if (!auth.ok) {
        return reply.status(auth.statusCode).send(auth.body);
      }

      const session = auth.session;
      if (session.status === 'importing') {
        return reply.status(409).send({
          code: 'CONFLICT',
          message: 'Scrape session is already importing results',
        });
      }
      if (session.status === 'done') {
        return reply.status(409).send({
          code: 'CONFLICT',
          message: 'Scrape session has already finished importing results',
        });
      }

      try {
        await updateScrapeSession(deps.pool, params.id, params.sessionId, {
          status: 'importing',
          receivedAt: new Date(),
          error: null,
        });
        const summary = await importGoogleMapsItems(
          deps,
          params.id,
          session.keyword,
          session.location,
          parseResult.data.items,
        );
        const updated = await updateScrapeSession(deps.pool, params.id, params.sessionId, {
          status: 'done',
          summary,
          completedAt: new Date(),
          error: null,
        });
        return reply.status(200).send(updated);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'capture_import_failed';
        const failed = await updateScrapeSession(deps.pool, params.id, params.sessionId, {
          status: 'failed',
          completedAt: new Date(),
          error: message,
        });
        return reply.status(500).send(failed);
      }
    });
  };

async function importGoogleMapsItems(
  deps: ConnectorRoutesDeps,
  teamId: string,
  keyword: string,
  location: string | undefined,
  items: ScrapeImportItem[],
): Promise<ScanSummary> {
  const connector = new ImportedGoogleMapsConnector(items);
  const model = (await deps.loadModel(teamId)) ?? emptyScoringModel(teamId);

  return withTransaction(deps.pool, async (tx) =>
    runScanPipeline(tx, buildPipelineDeps(), {
      teamId,
      query: {
        keywords: [keyword],
        ...(location ? { location } : {}),
      },
      availableConnectors: [connector],
      excluded: [],
      model,
      aiEnabled: false,
    }),
  );
}

class ImportedGoogleMapsConnector implements Source_Connector {
  public readonly sourceId = 'google-maps-import';
  public readonly displayName = 'Google Maps (Import)';

  constructor(private readonly items: ScrapeImportItem[]) {}

  public async checkAvailability() {
    return 'available' as const;
  }

  public async fetch(query: ScanQuery): Promise<RawProspect[]> {
    return this.items.map((item) => mapImportedItemToRawProspect(item, query));
  }

  public normalize(raw: RawProspect, teamId: string) {
    return normalizeRawProspect(raw, {
      teamId,
      sourceId: this.sourceId,
    });
  }
}

function buildPipelineDeps() {
  return {
    dedup: (tx: Tx) =>
      new DeduplicationService({
        leads: new LeadRepository(tx),
        finder: new SqlCanonicalLeadFinder(tx),
      }),
    scorer: (tx: Tx) =>
      new LeadScoringPersister({
        leads: new LeadRepository(tx),
        contributions: new ScoreContributionRepository(),
        failures: new ScoringFailureRepository(),
        outbox: new OutboxRepository(),
      }),
    project: (
      _leadId: string,
      normalized: import('@leads-generator/shared').NormalizedLead,
    ): ScorableLead => {
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
  };
}

type ScrapeImportItem = z.infer<typeof ScrapeImportItemSchema>;

function mapImportedItemToRawProspect(item: ScrapeImportItem, query: ScanQuery): RawProspect {
  const website = normalizeWebsite(item.website);
  const phone = cleanText(item.phone);
  const address = cleanText(item.address);

  const prospect: RawProspect = {
    name: item.name.trim(),
    matchedKeyword: query.keywords[0] ?? 'google-maps-import',
    acquiredAt: new Date(),
    whatsappVerificationStatus: 'unchecked',
  };

  if (address) {
    prospect.location = address;
  }
  if (phone) {
    prospect.publicContact = phone;
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 6) {
      prospect.whatsappNumber = digits;
      prospect.whatsappUrl = `https://wa.me/${digits}`;
    }
  }
  if (website) {
    prospect.profileUrl = website;
  }

  return prospect;
}

interface CreateScrapeSessionInput {
  teamId: string;
  keyword: string;
  location?: string;
  googleMapsUrl: string;
}

interface ScrapeSessionWithToken {
  session: GoogleMapsScrapeSession;
  captureTokenHash: string;
}

interface ScrapeSessionRequestAuthSuccess {
  ok: true;
  session: GoogleMapsScrapeSession;
}

interface ScrapeSessionRequestAuthFailure {
  ok: false;
  statusCode: number;
  body: { code: string; message: string };
}

type ScrapeSessionRequestAuthResult =
  | ScrapeSessionRequestAuthSuccess
  | ScrapeSessionRequestAuthFailure;

async function createScrapeSession(
  pool: import('pg').Pool,
  input: CreateScrapeSessionInput,
): Promise<{ session: GoogleMapsScrapeSession; captureToken: string }> {
  const sessionId = randomUUID();
  const captureToken = randomBytes(32).toString('base64url');
  const captureTokenHash = hashCaptureToken(captureToken);
  const rows = await query<GoogleMapsScrapeSessionRow>(
    pool,
    `INSERT INTO google_maps_scrape_session (
       id,
       team_id,
       keyword,
       location,
       status,
       google_maps_url,
       capture_token_hash,
       summary,
       error_message,
       created_at,
       updated_at,
       received_at,
       completed_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8::jsonb, NULL, now(), now(), NULL, NULL
     )
     RETURNING id, team_id, keyword, location, status, google_maps_url, capture_token_hash, summary, error_message, created_at, updated_at, received_at, completed_at`,
    [
      sessionId,
      input.teamId,
      input.keyword,
      input.location ?? null,
      'waiting_browser',
      input.googleMapsUrl,
      captureTokenHash,
      JSON.stringify(emptySummary()),
    ],
  );
  return {
    session: mapScrapeSessionRow(rows[0]!),
    captureToken,
  };
}

async function findScrapeSession(
  pool: import('pg').Pool,
  teamId: string,
  sessionId: string,
): Promise<ScrapeSessionWithToken | null> {
  const rows = await query<GoogleMapsScrapeSessionRow>(
    pool,
    `SELECT id, team_id, keyword, location, status, google_maps_url, capture_token_hash, summary, error_message, created_at, updated_at, received_at, completed_at
       FROM google_maps_scrape_session
      WHERE team_id = $1 AND id = $2`,
    [teamId, sessionId],
  );
  if (rows.length === 0) return null;
  const row = rows[0]!;
  return {
    session: mapScrapeSessionRow(row),
    captureTokenHash: row.capture_token_hash,
  };
}

interface UpdateScrapeSessionInput {
  status?: GoogleMapsScrapeSessionStatus;
  summary?: ScanSummary;
  error?: string | null;
  receivedAt?: Date;
  completedAt?: Date;
}

async function updateScrapeSession(
  pool: import('pg').Pool,
  teamId: string,
  sessionId: string,
  input: UpdateScrapeSessionInput,
): Promise<GoogleMapsScrapeSession> {
  const rows = await query<GoogleMapsScrapeSessionRow>(
    pool,
    `UPDATE google_maps_scrape_session
        SET status = COALESCE($3, status),
            summary = COALESCE($4::jsonb, summary),
            error_message = CASE WHEN $5::boolean THEN $6 ELSE error_message END,
            received_at = COALESCE($7, received_at),
            completed_at = COALESCE($8, completed_at),
            updated_at = now()
      WHERE team_id = $1 AND id = $2
      RETURNING id, team_id, keyword, location, status, google_maps_url, capture_token_hash, summary, error_message, created_at, updated_at, received_at, completed_at`,
    [
      teamId,
      sessionId,
      input.status ?? null,
      input.summary ? JSON.stringify(input.summary) : null,
      input.error !== undefined,
      input.error ?? null,
      input.receivedAt ?? null,
      input.completedAt ?? null,
    ],
  );
  return mapScrapeSessionRow(rows[0]!);
}

function mapScrapeSessionRow(row: GoogleMapsScrapeSessionRow): GoogleMapsScrapeSession {
  const summary = parseSummary(row.summary);
  return {
    id: row.id,
    teamId: row.team_id,
    keyword: row.keyword,
    ...(row.location ? { location: row.location } : {}),
    status: row.status,
    googleMapsUrl: row.google_maps_url,
    ...(summary ? { summary } : {}),
    ...(row.error_message ? { error: row.error_message } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    ...(row.received_at ? { receivedAt: new Date(row.received_at).toISOString() } : {}),
    ...(row.completed_at ? { completedAt: new Date(row.completed_at).toISOString() } : {}),
  };
}

function hashCaptureToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function extractCaptureToken(request: import('fastify').FastifyRequest): string | undefined {
  const headerValue = request.headers['x-google-maps-capture-token'];
  if (typeof headerValue === 'string' && headerValue.trim().length > 0) {
    return headerValue.trim();
  }
  const queryValue = request.query as { captureToken?: string };
  if (typeof queryValue.captureToken === 'string' && queryValue.captureToken.trim().length > 0) {
    return queryValue.captureToken.trim();
  }
  return undefined;
}

function matchesCaptureToken(token: string, tokenHash: string): boolean {
  const actual = Buffer.from(hashCaptureToken(token), 'utf8');
  const expected = Buffer.from(tokenHash, 'utf8');
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

async function authenticateScrapeSessionRequest(
  fastify: import('fastify').FastifyInstance,
  pool: import('pg').Pool,
  request: FastifyRequest,
  reply: FastifyReply,
  teamId: string,
  sessionId: string,
): Promise<ScrapeSessionRequestAuthResult> {
  const captureToken = extractCaptureToken(request);
  const found = await findScrapeSession(pool, teamId, sessionId);
  if (!found) {
    return {
      ok: false,
      statusCode: 404,
      body: { code: 'NOT_FOUND', message: 'Scrape session not found' },
    };
  }

  if (captureToken && matchesCaptureToken(captureToken, found.captureTokenHash)) {
    return { ok: true, session: found.session };
  }

  try {
    await fastify.requireAuth(request, reply);
    await fastify.requireTeamId(request, reply);
    await fastify.requireRole('scan.execute')(request, reply);
    return { ok: true, session: found.session };
  } catch {
    return {
      ok: false,
      statusCode: 401,
      body: { code: 'AUTH', message: 'Unauthorized scrape session request' },
    };
  }
}

function parseSummary(value: ScanSummary | string | null): ScanSummary | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return JSON.parse(value) as ScanSummary;
  return value;
}

function emptySummary(): ScanSummary {
  return {
    newLeads: 0,
    duplicateLeads: 0,
    excludedSources: [],
    connectorResults: [],
  };
}

function buildGoogleMapsUrl(keyword: string, location?: string): string {
  const queryText = [keyword.trim(), location?.trim()].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/${encodeURIComponent(queryText)}`;
}

function cleanText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeWebsite(value: string | undefined): string | undefined {
  const trimmed = cleanText(value);
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function emptyScoringModel(teamId: string): ScoringModel {
  return { teamId, version: 0, factors: [] };
}

function hasServerManagedCredential(sourceId: string): boolean {
  if (sourceId !== 'google') return false;
  return Boolean(process.env.APIFY_TOKEN || process.env.RAPIDAPI_KEY);
}
