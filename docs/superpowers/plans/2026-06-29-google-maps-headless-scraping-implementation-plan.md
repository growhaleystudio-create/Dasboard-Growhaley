# Google Maps Headless Scraping Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an on-demand Google Maps headless scraping connector that can be triggered from the dashboard connectors page, runs in the existing BullMQ worker process, and reuses the existing normalize → dedup → persist lead pipeline.

**Architecture:** Add a new backend connector that implements the existing `Source_Connector` contract and extracts business data from Google Search using Playwright. Expose a small API route that enqueues a dedicated BullMQ job, process that job in `backend/src/worker.ts`, and add a simple modal flow in the dashboard connectors page to trigger and monitor the request.

**Tech Stack:** TypeScript, Node.js, Fastify, BullMQ, Playwright, React, Next.js, React Query, Vitest/Jest-style backend tests already present in repo.

---

## File Structure

### Create
- `backend/src/connector/google-maps-headless.ts` — new connector that implements `Source_Connector`, owns Playwright fetch logic, and delegates normalize to shared connector normalization.
- `backend/src/scraping/google-maps-scrape-worker.ts` — queue name, enqueue helper, worker factory, and job processor for manual scrape jobs.
- `backend/src/scraping/google-maps-scrape-worker.test.ts` — queue/job processor tests, including anti-overlap and successful pipeline invocation behavior at unit level.
- `backend/src/api/routes/scrape.routes.ts` — Fastify route for `POST /api/teams/:teamId/scrape` with validation, RBAC, and queue integration.
- `backend/src/api/routes/scrape.routes.test.ts` — route tests covering validation, queue success, overlap conflict, and unavailable queue behavior.
- `frontend/src/components/connectors/ScrapeNowModal.tsx` — focused modal component for keyword/location input and submit UX.
- `frontend/src/components/connectors/ScrapeNowModal.test.tsx` — modal rendering and submit behavior tests if the frontend test stack already supports component tests.

### Modify
- `backend/package.json` — add `playwright` dependency and any script/update needed for browser install notes.
- `backend/src/connector/index.ts` or the connector export file used by `start.ts` / `worker.ts` — export the new connector if there is a shared barrel.
- `backend/src/start.ts` — instantiate the scrape queue in production, stub it in development like the existing queue pattern, and pass it into route registration.
- `backend/src/worker.ts` — register the new scrape worker and its lifecycle logging/shutdown handling.
- `backend/src/api/server.ts` — register the new scrape routes if routes are wired centrally.
- `backend/src/auth/rbac.ts` — only if current roles/constants need a reusable permission helper for this route.
- `frontend/src/app/dashboard/connectors/page.tsx` — add “Scrape Sekarang” trigger, modal wiring, mutation state, and success/error UX.
- `frontend/package.json` — only if frontend tests require an already-approved testing dependency that is currently missing.
- `docs/superpowers/specs/2026-06-28-google-maps-headless-scraping-design.md` — only if implementation discovers a spec mismatch that must be corrected before coding.

### Existing code to study while implementing
- `backend/src/connector/source-connector.ts` — contract the new connector must match.
- `backend/src/connector/google-scraper.ts` — normalization and fetch shape reference.
- `backend/src/scan/scan-pipeline.ts` and `backend/src/scan/scan-engine.ts` — existing normalize → dedup → persist path to reuse.
- `backend/src/ai/ai-worker.ts` — BullMQ worker pattern reference.
- `backend/src/api/routes/lead.routes.ts` — Fastify route style, schema, auth, and repository/service access pattern.
- `frontend/src/app/dashboard/connectors/page.tsx` — existing connectors page UX and mutation patterns.

---

### Task 1: Add the Playwright-backed connector

**Files:**
- Create: `backend/src/connector/google-maps-headless.ts`
- Modify: `backend/package.json`
- Modify: `backend/src/connector/index.ts` or the connector export file used in the backend
- Test: `backend/src/connector/google-maps-headless.test.ts`

- [ ] **Step 1: Write the failing connector tests**

Create `backend/src/connector/google-maps-headless.test.ts` with focused tests for availability, fetch mapping, and empty results. Match the repo’s current backend test style.

