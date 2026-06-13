/**
 * Unit tests for ContentGeneratorService (tasks 17.1, 17.2) and
 * checkRequiredData (task 17.3).
 *
 * All dependencies are faked in-memory — no database or Redis required.
 *
 * Tests:
 *   trigger — collects all prereq errors together
 *   trigger — creates job when valid
 *   getJob  — returns JobView
 *   getJob  — returns NOT_FOUND for unknown job
 *   checkRequiredData — returns failing slides
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { Queue } from 'bullmq';

import type {
  ContentPlan,
  ContentPlanBlock,
  ContentPlanSlide,
  ChartData,
  JobView,
  AspectRatio,
} from '@leads-generator/shared';
import type { JobFullRow } from '../repository/content-generation-job-repository.js';
import type { SlideResult } from '../repository/content-generation-slide-repository.js';
import type { MasterTemplate } from '@leads-generator/shared';

import {
  ContentGeneratorService,
  checkRequiredData,
} from './content-generator-service.js';
import type {
  ContentGeneratorServiceDeps,
  GenerateRequest,
  FailingSlide,
} from './content-generator-service.js';

// ---------------------------------------------------------------------------
// Minimal fake implementations
// ---------------------------------------------------------------------------

function makeTemplate(): MasterTemplate {
  return {
    id: 'tmpl-1',
    teamId: 'team-1',
    brandKitId: 'bk-1',
    allowedBlocks: ['heading', 'body'],
    maxSlides: 5,
    textLimits: [],
    aspectRatios: ['1:1'],
    defaultTone: 'professional',
    updatedAt: new Date(),
  };
}

function makeJobRow(overrides: Partial<JobFullRow> = {}): JobFullRow {
  return {
    id: 'job-1',
    teamId: 'team-1',
    masterTemplateId: 'tmpl-1',
    prompt: 'test prompt',
    aspectRatio: '1:1',
    status: 'pending',
    reason: null,
    inputs: {},
    createdAt: new Date(),
    finishedAt: null,
    ...overrides,
  };
}

function makeSlideResult(index: number, overrides: Partial<SlideResult> = {}): SlideResult {
  return {
    jobId: 'job-1',
    index,
    status: 'pending',
    imageUrl: null,
    reason: null,
    usedFallback: false,
    blockComposition: [],
    ...overrides,
  };
}

function makeDeps(options: {
  templateResult?: MasterTemplate | null;
  hasApiKey?: boolean;
  jobInsertResult?: JobFullRow;
  findByIdResult?: JobFullRow | null;
  listSlidesResult?: SlideResult[];
  queueAddRejects?: boolean;
  fallbackProcessor?: ContentGeneratorServiceDeps['fallbackProcessor'];
  allowQueueFallback?: boolean;
} = {}): ContentGeneratorServiceDeps & { queue: Queue<any> } {
  const {
    templateResult = makeTemplate(),
    hasApiKey = true,
    jobInsertResult = makeJobRow(),
    findByIdResult = makeJobRow(),
    listSlidesResult = [],
    queueAddRejects = false,
    fallbackProcessor,
    allowQueueFallback,
  } = options;

  return {
    jobRepo: {
      insert: vi.fn().mockResolvedValue(jobInsertResult),
      findById: vi.fn().mockResolvedValue(findByIdResult),
      listForTeam: vi.fn(),
      setStatus: vi.fn(),
      setFinishedAt: vi.fn(),
    } as any,
    slideRepo: {
      insertSlide: vi.fn(),
      updateSlide: vi.fn(),
      listSlides: vi.fn().mockResolvedValue(listSlidesResult),
    } as any,
    masterTemplateRepo: {
      findByTeam: vi.fn().mockResolvedValue(templateResult),
      upsert: vi.fn(),
    } as any,
    aiSettings: {
      hasApiKey: vi.fn().mockResolvedValue(hasApiKey),
      loadApiKey: vi.fn(),
      setApiKey: vi.fn(),
      clearApiKey: vi.fn(),
      getSettings: vi.fn(),
      setAiEnabled: vi.fn(),
      setCallBudget30d: vi.fn(),
      setAiIntentFactorWeight: vi.fn(),
    } as any,
    queue: {
      add: queueAddRejects
        ? vi.fn().mockRejectedValue(new Error('redis unavailable'))
        : vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue<any>,
    ...(fallbackProcessor ? { fallbackProcessor } : {}),
    ...(allowQueueFallback !== undefined ? { allowQueueFallback } : {}),
  };
}

// ---------------------------------------------------------------------------
// trigger — 17.1
// ---------------------------------------------------------------------------

describe('ContentGeneratorService.trigger', () => {
  const validRequest: GenerateRequest = {
    prompt: 'Buat carousel produk baru',
    aspectRatio: '1:1',
  };

  it('collects validation errors for prompt and API key while allowing missing Master Template', async () => {
    const deps = makeDeps({
      templateResult: null,
      hasApiKey: false,
    });
    const svc = new ContentGeneratorService(deps);

    const result = await svc.trigger('team-1', 'actor-1', {
      ...validRequest,
      prompt: '', // empty prompt
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('should not reach');
    expect(result.error.code).toBe('VALIDATION');
    const error = result.error;
    if (error.code !== 'VALIDATION') throw new Error('expected VALIDATION error');
    expect(error.messages).toHaveLength(2);
    expect(error.messages).toContain('Prompt harus sepanjang 1 sampai 2.000 karakter');
    expect(error.messages).toContain('Kunci API Leads & Suggestion Content wajib dikonfigurasi terlebih dahulu');
  });

  it('returns prompt error when prompt exceeds 2000 characters', async () => {
    const deps = makeDeps();
    const svc = new ContentGeneratorService(deps);

    const result = await svc.trigger('team-1', 'actor-1', {
      ...validRequest,
      prompt: 'a'.repeat(2001),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('should not reach');
    expect(result.error.code).toBe('VALIDATION');
    const error2 = result.error;
    if (error2.code !== 'VALIDATION') throw new Error('expected VALIDATION error');
    expect(error2.messages).toContain('Prompt harus sepanjang 1 sampai 2.000 karakter');
  });

  it('creates a pending job with internal defaults when Master_Template is missing', async () => {
    const deps = makeDeps({ templateResult: null });
    const svc = new ContentGeneratorService(deps);

    const result = await svc.trigger('team-1', 'actor-1', validRequest);

    expect(result.ok).toBe(true);
    expect(deps.jobRepo.insert).toHaveBeenCalledOnce();
    expect(deps.queue.add).toHaveBeenCalledOnce();
    const calls = (deps.jobRepo.insert as ReturnType<typeof vi.fn>).mock.calls;
    const insertCall = calls[0]![0];
    expect(insertCall.masterTemplateId).toBeNull();
    expect(insertCall.inputs.generationRulesSource).toBe('internal_defaults');
  });

  it('returns API key error when Gemini key is not configured', async () => {
    const deps = makeDeps({ hasApiKey: false });
    const svc = new ContentGeneratorService(deps);

    const result = await svc.trigger('team-1', 'actor-1', validRequest);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('should not reach');
    expect(result.error.code).toBe('VALIDATION');
    const error4 = result.error;
    if (error4.code !== 'VALIDATION') throw new Error('expected VALIDATION error');
    expect(error4.messages).toContain('Kunci API Leads & Suggestion Content wajib dikonfigurasi terlebih dahulu');
  });

  it('does NOT create a job when validation errors exist', async () => {
    const deps = makeDeps({ hasApiKey: false });
    const svc = new ContentGeneratorService(deps);

    await svc.trigger('team-1', 'actor-1', validRequest);

    expect(deps.jobRepo.insert).not.toHaveBeenCalled();
    expect(deps.queue.add).not.toHaveBeenCalled();
  });

  it('creates a pending job and enqueues it when all prereqs are met', async () => {
    const deps = makeDeps();
    const svc = new ContentGeneratorService(deps);

    const result = await svc.trigger('team-1', 'actor-1', validRequest);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('should not reach');
    expect(result.value.jobId).toBe('job-1');

    // Verify repo was called with trimmed prompt and correct inputs
    expect(deps.jobRepo.insert).toHaveBeenCalledOnce();
    const calls = (deps.jobRepo.insert as ReturnType<typeof vi.fn>).mock.calls;
    const insertCall = calls[0]![0];
    expect(insertCall.teamId).toBe('team-1');
    expect(insertCall.masterTemplateId).toBe('tmpl-1');
    expect(insertCall.prompt).toBe('Buat carousel produk baru');

    // Verify job was enqueued
    expect(deps.queue.add).toHaveBeenCalledOnce();
    const queueCalls = (deps.queue.add as ReturnType<typeof vi.fn>).mock.calls;
    const queueCall = queueCalls[0]!;
    expect(queueCall[0]).toBe('generate');
    expect(queueCall[1]).toMatchObject({ jobId: 'job-1', teamId: 'team-1', actorId: 'actor-1' });
  });

  it('uses fallback processor when queue enqueue fails and fallback is enabled', async () => {
    const fallbackProcessor = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      queueAddRejects: true,
      fallbackProcessor,
      allowQueueFallback: true,
    });
    const svc = new ContentGeneratorService(deps);

    const result = await svc.trigger('team-1', 'actor-1', validRequest);

    expect(result.ok).toBe(true);
    expect(deps.queue?.add).toHaveBeenCalledOnce();
    expect(fallbackProcessor).toHaveBeenCalledWith({ jobId: 'job-1', teamId: 'team-1', actorId: 'actor-1' });
  });

  it('trims the prompt before saving and validating', async () => {
    const deps = makeDeps();
    const svc = new ContentGeneratorService(deps);

    const result = await svc.trigger('team-1', 'actor-1', {
      ...validRequest,
      prompt: '   hello   ',
    });

    expect(result.ok).toBe(true);
    const trimCalls = (deps.jobRepo.insert as ReturnType<typeof vi.fn>).mock.calls;
    const insertCall = trimCalls[0]![0];
    expect(insertCall.prompt).toBe('hello');
  });

  it('persists chartData, mockups, and images in job inputs', async () => {
    const deps = makeDeps();
    const svc = new ContentGeneratorService(deps);

    const chartData = [{ ref: 'chart-1', data: { kind: 'bar' as const, series: [{ label: 'A', value: 10 }] } }];
    const mockups = [{ ref: 'mockup-1', objectUrl: 'https://cdn.example.com/mockup.png' }];

    await svc.trigger('team-1', 'actor-1', {
      ...validRequest,
      chartData,
      mockups,
    });

    const inputsCalls = (deps.jobRepo.insert as ReturnType<typeof vi.fn>).mock.calls;
    const insertCall = inputsCalls[0]![0];
    expect(insertCall.inputs.chartData).toEqual(chartData);
    expect(insertCall.inputs.mockups).toEqual(mockups);
  });

  it('persists per-job typography override in job inputs', async () => {
    const deps = makeDeps();
    const svc = new ContentGeneratorService(deps);
    const typographyOverride = { coverSizePx: 64, headerSizePx: 64, bodySizePx: 32 };

    await svc.trigger('team-1', 'actor-1', {
      ...validRequest,
      typographyOverride,
    });

    const inputsCalls = (deps.jobRepo.insert as ReturnType<typeof vi.fn>).mock.calls;
    const insertCall = inputsCalls[0]![0];
    expect(insertCall.inputs.typographyOverride).toEqual(typographyOverride);
  });
});

// ---------------------------------------------------------------------------
// getJob — 17.2
// ---------------------------------------------------------------------------

describe('ContentGeneratorService.getJob', () => {
  it('returns JobView with slides when job exists', async () => {
    const slides = [
      makeSlideResult(0, { status: 'success', imageUrl: 'https://cdn.example.com/s0.png', usedFallback: false }),
      makeSlideResult(1, { status: 'failed', reason: 'off_brand', usedFallback: false }),
    ];
    const deps = makeDeps({
      findByIdResult: makeJobRow({ status: 'failed', reason: 'off_brand' }),
      listSlidesResult: slides,
    });
    const svc = new ContentGeneratorService(deps);

    const result = await svc.getJob('team-1', 'job-1');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('should not reach');

    const view: JobView = result.value;
    expect(view.jobId).toBe('job-1');
    expect(view.status).toBe('failed');
    expect(view.reason).toBe('off_brand');
    expect(view.slides).toHaveLength(2);
    expect(view.slides[0]).toMatchObject({
      index: 0,
      status: 'success',
      imageUrl: 'https://cdn.example.com/s0.png',
      usedFallbackLayout: false,
    });
    expect(view.slides[0]!.reason).toBeUndefined();
    expect(view.slides[1]).toMatchObject({
      index: 1,
      status: 'failed',
      reason: 'off_brand',
      usedFallbackLayout: false,
    });
  });

  it('returns JobView with empty slides array when no slides yet', async () => {
    const deps = makeDeps({ listSlidesResult: [] });
    const svc = new ContentGeneratorService(deps);

    const result = await svc.getJob('team-1', 'job-1');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('should not reach');
    expect(result.value.slides).toHaveLength(0);
  });

  it('returns NOT_FOUND when job does not exist for the team', async () => {
    const deps = makeDeps({ findByIdResult: null });
    const svc = new ContentGeneratorService(deps);

    const result = await svc.getJob('team-1', 'nonexistent-job');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('should not reach');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('maps usedFallback from slide repo to usedFallbackLayout in JobView', async () => {
    const slides = [makeSlideResult(0, { usedFallback: true })];
    const deps = makeDeps({ listSlidesResult: slides });
    const svc = new ContentGeneratorService(deps);

    const result = await svc.getJob('team-1', 'job-1');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('should not reach');
    expect(result.value.slides[0]!.usedFallbackLayout).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkRequiredData — 17.3
// ---------------------------------------------------------------------------

describe('checkRequiredData', () => {
  const baseAspectRatio: AspectRatio = '1:1';

  it('returns empty array when all chart and mockup refs are provided', () => {
    const plan: ContentPlan = {
      aspectRatio: baseAspectRatio,
      slides: [
        {
          index: 0,
          blocks: [
            { type: 'chart', chartDataRef: 'chart-1' },
            { type: 'mockup', mockupRef: 'mock-1' },
          ],
        },
      ],
    };

    const result = checkRequiredData(plan, {
      chartData: [{ ref: 'chart-1', data: { kind: 'bar', series: [] } }],
      mockups: [{ ref: 'mock-1', objectUrl: 'https://cdn.example.com/m.png' }],
    });

    expect(result).toHaveLength(0);
  });

  it('returns failing slide when chart block has missing chartDataRef', () => {
    const plan: ContentPlan = {
      aspectRatio: baseAspectRatio,
      slides: [{ index: 0, blocks: [{ type: 'chart', chartDataRef: 'chart-missing' }] }],
    };

    const result = checkRequiredData(plan, { chartData: [] });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ slideIndex: 0, reason: 'missing_chart_data' });
  });

  it('returns failing slide when mockup block has missing mockupRef', () => {
    const plan: ContentPlan = {
      aspectRatio: baseAspectRatio,
      slides: [{ index: 2, blocks: [{ type: 'mockup', mockupRef: 'mock-missing' }] }],
    };

    const result = checkRequiredData(plan, { mockups: [] });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ slideIndex: 2, reason: 'missing_mockup' });
  });

  it('returns missing_chart_data when chart block has no chartDataRef at all', () => {
    const plan: ContentPlan = {
      aspectRatio: baseAspectRatio,
      slides: [{ index: 0, blocks: [{ type: 'chart' }] }],
    };

    const result = checkRequiredData(plan, {
      chartData: [{ ref: 'chart-1', data: { kind: 'bar', series: [] } }],
    });

    expect(result[0]?.reason).toBe('missing_chart_data');
  });

  it('reports each failing slide independently across multiple slides', () => {
    const plan: ContentPlan = {
      aspectRatio: baseAspectRatio,
      slides: [
        { index: 0, blocks: [{ type: 'heading', text: 'OK slide' }] },
        { index: 1, blocks: [{ type: 'chart', chartDataRef: 'missing-chart' }] },
        { index: 2, blocks: [{ type: 'mockup', mockupRef: 'missing-mock' }] },
        { index: 3, blocks: [{ type: 'body', text: 'another OK slide' }] },
      ],
    };

    const result = checkRequiredData(plan, {
      chartData: [],
      mockups: [],
    });

    expect(result).toHaveLength(2);
    expect(result.find((f) => f.slideIndex === 1)?.reason).toBe('missing_chart_data');
    expect(result.find((f) => f.slideIndex === 2)?.reason).toBe('missing_mockup');
  });

  it('prioritizes missing_chart_data over missing_mockup within the same slide', () => {
    // chart block comes first in the slide — should give missing_chart_data
    const plan: ContentPlan = {
      aspectRatio: baseAspectRatio,
      slides: [
        {
          index: 0,
          blocks: [
            { type: 'chart', chartDataRef: 'missing-chart' },
            { type: 'mockup', mockupRef: 'missing-mock' },
          ],
        },
      ],
    };

    const result = checkRequiredData(plan, { chartData: [], mockups: [] });

    expect(result).toHaveLength(1);
    expect(result[0]?.reason).toBe('missing_chart_data');
  });

  it('returns empty array for plan with no chart or mockup blocks', () => {
    const plan: ContentPlan = {
      aspectRatio: baseAspectRatio,
      slides: [
        { index: 0, blocks: [{ type: 'heading', text: 'Hello' }, { type: 'body', text: 'World' }] },
      ],
    };

    const result = checkRequiredData(plan, {});

    expect(result).toHaveLength(0);
  });

  it('returns empty array for an empty plan', () => {
    const plan: ContentPlan = { aspectRatio: baseAspectRatio, slides: [] };
    const result = checkRequiredData(plan, {});
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

/**
 * Generates a prompt whose trimmed length is within the valid 1..2000 range.
 * Upper bound is automatic (trim never grows the string); the filter only
 * rejects whitespace-only inputs.
 */
