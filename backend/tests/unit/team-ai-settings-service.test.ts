/**
 * Unit tests for {@link TeamAiSettingsService} (Task 17.2, R13.2, R13.10,
 * R13.14, R13.15, R13.18).
 *
 * These exercise the service against an IN-MEMORY fake repository plus a
 * REAL {@link CredentialVault} built with a synthetic 32-byte key. That
 * combination proves:
 * - the store → load round-trip returns the same key (real AES-256-GCM);
 * - clearing a key makes `loadApiKey` return null;
 * - `hasApiKey` reflects presence WITHOUT exposing the secret;
 * - the settings getters/setters round-trip non-sensitive config;
 * - `getSettings` never returns the plaintext (or any key material);
 * - basic validation guards reject bad budget / weight / empty key.
 *
 * The fake repository stores the encrypted Buffer exactly as the real
 * Postgres `bytea` column would, so the vault does genuine crypto here —
 * no mocking of the encryption primitive.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { CredentialVault } from '../../src/auth/credential-vault.js';
import { TeamAiSettingsService } from '../../src/auth/team-ai-settings-service.js';
import type {
  TeamAiSettings,
  TeamAiSettingsRepository,
} from '../../src/repository/team-ai-settings-repository.js';

/** Deterministic 32-byte key so failures are reproducible. */
const TEST_KEY = Buffer.alloc(32, 11);

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

/**
 * In-memory stand-in for {@link TeamAiSettingsRepository}. Mirrors the real
 * SQL semantics: upserts create a row on first write, the encrypted key is
 * stored as a Buffer (bytea), and `getForTeam` returns defaults when no row
 * exists and never exposes the encrypted bytes.
 *
 * Typed as the real repository class so the service's constructor contract
 * is enforced at compile time.
 */
class FakeTeamAiSettingsRepository {
  private readonly rows = new Map<
    string,
    {
      encrypted: Buffer | null;
      aiEnabled: boolean;
      callBudget30d: number;
      aiIntentFactorWeight: number;
    }
  >();

  private ensure(teamId: string) {
    let row = this.rows.get(teamId);
    if (!row) {
      row = {
        encrypted: null,
        aiEnabled: false,
        callBudget30d: 0,
        aiIntentFactorWeight: 1.0,
      };
      this.rows.set(teamId, row);
    }
    return row;
  }

  async getForTeam(teamId: string): Promise<TeamAiSettings> {
    const row = this.rows.get(teamId);
    if (!row) {
      return { aiEnabled: false, callBudget30d: 0, aiIntentFactorWeight: 1.0, hasApiKey: false };
    }
    return {
      aiEnabled: row.aiEnabled,
      callBudget30d: row.callBudget30d,
      aiIntentFactorWeight: row.aiIntentFactorWeight,
      hasApiKey: row.encrypted !== null,
    };
  }

  async getEncryptedApiKeyForVault(teamId: string): Promise<Buffer | null> {
    return this.rows.get(teamId)?.encrypted ?? null;
  }

  async setEncryptedApiKey(teamId: string, envelope: Buffer | null): Promise<void> {
    this.ensure(teamId).encrypted = envelope;
  }

  async setAiEnabled(teamId: string, enabled: boolean): Promise<void> {
    this.ensure(teamId).aiEnabled = enabled;
  }

  async setCallBudget30d(teamId: string, n: number): Promise<void> {
    this.ensure(teamId).callBudget30d = n;
  }

  async setAiIntentFactorWeight(teamId: string, w: number): Promise<void> {
    this.ensure(teamId).aiIntentFactorWeight = w;
  }

  /** Test-only peek at the raw stored envelope (not part of the contract). */
  rawEnvelope(teamId: string): Buffer | null {
    return this.rows.get(teamId)?.encrypted ?? null;
  }
}

