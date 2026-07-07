# Sprint 4 Integration Test Plan

**Date:** 2026-06-15  
**Sprint:** Sprint 4 - Integration Verification  
**Status:** 📋 Ready for Execution

---

## 🎯 Test Objectives

Verify that the refactored `sdui-carousel-worker.ts` correctly integrates with all external dependencies:
- Satori renderer (PNG generation)
- Sharp (image processing)
- BullMQ + Redis (job queue)
- BackgroundImageClient (AI image generation)
- ObjectStorage (S3/GCS uploads)
- PostgreSQL (job/slide persistence)
- AI Planner (LLM calls)

---

## 🧪 Test Levels

### Level 1: Build & Type Verification ✅ **[PRIORITY]**
Verify TypeScript compilation and import resolution.

**Tests:**
1. Full TypeScript build without errors
2. No missing imports
3. No type mismatches with external deps
4. Verify all `@leads-generator/shared` types match

**Command:**
```bash
npm run build
```

**Expected:**
- ✅ Zero TypeScript errors
- ✅ Zero import resolution errors
- ✅ Clean build output

---

### Level 2: Dependency Interface Verification ✅ **[PRIORITY]**
Check that refactored code matches external dependency interfaces.

#### 2.1 Satori Renderer
**Interface:** `SatoriRenderer.renderSlide(slide, doc, fonts)`

**Verification:**
- ✅ `renderAndUploadSlides()` calls `renderer.renderSlide()` with correct signature
- ✅ `SduiDocument` structure matches Satori expectations
- ✅ `BrandFontRef[]` format is correct
- ✅ Slide component types are renderable

**Test files:**
- `render-phase-handler.ts` L72
- `sdui-carousel-worker.ts` L318-320

#### 2.2 Sharp (Image Processing)
**Interface:** `sharp(buffer).resize(...).png().toBuffer()`

**Verification:**
- ✅ `ImageUtils.normalize()` uses Sharp API correctly
- ✅ Aspect ratio calculations match Sharp expectations
- ✅ PNG output format is correct

**Test files:**
- `image-utils.ts` L85-107

#### 2.3 BullMQ Worker
**Interface:** `Worker<ContentGenerationJobPayload>`

**Verification:**
- ✅ `createSduiCarouselWorker()` returns valid BullMQ worker
- ✅ Job payload type matches queue expectations
- ✅ Redis connection options are correct
- ✅ Worker concurrency settings preserved

**Test files:**
- `sdui-carousel-worker.ts` L359-397

#### 2.4 Background Image Client
**Interface:** `imageClient.generate(teamId, request, signal)`

**Verification:**
- ✅ `generateSlideImages()` calls `imageClient.generate()` with correct args
- ✅ `BackgroundRequest` structure is correct
- ✅ Error handling for provider failures works
- ✅ AbortSignal propagation is correct

**Test files:**
- `image-generation-handler.ts` L102

#### 2.5 Object Storage
**Interface:** `storage.upload(teamId, path, buffer, contentType)`

**Verification:**
- ✅ `renderAndUploadSlides()` calls `storage.upload()` correctly
- ✅ Upload path format is correct
- ✅ Content type is 'image/png'
- ✅ Error handling for upload failures works

**Test files:**
- `render-phase-handler.ts` L87-93

#### 2.6 Repository Interfaces
**Interfaces:**
- `ContentGenerationJobRepository`
- `ContentGenerationSlideRepository`
- `MasterTemplateRepository`
- `BrandKitRepository`

**Verification:**
- ✅ All repo method calls use correct signatures
- ✅ `findById()`, `setStatus()`, `updateInputs()` calls are correct
- ✅ `insertSlide()`, `updateSlide()` calls are correct
- ✅ Transaction handling (if any) is preserved

**Test files:**
- `sdui-carousel-worker.ts` L78, L104, L111
- `render-phase-handler.ts` L60, L76, L99, L108, L139
- `pipeline-error-handler.ts` L23, L30

#### 2.7 AI Planner
**Interface:** `planner.plan(request, signal)`

**Verification:**
- ✅ `acquireInitialSlides()` calls `planner.plan()` correctly
- ✅ `SlideRepair.repairSlidesForQuality()` passes correct feedback
- ✅ `repairFailedOptionalImages()` uses correct repair mode
- ✅ Error handling for planner failures works

**Test files:**
- `slide-acquisition.ts` L42-58
- `slide-repair.ts` L149-171, L220-240

---

### Level 3: Mock Integration Tests ✅ **[CURRENT]**
Run existing test suite with mocked dependencies.

**Test Suite:** `sdui-carousel-worker.test.ts`

**Command:**
```bash
npm test -- sdui-carousel-worker.test.ts --run
```

**Expected:**
- ✅ 17/17 tests passing *(already verified)*
- ✅ All pipeline phases execute correctly
- ✅ Error paths work as expected

**Status:** ✅ **PASSED** (verified 2026-06-15)

---

### Level 4: Local Integration Tests 🟡 **[RECOMMENDED]**
Test with real local dependencies (Docker).