```ts
import { describe, expect, it, vi } from 'vitest';
import { GoogleMapsHeadlessConnector } from './google-maps-headless';

describe('GoogleMapsHeadlessConnector', () => {
  it('returns false from checkAvailability when browser launch fails', async () => {
    const connector = new GoogleMapsHeadlessConnector({
      launchBrowser: vi.fn().mockRejectedValue(new Error('launch failed')),
    });

    await expect(connector.checkAvailability()).resolves.toBe(false);
  });

  it('maps parsed search results into raw prospects', async () => {
    const connector = new GoogleMapsHeadlessConnector({
      launchBrowser: vi.fn().mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        fetchBusinessCards: vi.fn().mockResolvedValue([
          {
            title: 'Kopi Senja',
            address: 'Jl. Tebet Barat, Jakarta Selatan',
            phone: '08123456789',
            website: 'https://kopisenja.example',
            rating: '4.7',
            reviewCount: '128',
            category: 'Cafe',
          },
        ]),
      }),
    });

    const results = await connector.fetch(
      { keyword: 'cafe', location: 'Jakarta Selatan' },
      new AbortController().signal,
    );

    expect(results).toEqual([
      expect.objectContaining({
        name: 'Kopi Senja',
        location: 'Jl. Tebet Barat, Jakarta Selatan',
        publicContact: '08123456789',
        profileUrl: 'https://kopisenja.example',
      }),
    ]);
  });

  it('returns an empty list when no cards are parsed', async () => {
    const connector = new GoogleMapsHeadlessConnector({
      launchBrowser: vi.fn().mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        fetchBusinessCards: vi.fn().mockResolvedValue([]),
      }),
    });

    await expect(
      connector.fetch({ keyword: 'cafe', location: 'Bandung' }, new AbortController().signal),
    ).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run the connector tests to verify they fail**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm test -- google-maps-headless.test.ts
```

Expected: FAIL because `google-maps-headless.ts` does not exist yet and the connector is not exported.

- [ ] **Step 3: Add the Playwright dependency**

Update `backend/package.json` to add Playwright in dependencies.

```json
{
  "dependencies": {
    "playwright": "^1.54.0"
  }
}
```

If the project keeps dependencies sorted alphabetically, preserve that order.

- [ ] **Step 4: Implement the connector with injectable browser helpers**

Create `backend/src/connector/google-maps-headless.ts`.

```ts
import { chromium, type Browser } from 'playwright';
import { normalizeRawProspect } from './normalize';
import type { NormalizedLead, RawProspect, Source_Connector } from './source-connector';

export type GoogleMapsHeadlessQuery = {
  keyword: string;
  location?: string;
};

type ParsedBusinessCard = {
  title: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: string;
  reviewCount?: string;
  category?: string;
};

type BrowserSession = {
  fetchBusinessCards(query: GoogleMapsHeadlessQuery, signal: AbortSignal): Promise<ParsedBusinessCard[]>;
  close(): Promise<void>;
};

type GoogleMapsHeadlessConnectorDeps = {
  launchBrowser?: () => Promise<BrowserSession>;
};

const DEFAULT_USAGE_POLICY = {
  allowedRetentionDays: 90,
};

export class GoogleMapsHeadlessConnector implements Source_Connector {
  readonly sourceId = 'google-maps-headless';
  readonly displayName = 'Google Maps (Headless)';
  readonly usagePolicy = DEFAULT_USAGE_POLICY;

  constructor(private readonly deps: GoogleMapsHeadlessConnectorDeps = {}) {}

  async checkAvailability(): Promise<boolean> {
    try {
      const session = await this.createSession();
      await session.close();
      return true;
    } catch {
      return false;
    }
  }

  async fetch(query: GoogleMapsHeadlessQuery, signal: AbortSignal): Promise<RawProspect[]> {
    const session = await this.createSession();
    try {
      const cards = await session.fetchBusinessCards(query, signal);
      return cards.map((card) => ({
        name: card.title,
        location: card.address,
        publicContact: card.phone,
        profileUrl: card.website,
        whatsappNumber: card.phone,
        postSnippet: [card.category, card.rating, card.reviewCount]
          .filter(Boolean)
          .join(' • '),
      }));
    } finally {
      await session.close();
    }
  }

  normalize(raw: RawProspect, teamId: string): NormalizedLead {
    return normalizeRawProspect(raw, {
      teamId,
      sourceId: this.sourceId,
      usagePolicy: this.usagePolicy,
    });
  }

  private async createSession(): Promise<BrowserSession> {
    return this.deps.launchBrowser ? this.deps.launchBrowser() : createPlaywrightSession();
  }
}

async function createPlaywrightSession(): Promise<BrowserSession> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });

  return {
    async fetchBusinessCards(query, signal) {
      const searchTerm = [query.keyword, query.location].filter(Boolean).join(' ');
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
        signal,
      });

      await page.waitForTimeout(1_000);

      return page.evaluate(() => {
        const heading = document.querySelector('h2, h3');
        const websiteLink = Array.from(document.querySelectorAll('a')).find((link) =>
          (link.textContent || '').toLowerCase().includes('website'),
        ) as HTMLAnchorElement | undefined;

        const bodyText = document.body.innerText;
        const phoneMatch = bodyText.match(/(\+62|0)\d{8,14}/);
        const ratingMatch = bodyText.match(/\b([0-5]\.?\d?)\b\s*\(/);

        if (!heading?.textContent) {
          return [];
        }

        return [
          {
            title: heading.textContent.trim(),
            address: bodyText.split('\n').find((line) => line.includes('Jl.') || line.includes('Street')),
            phone: phoneMatch?.[0],
            website: websiteLink?.href,
            rating: ratingMatch?.[1],
          },
        ];
      });
    },
    async close() {
      await closeBrowser(browser);
    },
  };
}

async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close();
}
```

