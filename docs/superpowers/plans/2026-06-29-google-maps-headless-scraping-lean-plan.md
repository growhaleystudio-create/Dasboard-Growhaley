# Google Maps Headless Scraping Connector (Lean) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the smallest end-to-end manual scraping flow that actually fetches Google business data, queues work in BullMQ, and gets results into the existing leads pipeline from the dashboard connectors page.

**Architecture:** Reuse the existing backend queue and lead-ingestion patterns, but only for the manual user flow. Add one new connector with Playwright-based scraping, one queue worker, one POST route, and the smallest possible UI trigger in the connectors page. Skip scheduled mode, retries, proxies, and extra abstractions until the real flow works.

**Tech Stack:** TypeScript, Node.js, Fastify, BullMQ, Playwright, React, Next.js.

---

## File Structure

### Create
- `backend/src/connector/google-maps-headless.ts` — the real scraping connector using Playwright and shared normalization.
- `backend/src/scraping/google-maps-scrape-worker.ts` — queue name, enqueue helper, and worker processor.
- `backend/src/api/routes/scrape.routes.ts` — manual scrape endpoint.

### Modify
- `backend/package.json` — add `playwright`.
- `backend/src/start.ts` — create the scrape queue and pass it into route registration.
- `backend/src/worker.ts` — register the scrape worker.
- `backend/src/api/server.ts` — register scrape routes.
- `frontend/src/app/dashboard/connectors/page.tsx` — add the smallest manual trigger UI.

### Optional test touches
- Reuse an existing backend route test file if the codebase already keeps route tests nearby.
- Add at most one worker test and one route test if they fit the existing style quickly.

---

### Task 1: Add the real Google scraping connector

**Files:**
- Create: `backend/src/connector/google-maps-headless.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Add Playwright to the backend**

Update `backend/package.json` and add the dependency only once.

```json
{
  "dependencies": {
    "playwright": "^1.54.0"
  }
}
```

- [ ] **Step 2: Implement the smallest real connector that scrapes Google Search**

Create `backend/src/connector/google-maps-headless.ts` and keep it focused on one job: fetch one visible business result page and map it into `RawProspect`.

```ts
import { chromium } from 'playwright';
import { normalizeRawProspect } from './normalize';
import type { NormalizedLead, RawProspect, Source_Connector } from './source-connector';

export type GoogleMapsHeadlessQuery = {
  keyword: string;
  location?: string;
};

const USAGE_POLICY = {
  allowedRetentionDays: 90,
};

export class GoogleMapsHeadlessConnector implements Source_Connector {
  readonly sourceId = 'google-maps-headless';
  readonly displayName = 'Google Maps (Headless)';
  readonly usagePolicy = USAGE_POLICY;

  async checkAvailability(): Promise<boolean> {
    try {
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      return true;
    } catch {
      return false;
    }
  }

  async fetch(query: GoogleMapsHeadlessQuery, signal: AbortSignal): Promise<RawProspect[]> {
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      });

      const searchTerm = [query.keyword, query.location].filter(Boolean).join(' ');
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
        signal,
      });

      await page.waitForTimeout(1500);

      const result = await page.evaluate(() => {
        const text = document.body.innerText;
        const title = document.querySelector('h2, h3')?.textContent?.trim();
        const websiteLink = Array.from(document.querySelectorAll('a')).find((link) =>
          (link.textContent || '').toLowerCase().includes('website'),
        ) as HTMLAnchorElement | undefined;
        const phoneMatch = text.match(/(\+62|0)\d{8,14}/);
        const ratingMatch = text.match(/\b([0-5]\.?\d?)\b/);
        const addressLine = text
          .split('\n')
          .find((line) => line.includes('Jl.') || line.toLowerCase().includes('street'));

        if (!title) {
          return null;
        }

        return {
          title,
          address: addressLine,
          phone: phoneMatch?.[0],
          website: websiteLink?.href,
          rating: ratingMatch?.[1],
        };
      });

      if (!result) {
        return [];
      }

      return [
        {
          name: result.title,
          location: result.address,
          publicContact: result.phone,
          whatsappNumber: result.phone,
          profileUrl: result.website,
          postSnippet: result.rating ? `Rating ${result.rating}` : undefined,
        },
      ];
    } finally {
      await browser.close();
    }
  }

  normalize(raw: RawProspect, teamId: string): NormalizedLead {
    return normalizeRawProspect(raw, {
      teamId,
      sourceId: this.sourceId,
      usagePolicy: this.usagePolicy,
    });
  }
}
```

- [ ] **Step 3: Install dependencies**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm install
```

