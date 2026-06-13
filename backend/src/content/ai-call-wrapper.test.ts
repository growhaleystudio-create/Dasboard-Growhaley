/**
 * Unit tests for AiCallWrapper.
 *
 * Covers the four scenarios required by task 9.1:
 *   1. budget_exceeded  → fn is NOT called; logs are written.
 *   2. no_api_key       → fn is NOT called; logs are written.
 *   3. success          → fn IS called; audit log is written.
 *   4. failure (fn throws) → fn IS called; audit log is still written.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { AiCallWrapper } from './ai-call-wrapper.js';
import type { AiCallContext, AiCallWrapperDeps } from './ai-call-wrapper.js';
import type { AiBudgetTracker } from '../ai/ai-budget-tracker.js';
import type { AiCallLogInsert, AiCallLogRepository } from '../repository/ai-call-log-repository.js';
import type { AuditEntry, AuditLog } from '../privacy/audit-log.js';
import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';
import type { DbExecutor } from '../repository/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal fake DbExecutor (never used in unit tests — deps are mocked). */
const fakeDb = {} as DbExecutor;

function makeCtx(overrides?: Partial<AiCallContext>): AiCallContext {
  return {
    teamId: 'team-abc',
    jobId: 'job-123',
    actorId: 'user-xyz',
    trigger: 'manual',
    callType: 'planner_text',
    endpointUrl: 'https://api.example.com/generate',
    dataScope: 'prompt + master_template',
    ...overrides,
  };
}