- [ ] **Step 5: Export the connector from the connector module**

Update the backend connector export file to include the new connector.

```ts
export { GoogleMapsHeadlessConnector } from './google-maps-headless';
```

- [ ] **Step 6: Run the connector tests to verify they pass**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm test -- google-maps-headless.test.ts
```

Expected: PASS for the new connector tests.

- [ ] **Step 7: Commit the connector work**

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator" && git add backend/package.json backend/src/connector/google-maps-headless.ts backend/src/connector/google-maps-headless.test.ts backend/src/connector/index.ts && git commit -m "feat: add Google Maps headless connector"
```

---

### Task 2: Add the scrape queue and worker processor

**Files:**
- Create: `backend/src/scraping/google-maps-scrape-worker.ts`
- Create: `backend/src/scraping/google-maps-scrape-worker.test.ts`
- Modify: `backend/src/worker.ts`
- Modify: `backend/src/start.ts`
- Test: `backend/src/scraping/google-maps-scrape-worker.test.ts`

- [ ] **Step 1: Write the failing worker tests**

Create `backend/src/scraping/google-maps-scrape-worker.test.ts`.

```ts
import { describe, expect, it, vi } from 'vitest';
import { processGoogleMapsScrapeJob } from './google-maps-scrape-worker';

describe('processGoogleMapsScrapeJob', () => {
  it('normalizes fetched raw prospects and persists them through the ingest pipeline', async () => {
    const connector = {
      fetch: vi.fn().mockResolvedValue([{ name: 'Kopi Senja', location: 'Jakarta Selatan' }]),
      normalize: vi.fn().mockReturnValue({ id: 'normalized-1' }),
    };
    const ingestLeads = vi.fn().mockResolvedValue({ newLeads: 1, duplicates: 0 });

    const result = await processGoogleMapsScrapeJob(
      { teamId: 'team-1', keyword: 'cafe', location: 'Jakarta Selatan', triggeredBy: 'manual', actorId: 'user-1' },
      { connector, ingestLeads },
    );

    expect(connector.fetch).toHaveBeenCalled();
    expect(connector.normalize).toHaveBeenCalledWith({ name: 'Kopi Senja', location: 'Jakarta Selatan' }, 'team-1');
    expect(ingestLeads).toHaveBeenCalledWith('team-1', [{ id: 'normalized-1' }]);
    expect(result).toEqual({ resultsFound: 1, newLeads: 1, duplicates: 0 });
  });
});
```