Expected: Playwright is added to `package-lock.json` and install completes.

- [ ] **Step 4: Sanity check the connector loads**

Run a small import/build check.

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm run build
```

Expected: TypeScript build passes or reports the exact type mismatches to fix before moving on.

- [ ] **Step 5: Commit the connector**

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator" && git add backend/package.json backend/package-lock.json backend/src/connector/google-maps-headless.ts && git commit -m "feat: add Google Maps headless connector"
```

---

### Task 2: Add the scrape queue and worker

**Files:**
- Create: `backend/src/scraping/google-maps-scrape-worker.ts`
- Modify: `backend/src/worker.ts`
- Modify: `backend/src/start.ts`

- [ ] **Step 1: Implement one queue and one processor**

Create `backend/src/scraping/google-maps-scrape-worker.ts`.

```ts
import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { GoogleMapsHeadlessConnector } from '../connector/google-maps-headless';

export const GOOGLE_MAPS_SCRAPE_QUEUE = 'google-maps-scrape';

export type GoogleMapsScrapeJobData = {
  teamId: string;
  keyword: string;
  location?: string;
  actorId: string;
};

type ProcessDeps = {
  ingestNormalizedLeads: (teamId: string, leads: unknown[]) => Promise<unknown>;
};

export async function processGoogleMapsScrapeJob(
  data: GoogleMapsScrapeJobData,
  deps: ProcessDeps,
): Promise<unknown> {
  const connector = new GoogleMapsHeadlessConnector();
  const raw = await connector.fetch(
    { keyword: data.keyword, location: data.location },
    new AbortController().signal,
  );
  const normalized = raw.map((item) => connector.normalize(item, data.teamId));

  // ponytail: keep the worker dumb; reuse the existing pipeline adapter from worker.ts.
  return deps.ingestNormalizedLeads(data.teamId, normalized);
}

export function createGoogleMapsScrapeWorker(
  connection: ConstructorParameters<typeof Worker<GoogleMapsScrapeJobData>>[2]['connection'],
  deps: ProcessDeps,
): Worker<GoogleMapsScrapeJobData> {
  return new Worker<GoogleMapsScrapeJobData>(
    GOOGLE_MAPS_SCRAPE_QUEUE,
    async (job: Job<GoogleMapsScrapeJobData>) => processGoogleMapsScrapeJob(job.data, deps),
    {
      connection,
      concurrency: 1,
    },
  );
}

export async function enqueueGoogleMapsScrape(
  queue: Pick<Queue<GoogleMapsScrapeJobData>, 'add'>,
  data: GoogleMapsScrapeJobData,
): Promise<void> {
  await queue.add(GOOGLE_MAPS_SCRAPE_QUEUE, data, {
    jobId: `${data.teamId}:${Date.now()}`,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
  });
}
```

- [ ] **Step 2: Register the queue in `backend/src/start.ts`**

Follow the same pattern as existing queues.

```ts
const googleMapsScrapeQueue = redisClient
  ? new Queue<GoogleMapsScrapeJobData>(GOOGLE_MAPS_SCRAPE_QUEUE, { connection: redisClient })
  : {
      add: async () => {
        throw new Error('google_maps_scrape_queue_unavailable_in_development');
      },
    };
```

Pass `googleMapsScrapeQueue` through the existing dependency wiring into API/server route registration.

- [ ] **Step 3: Register the worker in `backend/src/worker.ts`**

Follow the existing worker style and keep the ingestion adapter local to `worker.ts`.