/** Build mock deps with sane defaults (key present, budget ok). */
function makeDeps(overrides?: {
  apiKey?: string | null;
  budgetAllowed?: boolean;
}): {
  deps: AiCallWrapperDeps;
  callLogInsert: ReturnType<typeof vi.fn>;
  auditRecord: ReturnType<typeof vi.fn>;
} {
  const apiKey = overrides?.apiKey !== undefined ? overrides.apiKey : 'test-api-key';
  const budgetAllowed = overrides?.budgetAllowed !== undefined ? overrides.budgetAllowed : true;

  const callLogInsert = vi.fn().mockResolvedValue(undefined);
  const auditRecord = vi.fn().mockResolvedValue(undefined);

  const settings = {
    loadApiKey: vi.fn().mockResolvedValue(apiKey),
  } as unknown as TeamAiSettingsService;

  const budget = {
    canCall: vi.fn().mockResolvedValue({ allowed: budgetAllowed, reason: budgetAllowed ? undefined : 'budget_exceeded' }),
  } as unknown as AiBudgetTracker;

  const callLog = {
    insert: callLogInsert,
  } as unknown as AiCallLogRepository;

  const audit = {
    record: auditRecord,
  } as unknown as Pick<AuditLog, 'record'>;

  return {
    deps: { settings, budget, callLog, audit },
    callLogInsert,
    auditRecord,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AiCallWrapper', () => {
  // -------------------------------------------------------------------------
  // no_api_key path
  // -------------------------------------------------------------------------
  describe('no_api_key — fn must NOT be called', () => {
    let wrapper: AiCallWrapper;
    let callLogInsert: ReturnType<typeof vi.fn>;
    let auditRecord: ReturnType<typeof vi.fn>;
    let fn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      const mocks = makeDeps({ apiKey: null });
      callLogInsert = mocks.callLogInsert;
      auditRecord = mocks.auditRecord;
      wrapper = new AiCallWrapper(mocks.deps, fakeDb);
      fn = vi.fn();
    });

    it('returns err with code INTERNAL and message no_api_key', async () => {
      const result = await wrapper.execute(makeCtx(), fn);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL');
        if (result.error.code === 'INTERNAL') {
          expect(result.error.message).toBe('no_api_key');
        }
      }
    });

    it('does NOT invoke fn', async () => {
      await wrapper.execute(makeCtx(), fn);
      expect(fn).not.toHaveBeenCalled();
    });

    it('writes one ai_call_log with outcome no_api_key', async () => {
      await wrapper.execute(makeCtx(), fn);
      expect(callLogInsert).toHaveBeenCalledOnce();
      const call = callLogInsert.mock.calls[0]!;
      expect(call[1]).toMatchObject({ outcome: 'no_api_key', teamId: 'team-abc', leadId: null });
    });

    it('writes one audit_log with action ai_call and outcome no_api_key', async () => {
      const ctx = makeCtx();
      await wrapper.execute(ctx, fn);
      expect(auditRecord).toHaveBeenCalledOnce();
      const entry = auditRecord.mock.calls[0]![0];
      expect(entry.action).toBe('ai_call');
      expect(entry.metadata?.outcome).toBe('no_api_key');
      expect(entry.teamId).toBe(ctx.teamId);
      expect(entry.objectId).toBe(ctx.jobId);
    });
  });

  // -------------------------------------------------------------------------
  // budget_exceeded path
  // -------------------------------------------------------------------------
  describe('budget_exceeded — fn must NOT be called', () => {
    let wrapper: AiCallWrapper;
    let callLogInsert: ReturnType<typeof vi.fn>;
    let auditRecord: ReturnType<typeof vi.fn>;
    let fn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      const mocks = makeDeps({ budgetAllowed: false });
      callLogInsert = mocks.callLogInsert;
      auditRecord = mocks.auditRecord;
      wrapper = new AiCallWrapper(mocks.deps, fakeDb);
      fn = vi.fn();
    });

    it('returns err with code INTERNAL and message budget_exceeded', async () => {
      const result = await wrapper.execute(makeCtx(), fn);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL');
        if (result.error.code === 'INTERNAL') {
          expect(result.error.message).toBe('budget_exceeded');
        }
      }
    });

    it('does NOT invoke fn', async () => {
      await wrapper.execute(makeCtx(), fn);
      expect(fn).not.toHaveBeenCalled();
    });

    it('writes one ai_call_log with outcome budget_exceeded', async () => {
      await wrapper.execute(makeCtx(), fn);
      expect(callLogInsert).toHaveBeenCalledOnce();
      const call = callLogInsert.mock.calls[0]!;
      expect(call[1]).toMatchObject({ outcome: 'budget_exceeded', teamId: 'team-abc', leadId: null });
    });

    it('writes one audit_log with action ai_call and outcome budget_exceeded', async () => {
      const ctx = makeCtx();
      await wrapper.execute(ctx, fn);
      expect(auditRecord).toHaveBeenCalledOnce();
      const entry = auditRecord.mock.calls[0]![0];
      expect(entry.action).toBe('ai_call');
      expect(entry.metadata?.outcome).toBe('budget_exceeded');
    });
  });

  // -------------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------------
  describe('success — fn called and audit recorded', () => {
    let wrapper: AiCallWrapper;
    let callLogInsert: ReturnType<typeof vi.fn>;
    let auditRecord: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      const mocks = makeDeps();
      callLogInsert = mocks.callLogInsert;
      auditRecord = mocks.auditRecord;
      wrapper = new AiCallWrapper(mocks.deps, fakeDb);
    });

    it('calls fn with the decrypted API key and returns ok(result)', async () => {
      const fn = vi.fn().mockResolvedValue({ text: 'plan' });
      const result = await wrapper.execute(makeCtx(), fn);
      expect(fn).toHaveBeenCalledWith('test-api-key');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ text: 'plan' });
      }
    });

    it('writes one ai_call_log with outcome success', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      await wrapper.execute(makeCtx(), fn);
      expect(callLogInsert).toHaveBeenCalledOnce();
      const call = callLogInsert.mock.calls[0]!;
      expect(call[1]).toMatchObject({ outcome: 'success', teamId: 'team-abc', leadId: null });
    });

    it('writes one audit_log with action ai_call and correct metadata', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const ctx = makeCtx();
      await wrapper.execute(ctx, fn);
      expect(auditRecord).toHaveBeenCalledOnce();
      const entry = auditRecord.mock.calls[0]![0];
      expect(entry.action).toBe('ai_call');
      expect(entry.metadata?.outcome).toBe('success');
      expect(entry.metadata?.trigger).toBe(ctx.trigger);
      expect(entry.metadata?.endpointUrl).toBe(ctx.endpointUrl);
      expect(entry.metadata?.dataScope).toBe(ctx.dataScope);
      expect(entry.objectType).toBe(ctx.callType);
      expect(entry.objectId).toBe(ctx.jobId);
    });
  });

  // -------------------------------------------------------------------------
  // Failure (fn throws) path — audit STILL recorded
  // -------------------------------------------------------------------------
  describe('failure (fn throws) — audit still recorded', () => {
    let wrapper: AiCallWrapper;
    let callLogInsert: ReturnType<typeof vi.fn>;
    let auditRecord: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      const mocks = makeDeps();
      callLogInsert = mocks.callLogInsert;
      auditRecord = mocks.auditRecord;
      wrapper = new AiCallWrapper(mocks.deps, fakeDb);
    });

    it('returns err when fn throws a generic error', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Network failure'));
      const result = await wrapper.execute(makeCtx(), fn);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL');
        if (result.error.code === 'INTERNAL') {
          expect(result.error.message).toBe('provider_error');
        }
      }
    });

    it('returns err with message timeout when fn throws an AbortError', async () => {
      const abortError = new Error('fetch aborted');
      abortError.name = 'AbortError';
      const fn = vi.fn().mockRejectedValue(abortError);
      const result = await wrapper.execute(makeCtx(), fn);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        if (result.error.code === 'TIMEOUT') {
          expect(result.error.message).toBe('timeout');
        } else if (result.error.code === 'INTERNAL') {
          expect(result.error.message).toBe('timeout');
        }
      }
    });

    it('writes ai_call_log with provider_error outcome when fn throws', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('oops'));
      await wrapper.execute(makeCtx(), fn);
      expect(callLogInsert).toHaveBeenCalledOnce();
      const call = callLogInsert.mock.calls[0]!;
      expect(call[1]).toMatchObject({ outcome: 'provider_error' });
    });

    it('writes audit_log even when fn throws', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('oops'));
      await wrapper.execute(makeCtx(), fn);
      expect(auditRecord).toHaveBeenCalledOnce();
      const entry = auditRecord.mock.calls[0]![0];
      expect(entry.action).toBe('ai_call');
      expect(entry.metadata?.outcome).toBe('provider_error');
    });

    it('does NOT double-record when fn throws (exactly one callLog + one audit)', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('bad'));
      await wrapper.execute(makeCtx(), fn);
      expect(callLogInsert).toHaveBeenCalledOnce();
      expect(auditRecord).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Audit metadata completeness
  // -------------------------------------------------------------------------
  describe('audit metadata completeness', () => {
    it('always records endpointUrl and dataScope in audit metadata', async () => {
      const mocks = makeDeps();
      const wrapper = new AiCallWrapper(mocks.deps, fakeDb);
      const ctx = makeCtx({
        endpointUrl: 'https://custom.endpoint.com/v1',
        dataScope: 'prompt only',
      });
      const fn = vi.fn().mockResolvedValue('result');
      await wrapper.execute(ctx, fn);
      const entry = mocks.auditRecord.mock.calls[0]![0];
      expect(entry.metadata?.endpointUrl).toBe('https://custom.endpoint.com/v1');
      expect(entry.metadata?.dataScope).toBe('prompt only');
    });

    it('records exactly one ai_call_log and one audit_log per successful call', async () => {
      const mocks = makeDeps();
      const wrapper = new AiCallWrapper(mocks.deps, fakeDb);
      await wrapper.execute(makeCtx(), vi.fn().mockResolvedValue('ok'));
      expect(mocks.callLogInsert).toHaveBeenCalledOnce();
      expect(mocks.auditRecord).toHaveBeenCalledOnce();
    });
  });
});