const validPromptArb = fc
  .string({ minLength: 1, maxLength: 2000 })
  .filter((s) => s.trim().length >= 1);

// ---------------------------------------------------------------------------
// Property 6 — 17.4
// ---------------------------------------------------------------------------

describe('ContentGeneratorService.trigger — Property 6: Pemicuan bersifat asinkron tanpa panggilan AI inline', () => {
  // Feature: ai-content-carousel-generator, Property 6: Pemicuan bersifat asinkron tanpa panggilan AI inline
  // **Validates: Requirements 3.1, 10.1**

  it('creates a pending job, enqueues it exactly once, and never invokes Planner/Renderer/AI on the request path', async () => {
    await fc.assert(
      fc.asyncProperty(
        validPromptArb,
        fc.constantFrom<AspectRatio>('1:1', '4:5', '9:16'),
        fc.string({ minLength: 1, maxLength: 12 }),
        async (prompt, aspectRatio, idSuffix) => {
          const jobId = `job-${idSuffix}`;

          // Standalone spies representing the deferred pipeline stages. These
          // are intentionally NOT wired into the service deps — the AI work is
          // handed off to the BullMQ worker — so the request path must never
          // touch them (R3.1, R10.1).
          const plannerSpy = vi.fn();
          const rendererSpy = vi.fn();
          const aiProviderSpy = vi.fn();

          const deps = makeDeps({
            jobInsertResult: makeJobRow({ id: jobId, status: 'pending', prompt: prompt.trim() }),
          });
          const svc = new ContentGeneratorService(deps);

          const result = await svc.trigger('team-1', 'actor-1', { prompt, aspectRatio });

          // Returns a jobId synchronously, without awaiting Planner/Renderer.
          expect(result.ok).toBe(true);
          if (!result.ok) throw new Error('expected ok result');
          expect(result.value.jobId).toBe(jobId);

          // A pending job row was created exactly once.
          expect(deps.jobRepo.insert).toHaveBeenCalledOnce();

          // Enqueued exactly once with the newly created job id.
          expect(deps.queue.add).toHaveBeenCalledOnce();
          const addCall = (deps.queue.add as ReturnType<typeof vi.fn>).mock.calls[0]!;
          expect(addCall[1]).toMatchObject({ jobId, teamId: 'team-1', actorId: 'actor-1' });

          // No slide rendering / AI work happened inline on the HTTP path.
          expect(deps.slideRepo.insertSlide).not.toHaveBeenCalled();
          expect(deps.slideRepo.updateSlide).not.toHaveBeenCalled();
          expect(plannerSpy).not.toHaveBeenCalled();
          expect(rendererSpy).not.toHaveBeenCalled();
          expect(aiProviderSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7 — 17.5
// ---------------------------------------------------------------------------

describe('ContentGeneratorService.trigger — Property 7: Agregasi validasi prasyarat pemicuan', () => {
  // Feature: ai-content-carousel-generator, Property 7: Agregasi validasi prasyarat pemicuan
  // **Validates: Requirements 3.6, 3.7, 3.8, 13.5, 13.6**

  const PROMPT_ERR = 'Prompt harus sepanjang 1 sampai 2.000 karakter';
  const APIKEY_ERR = 'Kunci API Leads & Suggestion Content wajib dikonfigurasi terlebih dahulu';

  // A prompt whose trimmed length is OUTSIDE 1..2000 (empty, whitespace-only,
  // or longer than 2000 characters).
  const invalidPromptArb = fc.oneof(
    fc.constant(''),
    fc.string({ minLength: 1, maxLength: 10 }).map((s) => s.replace(/\S/g, ' ')),
    fc.integer({ min: 2001, max: 2200 }).map((n) => 'a'.repeat(n)),
  );

  it('creates+enqueues a job iff all prereqs hold, else returns exactly the active-violation messages and creates no job', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // promptValid
        fc.boolean(), // masterPresent
        fc.boolean(), // apiKeyConfigured
        validPromptArb,
        invalidPromptArb,
        async (promptValid, masterPresent, apiKeyConfigured, validPrompt, invalidPrompt) => {
          const prompt = promptValid ? validPrompt : invalidPrompt;

          const deps = makeDeps({
            templateResult: masterPresent ? makeTemplate() : null,
            hasApiKey: apiKeyConfigured,
          });
          const svc = new ContentGeneratorService(deps);

          const result = await svc.trigger('team-1', 'actor-1', { prompt, aspectRatio: '1:1' });

          // Exactly the set of messages for the active violations — no more,
          // no less. Master Template absence is not a violation during the
          // dynamic composer refactor; generation uses internal defaults.
          const expected: string[] = [];
          if (!promptValid) expected.push(PROMPT_ERR);
          if (!apiKeyConfigured) expected.push(APIKEY_ERR);

          const allSatisfied = promptValid && apiKeyConfigured;

          if (allSatisfied) {
            // IFF all prereqs hold → job created + enqueued.
            expect(result.ok).toBe(true);
            expect(deps.jobRepo.insert).toHaveBeenCalledOnce();
            expect(deps.queue.add).toHaveBeenCalledOnce();
            const insertCall = (deps.jobRepo.insert as ReturnType<typeof vi.fn>).mock.calls[0]![0];
            expect(insertCall.masterTemplateId).toBe(masterPresent ? 'tmpl-1' : null);
            expect(insertCall.inputs.generationRulesSource).toBe(masterPresent ? 'master_template' : 'internal_defaults');
          } else {
            // Any violation → no job, no enqueue, exact violation message set.
            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected err result');
            const error = result.error;
            expect(error.code).toBe('VALIDATION');
            if (error.code !== 'VALIDATION') throw new Error('expected VALIDATION error');
            expect([...error.messages].sort()).toEqual([...expected].sort());

            expect(deps.jobRepo.insert).not.toHaveBeenCalled();
            expect(deps.queue.add).not.toHaveBeenCalled();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18 — 17.6
// ---------------------------------------------------------------------------

describe('checkRequiredData — Property 18: Precheck data chart/mockup yang hilang', () => {
  // Feature: ai-content-carousel-generator, Property 18: Precheck data chart/mockup yang hilang
  // **Validates: Requirements 7.4**

  type SlideCat =
    | 'clean'
    | 'chartResolved'
    | 'mockupResolved'
    | 'chartMissing'
    | 'mockupMissing'
    | 'bothMissingChartFirst'
    | 'bothMissingMockupFirst';

  const elemArb = fc.record({
    cat: fc.constantFrom<SlideCat>(
      'clean',
      'chartResolved',
      'mockupResolved',
      'chartMissing',
      'mockupMissing',
      'bothMissingChartFirst',
      'bothMissingMockupFirst',
    ),
    // For the *missing* categories, whether the ref is omitted entirely
    // (undefined) or present-but-unresolved.
    omitRef: fc.boolean(),
  });

  it('fails exactly the affected slides (missing_chart_data/missing_mockup) and pre-fails none when all data is present', () => {
    fc.assert(
      fc.property(fc.array(elemArb, { maxLength: 10 }), (elems) => {
        const slides: ContentPlanSlide[] = [];
        const chartData: { ref: string; data: ChartData }[] = [];
        const mockups: { ref: string; objectUrl: string }[] = [];
        const expected: FailingSlide[] = [];

        elems.forEach((e, i) => {
          const chartRef = `chart-${i}`;
          const mockRef = `mock-${i}`;
          let blocks: ContentPlanBlock[];

          switch (e.cat) {
            case 'clean':
              blocks = [
                { type: 'heading', text: 'Title' },
                { type: 'body', text: 'Body copy' },
              ];
              break;
            case 'chartResolved':
              blocks = [{ type: 'chart', chartDataRef: chartRef }];
              chartData.push({ ref: chartRef, data: { kind: 'bar', series: [{ label: 'a', value: 1 }] } });
              break;
            case 'mockupResolved':
              blocks = [{ type: 'mockup', mockupRef: mockRef }];
              mockups.push({ ref: mockRef, objectUrl: `https://cdn.example.com/${mockRef}.png` });
              break;
            case 'chartMissing':
              blocks = [e.omitRef ? { type: 'chart' } : { type: 'chart', chartDataRef: chartRef }];
              expected.push({ slideIndex: i, reason: 'missing_chart_data' });
              break;
            case 'mockupMissing':
              blocks = [e.omitRef ? { type: 'mockup' } : { type: 'mockup', mockupRef: mockRef }];
              expected.push({ slideIndex: i, reason: 'missing_mockup' });
              break;
            case 'bothMissingChartFirst':
              // First offending block is the chart → reason is missing_chart_data.
              blocks = [
                { type: 'chart', chartDataRef: chartRef },
                { type: 'mockup', mockupRef: mockRef },
              ];
              expected.push({ slideIndex: i, reason: 'missing_chart_data' });
              break;
            case 'bothMissingMockupFirst':
              // First offending block is the mockup → reason is missing_mockup.
              blocks = [
                { type: 'mockup', mockupRef: mockRef },
                { type: 'chart', chartDataRef: chartRef },
              ];
              expected.push({ slideIndex: i, reason: 'missing_mockup' });
              break;
          }

          slides.push({ index: i, blocks });
        });

        const plan: ContentPlan = { aspectRatio: '1:1', slides };

        // Standalone spies: the precheck must perform NO partial render and
        // make NO AI image-model call (R7.4). checkRequiredData is a pure
        // function, so these can never be invoked.
        const partialRenderSpy = vi.fn();
        const aiImageSpy = vi.fn();

        const result = checkRequiredData(plan, { chartData, mockups });

        const byIndex = (a: FailingSlide, b: FailingSlide) => a.slideIndex - b.slideIndex;
        expect([...result].sort(byIndex)).toEqual([...expected].sort(byIndex));

        expect(partialRenderSpy).not.toHaveBeenCalled();
        expect(aiImageSpy).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
