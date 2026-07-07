import { describe, expect, it, vi } from 'vitest';
import type { NormalizedLead, RawProspect, ScoringModel, WhatsAppVerificationStatus } from '@leads-generator/shared';
import type { PoolClient } from 'pg';
import { GoogleMapsHeadlessConnector } from '../connector/google-maps-headless.js';
import { enqueueGoogleMapsScrape, processGoogleMapsScrapeJob, projectScorableLead } from './google-maps-scrape-worker.js';

describe('google maps scrape worker smoke', () => {
  it('logs job lifecycle around a successful scrape run', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const raw: RawProspect = {
      name: 'Ponytail Plumbing',
      location: 'Jakarta',
      matchedKeyword: 'plumber',
      acquiredAt: new Date('2026-06-28T00:00:00.000Z'),
      publicContact: '+62 812-3456-7890',
      profileUrl: 'https://ponytail.example.com',
    };

    const normalized: NormalizedLead = {
      teamId: 'team-smoke',
      name: 'Ponytail Plumbing',
      publicContact: '+62 812-3456-7890',
      profileUrl: 'https://ponytail.example.com',
      location: 'Jakarta',
      whatsappNumber: '6281234567890',
      whatsappUrl: 'https://wa.me/6281234567890',
      matchedKeywords: ['plumber'],
      discoveredAt: new Date('2026-06-28T00:00:00.000Z'),
      sources: ['google-maps-headless'],
      whatsappVerificationStatus: 'unverified' as WhatsAppVerificationStatus,
    };

    const fetchSpy = vi
      .spyOn(GoogleMapsHeadlessConnector.prototype, 'fetch')
      .mockResolvedValue([raw]);
    const normalizeSpy = vi
      .spyOn(GoogleMapsHeadlessConnector.prototype, 'normalize')
      .mockReturnValue(normalized);

    const tx = {} as PoolClient;
    const ingest = vi.fn().mockResolvedValue({ outcome: 'created', leadId: 'lead-1' });
    const scoreAndPersist = vi.fn().mockResolvedValue({ ok: true, value: { score: null, state: 'unscored' } });
    let runInTxCalls = 0;
    const runInTx = async <T>(fn: (currentTx: PoolClient) => Promise<T>) => {
      runInTxCalls += 1;
      return fn(tx);
    };
    const loadModel = vi.fn<() => Promise<ScoringModel | null>>().mockResolvedValue(null);

    const summary = await processGoogleMapsScrapeJob(
      {
        redisUrl: 'redis://localhost:6379/0',
        runInTx,
        loadModel,
        pipeline: {
          dedup: () => ({ ingest }) as never,
          scorer: () => ({ scoreAndPersist }) as never,
          project: projectScorableLead,
        },
      },
      {
        teamId: 'team-smoke',
        keyword: 'plumber',
        location: 'jakarta',
      },
    );

    expect(runInTxCalls).toBe(1);
    expect(loadModel).toHaveBeenCalledWith('team-smoke');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toEqual({ keywords: ['plumber'], location: 'jakarta' });
    expect(fetchSpy.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    expect(normalizeSpy).toHaveBeenCalledWith(raw, 'team-smoke');
    expect(ingest).toHaveBeenCalledWith(tx, normalized);
    expect(scoreAndPersist).toHaveBeenCalledTimes(1);

    const scorable = scoreAndPersist.mock.calls[0]?.[3];
    expect(scorable).toMatchObject({
      teamId: 'team-smoke',
      matchedKeywords: ['plumber'],
      sources: ['google-maps-headless'],
      location: 'Jakarta',
      publicContact: '+62 812-3456-7890',
      aiIntentScore: null,
    });

    expect(summary).toEqual({
      newLeads: 1,
      duplicateLeads: 0,
      excludedSources: [],
      connectorResults: [
        {
          sourceId: 'google-maps-headless',
          outcome: 'ok',
          itemsFetched: 1,
        },
      ],
    });
    expect(infoSpy).toHaveBeenCalledWith('[google-maps-scrape] job started', {
      teamId: 'team-smoke',
      keyword: 'plumber',
      location: 'jakarta',
    });
    expect(infoSpy).toHaveBeenCalledWith('[google-maps-scrape] job completed', {
      teamId: 'team-smoke',
      keyword: 'plumber',
      location: 'jakarta',
      summary,
    });
    expect(errorSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    normalizeSpy.mockRestore();
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('runs the scrape job through the pipeline with the headless connector', async () => {
    const raw: RawProspect = {
      name: 'Ponytail Plumbing',
      location: 'Jakarta',
      matchedKeyword: 'plumber',
      acquiredAt: new Date('2026-06-28T00:00:00.000Z'),
      publicContact: '+62 812-3456-7890',
      profileUrl: 'https://ponytail.example.com',
    };

    const normalized: NormalizedLead = {
      teamId: 'team-smoke',
      name: 'Ponytail Plumbing',
      publicContact: '+62 812-3456-7890',
      profileUrl: 'https://ponytail.example.com',
      location: 'Jakarta',
      whatsappNumber: '6281234567890',
      whatsappUrl: 'https://wa.me/6281234567890',
      matchedKeywords: ['plumber'],
      discoveredAt: new Date('2026-06-28T00:00:00.000Z'),
      sources: ['google-maps-headless'],
      whatsappVerificationStatus: 'unverified' as WhatsAppVerificationStatus,
    };

    const fetchSpy = vi
      .spyOn(GoogleMapsHeadlessConnector.prototype, 'fetch')
      .mockResolvedValue([raw]);
    const normalizeSpy = vi
      .spyOn(GoogleMapsHeadlessConnector.prototype, 'normalize')
      .mockReturnValue(normalized);

    const tx = {} as PoolClient;
    const ingest = vi.fn().mockResolvedValue({ outcome: 'created', leadId: 'lead-1' });
    const scoreAndPersist = vi.fn().mockResolvedValue({ ok: true, value: { score: null, state: 'unscored' } });
    let runInTxCalls = 0;
    const runInTx = async <T>(fn: (currentTx: PoolClient) => Promise<T>) => {
      runInTxCalls += 1;
      return fn(tx);
    };
    const loadModel = vi.fn<() => Promise<ScoringModel | null>>().mockResolvedValue(null);

    const summary = await processGoogleMapsScrapeJob(
      {
        redisUrl: 'redis://localhost:6379/0',
        runInTx,
        loadModel,
        pipeline: {
          dedup: () => ({ ingest }) as never,
          scorer: () => ({ scoreAndPersist }) as never,
          project: projectScorableLead,
        },
      },
      {
        teamId: 'team-smoke',
        keyword: 'plumber',
        location: 'jakarta',
      },
    );

    expect(runInTxCalls).toBe(1);
    expect(loadModel).toHaveBeenCalledWith('team-smoke');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toEqual({ keywords: ['plumber'], location: 'jakarta' });
    expect(fetchSpy.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    expect(normalizeSpy).toHaveBeenCalledWith(raw, 'team-smoke');
    expect(ingest).toHaveBeenCalledWith(tx, normalized);
    expect(scoreAndPersist).toHaveBeenCalledTimes(1);

    const scorable = scoreAndPersist.mock.calls[0]?.[3];
    expect(scorable).toMatchObject({
      teamId: 'team-smoke',
      matchedKeywords: ['plumber'],
      sources: ['google-maps-headless'],
      location: 'Jakarta',
      publicContact: '+62 812-3456-7890',
      aiIntentScore: null,
    });

    expect(summary).toEqual({
      newLeads: 1,
      duplicateLeads: 0,
      excludedSources: [],
      connectorResults: [
        {
          sourceId: 'google-maps-headless',
          outcome: 'ok',
          itemsFetched: 1,
        },
      ],
    });

    fetchSpy.mockRestore();
    normalizeSpy.mockRestore();
  });

  it('logs enqueue fallback runner failures', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const queue = {
      add: vi.fn().mockRejectedValue(new Error('google_maps_scrape_queue_unavailable_in_development')),
    } as never;
    const runnerError = new Error('connector failed');

    await enqueueGoogleMapsScrape(
      queue,
      {
        teamId: 'team-smoke',
        keyword: 'plumber',
        location: 'jakarta',
      },
      {
        inProcessRunner: async () => {
          throw runnerError;
        },
      },
    );

    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      '[google-maps-scrape] BullMQ enqueue failed (google_maps_scrape_queue_unavailable_in_development). Falling back to in-process runner.',
    );
    expect(errorSpy).toHaveBeenCalledWith('[google-maps-scrape] in-process runner failed:', runnerError);

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
