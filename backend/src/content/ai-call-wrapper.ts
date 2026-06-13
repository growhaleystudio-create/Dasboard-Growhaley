/**
 * AiCallWrapper — team-scoped wrapper for every AI provider call.
 *
 * Enforces the three pre-call gates mandated by R13 before ANY call exits
 * to the AI provider, and writes exactly one `ai_call_log` row + one
 * `audit_log` row (action: 'ai_call') per invocation regardless of whether
 * the call succeeds or fails.
 *
 * Pre-call gates (in order):
 *   1. API key must be present for the Team (TeamAiSettingsService.loadApiKey).
 *   2. 30-day rolling budget must not be exhausted (AiBudgetTracker.canCall).
 *   3. The caller-supplied `fn` receives the decrypted key and executes the
 *      actual provider call.
 *
 * Recording (always, success or failure):
 *   - `ai_call_log`: one row via AiCallLogRepository.insert.
 *   - `audit_log`:   one row via AuditLog.record (action: 'ai_call').
 *
 * Fail-fast:
 *   - Missing API key → record failure ('no_api_key') + return
 *     err({ code: 'INTERNAL', message: 'no_api_key' }) WITHOUT calling fn.
 *   - Budget exhausted → record failure ('budget_exceeded') + return
 *     err({ code: 'INTERNAL', message: 'budget_exceeded' }) WITHOUT calling fn.
 *
 * Design: Error Handling → Pola Transaksi & Kompensasi; Desain Keamanan dan
 * Privasi → Penggunaan ulang kunci.
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import { err, ok, type Result } from '@leads-generator/shared';

import type { AiBudgetTracker } from '../ai/ai-budget-tracker.js';
import type { AiCallLogInsert, AiCallLogRepository } from '../repository/ai-call-log-repository.js';
import type { DbExecutor } from '../repository/types.js';
import type { AuditLog } from '../privacy/audit-log.js';
import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';
import type { AiKeyPurpose } from '../repository/team-ai-settings-repository.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Contextual metadata supplied by the caller for every AI invocation.
 * Used for audit logging (R14.6 endpoint URL, R15.5 data scope).
 */
export interface AiCallContext {
  /** Team making the call (tenant scope). */
  teamId: string;
  /** Content generation job this call belongs to. */
  jobId: string;
  /** Actor who triggered the job (user uuid or 'system'). */
  actorId: string;
  /** Whether the job was triggered by an automated scan or a manual action. */
  trigger: 'scan' | 'manual';
  /** Granular call type within the content pipeline. */
  callType: 'planner_text' | 'background_image' | 'reference_description';
  /** Which encrypted API key slot should be used for this call. */
  apiKeyPurpose?: AiKeyPurpose;
  /** Target endpoint URL — for audit (R14.6). */
  endpointUrl: string;
  /** Human-readable description of what data was sent — for audit (R15.5). */
  dataScope: string;
}

// ---------------------------------------------------------------------------
// Outcome type (union of all possible ai_call_log outcome values)
// ---------------------------------------------------------------------------

