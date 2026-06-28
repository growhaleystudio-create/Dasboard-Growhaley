# Google Maps Headless Scraping Connector — Design Spec

**Date**: 2026-06-28
**Status**: Draft
**Author**: Brainstorming session

---

## Overview

Add a new connector (`google-maps-headless`) that scrapes Google Search Places sidebar using Playwright headless browser. Runs as a BullMQ worker in the existing Node.js worker process. Triggered on-demand from the dashboard connectors page.

---

## User Flow

1. Admin opens `/dashboard/connectors`
2. Clicks "Scrape Sekarang" button
3. Modal opens: fills in keyword (required) + location (optional)
4. Submits → system enqueues job to `google-maps-scrape` BullMQ queue
5. Worker processes: opens Google Search → extracts Places sidebar → normalizes → deduplicates → persists
6. New leads appear in `/dashboard/leads`

---

## Architecture

```
Frontend (UI)
  │ POST /api/teams/:teamId/scrape
  ▼
API Server (start.ts)
  │ enqueue job to 'google-maps-scrape' queue
  ▼
BullMQ Worker (worker.ts)
  │ GoogleMapsScrapeProcessor
  │   ├─ Playwright: opens google.com/search?q=keyword+lokasi
  │   ├─ Parses Places sidebar → RawProspect[]
  │   └─ Calls scan pipeline (normalize → dedup → persist)
  ▼
Database (Postgres)
  │ New leads + audit log
  ▼
Frontend (UI)
  │ Polling / refetch leads
```

---

## Components

### 1. Connector: `GoogleMapsHeadlessConnector`

**File**: `backend/src/connector/google-maps-headless.ts`

Implements `Source_Connector` interface:

| Property/Method | Details |
|---|---|
| `sourceId` | `'google-maps-headless'` |
| `displayName` | `"Google Maps (Headless)"` |
| `usagePolicy` | `{ allowedRetentionDays: 90 }` |
| `checkAvailability()` | Launches headless browser briefly to verify Playwright works |
| `fetch(query, signal)` | Opens `google.com/search?q=keyword+location`, parses Places sidebar, returns `RawProspect[]` |
| `normalize(raw, teamId)` | Delegates to shared `normalizeRawProspect()` |

**Fetch strategy**: Google Search (not Maps directly). Search for `keyword + location`, extract business data from the Places/Knowledge sidebar panel. This is more stable and easier to parse than the full Maps DOM.

**Data extracted per result**:
- `name` — business name from sidebar heading
- `location` — address from sidebar
- `profileUrl` — website link if available
- `publicContact` — phone number if available
- `whatsappNumber` — phone (same field, may be WhatsApp)
- `postSnippet` — rating + review count + category

**Error handling**:
- Playwright launch failure → `checkAvailability()` returns `false`
- Google blocks/detects → retry once with delay, then fail gracefully
- No results found → return empty `[]`
- Timeout (30s per search) → abort via `AbortSignal`

### 2. Queue & Worker: `GoogleMapsScrapeWorker`

**File**: `backend/src/scraping/google-maps-scrape-worker.ts`

**Queue**: `google-maps-scrape`

**Job data**:
```ts
{
  teamId: string;
  keyword: string;
  location?: string;
  triggeredBy: 'manual' | 'scheduled';
  actorId: string;
}
```

**Job options**:
- `jobId`: `${teamId}:${keyword}:${Date.now()}`
- `attempts`: 1
- `removeOnComplete`: true
- `removeOnFail`: true

**Processor flow**:
1. Instantiate `GoogleMapsHeadlessConnector`
2. Call `connector.fetch({ keyword, location }, signal)`
3. Call `connector.normalize(raw, teamId)` for each result
4. Call scan pipeline: dedup → persist (reuse `DeduplicationService.ingest` + `LeadScoringPersister`)
5. Log result: `{ keyword, location, resultsFound, newLeads, duplicates }`

**Concurrency**: 1 (low volume, 1x/day or on-demand)

**Registration in `worker.ts`**:
```ts
const scrapeWorker = createGoogleMapsScrapeWorker({ redis, db, logger });
scrapeWorker.on('completed', ...);
scrapeWorker.on('failed', ...);
shutdownFns.push(() => scrapeWorker.close());
```

### 3. API Endpoint

**Route**: `POST /api/teams/:teamId/scrape`

**File**: `backend/src/api/routes/scrape.routes.ts` (new)

**Request body**:
```json
{
  "keyword": "cafe",
  "location": "Jakarta Selatan"
}
```

**Validation**:
- `keyword`: required, 1–100 chars
- `location`: optional, 0–200 chars

**Response**:
```json
{
  "jobId": "team_123:cafe:1719561600000",
  "status": "queued"
}
```

**RBAC**: `team_member` minimum

**Error responses**:
- `400` — invalid keyword/location
- `409` — another scrape job already running for this team (anti-overlap: check active jobs in queue before enqueuing)
- `503` — scraping unavailable (Playwright not configured or `checkAvailability()` returned false)

### 4. Frontend UI

**File**: `frontend/src/app/dashboard/connectors/page.tsx` (extend existing)

**Changes**:
- Add "Scrape Sekarang" button in the connectors page header
- Modal with:
  - Keyword input (required, text)
  - Location input (optional, text)
  - Submit button
- On submit: `POST /api/teams/:teamId/scrape` → loading state → toast
- Success toast: "Scraping started. Leads will appear shortly."
- Error toast: show error message

**States**:
- Idle: button enabled
- Loading: button disabled + spinner
- Success: toast + reset modal
- Error: toast + keep modal open for retry

---

## Integration Points

### Reuses existing:
- `Source_Connector` interface
- `normalizeRawProspect()` from `backend/src/connector/normalize.ts`
- `DeduplicationService.ingest()` for dedup
- `LeadScoringPersister` for scoring + persist
- BullMQ queue pattern (mirrors `ai-worker.ts`)
- Audit log via existing transaction pattern
- RBAC middleware

### New additions:
- `playwright` npm dependency (backend)
- `GoogleMapsHeadlessConnector` class
- `google-maps-scrape` BullMQ queue + worker
- `POST /api/teams/:teamId/scrape` endpoint
- "Scrape Sekarang" button + modal in connectors page

---

## Dependencies

- **playwright** (~1.45.x) — headless browser automation
- **Chromium** — bundled with Playwright or system-installed

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Google detects bot and blocks | Rotate user-agent, add random delays between actions, use stealth mode |
| Playwright memory usage | Concurrency = 1, browser closes after each job |
| DOM structure changes | Parse by semantic selectors (heading, address tags), not class names. Add monitoring alert if parse fails 3x consecutive |
| Worker crash takes down AI/survey | Concurrency = 1, browser launched per-job and closed, timeout protection |

---

## Out of Scope

- Scheduled/cron scraping (future: add to scan scheduler)
- Proxy rotation (future: if volume increases)
- Captcha solving (future: if Google starts requiring it)
- Multi-page scrolling / pagination (future: if more than top results needed)
- Enrichment of existing leads (future: separate worker)