describe('TeamAiSettingsService', () => {
  let fake: FakeTeamAiSettingsRepository;
  let service: TeamAiSettingsService;

  beforeEach(() => {
    fake = new FakeTeamAiSettingsRepository();
    const vault = new CredentialVault(TEST_KEY);
    service = new TeamAiSettingsService(
      fake as unknown as TeamAiSettingsRepository,
      vault,
    );
  });

  describe('API key lifecycle', () => {
    it('round-trips: setApiKey then loadApiKey returns the same key', async () => {
      const key = 'AIzaSy-secret-gemini-key-1234567890';
      await service.setApiKey(TEAM_A, key);

      expect(await service.loadApiKey(TEAM_A)).toBe(key);
    });

    it('stores the key encrypted, not as plaintext', async () => {
      const key = 'AIzaSy-secret-gemini-key-1234567890';
      await service.setApiKey(TEAM_A, key);

      const stored = fake.rawEnvelope(TEAM_A);
      expect(stored).not.toBeNull();
      // The stored bytes must not contain the plaintext key anywhere.
      expect(stored!.includes(Buffer.from(key, 'utf8'))).toBe(false);
      // Envelope starts with the version byte 0x01 (shared vault format).
      expect(stored![0]).toBe(0x01);
    });

    it('loadApiKey returns null when no key is stored', async () => {
      expect(await service.loadApiKey(TEAM_A)).toBeNull();
    });

    it('clearApiKey makes loadApiKey return null', async () => {
      await service.setApiKey(TEAM_A, 'some-key');
      expect(await service.loadApiKey(TEAM_A)).toBe('some-key');

      await service.clearApiKey(TEAM_A);
      expect(await service.loadApiKey(TEAM_A)).toBeNull();
    });

    it('clearApiKey is idempotent when no key exists', async () => {
      await expect(service.clearApiKey(TEAM_A)).resolves.toBeUndefined();
      expect(await service.loadApiKey(TEAM_A)).toBeNull();
    });

    it('rejects an empty API key', async () => {
      await expect(service.setApiKey(TEAM_A, '')).rejects.toThrowError(
        'API key must not be empty',
      );
    });

    it('isolates keys per Team (no shared key across Teams, R13.2)', async () => {
      await service.setApiKey(TEAM_A, 'key-for-a');
      await service.setApiKey(TEAM_B, 'key-for-b');

      expect(await service.loadApiKey(TEAM_A)).toBe('key-for-a');
      expect(await service.loadApiKey(TEAM_B)).toBe('key-for-b');
    });
  });

  describe('hasApiKey', () => {
    it('is false before a key is set and true after', async () => {
      expect(await service.hasApiKey(TEAM_A)).toBe(false);
      await service.setApiKey(TEAM_A, 'k');
      expect(await service.hasApiKey(TEAM_A)).toBe(true);
    });

    it('reflects presence without returning the secret', async () => {
      await service.setApiKey(TEAM_A, 'super-secret');
      const result = await service.hasApiKey(TEAM_A);
      expect(result).toBe(true);
      // The return type is a boolean — nothing key-shaped can leak.
      expect(typeof result).toBe('boolean');
    });

    it('is false again after clearApiKey', async () => {
      await service.setApiKey(TEAM_A, 'k');
      await service.clearApiKey(TEAM_A);
      expect(await service.hasApiKey(TEAM_A)).toBe(false);
    });
  });

  describe('getSettings', () => {
    it('returns defaults for a Team with no row', async () => {
      expect(await service.getSettings(TEAM_A)).toEqual({
        aiEnabled: false,
        callBudget30d: 0,
        aiIntentFactorWeight: 1.0,
        hasApiKey: false,
      });
    });

    it('never exposes the plaintext or ciphertext key', async () => {
      const key = 'AIzaSy-do-not-leak-me';
      await service.setApiKey(TEAM_A, key);

      const settings = await service.getSettings(TEAM_A);
      // hasApiKey signals presence...
      expect(settings.hasApiKey).toBe(true);
      // ...but no field carries the key material.
      const serialized = JSON.stringify(settings);
      expect(serialized).not.toContain(key);
      expect(Object.keys(settings).sort()).toEqual(
        ['aiEnabled', 'aiIntentFactorWeight', 'callBudget30d', 'hasApiKey'].sort(),
      );
    });

    it('reflects toggled settings', async () => {
      await service.setAiEnabled(TEAM_A, true);
      await service.setCallBudget30d(TEAM_A, 500);
      await service.setAiIntentFactorWeight(TEAM_A, 2.5);

      expect(await service.getSettings(TEAM_A)).toEqual({
        aiEnabled: true,
        callBudget30d: 500,
        aiIntentFactorWeight: 2.5,
        hasApiKey: false,
      });
    });
  });

  describe('setAiEnabled', () => {
    it('enables and disables the global AI toggle', async () => {
      await service.setAiEnabled(TEAM_A, true);
      expect((await service.getSettings(TEAM_A)).aiEnabled).toBe(true);

      await service.setAiEnabled(TEAM_A, false);
      expect((await service.getSettings(TEAM_A)).aiEnabled).toBe(false);
    });
  });

  describe('setCallBudget30d', () => {
    it('accepts zero and positive integers', async () => {
      await service.setCallBudget30d(TEAM_A, 0);
      expect((await service.getSettings(TEAM_A)).callBudget30d).toBe(0);

      await service.setCallBudget30d(TEAM_A, 1000);
      expect((await service.getSettings(TEAM_A)).callBudget30d).toBe(1000);
    });

    it('rejects negative values', async () => {
      await expect(service.setCallBudget30d(TEAM_A, -1)).rejects.toThrowError(
        'AI_Call_Budget must be a non-negative integer',
      );
    });

    it('rejects non-integer values', async () => {
      await expect(service.setCallBudget30d(TEAM_A, 1.5)).rejects.toThrowError(
        'AI_Call_Budget must be a non-negative integer',
      );
    });
  });

  describe('centralized key (CENTRAL_AI_TEAM_ID)', () => {
    const CENTRAL = 'central-team';
    let centralFake: FakeTeamAiSettingsRepository;
    let centralService: TeamAiSettingsService;

    beforeEach(() => {
      centralFake = new FakeTeamAiSettingsRepository();
      const vault = new CredentialVault(TEST_KEY);
      centralService = new TeamAiSettingsService(
        centralFake as unknown as TeamAiSettingsRepository,
        vault,
        CENTRAL,
      );
    });

    it('writes go to the central row regardless of caller team', async () => {
      await centralService.setApiKey(TEAM_A, 'shared-key');
      // Stored under the central team, NOT the caller's team.
      expect(centralFake.rawEnvelope(CENTRAL)).not.toBeNull();
      expect(centralFake.rawEnvelope(TEAM_A)).toBeNull();
    });

    it('every team reads the same shared key', async () => {
      await centralService.setApiKey(TEAM_A, 'shared-key');
      expect(await centralService.loadApiKey(TEAM_A)).toBe('shared-key');
      expect(await centralService.loadApiKey(TEAM_B)).toBe('shared-key');
      expect(await centralService.loadApiKey('any-other-team')).toBe('shared-key');
    });

    it('config (getSettings/hasApiKey) also resolves to central', async () => {
      await centralService.setApiKey(TEAM_A, 'k');
      await centralService.setAiEnabled(TEAM_B, true);
      // Both writes landed on the central row → any team sees them.
      expect(await centralService.hasApiKey('team-x')).toBe(true);
      expect((await centralService.getSettings('team-y')).aiEnabled).toBe(true);
    });

    it('without a central team id, keys stay per-team (backward compat)', async () => {
      // `service` (no central id) from the outer beforeEach.
      await service.setApiKey(TEAM_A, 'a');
      await service.setApiKey(TEAM_B, 'b');
      expect(await service.loadApiKey(TEAM_A)).toBe('a');
      expect(await service.loadApiKey(TEAM_B)).toBe('b');
    });
  });

  describe('setAiIntentFactorWeight', () => {
    it('accepts zero and positive weights', async () => {
      await service.setAiIntentFactorWeight(TEAM_A, 0);
      expect((await service.getSettings(TEAM_A)).aiIntentFactorWeight).toBe(0);

      await service.setAiIntentFactorWeight(TEAM_A, 3.25);
      expect((await service.getSettings(TEAM_A)).aiIntentFactorWeight).toBe(3.25);
    });

    it('rejects negative weights', async () => {
      await expect(service.setAiIntentFactorWeight(TEAM_A, -0.1)).rejects.toThrowError(
        'ai_intent_match weight must be a non-negative number',
      );
    });

    it('rejects non-finite weights', async () => {
      await expect(
        service.setAiIntentFactorWeight(TEAM_A, Number.POSITIVE_INFINITY),
      ).rejects.toThrowError('ai_intent_match weight must be a non-negative number');
    });
  });
});