type AiCallOutcome = AiCallLogInsert['outcome'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a thrown error to a standard `AiCallOutcome` string.
 *
 * - Abort / Timeout errors → 'timeout'
 * - Everything else        → 'provider_error'
 */
function mapError(e: unknown): AiCallOutcome {
  if (e instanceof Error && (e.name.includes('Abort') || e.name.includes('Timeout'))) {
    return 'timeout';
  }
  return 'provider_error';
}

// ---------------------------------------------------------------------------
// AiCallWrapper
// ---------------------------------------------------------------------------

/**
 * Dependencies injected into {@link AiCallWrapper}.
 */
export interface AiCallWrapperDeps {
  settings: TeamAiSettingsService;
  budget: AiBudgetTracker;
  callLog: AiCallLogRepository;
  /** Only the `record` method is needed — keeps the wrapper test-friendly. */
  audit: Pick<AuditLog, 'record'>;
}

/**
 * Team-scoped wrapper that enforces API-key + budget pre-checks and writes
 * exactly one `ai_call_log` + one `audit_log` row per invocation.
 *
 * @example
 * ```ts
 * const result = await wrapper.execute(ctx, (apiKey) =>
 *   fetch(`${endpoint}/generate`, { headers: { Authorization: `Bearer ${apiKey}` } })
 *     .then((r) => r.json()),
 * );
 * ```
 */
export class AiCallWrapper {
  constructor(
    private readonly deps: AiCallWrapperDeps,
    private readonly db: DbExecutor,
  ) {}

  /**
   * Execute an AI provider call with full pre-check + audit trail.
   *
   * Steps:
   *   1. Load API key → no key → record + return err('no_api_key')
   *   2. Budget check → exhausted → record + return err('budget_exceeded')
   *   3. Call `fn(apiKey)` → capture outcome
   *   4. Write `ai_call_log` (one row)
   *   5. Write `audit_log`  (one row, action: 'ai_call')
   *   6. If step 3 threw → return err(outcome)
   *   7. Else → return ok(result)
   */
  async execute<T>(
    ctx: AiCallContext,
    fn: (apiKey: string) => Promise<T>,
  ): Promise<Result<T>> {
    // -----------------------------------------------------------------------
    // Step 1: Load API key
    // -----------------------------------------------------------------------
    const apiKey = await this.deps.settings.loadApiKey(ctx.teamId, ctx.apiKeyPurpose ?? 'content_suggestion');
    if (apiKey === null) {
      await this._record(ctx, 'no_api_key');
      return err({ code: 'INTERNAL', message: 'no_api_key' });
    }

    // -----------------------------------------------------------------------
    // Step 2: Budget pre-check (fail-fast before calling provider)
    // -----------------------------------------------------------------------
    const budgetCheck = await this.deps.budget.canCall(ctx.teamId);
    if (!budgetCheck.allowed) {
      await this._record(ctx, 'budget_exceeded');
      return err({ code: 'INTERNAL', message: 'budget_exceeded' });
    }

    // -----------------------------------------------------------------------
    // Step 3: Execute the provider call
    // -----------------------------------------------------------------------
    let outcome: AiCallOutcome = 'success';
    let callResult: T | undefined;
    let callError: unknown;

    try {
      callResult = await fn(apiKey);
    } catch (e) {
      outcome = mapError(e);
      callError = e;
    }

    // -----------------------------------------------------------------------
    // Steps 4 & 5: Record call log + audit (always, success or failure)
    // -----------------------------------------------------------------------
    await this._record(ctx, outcome);

    // -----------------------------------------------------------------------
    // Steps 6 & 7: Return result or error
    // -----------------------------------------------------------------------
    if (callError !== undefined) {
      return err({ code: 'INTERNAL', message: outcome });
    }

    return ok(callResult as T);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Write one `ai_call_log` row and one `audit_log` row for the given
   * outcome. Errors from either write are intentionally propagated so the
   * caller knows the audit trail may be incomplete.
   */
  private async _record(ctx: AiCallContext, outcome: AiCallOutcome): Promise<void> {
    // ai_call_log (R13.3)
    await this.deps.callLog.insert(this.db, {
      teamId: ctx.teamId,
      leadId: null,
      trigger: ctx.trigger,
      outcome,
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });

    // audit_log (action: 'ai_call', R13.3, R14.6, R15.5)
    await this.deps.audit.record({
      teamId: ctx.teamId,
      actorId: ctx.actorId,
      action: 'ai_call',
      objectType: ctx.callType,
      objectId: ctx.jobId,
      metadata: {
        trigger: ctx.trigger,
        outcome,
        endpointUrl: ctx.endpointUrl,
        dataScope: ctx.dataScope,
        apiKeyPurpose: ctx.apiKeyPurpose ?? 'content_suggestion',
      },
    });
  }
}
