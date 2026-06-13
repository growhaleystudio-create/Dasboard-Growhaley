import type { Tx } from '../db/transaction.js';
import { query, type DbExecutor } from './types.js';

export interface AiCallLogInsert {
  teamId: string;
  leadId?: string | null | undefined;
  trigger: 'scan' | 'manual';
  outcome:
    | 'success'
    | 'timeout'
    | 'provider_error'
    | 'malformed_output'
    | 'no_api_key'
    | 'budget_exceeded'
    | 'quota_exceeded';
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/**
 * Repository for the `ai_call_log` table (R13.8, R13.15).
 */
export class AiCallLogRepository {
  constructor(private readonly db: DbExecutor) {}

  /**
   * Insert a new AI call log entry.
   * Uses the provided transaction/executor.
   */
  async insert(tx: Tx | DbExecutor, entry: AiCallLogInsert): Promise<void> {
    await query(
      tx,
      `INSERT INTO ai_call_log (
         team_id, lead_id, trigger, outcome, prompt_tokens, output_tokens, total_tokens
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7
       )`,
      [
        entry.teamId,
        entry.leadId ?? null,
        entry.trigger,
        entry.outcome,
        entry.promptTokens ?? 0,
        entry.outputTokens ?? 0,
        entry.totalTokens ?? 0,
      ],
    );
  }

  /**
   * Count the number of AI calls made by a Team since a given time.
   * Used by AiBudgetTracker for the rolling 30-day window (R13.15).
   * Team-scoped (R2.8).
   */
  async countSince(teamId: string, since: Date): Promise<number> {
    const rows = await query<{ count: string }>(
      this.db,
      `SELECT COUNT(*)::text AS count
         FROM ai_call_log
        WHERE team_id = $1
          AND at >= $2`,
      [teamId, since],
    );
    const first = rows[0];
    return first ? Number(first.count) : 0;
  }

  async countByOutcomeSince(teamId: string, since: Date): Promise<Record<string, number>> {
    const rows = await query<{ outcome: string; count: string }>(
      this.db,
      `SELECT outcome, COUNT(*)::text AS count
         FROM ai_call_log
        WHERE team_id = $1
          AND at >= $2
        GROUP BY outcome`,
      [teamId, since],
    );

    return Object.fromEntries(rows.map((row) => [row.outcome, Number(row.count)]));
  }

  async sumTokensSince(teamId: string, since: Date): Promise<{ promptTokens: number; outputTokens: number; totalTokens: number }> {
    const rows = await query<{ prompt_tokens: string; output_tokens: string; total_tokens: string }>(
      this.db,
      `SELECT
          COALESCE(SUM(prompt_tokens), 0)::text AS prompt_tokens,
          COALESCE(SUM(output_tokens), 0)::text AS output_tokens,
          COALESCE(SUM(total_tokens), 0)::text AS total_tokens
         FROM ai_call_log
        WHERE team_id = $1
          AND at >= $2`,
      [teamId, since],
    );
    const first = rows[0];
    return {
      promptTokens: first ? Number(first.prompt_tokens) : 0,
      outputTokens: first ? Number(first.output_tokens) : 0,
      totalTokens: first ? Number(first.total_tokens) : 0,
    };
  }
}
