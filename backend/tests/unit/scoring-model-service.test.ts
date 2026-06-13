/**
 * Unit tests for {@link ScoringModelService} (Task 10.9, R7.3).
 *
 * The service is a thin façade over {@link ScoringModelRepository}: the
 * version bump itself lives in the repository SQL, so these tests assert the
 * service delegates correctly, surfaces the new version on update, and maps
 * a repository fault to a unified `INTERNAL` error.
 */

import { describe, it, expect } from 'vitest';
import type { ScoringFactor, ScoringModel } from '@leads-generator/shared';

import { ScoringModelService } from '../../src/scoring/index.js';
import type { ScoringModelRepository } from '../../src/repository/scoring-model-repository.js';

const FACTORS: ScoringFactor[] = [{ id: 'f1', kind: 'has_contact', weight: 1 }];

describe('ScoringModelService.update', () => {
  it('returns the upserted model with its (incremented) version', async () => {
    const upserted: ScoringModel = { teamId: 'team-1', version: 4, factors: FACTORS };
    const calls: { teamId: string; factors: ScoringFactor[] }[] = [];
    const repo = {
      async upsertForTeam(teamId: string, factors: ScoringFactor[]): Promise<ScoringModel> {
        calls.push({ teamId, factors });
        return upserted;
      },
    } as unknown as ScoringModelRepository;

    const service = new ScoringModelService(repo);
    const result = await service.update('team-1', FACTORS);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(upserted);
    expect(calls).toEqual([{ teamId: 'team-1', factors: FACTORS }]);
  });

  it('maps a repository fault to an INTERNAL AppError', async () => {
    const repo = {
      async upsertForTeam(): Promise<ScoringModel> {
        throw new Error('connection lost');
      },
    } as unknown as ScoringModelRepository;

    const service = new ScoringModelService(repo);
    const result = await service.update('team-1', FACTORS);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

describe('ScoringModelService.get', () => {
  it('returns the stored model, or null when none configured', async () => {
    const model: ScoringModel = { teamId: 'team-1', version: 1, factors: FACTORS };
    const repo = {
      async getForTeam(teamId: string): Promise<ScoringModel | null> {
        return teamId === 'team-1' ? model : null;
      },
    } as unknown as ScoringModelRepository;

    const service = new ScoringModelService(repo);
    expect(await service.get('team-1')).toEqual(model);
    expect(await service.get('team-2')).toBeNull();
  });
});