```ts
const googleMapsScrapeWorker = createGoogleMapsScrapeWorker(redisConnection, {
  ingestNormalizedLeads: async (teamId, leads) => {
    return ingestNormalizedLeadsForTeam(teamId, leads);
  },
});

googleMapsScrapeWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, result }, 'google maps scrape completed');
});

googleMapsScrapeWorker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, error }, 'google maps scrape failed');
});

shutdownTasks.push(() => googleMapsScrapeWorker.close());
```

- [ ] **Step 4: Reuse the existing lead pipeline instead of inventing a new one**

Inside `backend/src/worker.ts`, implement `ingestNormalizedLeadsForTeam(teamId, leads)` by reusing the same dedup/scoring persistence services that the current scan flow already uses.

```ts
async function ingestNormalizedLeadsForTeam(teamId: string, leads: NormalizedLead[]) {
  let created = 0;
  let duplicates = 0;

  await db.withTransaction(async (tx) => {
    for (const lead of leads) {
      const result = await deduplicationService.ingest(tx, lead);
      if (result.kind === 'created') {
        created += 1;
      } else {
        duplicates += 1;
      }
    }
  });

  return { created, duplicates };
}
```

Use the real transaction helper and scoring services already present in the file.

- [ ] **Step 5: Build the backend again**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm run build
```

Expected: Build passes.

- [ ] **Step 6: Commit the queue and worker**

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator" && git add backend/src/scraping/google-maps-scrape-worker.ts backend/src/start.ts backend/src/worker.ts && git commit -m "feat: add Google Maps scrape worker"
```

---

### Task 3: Add the manual scrape endpoint

**Files:**
- Create: `backend/src/api/routes/scrape.routes.ts`
- Modify: `backend/src/api/server.ts`

- [ ] **Step 1: Add the smallest route that queues a scrape job**

Create `backend/src/api/routes/scrape.routes.ts`.

```ts
import type { FastifyInstance } from 'fastify';
import { enqueueGoogleMapsScrape, type GoogleMapsScrapeJobData } from '../../scraping/google-maps-scrape-worker';

type ScrapeRoutesDeps = {
  scrapeQueue: { add: (name: string, data: GoogleMapsScrapeJobData, opts?: unknown) => Promise<unknown> };
};

export async function registerScrapeRoutes(app: FastifyInstance, deps: ScrapeRoutesDeps): Promise<void> {
  app.post('/api/teams/:teamId/scrape', async (request, reply) => {
    const { teamId } = request.params as { teamId: string };
    const body = request.body as { keyword?: string; location?: string; actorId?: string };

    const keyword = body.keyword?.trim();
    const location = body.location?.trim();

    if (!keyword) {
      return reply.status(400).send({ error: 'invalid_keyword' });
    }

    await enqueueGoogleMapsScrape(deps.scrapeQueue, {
      teamId,
      keyword,
      location: location || undefined,
      actorId: body.actorId?.trim() || 'manual-user',
    });

    return reply.status(202).send({ status: 'queued' });
  });
}
```

- [ ] **Step 2: Register the route in `backend/src/api/server.ts`**

Use the existing route registration style.

```ts
await registerScrapeRoutes(app, {
  scrapeQueue: deps.googleMapsScrapeQueue,
});
```

- [ ] **Step 3: Add one quick route test or inject smoke check**

If the backend already has route tests nearby, add one route test that asserts `202` on valid payload. If not, do a Fastify inject smoke script locally.

```ts
const response = await app.inject({
  method: 'POST',
  url: '/api/teams/team-1/scrape',
  payload: { keyword: 'cafe', location: 'Bandung' },
});
expect(response.statusCode).toBe(202);
```

- [ ] **Step 4: Build the backend**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm run build
```

Expected: Build passes.

- [ ] **Step 5: Commit the route**

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator" && git add backend/src/api/routes/scrape.routes.ts backend/src/api/server.ts && git commit -m "feat: add manual scrape route"
```

---

### Task 4: Add the smallest connectors-page trigger

**Files:**
- Modify: `frontend/src/app/dashboard/connectors/page.tsx`

- [ ] **Step 1: Add the minimum UI state and trigger**

Inside `frontend/src/app/dashboard/connectors/page.tsx`, add:
- one button: `Scrape Sekarang`
- one small modal or inline panel with `keyword` and `location`
- one mutation that `POST`s to `/api/teams/${teamId}/scrape`

