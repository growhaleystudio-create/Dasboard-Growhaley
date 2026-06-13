/**
 * TeamAiSettingsService — the only sanctioned bridge between
 * {@link CredentialVault} (pure crypto) and the `team_ai_settings` table
 * ({@link TeamAiSettingsRepository}) for the per-Team Gemini API key and
 * AI configuration (Task 17.2, R13.2, R13.10, R13.14, R13.15, R13.18).
 *
 * Why this split mirrors {@link CredentialVaultService}:
 * - {@link CredentialVault} is pure crypto and reusable. Per design.md
 *   (Security → Kredensial connector: "mekanisme setara"), the Gemini key
 *   uses the SAME envelope format as connector credentials.
 * - {@link TeamAiSettingsRepository} owns SQL and tenant-scoped lookups but
 *   never touches plaintext.
 * - This service composes both. It is the ONLY caller of
 *   `TeamAiSettingsRepository.getEncryptedApiKeyForVault`, per the
 *   "INTERNAL: only call from TeamAiSettingsService" contract on that
 *   method.
 *
 * Authorization: every operation here is Admin-only via RBAC `ai.configure`
 * (R13.18). Enforcement lives at the API layer (Task 18.4); this service is
 * intentionally RBAC-agnostic so it stays unit-testable without a request
 * context. Callers MUST gate these methods behind `ai.configure`.
 *
 * Logging policy: this module never logs the plaintext API key, the
 * encrypted envelope, or detailed decryption errors. Decryption failures
 * bubble up as the generic `Error('credential decryption failed')` raised
 * by {@link CredentialVault.decrypt}.
 */

import type {
  AiKeyPurpose,
  TeamAiSettings,
  TeamAiSettingsRepository,
} from '../repository/team-ai-settings-repository.js';

import type { CredentialVault } from './credential-vault.js';

/**
 * Team-scoped service for AI configuration. All methods take `teamId` as
 * their first argument (Tenant Guard, R2.8).
 */
export class TeamAiSettingsService {
  constructor(
    private readonly repo: TeamAiSettingsRepository,
    private readonly vault: CredentialVault,
  ) {}

  /**
   * Encrypt `plaintext` and persist the envelope for the given Team
   * (R13.2). Overwrites any previously stored key.
   *
   * Plaintext never leaves this method as a string — only the encrypted
   * Buffer reaches the repository, and it is never logged.
   *
   * @throws Error if `plaintext` is empty (use {@link clearApiKey} to
   *   remove a key instead).
   */
  async setApiKey(teamId: string, plaintext: string, purpose: AiKeyPurpose = 'leads'): Promise<void> {
    if (plaintext.length === 0) {
      throw new Error('API key must not be empty');
    }
    const envelope = this.vault.encrypt(plaintext);
    await this.repo.setEncryptedApiKey(teamId, envelope, purpose);
  }

  /**
   * Clear the stored Gemini API key for a Team (R13.2). Idempotent: a
   * no-op when no key was stored.
   */
  async clearApiKey(teamId: string, purpose: AiKeyPurpose = 'leads'): Promise<void> {
    await this.repo.setEncryptedApiKey(teamId, null, purpose);
  }

  async setApiBaseUrl(teamId: string, baseUrl: string, purpose: AiKeyPurpose = 'leads'): Promise<void> {
    const normalized = normalizeBaseUrl(baseUrl);
    await this.repo.setApiBaseUrl(teamId, purpose, normalized);
  }

  async loadApiBaseUrl(teamId: string, purpose: AiKeyPurpose = 'leads'): Promise<string> {
    const settings = await this.repo.getForTeam(teamId);
    return purpose === 'image_generation' ? settings.imageGenerationApiBaseUrl : settings.textApiBaseUrl;
  }

  /**
   * Load and decrypt the Gemini API key for a Team. Returns `null` when no
   * key is stored. Used by the AI worker just before calling the provider.
   *
   * @throws the generic `Error('credential decryption failed')` raised by
   *   {@link CredentialVault.decrypt} on any envelope corruption.
   */
  async loadApiKey(teamId: string, purpose: AiKeyPurpose = 'leads'): Promise<string | null> {
    const envelope = await this.repo.getEncryptedApiKeyForVault(teamId, purpose);
    if (envelope === null) return null;
    return this.vault.decrypt(envelope);
  }

  /**
   * Report whether a Gemini API key is stored for a Team WITHOUT exposing
   * the secret (R13.3, R13.5). Used by the Scan_Configuration AI toggle
   * pre-check (Task 17.5) and the worker.
   */
  async hasApiKey(teamId: string, purpose?: AiKeyPurpose): Promise<boolean> {
    const settings = await this.repo.getForTeam(teamId);
    if (purpose === 'leads') return settings.hasLeadsApiKey;
    if (purpose === 'content_suggestion') return settings.hasContentSuggestionApiKey;
    if (purpose === 'image_generation') return settings.hasImageGenerationApiKey;
    return settings.hasApiKey;
  }

  /**
   * Return the non-sensitive AI settings for a Team: the global toggle,
   * the 30-day budget, the `ai_intent_match` factor weight, and whether a
   * key is set. NEVER returns the API key plaintext or ciphertext.
   */
  async getSettings(teamId: string): Promise<TeamAiSettings> {
    return this.repo.getForTeam(teamId);
  }

  /** Enable or disable AI globally for a Team (R13.18). */
  async setAiEnabled(teamId: string, enabled: boolean): Promise<void> {
    await this.repo.setAiEnabled(teamId, enabled);
  }

  async setTextModel(teamId: string, model: string): Promise<void> {
    if (model.trim().length === 0) {
      throw new Error('Text model name must not be empty');
    }
    await this.repo.setTextModel(teamId, model.trim());
  }

  async setImageModel(teamId: string, model: string): Promise<void> {
    if (model.trim().length === 0) {
      throw new Error('Image model name must not be empty');
    }
    await this.repo.setImageModel(teamId, model.trim());
  }

  /**
   * Set the AI_Call_Budget for a Team (R13.14). Validates that the value
   * is a non-negative integer before it reaches SQL (the DB CHECK is the
   * backstop).
   *
   * @throws Error if `n` is not a finite, non-negative integer.
   */
  async setCallBudget30d(teamId: string, n: number): Promise<void> {
    if (!Number.isInteger(n) || n < 0) {
      throw new Error('AI_Call_Budget must be a non-negative integer');
    }
    await this.repo.setCallBudget30d(teamId, n);
  }

  /**
   * Set the `ai_intent_match` factor weight for a Team (R13.10). Validates
   * that the value is a finite, non-negative number before it reaches SQL.
   *
   * @throws Error if `w` is not a finite, non-negative number.
   */
  async setAiIntentFactorWeight(teamId: string, w: number): Promise<void> {
    if (!Number.isFinite(w) || w < 0) {
      throw new Error('ai_intent_match weight must be a non-negative number');
    }
    await this.repo.setAiIntentFactorWeight(teamId, w);
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed.length === 0) return '';
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('API base URL must be a valid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('API base URL must use http or https');
  }
  return trimmed;
}
