# Staging Render Smoke Test Checklist

**Date:** 2026-06-16  
**Scope:** `sdui-carousel-worker.ts` staging validation  
**Status:** 📋 Ready for Execution

---

## 🎯 Goal

Validate that the refactored SDUI carousel render pipeline works end-to-end in staging with real infrastructure dependencies:
- BullMQ + Redis queue pickup
- Worker job orchestration
- Satori render path
- Sharp image processing
- Object storage upload
- PostgreSQL status and slide persistence

---

## ✅ Preconditions

Before starting, confirm the following:
- Refactor branch is deployed to staging
- Staging API process is running
- Staging worker process is running
- Worker runtime uses the backend worker entrypoint: `npm run worker`
- Staging Redis/BullMQ is reachable
- Staging PostgreSQL is reachable
- Staging object storage credentials are valid
- Required fonts/assets for Satori are available in staging
- Log access is available for both API and worker services
- A valid staging team/workspace and template data exist

---

## 🧪 Smoke Test Flow

### 1. Prepare Test Inputs

Prepare at least these 3 scenarios:

#### Scenario A: Happy Path Render
- Prompt: normal carousel request
- Aspect ratio: supported production value such as `1:1`
- Expected result: full render success

#### Scenario B: Long Content Render
- Prompt: carousel request with longer body text
- Aspect ratio: supported production value such as `4:5` or `9:16`
- Expected result: render still succeeds without layout corruption

#### Scenario C: Controlled Invalid Input
- Prompt or payload with a known invalid or incomplete field
- Expected result: graceful failure, proper status update, and actionable logs

---

### 2. Trigger a Staging Job

Submit a real job through the staging API route used by the application:
- `POST /carousel/generate`
- Requires authenticated session
- Requires team-scoped route context
- Requires RBAC permission `content.generate`

Minimum request body shape:
```json
{
  "prompt": "Create a 5-slide carousel about AI benefits for small businesses",
  "aspectRatio": "1:1"
}
```

Supported aspect ratios confirmed in the code path:
- `1:1`
- `4:5`
- `9:16`

Optional request fields available in the trigger path include:
- `requestedSlideCount`
- `chosenPlan`
- `sduiSlides`
- `workflow`
- `chartData`
- `mockups`
- `typographyOverride`
- `contentTags`
- `conversationContext`

Record these values for every scenario:
- `jobId`
- `teamId`
- trigger timestamp
- input payload snapshot

**Pass criteria:**
- API request returns success
- A valid `jobId` is returned or recorded

---

### 3. Verify Queue Ingestion

Check BullMQ/Redis after trigger.

Implementation details confirmed in the backend:
- Queue name: `content-generation`
- Enqueued BullMQ job name: `generate`
- Payload shape includes: `jobId`, `teamId`, `actorId`
- Queue config sets `attempts: 1`, `removeOnComplete: true`, `removeOnFail: true`

**Verify:**
- Job appears in the `content-generation` queue
- Initial state is `waiting` or equivalent queued state
- No immediate enqueue failure

**Pass criteria:**
- Job is visible in queue
- No Redis or queue serialization errors appear

---

### 4. Verify Worker Pickup

Check worker logs and job state transitions.

Implementation details confirmed in the repo:
- Worker process is started from backend script `npm run worker`
- API creates the content job in `pending` state before enqueue
- Status polling route is `GET /carousel/jobs/:jobId`
- A stale `pending` job older than 240 seconds is treated as orphaned and marked failed on later status reads

**Verify:**
- Worker receives the staging job from the `content-generation` queue
- Job status progresses beyond `pending`
- `GET /carousel/jobs/:jobId` shows active processing or downstream slide progress
- Correct job identifiers appear in logs
- No dependency boot/runtime errors occur before render starts

**Pass criteria:**
- Worker picks up the job without retry loop
- Processing starts within expected staging latency

---

### 5. Verify Render Pipeline Execution

Observe the render path end-to-end.