- [ ] **Step 2: Run the worker tests to verify they fail**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm test -- google-maps-scrape-worker.test.ts
```

Expected: FAIL because the worker module does not exist yet.

- [ ] **Step 3: Implement the worker module and enqueue helper**

Create `backend/src/scraping/google-maps-scrape-worker.ts`.

```ts
import { Queue, Worker, type JobsOptions } from 'bullmq';
import type { Job } from 'bullmq';
import { GoogleMapsHeadlessConnector } from '../connector/google-maps-headless';

export const GOOGLE_MAPS_SCRAPE_QUEUE = 'google-maps-scrape';

export type GoogleMapsScrapeJobData = {
  teamId: string;
  keyword: string;
  location?: string;
  triggeredBy: 'manual' | 'scheduled';
  actorId: string;
};

type ProcessDeps = {
  connector?: Pick<GoogleMapsHeadlessConnector, 'fetch' | 'normalize'>;
  ingestLeads: (teamId: string, leads: unknown[]) => Promise<{ newLeads: number; duplicates: number }>;
};

type WorkerDeps = ProcessDeps & {
  connection: Parameters<typeof Worker<GoogleMapsScrapeJobData>>[2]['connection'];
};

export async function processGoogleMapsScrapeJob(
  jobData: GoogleMapsScrapeJobData,
  deps: ProcessDeps,
): Promise<{ resultsFound: number; newLeads: number; duplicates: number }> {
  const connector = deps.connector ?? new GoogleMapsHeadlessConnector();
  const rawProspects = await connector.fetch(
    { keyword: jobData.keyword, location: jobData.location },
    new AbortController().signal,
  );
  const normalized = rawProspects.map((raw) => connector.normalize(raw, jobData.teamId));
  const persisted = await deps.ingestLeads(jobData.teamId, normalized);

  return {
    resultsFound: rawProspects.length,
    newLeads: persisted.newLeads,
    duplicates: persisted.duplicates,
  };
}

export function createGoogleMapsScrapeWorker(deps: WorkerDeps): Worker<GoogleMapsScrapeJobData> {
  return new Worker<GoogleMapsScrapeJobData>(
    GOOGLE_MAPS_SCRAPE_QUEUE,
    async (job: Job<GoogleMapsScrapeJobData>) => processGoogleMapsScrapeJob(job.data, deps),
    {
      connection: deps.connection,
      concurrency: 1,
    },
  );
}

export async function enqueueGoogleMapsScrape(
  queue: Pick<Queue<GoogleMapsScrapeJobData>, 'add'>,
  data: GoogleMapsScrapeJobData,
): Promise<void> {
  const options: JobsOptions = {
    jobId: `${data.teamId}:${data.keyword}:${Date.now()}`,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
  };

  await queue.add(GOOGLE_MAPS_SCRAPE_QUEUE, data, options);
}
```

- [ ] **Step 4: Wire the worker into `backend/src/worker.ts`**

Add a worker registration that matches the existing AI worker style.

```ts
const googleMapsScrapeWorker = createGoogleMapsScrapeWorker({
  connection: redisConnection,
  ingestLeads: async (teamId, leads) => {
    return ingestNormalizedLeadsForTeam({
      teamId,
      leads,
      db,
      logger,
    });
  },
});

googleMapsScrapeWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, result }, 'google maps scrape job completed');
});

googleMapsScrapeWorker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, error }, 'google maps scrape job failed');
});

shutdownTasks.push(() => googleMapsScrapeWorker.close());
```

Use the actual logger, shutdown array, and Redis variable names from `backend/src/worker.ts`.

- [ ] **Step 5: Wire the queue into `backend/src/start.ts`**

Add a production queue and development stub, matching the existing queue pattern.

```ts
const googleMapsScrapeQueue = redisClient
  ? new Queue<GoogleMapsScrapeJobData>(GOOGLE_MAPS_SCRAPE_QUEUE, { connection: redisClient })
  : {
      add: async () => {
        throw new Error('google_maps_scrape_queue_unavailable_in_development');
      },
    };
```

Pass this queue into the route registration/dependencies in the same place other queues are passed.

- [ ] **Step 6: Run the worker tests to verify they pass**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm test -- google-maps-scrape-worker.test.ts
```

Expected: PASS for the new processor tests.

