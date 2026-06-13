import { describe, it, expect, vi } from 'vitest';
import { AiBudgetTracker } from '../../src/ai/ai-budget-tracker.js';

describe('AiBudgetTracker', () => {
  it('allows if budget is 0 (unlimited)', async () => {
    const tracker = new AiBudgetTracker({
      settings: { getForTeam: async () => ({ callBudget30d: 0 }) } as any,
      callLog: { countSince: async () => 9999 } as any,
    });
    const result = await tracker.canCall('team-1');
    expect(result.allowed).toBe(true);
  });

  it('allows if call count is strictly less than budget', async () => {
    const tracker = new AiBudgetTracker({
      settings: { getForTeam: async () => ({ callBudget30d: 100 }) } as any,
      callLog: { countSince: async () => 99 } as any,
    });
    const result = await tracker.canCall('team-1');
    expect(result.allowed).toBe(true);
  });

  it('denies if call count equals or exceeds budget', async () => {
    const tracker = new AiBudgetTracker({
      settings: { getForTeam: async () => ({ callBudget30d: 100 }) } as any,
      callLog: { countSince: async () => 100 } as any,
    });
    const result = await tracker.canCall('team-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('budget_exceeded');
  });

  it('queries call log with a rolling 30-day window', async () => {
    const now = new Date('2026-06-01T12:00:00Z');
    const expectedSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const countSinceFn = vi.fn().mockResolvedValue(10);
    
    const tracker = new AiBudgetTracker({
      settings: { getForTeam: async () => ({ callBudget30d: 100 }) } as any,
      callLog: { countSince: countSinceFn } as any,
      now: () => now,
    });

    await tracker.canCall('team-1');
    expect(countSinceFn).toHaveBeenCalledWith('team-1', expectedSince);
  });
});