#### 4.1 Setup Local Environment
```bash
# Start dependencies
docker-compose up -d postgres redis

# Run migrations
npm run db:migrate

# Seed test data
npm run db:seed:test
```

#### 4.2 Test Scenarios

**Scenario 1: Text-Only Job (Happy Path)**
```typescript
const job = await jobRepo.create({
  teamId: 'test-team',
  prompt: 'Create a 5-slide carousel about AI benefits',
  aspectRatio: '1:1',
  inputs: { requestedSlideCount: 5 }
});

// Trigger worker
await processSduiCarouselJob(deps, { jobId: job.id, teamId: job.teamId });

// Verify
const result = await jobRepo.findById(job.teamId, job.id);
expect(result.status).toBe('success');
expect(result.slides).toHaveLength(5);
```

**Expected:**
- ✅ Job status = 'success'
- ✅ 5 slides generated
- ✅ All slides have imageUrl (uploaded to storage)
- ✅ Theme applied from brand kit
- ✅ Text guardrails enforced

---

**Scenario 2: Image-Aware Job**
```typescript
const job = await jobRepo.create({
  teamId: 'test-team',
  prompt: 'Create a visual-led carousel with product images',
  aspectRatio: '9:16',
  inputs: { requestedSlideCount: 5 }
});

await processSduiCarouselJob(deps, { jobId: job.id, teamId: job.teamId });

const result = await jobRepo.findById(job.teamId, job.id);
expect(result.status).toBe('success');
expect(result.slides.some(s => s.image_status === 'generated')).toBe(true);
```

**Expected:**
- ✅ At least 1 slide has `image_status: 'generated'`
- ✅ Generated images are uploaded to storage
- ✅ Image generation retry logic works
- ✅ Optional image repair fallback works

---

**Scenario 3: Planner Failure (Fallback Path)**
```typescript
// Mock planner to fail
const failingPlanner = {
  plan: async () => ({ ok: false, error: { kind: 'provider_error' } })
};

const deps = { ...realDeps, planner: failingPlanner };
await processSduiCarouselJob(deps, { jobId: job.id, teamId: job.teamId });

const result = await jobRepo.findById(job.teamId, job.id);
expect(result.status).toBe('success'); // Fallback deck should succeed
expect(result.inputs.plannerFallbackUsed).toBe(true);
```

**Expected:**
- ✅ Worker uses fallback deck
- ✅ Job still succeeds
- ✅ `plannerFallbackUsed: true` in inputs

---

**Scenario 4: Required Image Failure (Job Fails)**
```typescript
// Mock image client to always fail
const failingImageClient = {
  generate: async () => ({ ok: false, error: 'provider_error' })
};

const deps = { ...realDeps, imageClient: failingImageClient };
await processSduiCarouselJob(deps, { jobId: job.id, teamId: job.teamId });

const result = await jobRepo.findById(job.teamId, job.id);
expect(result.status).toBe('failed');
expect(result.failureReason).toBe('provider_error');
```

**Expected:**
- ✅ Job status = 'failed'
- ✅ Failure reason = 'provider_error'
- ✅ Slide rows marked as failed

---

**Scenario 5: Upload Failure (Job Fails)**
```typescript
// Mock storage to fail upload
const failingStorage = {
  upload: async () => ({ ok: false })
};

const deps = { ...realDeps, storage: failingStorage };
await processSduiCarouselJob(deps, { jobId: job.id, teamId: job.teamId });

const result = await jobRepo.findById(job.teamId, job.id);
expect(result.status).toBe('failed');
expect(result.failureReason).toBe('upload_failed');
```

**Expected:**
- ✅ Job status = 'failed'
- ✅ Failure reason = 'upload_failed'
- ✅ First slide fails → job fails (fail-fast)

---

### Level 5: Staging Environment Tests 🟡 **[PRE-PRODUCTION]**
Full end-to-end test in staging environment.

#### 5.1 Deployment
```bash
# Deploy to staging
npm run deploy:staging

# Verify worker is running
kubectl get pods -n staging | grep carousel-worker
```

#### 5.2 Smoke Tests

**Test 1: Submit Real Job via API**
```bash
curl -X POST https://staging.api.example.com/v1/content/generate \
  -H "Authorization: Bearer $STAGING_TOKEN" \
  -d '{
    "teamId": "staging-team-1",
    "prompt": "Create 5 slides about AI marketing tools",
    "aspectRatio": "1:1"
  }'
```

**Verify:**
- ✅ Job queued successfully
- ✅ Worker picks up job within 5 seconds
- ✅ Job completes within 60 seconds
- ✅ All slides rendered and uploaded
- ✅ No errors in worker logs

---

**Test 2: Monitor Worker Metrics**
```bash
# Check worker logs
kubectl logs -f deployment/carousel-worker -n staging

# Check Redis queue depth
redis-cli -h staging-redis LLEN bull:content-generation:wait

# Check database for job status
psql -h staging-db -d leads_generator -c "
  SELECT status, COUNT(*) 
  FROM content_generation_jobs 
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY status;
"
```