- [ ] **Step 7: Commit the queue and worker work**

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator" && git add backend/src/scraping/google-maps-scrape-worker.ts backend/src/scraping/google-maps-scrape-worker.test.ts backend/src/worker.ts backend/src/start.ts && git commit -m "feat: add Google Maps scrape worker"
```

---

### Task 3: Add the scrape API route

**Files:**
- Create: `backend/src/api/routes/scrape.routes.ts`
- Create: `backend/src/api/routes/scrape.routes.test.ts`
- Modify: `backend/src/api/server.ts`
- Test: `backend/src/api/routes/scrape.routes.test.ts`

- [ ] **Step 1: Write the failing route tests**

Create `backend/src/api/routes/scrape.routes.test.ts`.

```ts
import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerScrapeRoutes } from './scrape.routes';

describe('registerScrapeRoutes', () => {
  it('returns 202 and queues a scrape job for valid input', async () => {
    const app = Fastify();
    const queue = { add: vi.fn().mockResolvedValue(undefined) };

    await registerScrapeRoutes(app, {
      scrapeQueue: queue,
      requireTeamMember: async () => undefined,
      hasActiveScrape: async () => false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/teams/team-1/scrape',
      payload: { keyword: 'cafe', location: 'Bandung' },
    });

    expect(response.statusCode).toBe(202);
    expect(queue.add).toHaveBeenCalled();
  });

  it('returns 409 when another scrape is already running', async () => {
    const app = Fastify();

    await registerScrapeRoutes(app, {
      scrapeQueue: { add: vi.fn() },
      requireTeamMember: async () => undefined,
      hasActiveScrape: async () => true,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/teams/team-1/scrape',
      payload: { keyword: 'cafe' },
    });

    expect(response.statusCode).toBe(409);
  });
});
```

- [ ] **Step 2: Run the route tests to verify they fail**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm test -- scrape.routes.test.ts
```

Expected: FAIL because the route file does not exist yet.

- [ ] **Step 3: Implement the scrape route**

Create `backend/src/api/routes/scrape.routes.ts`.

```ts
import type { FastifyInstance } from 'fastify';
import { enqueueGoogleMapsScrape, type GoogleMapsScrapeJobData } from '../../scraping/google-maps-scrape-worker';

type RegisterScrapeRoutesDeps = {
  scrapeQueue: { add: (name: string, data: GoogleMapsScrapeJobData, opts?: unknown) => Promise<unknown> };
  requireTeamMember: (request: unknown, reply: unknown) => Promise<void>;
  hasActiveScrape: (teamId: string) => Promise<boolean>;
};

export async function registerScrapeRoutes(
  app: FastifyInstance,
  deps: RegisterScrapeRoutesDeps,
): Promise<void> {
  app.post('/api/teams/:teamId/scrape', async (request, reply) => {
    await deps.requireTeamMember(request, reply);

    const { teamId } = request.params as { teamId: string };
    const { keyword, location } = request.body as { keyword?: string; location?: string };

    if (!keyword || keyword.trim().length < 1 || keyword.trim().length > 100) {
      return reply.status(400).send({ error: 'invalid_keyword' });
    }

    if (location && location.length > 200) {
      return reply.status(400).send({ error: 'invalid_location' });
    }

    if (await deps.hasActiveScrape(teamId)) {
      return reply.status(409).send({ error: 'scrape_already_running' });
    }

    await enqueueGoogleMapsScrape(deps.scrapeQueue, {
      teamId,
      keyword: keyword.trim(),
      location: location?.trim() || undefined,
      triggeredBy: 'manual',
      actorId: 'session-user',
    });

    return reply.status(202).send({ status: 'queued' });
  });
}
```

Replace `'session-user'` with the actual authenticated actor extraction pattern used elsewhere in the API layer.

- [ ] **Step 4: Register the route in the API server**

Add the route registration in `backend/src/api/server.ts` using the existing route registration pattern.

```ts
await registerScrapeRoutes(app, {
  scrapeQueue: deps.googleMapsScrapeQueue,
  requireTeamMember: deps.requireTeamMember,
  hasActiveScrape: deps.hasActiveScrape,
});
```

Use the real dependency names from `server.ts`.