**Verify:**
- Slide planning/acquisition completes
- SDUI document generation completes
- Satori render executes successfully
- Sharp post-processing succeeds if applied
- No font-loading, asset-loading, or buffer-generation errors occur

**Watch for errors related to:**
- `Satori`
- `Sharp`
- missing fonts
- invalid aspect ratio
- unsupported component/layout data
- out-of-memory or timeout conditions

**Pass criteria:**
- Render phase completes for all expected slides
- No unhandled exceptions occur

---

### 6. Verify Upload to Object Storage

Check that rendered outputs are uploaded.

**Verify:**
- Upload call succeeds
- Output files exist in staging storage
- Returned object keys / URLs are valid
- Content type is correct for generated assets

**Pass criteria:**
- Every expected rendered asset is present in storage
- Generated URLs or object references are retrievable by the system

---

### 7. Verify Database Persistence

Inspect job and slide records in PostgreSQL.

**Verify:**
- Job status becomes `completed` / `success` for valid scenarios
- Failure scenario becomes `failed` with correct reason
- Slide rows are inserted or updated correctly
- Image URLs / object references are persisted
- Metadata matches the produced output

**Pass criteria:**
- DB state matches the actual worker outcome
- No partial silent failure is left behind

---

### 8. Verify Final Render Output

Open and inspect the generated outputs.

**Verify:**
- Image files are viewable
- No blank slides
- No corrupted files
- Slide count matches expectation
- Dimensions align with requested aspect ratio
- Text is legible and not obviously clipped
- Layout is acceptable for staging smoke-test quality

**Pass criteria:**
- Output is visually valid for each successful scenario

---

### 9. Verify Failure Handling

Use Scenario C to confirm operational safety.

**Verify:**
- Job fails in a controlled way
- Error message is actionable
- Failure status is persisted
- Retry behavior matches queue policy
- No poison-job infinite loop occurs

**Pass criteria:**
- Failure path is observable, bounded, and diagnosable

---

## 📋 Execution Checklist

Use this checklist during the run:

- [ ] Staging environment is confirmed healthy
- [ ] Scenario A triggered and `jobId` recorded
- [ ] Scenario A moved from queue to processing
- [ ] Scenario A render completed successfully
- [ ] Scenario A assets uploaded successfully
- [ ] Scenario A DB records verified
- [ ] Scenario A output visually verified
- [ ] Scenario B triggered and `jobId` recorded
- [ ] Scenario B render completed successfully
- [ ] Scenario B output visually verified
- [ ] Scenario C triggered and `jobId` recorded
- [ ] Scenario C failed gracefully as expected
- [ ] Worker logs reviewed for all scenarios
- [ ] No unexpected runtime regressions observed

---

## 🧾 Evidence to Capture

For each scenario, save:
- `jobId`
- trigger request body
- API response for `POST /carousel/generate`
- queue state screenshot or log snippet
- worker log snippet
- API polling response from `GET /carousel/jobs/:jobId`
- final DB status snapshot
- storage object key or output URL
- screenshot of the rendered result

---

## 🚨 Common Failure Signals

If any of these appear, stop and investigate before rollout:
- Worker does not pick up queued jobs
- Job stays stuck in `processing`
- Satori font/resource errors
- Sharp buffer/resize/output errors
- Upload succeeds partially or returns broken URLs
- DB status says success but output is missing
- Repeated retries for the same payload
- Memory spike, timeout, or worker crash

---

## ✅ Exit Criteria

The staging smoke test is considered successful when:
- Happy path render completes end-to-end
- Long-content render completes without obvious layout breakage
- Invalid-input scenario fails safely
- Queue, render, upload, and persistence all behave consistently
- No blocking runtime regressions appear in staging logs

---

## ➡ Recommended Next Action After Pass

If this checklist passes:
1. Monitor staging for a short soak period
2. Prepare canary or limited production rollout
3. Watch logs/metrics during first real jobs in production