**Expected:**
- ✅ No error logs in worker
- ✅ Queue depth returns to 0
- ✅ All jobs have status 'success' or 'failed' (no stuck jobs)

---

**Test 3: Load Test (Optional)**
```bash
# Submit 100 concurrent jobs
for i in {1..100}; do
  curl -X POST https://staging.api.example.com/v1/content/generate \
    -H "Authorization: Bearer $STAGING_TOKEN" \
    -d "{\"teamId\": \"staging-team-1\", \"prompt\": \"Test job $i\"}" &
done
wait

# Monitor completion
watch "psql -h staging-db -d leads_generator -c 'SELECT status, COUNT(*) FROM content_generation_jobs WHERE created_at > NOW() - INTERVAL \"5 minutes\" GROUP BY status;'"
```

**Expected:**
- ✅ All 100 jobs complete within 10 minutes
- ✅ Success rate > 95%
- ✅ No worker crashes
- ✅ Memory usage stable

---

### Level 6: Production Canary Test 🔴 **[PRODUCTION]**
Deploy to 10% of production workers first.

#### 6.1 Canary Deployment
```bash
# Deploy to 10% of workers
kubectl set image deployment/carousel-worker \
  carousel-worker=registry.example.com/carousel-worker:sprint-4 \
  -n production \
  --record

kubectl scale deployment/carousel-worker --replicas=10 -n production
kubectl scale deployment/carousel-worker-old --replicas=90 -n production
```

#### 6.2 Monitor Canary Metrics (2 hours)
```bash
# Error rate comparison
datadog query "sum:worker.error.count{env:production,version:sprint-4}.as_count()"
datadog query "sum:worker.error.count{env:production,version:old}.as_count()"

# Response time comparison
datadog query "avg:worker.job.duration{env:production,version:sprint-4}"
datadog query "avg:worker.job.duration{env:production,version:old}"

# Memory usage comparison
datadog query "avg:worker.memory.usage{env:production,version:sprint-4}"
datadog query "avg:worker.memory.usage{env:production,version:old}"
```

**Success Criteria:**
- ✅ Error rate ≤ old version
- ✅ Response time ≤ 105% of old version
- ✅ Memory usage ≤ old version
- ✅ No crashes in 2 hours

**If canary fails:**
```bash
# Immediate rollback
kubectl rollout undo deployment/carousel-worker -n production
```

#### 6.3 Full Production Rollout
If canary succeeds after 2 hours:
```bash
# Scale up new version
kubectl scale deployment/carousel-worker --replicas=100 -n production
kubectl scale deployment/carousel-worker-old --replicas=0 -n production

# Monitor for 24 hours
# After 24 hours: delete old deployment
```

---

## 📊 Test Checklist

### Pre-Deployment Verification
- [ ] **Level 1:** TypeScript build passes
- [ ] **Level 2:** All dependency interfaces verified
- [ ] **Level 3:** Mock integration tests pass (17/17) ✅
- [ ] **Level 4:** Local integration tests pass
- [ ] **Level 5:** Staging smoke tests pass

### Staging Verification (48 hours)
- [ ] Job success rate > 95%
- [ ] No worker crashes
- [ ] Memory usage stable
- [ ] Response time < 60s P95
- [ ] Error logs reviewed

### Production Verification
- [ ] **Canary (2 hours):** Metrics match or better than old version
- [ ] **Full rollout (24 hours):** No regressions detected
- [ ] **Week 1:** Monitor daily, ready for rollback
- [ ] **Post-deployment retrospective:** Document learnings

---

## 🚨 Rollback Triggers

### Immediate Rollback (< 5 minutes)
- Worker crashes continuously
- Error rate > 200% of baseline
- Critical data corruption detected

### Fast Rollback (< 1 hour)
- Error rate increase > 50%
- Response time increase > 50%
- Memory leak detected

### Planned Rollback (< 4 hours)
- Error rate increase > 20%
- Response time increase > 20%
- Subtle bugs affecting user experience

---

## 📝 Test Execution Log

| Test Level | Status | Date | Notes |
|------------|--------|------|-------|
| Level 1: Build | ✅ Pass | 2026-06-16 | Zero TypeScript errors |
| Level 2: Interface | ✅ Pass | 2026-06-16 | All dependency interfaces verified |
| Level 3: Mock Tests | ✅ Pass | 2026-06-15 | 17/17 tests passing |
| Level 4: Local Integration | ⏳ Pending | - | - |
| Level 5: Staging | ⏳ Pending | - | - |
| Level 6: Production Canary | ⏳ Pending | - | - |
| Level 6: Full Production | ⏳ Pending | - | - |

---

## 👥 Sign-off

- [ ] **Developer** - Local integration tests passed
- [ ] **QA** - Staging tests passed
- [ ] **Tech Lead** - Approved for canary deployment
- [ ] **DevOps** - Canary metrics look good
- [ ] **Tech Lead** - Approved for full production rollout

---

**Document Owner:** Development Team  
**Last Updated:** 2026-06-15 23:22 UTC  
**Status:** 📋 Ready for Execution