- [ ] **Step 5: Run the route tests to verify they pass**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm test -- scrape.routes.test.ts
```

Expected: PASS for queue success and overlap conflict tests.

- [ ] **Step 6: Commit the API route work**

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator" && git add backend/src/api/routes/scrape.routes.ts backend/src/api/routes/scrape.routes.test.ts backend/src/api/server.ts && git commit -m "feat: add manual scrape API route"
```

---

### Task 4: Add the connectors page trigger UI

**Files:**
- Create: `frontend/src/components/connectors/ScrapeNowModal.tsx`
- Modify: `frontend/src/app/dashboard/connectors/page.tsx`
- Test: `frontend/src/components/connectors/ScrapeNowModal.test.tsx`

- [ ] **Step 1: Write the failing modal test**

Create `frontend/src/components/connectors/ScrapeNowModal.test.tsx` if the frontend test stack already supports component tests.

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScrapeNowModal } from './ScrapeNowModal';

describe('ScrapeNowModal', () => {
  it('submits keyword and location', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ScrapeNowModal
        open
        loading={false}
        onClose={() => undefined}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText(/keyword/i), { target: { value: 'cafe' } });
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: 'Bandung' } });
    fireEvent.click(screen.getByRole('button', { name: /scrape sekarang/i }));

    expect(onSubmit).toHaveBeenCalledWith({ keyword: 'cafe', location: 'Bandung' });
  });
});
```

If the frontend currently has no component test stack, replace this task step with a documented manual verification checklist in the plan execution phase and do not add test dependencies just for this modal.

- [ ] **Step 2: Run the modal test to verify it fails**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/frontend" && npm test -- ScrapeNowModal.test.tsx
```

Expected: FAIL because the modal component does not exist yet.

- [ ] **Step 3: Implement the modal component**

Create `frontend/src/components/connectors/ScrapeNowModal.tsx`.

