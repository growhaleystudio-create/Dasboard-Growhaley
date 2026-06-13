import type { AIUnavailableReason } from '@leads-generator/shared';
import type { Tx } from '../db/transaction.js';
import type { AiCallLogInsert, AiCallLogRepository } from '../repository/ai-call-log-repository.js';
import type { TeamAiSettingsRepository } from '../repository/team-ai-settings-repository.js';

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: AIUnavailableReason;
}

export interface AiBudgetTrackerDeps {
  settings: TeamAiSettingsRepository;
  callLog: AiCallLogRepository;
  now?: () => Date;
}

/**
 * Tracks and enforces the Team-level AI call budget over a rolling 30-day window (R13.15).
 */
export class AiBudgetTracker {
  constructor(private readonly deps: AiBudgetTrackerDeps) {}

  /**
   * Check if the Team is allowed to make an AI call based on their budget (R13.15).
   * 
   * Returns allowed=true if:
   * - callBudget30d is 0 (unlimited)
   * - callBudget30d > 0 AND the number of calls in the last 30 days is strictly less than the budget
   * 
   * Otherwise returns allowed=false with reason 'budget_exceeded'.
   */
  async canCall(teamId: string): Promise<BudgetCheckResult> {
    const settings = await this.deps.settings.getForTeam(teamId);
    
    if (settings.callBudget30d === 0) {
      return { allowed: true };
    }

    const now = this.deps.now ? this.deps.now() : new Date();
    // 30 days ago
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const callCount = await this.deps.callLog.countSince(teamId, thirtyDaysAgo);

    if (callCount >= settings.callBudget30d) {
      return { allowed: false, reason: 'budget_exceeded' };
    }

    return { allowed: true };
  }

  /**
   * Record an AI call attempt (success or failure) to the log (R13.8).
   * Joins the provided transaction.
   */
  async recordCall(tx: Tx, entry: AiCallLogInsert): Promise<void> {
    await this.deps.callLog.insert(tx, entry);
  }
}
