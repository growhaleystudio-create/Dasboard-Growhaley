/**
 * Unit tests for DefaultPlanner (Task 12.1)
 *
 * Covers the three core scenarios specified:
 *   1. Valid JSON response from AI → ok(ContentPlan)
 *   2. Non-JSON / unparseable response → err({ kind: 'non_json' })
 *   3. Wrapper returns budget_exceeded → err({ kind: 'budget_exceeded' })
 *
 * Additional coverage:
 *   - timeout error from wrapper → err({ kind: 'timeout' })
 *   - endpoint_mismatch from wrapper → err({ kind: 'endpoint_mismatch' })
 *   - provider_error from wrapper → err({ kind: 'provider_error', message })
 *   - Valid JSON that fails ContentPlan schema → err({ kind: 'non_json' })
 *   - Endpoint resolve failure → err({ kind: 'provider_error' })
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5, 7.3, 8.2, 8.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultPlanner } from './planner.js';
import type { PlannerInput, DefaultPlannerDeps } from './planner.js';
import { AiCallWrapper, type AiCallWrapperDeps } from './ai-call-wrapper.js';
import type { DefaultProviderEndpointResolver, ResolvedEndpoint } from './provider-endpoint-resolver.js';
import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';
import type {
  MasterTemplateRules,
  AspectRatio,
  BlockType,
  ApprovedExampleStructure,
} from '@leads-generator/shared';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRules(overrides?: Partial<MasterTemplateRules>): MasterTemplateRules {
  return {
    allowedBlocks: new Set<BlockType>(['heading', 'body', 'chart', 'mockup', 'stat', 'cta']),
    maxSlides: 5,
    textLimits: new Map<BlockType, number>([
      ['heading', 80],
      ['body', 300],
      ['cta', 100],
    ]),
    aspectRatios: new Set<AspectRatio>(['9:16', '1:1']),
    defaultTone: 'professional',
    brandKitId: 'brand-kit-test',
    ...overrides,
  };
}

function makeInput(overrides?: Partial<PlannerInput>): PlannerInput {
  return {
    teamId: 'team-abc',
    jobId: 'job-123',
    actorId: 'user-xyz',
    prompt: 'Buat carousel produk terbaru kami',
    rules: makeRules(),
    examples: [],
    ...overrides,
  };
}

/** Minimal valid ContentPlan as a JSON string. */
function makeValidPlanJson(overrides?: object): string {
  const plan = {
    aspectRatio: '9:16',
    slides: [
      {
        index: 0,
        blocks: [{ type: 'heading', text: 'Judul Utama' }],
      },
    ],
    ...overrides,
  };
  return JSON.stringify(plan);
}

/** A resolved endpoint that always allows calls to the Gemini base URL. */
function makeResolvedEndpoint(baseUrl = 'https://generativelanguage.googleapis.com'): ResolvedEndpoint {
  return {
    baseUrl,
    assertAllowed: (targetUrl: string) => {
      try {
        const t = new URL(targetUrl);
        const b = new URL(baseUrl);
        if (t.protocol !== 'https:') return { ok: false, error: { code: 'INTERNAL', message: 'insecure_transport' } };
        if (t.host !== b.host) return { ok: false, error: { code: 'INTERNAL', message: 'endpoint_mismatch' } };
        return { ok: true, value: undefined };
      } catch {
        return { ok: false, error: { code: 'INTERNAL', message: 'insecure_transport' } };
      }
    },
  };
}

/**
 * Build mock deps for DefaultPlanner.
 *
 * `wrapperResult` controls what `wrapper.execute` resolves to.
 *   - If it's a string, the wrapper returns ok(string).
 *   - If it's an Error-like object it returns err({ code, message }).
 */