```tsx
'use client';

import { useState } from 'react';

type ScrapeNowModalProps = {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: { keyword: string; location: string }) => Promise<void>;
};

export function ScrapeNowModal({ open, loading, onClose, onSubmit }: ScrapeNowModalProps) {
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Scrape Sekarang</h2>
        <p className="mt-2 text-sm text-slate-600">Masukkan keyword dan lokasi untuk cari leads baru.</p>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Keyword
          <input
            aria-label="Keyword"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Lokasi
          <input
            aria-label="Location"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
            onClick={onClose}
            disabled={loading}
          >
            Batal
          </button>
          <button
            type="button"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => onSubmit({ keyword, location })}
            disabled={loading || !keyword.trim()}
          >
            {loading ? 'Memulai...' : 'Scrape Sekarang'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the modal into the connectors page**

Modify `frontend/src/app/dashboard/connectors/page.tsx` to add local modal state, a mutation, and the trigger button.

```tsx
const [scrapeOpen, setScrapeOpen] = useState(false);
const scrapeMutation = useMutation({
  mutationFn: async ({ keyword, location }: { keyword: string; location: string }) => {
    const response = await fetch(`/api/teams/${teamId}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, location }),
    });

    if (!response.ok) {
      throw new Error('Gagal memulai scraping');
    }

    return response.json();
  },
  onSuccess: () => {
    toast.success('Scraping started. Leads will appear shortly.');
    setScrapeOpen(false);
  },
  onError: (error) => {
    toast.error(error instanceof Error ? error.message : 'Gagal memulai scraping');
  },
});
```

Add the button near the page header actions.

```tsx
<Button onClick={() => setScrapeOpen(true)}>Scrape Sekarang</Button>
<ScrapeNowModal
  open={scrapeOpen}
  loading={scrapeMutation.isPending}
  onClose={() => setScrapeOpen(false)}
  onSubmit={(values) => scrapeMutation.mutateAsync(values)}
/>
```

Use the existing button, toast, modal, and mutation style already present in the file if equivalents already exist.

- [ ] **Step 5: Run the modal test to verify it passes**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/frontend" && npm test -- ScrapeNowModal.test.tsx
```

Expected: PASS if a supported frontend test stack exists.

- [ ] **Step 6: Manually verify the UI flow in the browser**

Manual checklist:

```md
1. Open /dashboard/connectors
2. Click "Scrape Sekarang"
3. Confirm modal opens
4. Confirm submit disabled when keyword is empty
5. Enter keyword and optional location
6. Submit and confirm loading state appears
7. Confirm success toast appears on 202 response
8. Confirm modal closes after success
9. Confirm error toast appears on non-200/202 response
```

- [ ] **Step 7: Commit the UI work**

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator" && git add frontend/src/components/connectors/ScrapeNowModal.tsx frontend/src/components/connectors/ScrapeNowModal.test.tsx frontend/src/app/dashboard/connectors/page.tsx && git commit -m "feat: add scrape now connectors UI"
```

---

### Task 5: Connect the worker to the real lead ingestion pipeline and verify end-to-end behavior

**Files:**
- Modify: `backend/src/scraping/google-maps-scrape-worker.ts`
- Modify: `backend/src/worker.ts`
- Modify: `backend/src/start.ts`
- Modify: `backend/src/api/routes/scrape.routes.ts`
- Test: `backend/src/scraping/google-maps-scrape-worker.test.ts`
- Test: `backend/src/api/routes/scrape.routes.test.ts`

- [ ] **Step 1: Write a failing integration-style unit test for pipeline reuse**

Extend `backend/src/scraping/google-maps-scrape-worker.test.ts` with a test that asserts the processor passes normalized leads to a real ingestion adapter with the exact team id and preserves duplicate/new lead counts.

```ts
it('returns duplicate and new lead counts from the ingestion adapter', async () => {
  const connector = {
    fetch: vi.fn().mockResolvedValue([{ name: 'Kopi Senja', location: 'Jakarta Selatan' }]),
    normalize: vi.fn().mockReturnValue({ id: 'normalized-1' }),
  };
  const ingestLeads = vi.fn().mockResolvedValue({ newLeads: 0, duplicates: 1 });

  const result = await processGoogleMapsScrapeJob(
    { teamId: 'team-1', keyword: 'cafe', location: 'Jakarta Selatan', triggeredBy: 'manual', actorId: 'user-1' },
    { connector, ingestLeads },
  );

  expect(result).toEqual({ resultsFound: 1, newLeads: 0, duplicates: 1 });
});
```

- [ ] **Step 2: Run the worker test to verify the new assertion fails if the adapter contract is incomplete**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm test -- google-maps-scrape-worker.test.ts
```

Expected: FAIL only if the ingestion adapter shape still does not match the real pipeline contract.

- [ ] **Step 3: Replace the placeholder ingestion adapter with the actual project pipeline**

Update `backend/src/worker.ts` and/or `backend/src/scraping/google-maps-scrape-worker.ts` so the worker uses the repo’s real lead ingestion services instead of a temporary adapter. The final wiring should:

```ts
const deduplicationService = new DeduplicationService({
  canonicalLeadFinder,
  leadRepository,
});

async function ingestNormalizedLeadsForTeam({ teamId, leads, db, scoringModelRepository }: {
  teamId: string;
  leads: NormalizedLead[];
  db: Pool;
  scoringModelRepository: ScoringModelRepository;
}) {
  let newLeads = 0;
  let duplicates = 0;

  await db.withTransaction(async (tx) => {
    for (const lead of leads) {
      const result = await deduplicationService.ingest(tx, lead);
      if (result.kind === 'created') {
        newLeads += 1;
      } else {
        duplicates += 1;
      }
    }
  });

  return { newLeads, duplicates };
}
```

Adapt this skeleton to the exact transaction helpers and scoring persistence utilities already present in the repo. Reuse the same services `runScanPipeline` uses rather than duplicating ingest logic.

- [ ] **Step 4: Add anti-overlap support using active BullMQ jobs**

Update the route and queue integration so `hasActiveScrape(teamId)` checks for waiting, active, or delayed jobs for the same team before enqueueing.

```ts
async function hasActiveGoogleMapsScrape(
  queue: Pick<Queue<GoogleMapsScrapeJobData>, 'getJobs'>,
  teamId: string,
): Promise<boolean> {
  const jobs = await queue.getJobs(['waiting', 'active', 'delayed']);
  return jobs.some((job) => job.data.teamId === teamId);
}
```

If the repo has a more efficient queue inspection utility already, use that instead.

- [ ] **Step 5: Run backend tests for worker and route together**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm test -- google-maps-scrape-worker.test.ts scrape.routes.test.ts
```

Expected: PASS for processor and route tests.

- [ ] **Step 6: Smoke-test the backend manually**

Manual checklist:

```md
1. Start Redis and Postgres for the project
2. Start backend API process
3. Start backend worker process
4. POST /api/teams/<teamId>/scrape with keyword=cafe and location=Bandung
5. Confirm 202 response with queued status
6. Check worker logs for completed Google Maps scrape job
7. Confirm leads were inserted or marked duplicate in the database
8. Re-submit immediately and confirm 409 overlap response
```

- [ ] **Step 7: Commit the pipeline integration work**

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator" && git add backend/src/scraping/google-maps-scrape-worker.ts backend/src/worker.ts backend/src/start.ts backend/src/api/routes/scrape.routes.ts backend/src/scraping/google-maps-scrape-worker.test.ts backend/src/api/routes/scrape.routes.test.ts && git commit -m "feat: wire Google Maps scrape jobs into lead pipeline"
```

---

### Task 6: Final verification, docs alignment, and cleanup

**Files:**
- Modify: `docs/superpowers/specs/2026-06-28-google-maps-headless-scraping-design.md` only if implementation changed behavior
- Modify: `docs/superpowers/specs/2026-06-28-google-maps-headless-scraping-prd.md` only if implementation changed product behavior
- Modify: any touched files above if verification exposes defects

- [ ] **Step 1: Run targeted backend tests**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm test -- google-maps-headless.test.ts google-maps-scrape-worker.test.ts scrape.routes.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted frontend tests if supported**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/frontend" && npm test -- ScrapeNowModal.test.tsx
```

Expected: PASS, or skip only if the project has no supported frontend test runner for component tests.

- [ ] **Step 3: Run a production build or targeted lint/typecheck for touched surfaces**

Run the smallest reliable verification command the repo already uses.

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm run build
cd "/Users/luthfierlambang/Documents/Leads Generator/frontend" && npm run build
```

Expected: PASS builds for both backend and frontend.

- [ ] **Step 4: Update docs only if actual behavior drifted from spec**

If implementation differs from the approved design, update the affected spec/PRD sections so the docs match reality before merging.

```md
- Queue overlap behavior changed from per-team to per-team+keyword
- Scrape source changed from Google Search sidebar to Google Maps results page
```

Do not change docs if implementation matches the approved design.

- [ ] **Step 5: Final manual product verification**

Manual checklist:

```md
1. Open dashboard connectors page
2. Start a scrape with a real keyword and location
3. See a success toast immediately after queueing
4. Confirm worker logs show resultsFound/newLeads/duplicates
5. Open dashboard leads page
6. Confirm new leads appear or duplicates are not duplicated
7. Re-submit while a job is running and confirm overlap protection
8. Stop the worker and confirm the API responds with the expected queue/unavailable failure behavior
```

- [ ] **Step 6: Commit any final fixes**

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator" && git add -A && git commit -m "test: verify Google Maps scrape flow"
```

---

## Self-Review

### Spec coverage
- Connector requirement covered in Task 1.
- BullMQ queue and worker requirement covered in Task 2.
- API endpoint with validation and anti-overlap covered in Task 3 and Task 5.
- Connectors page trigger UI covered in Task 4.
- Reuse of normalize → dedup → persist pipeline covered in Task 5.
- Verification and behavior drift handling covered in Task 6.

### Placeholder scan
- No TBD/TODO placeholders remain in executable steps.
- Manual verification steps are explicit and limited to UI/runtime behavior that is not practical to lock down with current context.

### Type consistency
- Shared names are consistent across tasks: `GoogleMapsHeadlessConnector`, `GoogleMapsScrapeJobData`, `GOOGLE_MAPS_SCRAPE_QUEUE`, `processGoogleMapsScrapeJob`, and `registerScrapeRoutes`.
- Route payload is consistently `{ keyword, location }`.
- Queue job shape consistently includes `teamId`, `keyword`, `location`, `triggeredBy`, and `actorId`.