// ===========================================================================
// Property-based tests (fast-check) — tasks 9.2 & 9.3
// ===========================================================================

/**
 * A persisted audit row as it would land in `audit_log`. `at` is captured at
 * record time to model the table's `at TIMESTAMPTZ DEFAULT now()` column,
 * since the wrapper never supplies the timestamp itself (the DB does).
 */
interface AuditRow {
  entry: AuditEntry;
  at: Date;
}

/**
 * Build fully in-memory deps (NO real DB/network). The budget tracker derives
 * its decision from a generated 30-day `usage` and `limit` (limit 0 = unlimited,
 * mirroring the real AiBudgetTracker). The audit + call-log fakes accumulate
 * every write so tests can assert exact counts and contents.
 */
function makeMemoryDeps(opts?: {
  apiKey?: string | null;
  usage?: number;
  limit?: number;
}): {
  deps: AiCallWrapperDeps;
  callLogRecords: AiCallLogInsert[];
  auditRows: AuditRow[];
} {
  const apiKey = opts?.apiKey === undefined ? 'mem-api-key' : opts.apiKey;
  const usage = opts?.usage ?? 0;
  const limit = opts?.limit ?? 0; // 0 → unlimited (mirrors AiBudgetTracker)

  const callLogRecords: AiCallLogInsert[] = [];
  const auditRows: AuditRow[] = [];

  const settings = {
    loadApiKey: async (_teamId: string) => apiKey,
  } as unknown as TeamAiSettingsService;

  const budget = {
    canCall: async (_teamId: string) => {
      const allowed = limit === 0 ? true : usage < limit;
      return allowed
        ? { allowed: true }
        : { allowed: false, reason: 'budget_exceeded' as const };
    },
  } as unknown as AiBudgetTracker;

  const callLog = {
    insert: async (_tx: unknown, entry: AiCallLogInsert) => {
      callLogRecords.push(entry);
    },
  } as unknown as AiCallLogRepository;

  const audit = {
    record: async (entry: AuditEntry) => {
      // Stamp the write time, modelling the DB `at DEFAULT now()` column.
      auditRows.push({ entry, at: new Date() });
    },
  } as unknown as Pick<AuditLog, 'record'>;

  return { deps: { settings, budget, callLog, audit }, callLogRecords, auditRows };
}