```tsx
const [scrapeOpen, setScrapeOpen] = useState(false);
const [keyword, setKeyword] = useState('');
const [location, setLocation] = useState('');

const scrapeMutation = useMutation({
  mutationFn: async () => {
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
    setScrapeOpen(false);
    setKeyword('');
    setLocation('');
  },
});
```

- [ ] **Step 2: Render the simplest usable UI**

Use existing buttons/cards/dialog patterns from the page if present. If not, keep it inline and boring.

```tsx
<Button onClick={() => setScrapeOpen((value) => !value)}>Scrape Sekarang</Button>

{scrapeOpen ? (
  <Card className="mt-4 p-4">
    <div className="space-y-3">
      <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Keyword" />
      <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lokasi" />
      <div className="flex gap-2">
        <Button onClick={() => scrapeMutation.mutate()} disabled={!keyword.trim() || scrapeMutation.isPending}>
          {scrapeMutation.isPending ? 'Memulai...' : 'Mulai Scrape'}
        </Button>
        <Button variant="secondary" onClick={() => setScrapeOpen(false)}>Batal</Button>
      </div>
    </div>
  </Card>
) : null}
```

- [ ] **Step 3: Verify the frontend builds**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/frontend" && npm run build
```

Expected: Build passes.

- [ ] **Step 4: Commit the UI**

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator" && git add frontend/src/app/dashboard/connectors/page.tsx && git commit -m "feat: add connectors scrape trigger"
```

---

### Task 5: Manual end-to-end verification that it actually scrapes

**Files:**
- Modify only if bugs are found during verification

- [ ] **Step 1: Start the backend dependencies and processes**

Run the real project commands for:

```bash
Redis
Postgres
backend API
backend worker
frontend app
```

Use the repo’s existing start commands instead of inventing new ones.

- [ ] **Step 2: Trigger a real scrape from the UI**

Manual checklist:

```md
1. Open /dashboard/connectors
2. Click Scrape Sekarang
3. Enter keyword = cafe
4. Enter location = Bandung
5. Submit
6. Confirm API returns queued response
7. Confirm worker logs show Google Maps scrape job started
8. Confirm worker logs show created/duplicates result
```

- [ ] **Step 3: Confirm data reaches leads**

Manual checklist:

```md
1. Open /dashboard/leads
2. Confirm at least one new lead appears, or confirm duplicate handling if the business already exists
3. Confirm source on the lead is the new scraping source or is traceable through current source display
```

- [ ] **Step 4: Fix only the blocking defects found**

Examples of acceptable fixes in this phase:
- wrong selector in Playwright extraction
- route wiring mistake
- queue dependency not passed through `start.ts`
- normalization field mismatch

Do not expand scope into retries, scheduling, proxies, or captcha handling here.

- [ ] **Step 5: Re-run backend and frontend builds after fixes**

Run:

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator/backend" && npm run build
cd "/Users/luthfierlambang/Documents/Leads Generator/frontend" && npm run build
```

Expected: Both builds pass.

- [ ] **Step 6: Commit the verification fixes**

```bash
cd "/Users/luthfierlambang/Documents/Leads Generator" && git add -A && git commit -m "fix: make manual Google Maps scraping flow work end to end"
```

---

## Self-Review

### Spec coverage
- Manual connectors-page user flow is covered.
- Real scraping logic exists in Task 1 instead of a stub.
- Queue + worker flow is covered.
- Existing normalize → dedup → persist reuse is covered.
- End-to-end manual verification is explicit.

### Placeholder scan
- No TODO/TBD placeholders remain.
- Where repo-specific names may differ (`db.withTransaction`, exact route registration variable names), the plan explicitly says to reuse the real names already present in the target files.

### Type consistency
- Shared names are consistent across tasks: `GoogleMapsHeadlessConnector`, `GOOGLE_MAPS_SCRAPE_QUEUE`, `GoogleMapsScrapeJobData`, `processGoogleMapsScrapeJob`, and `registerScrapeRoutes`.
- Route payload stays `{ keyword, location, actorId? }`.
- Worker payload stays `{ teamId, keyword, location?, actorId }`.