function makeDeps(opts?: {
  wrapperResult?: string | { code: string; message: string };
  endpointResult?: ResolvedEndpoint | null;
}): DefaultPlannerDeps {
  const resolvedEndpoint = opts?.endpointResult !== undefined
    ? opts.endpointResult
    : makeResolvedEndpoint();

  const endpointResolver = {
    resolve: vi.fn().mockResolvedValue(
      resolvedEndpoint === null
        ? { ok: false, error: { code: 'INTERNAL', message: 'endpoint_not_found' } }
        : { ok: true, value: resolvedEndpoint },
    ),
  } as unknown as DefaultProviderEndpointResolver;

  const wrapperResult = opts?.wrapperResult;

  const wrapper = {
    execute: vi.fn().mockImplementation(
      async (_ctx: unknown, fn: (apiKey: string) => Promise<string>) => {
        if (wrapperResult === undefined) {
          // By default execute the fn with a fake API key
          try {
            const text = await fn('fake-api-key');
            return { ok: true, value: text };
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'provider_error';
            return { ok: false, error: { code: 'INTERNAL', message: msg } };
          }
        }
        if (typeof wrapperResult === 'string') {
          // Pre-canned success response (bypasses actual fn)
          return { ok: true, value: wrapperResult };
        }
        // Pre-canned error
        return { ok: false, error: wrapperResult };
      },
    ),
  } as unknown as AiCallWrapper;

  const settings = {
    loadApiKey: vi.fn().mockResolvedValue('fake-api-key'),
    loadApiBaseUrl: vi.fn().mockResolvedValue('https://api.openai.com/v1'),
    getSettings: vi.fn().mockResolvedValue({
      textModel: 'gemini-2.5-flash-lite',
      imageModel: 'gpt-image-1',
    }),
  } as unknown as TeamAiSettingsService;

  return { wrapper, endpointResolver, settings };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultPlanner', () => {
  let signal: AbortSignal;

  beforeEach(() => {
    signal = AbortSignal.timeout(30_000);
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Valid JSON → ok(ContentPlan)
  // -------------------------------------------------------------------------
  describe('valid JSON response → ok(ContentPlan)', () => {
    it('returns ok with a parsed ContentPlan when wrapper returns valid JSON', async () => {
      const validJson = makeValidPlanJson();
      const deps = makeDeps({ wrapperResult: validJson });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.aspectRatio).toBe('9:16');
        expect(result.value.slides).toHaveLength(1);
        expect(result.value.slides[0]!.blocks[0]!.type).toBe('heading');
      }
    });

    it('parses a multi-slide plan correctly', async () => {
      const plan = {
        aspectRatio: '1:1',
        slides: [
          { index: 0, blocks: [{ type: 'heading', text: 'Slide 1' }] },
          { index: 1, blocks: [{ type: 'body', text: 'Slide 2' }] },
          { index: 2, blocks: [{ type: 'cta', text: 'Beli Sekarang' }] },
        ],
      };
      const deps = makeDeps({ wrapperResult: JSON.stringify(plan) });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slides).toHaveLength(3);
      }
    });

    it('preserves chartDataRef and mockupRef in parsed plan (R7.3)', async () => {
      const plan = {
        aspectRatio: '9:16',
        slides: [
          {
            index: 0,
            blocks: [
              { type: 'chart', chartDataRef: 'chart-ref-1' },
              { type: 'mockup', mockupRef: 'mockup-ref-1' },
            ],
          },
        ],
      };
      const deps = makeDeps({ wrapperResult: JSON.stringify(plan) });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slides[0]!.blocks[0]!.chartDataRef).toBe('chart-ref-1');
        expect(result.value.slides[0]!.blocks[1]!.mockupRef).toBe('mockup-ref-1');
      }
    });

    it('preserves layoutVariantHint from Approved_Example influence (R8.2, R8.3)', async () => {
      const plan = {
        aspectRatio: '9:16',
        slides: [
          {
            index: 0,
            layoutVariantHint: 'full-bleed-text',
            blocks: [{ type: 'heading', text: 'Inspirasi dari contoh' }],
          },
        ],
      };
      const deps = makeDeps({ wrapperResult: JSON.stringify(plan) });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slides[0]!.layoutVariantHint).toBe('full-bleed-text');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Non-JSON response → err({ kind: 'non_json' })
  // -------------------------------------------------------------------------
  describe('non-JSON response → err({ kind: non_json })', () => {
    it('returns err non_json when wrapper returns a plain text response', async () => {
      const deps = makeDeps({ wrapperResult: 'Ini bukan JSON' });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('non_json');
      }
    });

    it('returns err non_json when wrapper returns an empty string', async () => {
      const deps = makeDeps({ wrapperResult: '' });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('non_json');
      }
    });

    it('returns err non_json when JSON is structurally invalid for ContentPlan', async () => {
      // Valid JSON but wrong schema (missing required fields)
      const badPlan = JSON.stringify({ notAContentPlan: true });
      const deps = makeDeps({ wrapperResult: badPlan });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('non_json');
      }
    });

    it('returns err non_json when JSON has invalid aspectRatio', async () => {
      const badPlan = JSON.stringify({
        aspectRatio: '16:9', // not a valid AspectRatio
        slides: [{ index: 0, blocks: [{ type: 'heading', text: 'Hi' }] }],
      });
      const deps = makeDeps({ wrapperResult: badPlan });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('non_json');
      }
    });

    it('returns err non_json when JSON has invalid block type', async () => {
      const badPlan = JSON.stringify({
        aspectRatio: '9:16',
        slides: [{ index: 0, blocks: [{ type: 'video' }] }], // 'video' not a BlockType
      });
      const deps = makeDeps({ wrapperResult: badPlan });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('non_json');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: budget_exceeded from wrapper → err({ kind: 'budget_exceeded' })
  // -------------------------------------------------------------------------
  describe('budget_exceeded → err({ kind: budget_exceeded })', () => {
    it('returns err budget_exceeded when wrapper signals budget exhaustion', async () => {
      const deps = makeDeps({
        wrapperResult: { code: 'INTERNAL', message: 'budget_exceeded' },
      });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('budget_exceeded');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Additional error mapping tests
  // -------------------------------------------------------------------------
  describe('error mapping', () => {
    it('maps timeout wrapper error to err({ kind: timeout })', async () => {
      const deps = makeDeps({
        wrapperResult: { code: 'INTERNAL', message: 'timeout' },
      });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('timeout');
      }
    });

    it('maps endpoint_mismatch wrapper error to err({ kind: endpoint_mismatch })', async () => {
      const deps = makeDeps({
        wrapperResult: { code: 'INTERNAL', message: 'endpoint_mismatch' },
      });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('endpoint_mismatch');
      }
    });

    it('maps insecure_transport wrapper error to err({ kind: insecure_transport })', async () => {
      const deps = makeDeps({
        wrapperResult: { code: 'INTERNAL', message: 'insecure_transport' },
      });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('insecure_transport');
      }
    });

    it('maps privacy_violation wrapper error to err({ kind: privacy_violation })', async () => {
      const deps = makeDeps({
        wrapperResult: { code: 'INTERNAL', message: 'privacy_violation' },
      });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('privacy_violation');
      }
    });

    it('maps unknown wrapper error to err({ kind: provider_error, message })', async () => {
      const deps = makeDeps({
        wrapperResult: { code: 'INTERNAL', message: 'some_unknown_error' },
      });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('provider_error');
        if (result.error.kind === 'provider_error') {
          expect(result.error.message).toBe('some_unknown_error');
        }
      }
    });

    it('returns err provider_error when endpoint resolution fails', async () => {
      const deps = makeDeps({ endpointResult: null });
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('provider_error');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Wrapper interaction
  // -------------------------------------------------------------------------
  describe('wrapper interaction', () => {
    it('calls wrapper.execute exactly once per plan() invocation', async () => {
      const validJson = makeValidPlanJson();
      const deps = makeDeps({ wrapperResult: validJson });
      const planner = new DefaultPlanner(deps);

      await planner.plan(makeInput(), signal);

      expect((deps.wrapper.execute as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    });

    it('calls endpointResolver.resolve with the correct teamId', async () => {
      const validJson = makeValidPlanJson();
      const deps = makeDeps({ wrapperResult: validJson });
      const planner = new DefaultPlanner(deps);

      await planner.plan(makeInput({ teamId: 'team-xyz' }), signal);

      expect(
        (deps.endpointResolver.resolve as ReturnType<typeof vi.fn>),
      ).toHaveBeenCalledWith('team-xyz');
    });

    it('never calls wrapper.execute when endpoint resolution fails', async () => {
      const deps = makeDeps({ endpointResult: null });
      const planner = new DefaultPlanner(deps);

      await planner.plan(makeInput(), signal);

      expect((deps.wrapper.execute as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// Integration tests (Task 12.2)
//
// These exercise DefaultPlanner wired to the REAL AiCallWrapper (with faked
// settings/budget/audit deps) and a MOCKED AI provider at the network (fetch)
// boundary — no real network calls. This verifies the full path:
//   Planner → AiCallWrapper → (mocked Gemini provider) → error/JSON mapping.
//
// Requirements: 3.2, 3.5, 7.3
// ===========================================================================

// ---------------------------------------------------------------------------
// Integration helpers
// ---------------------------------------------------------------------------

/** A minimal fetch `Response`-like object shaped like a Gemini reply. */
function makeGeminiResponse(text: string): unknown {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    text: async () => text,
  };
}

/** An AbortError as thrown by `fetch` when its AbortSignal fires. */
function makeAbortError(): Error {
  return Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
}

/**
 * Build DefaultPlannerDeps backed by the REAL {@link AiCallWrapper}.
 *
 * Only the wrapper's leaf dependencies (api key load, budget check, call-log,
 * audit) are faked — the wrapper's real budget/audit/error-mapping logic runs.
 * The AI provider itself is mocked at the `fetch` boundary by each test.
 */
function makeIntegrationDeps(): {
  deps: DefaultPlannerDeps;
  callLogInsert: ReturnType<typeof vi.fn>;
  auditRecord: ReturnType<typeof vi.fn>;
} {
  const callLogInsert = vi.fn().mockResolvedValue(undefined);
  const auditRecord = vi.fn().mockResolvedValue(undefined);

  const wrapperDeps = {
    settings: {
      loadApiKey: vi.fn().mockResolvedValue('fake-api-key'),
      loadApiBaseUrl: vi.fn().mockResolvedValue('https://api.openai.com/v1'),
      getSettings: vi.fn().mockResolvedValue({
        textModel: 'gemini-2.5-flash-lite',
        imageModel: 'gpt-image-1',
      }),
    },
    budget: { canCall: vi.fn().mockResolvedValue({ allowed: true }) },
    callLog: { insert: callLogInsert },
    audit: { record: auditRecord },
  } as unknown as AiCallWrapperDeps;

  const wrapper = new AiCallWrapper(
    wrapperDeps,
    {} as unknown as ConstructorParameters<typeof AiCallWrapper>[1],
  );

  const endpointResolver = {
    resolve: vi.fn().mockResolvedValue({ ok: true, value: makeResolvedEndpoint() }),
  } as unknown as DefaultProviderEndpointResolver;

  const settings = {
    loadApiKey: vi.fn().mockResolvedValue('fake-api-key'),
    loadApiBaseUrl: vi.fn().mockResolvedValue('https://api.openai.com/v1'),
    getSettings: vi.fn().mockResolvedValue({
      textModel: 'gemini-2.5-flash-lite',
      imageModel: 'gpt-image-1',
    }),
  } as unknown as TeamAiSettingsService;

  return { deps: { wrapper, endpointResolver, settings }, callLogInsert, auditRecord };
}

describe('DefaultPlanner — integration with mock AI provider (Task 12.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // R3.2 — payload sent to the provider includes prompt + master rules + examples
  // -------------------------------------------------------------------------
  describe('payload composition (R3.2)', () => {
    it('sends User prompt + Master_Template rules + Approved_Example structures to the provider', async () => {
      let capturedBody: string | undefined;
      const fetchMock = vi.fn().mockImplementation(async (_url: string, options: { body?: string }) => {
        capturedBody = options?.body;
        return makeGeminiResponse(makeValidPlanJson());
      });
      vi.stubGlobal('fetch', fetchMock);

      const { deps } = makeIntegrationDeps();
      const planner = new DefaultPlanner(deps);

      const example: ApprovedExampleStructure = {
        aspectRatio: '9:16',
        tags: ['product-launch', 'B2B'],
        slides: [{ blocks: ['heading', 'body'], layoutVariant: 'hero-left-variant' }],
      };
      const input = makeInput({
        prompt: 'Buat carousel peluncuran produk B2B unggulan',
        examples: [example],
      });

      const result = await planner.plan(input, AbortSignal.timeout(30_000));

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(capturedBody).toBeDefined();

      const body = JSON.parse(capturedBody!) as {
        contents: { parts: { text: string }[] }[];
      };
      const sentText = body.contents[0]!.parts[0]!.text;

      // (a) User prompt is present
      expect(sentText).toContain('Buat carousel peluncuran produk B2B unggulan');

      // (b) Master_Template hard rules are present (allowed blocks, maxSlides, aspect ratio)
      expect(sentText).toContain('heading');
      expect(sentText).toContain('chart');
      expect(sentText).toContain(String(input.rules.maxSlides));
      expect(sentText).toContain('9:16');

      // (c) Retrieved Approved_Example structure is present (layout variant + block composition)
      expect(sentText).toContain('hero-left-variant');
    });

    it('omits the examples section when no Approved_Examples are retrieved', async () => {
      let capturedBody: string | undefined;
      const fetchMock = vi.fn().mockImplementation(async (_url: string, options: { body?: string }) => {
        capturedBody = options?.body;
        return makeGeminiResponse(makeValidPlanJson());
      });
      vi.stubGlobal('fetch', fetchMock);

      const { deps } = makeIntegrationDeps();
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput({ examples: [] }), AbortSignal.timeout(30_000));

      expect(result.ok).toBe(true);
      const body = JSON.parse(capturedBody!) as { contents: { parts: { text: string }[] }[] };
      const sentText = body.contents[0]!.parts[0]!.text;
      // Master rules still present, but the few-shot examples header is not.
      expect(sentText).toContain('heading');
      expect(sentText).not.toContain('Contoh yang disetujui');
    });
  });

  // -------------------------------------------------------------------------
  // R3.5 — 30-second timeout aborts via AbortSignal → PlannerError timeout
  // -------------------------------------------------------------------------
  describe('30s timeout via AbortSignal (R3.5)', () => {
    it('aborts the hanging AI call after 30s and resolves to PlannerError timeout', async () => {
      vi.useFakeTimers();

      const fetchMock = vi.fn().mockImplementation(
        (_url: string, options: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            const signal = options?.signal;
            if (signal?.aborted) {
              reject(makeAbortError());
              return;
            }
            signal?.addEventListener('abort', () => reject(makeAbortError()));
          }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const controller = new AbortController();
      // Simulate the Planner's 30-second timeout firing on a hanging provider call.
      setTimeout(() => controller.abort(), 30_000);

      const { deps } = makeIntegrationDeps();
      const planner = new DefaultPlanner(deps);

      const resultPromise = planner.plan(makeInput(), controller.signal);
      await vi.advanceTimersByTimeAsync(30_000);
      const result = await resultPromise;

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('timeout');
      }
    });

    it('maps an already-aborted AbortSignal to PlannerError timeout', async () => {
      const fetchMock = vi.fn().mockImplementation(
        (_url: string, options: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            const signal = options?.signal;
            if (signal?.aborted) {
              reject(makeAbortError());
              return;
            }
            signal?.addEventListener('abort', () => reject(makeAbortError()));
          }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const controller = new AbortController();
      controller.abort();

      const { deps } = makeIntegrationDeps();
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), controller.signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('timeout');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Non-JSON model output → PlannerError.non_json
  // -------------------------------------------------------------------------
  describe('non-JSON provider output', () => {
    it('maps a non-JSON provider response to PlannerError non_json', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(makeGeminiResponse('Tentu! Ini rencana konten Anda: ...(bukan JSON)'));
      vi.stubGlobal('fetch', fetchMock);

      const { deps } = makeIntegrationDeps();
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput(), AbortSignal.timeout(30_000));

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('non_json');
      }
    });
  });

  // -------------------------------------------------------------------------
  // R7.3 — Planner only FLAGS chart/mockup via refs, never fabricates inline data
  // -------------------------------------------------------------------------
  describe('chart/mockup flagged by reference only (R7.3)', () => {
    it('keeps chartDataRef/mockupRef and strips any fabricated inline data values', async () => {
      // The model attempts to hallucinate inline chart data alongside the ref.
      // The Planner's schema must keep ONLY the reference, never the fabricated data.
      const modelOutput = JSON.stringify({
        aspectRatio: '9:16',
        slides: [
          {
            index: 0,
            blocks: [
              {
                type: 'chart',
                chartDataRef: 'user-supplied-chart-1',
                // Hallucinated inline data the Planner must NOT carry forward:
                data: { kind: 'bar', series: [{ label: 'Q1', value: 9999 }] },
                values: [12, 34, 56],
              },
              {
                type: 'mockup',
                mockupRef: 'user-supplied-mockup-1',
                // Hallucinated inline mockup content:
                inlineImage: 'data:image/png;base64,ZmFrZQ==',
              },
            ],
          },
        ],
      });
      const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse(modelOutput));
      vi.stubGlobal('fetch', fetchMock);

      const { deps } = makeIntegrationDeps();
      const planner = new DefaultPlanner(deps);

      const result = await planner.plan(makeInput({ expectsData: true }), AbortSignal.timeout(30_000));

      expect(result.ok).toBe(true);
      if (result.ok) {
        const chartBlock = result.value.slides[0]!.blocks[0]!;
        const mockupBlock = result.value.slides[0]!.blocks[1]!;

        // Chart/mockup needs are FLAGGED via references to user-supplied data.
        expect(chartBlock.type).toBe('chart');
        expect(chartBlock.chartDataRef).toBe('user-supplied-chart-1');
        expect(mockupBlock.type).toBe('mockup');
        expect(mockupBlock.mockupRef).toBe('user-supplied-mockup-1');

        // No fabricated inline data values survive parsing.
        expect(chartBlock).not.toHaveProperty('data');
        expect(chartBlock).not.toHaveProperty('values');
        expect(mockupBlock).not.toHaveProperty('inlineImage');
        expect(Object.keys(chartBlock).sort()).toEqual(['chartDataRef', 'type']);
        expect(Object.keys(mockupBlock).sort()).toEqual(['mockupRef', 'type']);
      }
    });
  });
});