/** Arbitrary AiCallContext spanning every trigger and call type. */
const ctxArb: fc.Arbitrary<AiCallContext> = fc.record({
  teamId: fc.string({ minLength: 1 }),
  jobId: fc.string({ minLength: 1 }),
  actorId: fc.string({ minLength: 1 }),
  trigger: fc.constantFrom('scan', 'manual'),
  callType: fc.constantFrom('planner_text', 'background_image', 'reference_description'),
  endpointUrl: fc.webUrl(),
  dataScope: fc.string({ minLength: 1 }),
});

describe('AiCallWrapper — Property 25: Setiap panggilan AI tercatat pada budget dan Audit_Log', () => {
  // Feature: ai-content-carousel-generator, Property 25: Setiap panggilan AI tercatat pada budget dan Audit_Log
  // **Validates: Requirements 13.2, 13.3, 14.6, 15.5**

  it('records exactly one team-scoped ai_call_log and one ai_call Audit_Log (with actor, job, time, outcome, endpoint, data scope) for BOTH success and failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        ctxArb,
        fc.constantFrom('success', 'generic', 'abort'),
        fc.anything(),
        async (ctx, mode, value) => {
          const { deps, callLogRecords, auditRows } = makeMemoryDeps();
          const wrapper = new AiCallWrapper(deps, fakeDb);

          const expectedOutcome =
            mode === 'success'
              ? 'success'
              : mode === 'abort'
                ? 'timeout'
                : 'provider_error';

          const fn =
            mode === 'success'
              ? async () => value
              : mode === 'abort'
                ? async () => {
                    const e = new Error('aborted');
                    e.name = 'AbortError';
                    throw e;
                  }
                : async () => {
                    throw new Error('provider failed');
                  };

          const result = await wrapper.execute(ctx, fn);

          // Result reflects the outcome (ok on success, err on failure).
          expect(result.ok).toBe(mode === 'success');

          // Exactly ONE ai_call_log: team-scoped, lead_id null, correct outcome.
          expect(callLogRecords.length).toBe(1);
          const log = callLogRecords[0]!;
          expect(log.teamId).toBe(ctx.teamId);
          expect(log.leadId).toBeNull();
          expect(log.outcome).toBe(expectedOutcome);

          // Exactly ONE Audit_Log entry with action 'ai_call'.
          const aiCallRows = auditRows.filter((r) => r.entry.action === 'ai_call');
          expect(aiCallRows.length).toBe(1);
          const row = aiCallRows[0]!;

          // Carries: actor, related Job, time, result, endpoint target (R14.6),
          // and the data-scope marker (R15.5).
          expect(row.entry.actorId).toBe(ctx.actorId);
          expect(row.entry.objectId).toBe(ctx.jobId);
          expect(row.at).toBeInstanceOf(Date);
          expect(Number.isNaN(row.at.getTime())).toBe(false);
          expect(row.entry.metadata?.outcome).toBe(expectedOutcome);
          expect(row.entry.metadata?.endpointUrl).toBe(ctx.endpointUrl);
          expect(row.entry.metadata?.dataScope).toBe(ctx.dataScope);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('AiCallWrapper — Property 26: Pra-pemeriksaan AI_Call_Budget jendela 30 hari', () => {
  // Feature: ai-content-carousel-generator, Property 26: Pra-pemeriksaan AI_Call_Budget jendela 30 hari
  // **Validates: Requirements 13.4**

  it('invokes the AI operation IF AND ONLY IF 30-day usage is below the limit; otherwise rejects with budget_exceeded BEFORE calling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 10_000 }), // pemakaian pada jendela 30 hari
        fc.integer({ min: 1, max: 10_000 }), // batas AI_Call_Budget (>0)
        ctxArb,
        async (usage, limit, ctx) => {
          const { deps, callLogRecords } = makeMemoryDeps({ usage, limit });
          const wrapper = new AiCallWrapper(deps, fakeDb);

          // Spy standing in for the wrapped provider call.
          const opSpy = vi.fn(async () => ({ data: 'ok' }));

          const result = await wrapper.execute(ctx, opSpy);

          if (usage < limit) {
            // Under budget → call allowed, operation invoked exactly once.
            expect(opSpy).toHaveBeenCalledTimes(1);
            expect(result.ok).toBe(true);
          } else {
            // At/over budget → precheck rejects BEFORE the operation runs.
            expect(opSpy).not.toHaveBeenCalled();
            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.error.code).toBe('INTERNAL');
              if (result.error.code === 'INTERNAL') {
                expect(result.error.message).toBe('budget_exceeded');
              }
            }
            // The rejected attempt is still recorded as budget_exceeded.
            expect(callLogRecords.length).toBe(1);
            expect(callLogRecords[0]!.outcome).toBe('budget_exceeded');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
