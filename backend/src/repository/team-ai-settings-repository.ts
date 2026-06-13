/**
 * Tenant-scoped repository for `team_ai_settings` rows (Task 17.2, R13.2,
 * R13.10, R13.15, R13.18).
 *
 * Design references:
 * - design.md → Components and Interfaces → AI_Analyzer_Service (R13).
 * - design.md → Data Models → Pengayaan AI (R13): table `team_ai_settings`
 *   keyed by `team_id`, holding the encrypted Gemini API key, the global
 *   AI toggle, the 30-day AI_Call_Budget, and the `ai_intent_match` factor
 *   weight.
 * - design.md → Security → Kredensial connector (mekanisme setara): the
 *   Gemini key is stored encrypted at-rest with the SAME envelope format as
 *   connector credentials and plaintext is never logged.
 *
 * This repository deliberately mirrors {@link TeamConnectorRepository}:
 * - The public read (`getForTeam`) NEVER exposes the encrypted bytea —
 *   it only reports whether a key is set.
 * - A single INTERNAL method (`getEncryptedApiKeyForVault`) returns the raw
 *   envelope, and it MUST only be called from {@link TeamAiSettingsService}.
 *
 * Admin-only enforcement (RBAC `ai.configure`, R13.18) is applied at the
 * API layer (Task 18.4); this repository stays RBAC-agnostic.
 */

import { query, type DbExecutor } from './types.js';

export type AiKeyPurpose = 'leads' | 'content_suggestion' | 'image_generation';

/**
 * Non-sensitive view of a Team's AI settings. Conspicuously absent: the
 * encrypted key bytes. `hasApiKey` reports presence without exposing the
 * secret (used by the toggle pre-check in Task 17.5 and by the worker).
 */
export interface TeamAiSettings {
  /** R13.18 — global AI availability toggle for the Team. */
  aiEnabled: boolean;
  /** R13.15 — max AI_Provider calls per rolling 30-day window. */
  callBudget30d: number;
  /** R13.10 — weight of the `ai_intent_match` factor in scoring. */
  aiIntentFactorWeight: number;
  /** True when an encrypted Gemini API key is stored for the Team. */
  hasApiKey: boolean;
  /** True when a Leads AI key is stored for the Team. */
  hasLeadsApiKey: boolean;
  /** True when a content suggestion/text key is stored for the Team. */
  hasContentSuggestionApiKey: boolean;
  /** True when an image generation key is stored for the Team. */
  hasImageGenerationApiKey: boolean;
  textApiBaseUrl: string;
  imageGenerationApiBaseUrl: string;
  textModel: string;
  imageModel: string;
}

/**
 * Raw projection used to build a {@link TeamAiSettings}. `pg` returns
 * `numeric` columns as strings, so `ai_intent_factor_weight` is typed as a
 * string and parsed by the mapper below.
 */
interface TeamAiSettingsRow {
  ai_enabled: boolean;
  call_budget_30d: number;
  ai_intent_factor_weight: string;
  has_api_key: boolean;
  has_leads_api_key: boolean;
  has_content_suggestion_api_key: boolean;
  has_image_generation_api_key: boolean;
  text_api_base_url: string | null;
  image_generation_api_base_url: string | null;
  text_model: string | null;
  image_model: string | null;
}

/**
 * Defaults applied when a Team has no `team_ai_settings` row yet. These
 * mirror the column defaults declared in
 * `1700000002000_ai-analyzer-schema.cjs` so callers see consistent values
 * whether or not a row has been materialised.
 */
const DEFAULT_SETTINGS: TeamAiSettings = {
  aiEnabled: false,
  callBudget30d: 0,
  aiIntentFactorWeight: 1.0,
  hasApiKey: false,
  hasLeadsApiKey: false,
  hasContentSuggestionApiKey: false,
  hasImageGenerationApiKey: false,
  textApiBaseUrl: '',
  imageGenerationApiBaseUrl: '',
  textModel: 'gemini-2.5-flash-lite',
  imageModel: 'gpt-image-1',
};

/**
 * Columns selected for the public-facing {@link TeamAiSettings}. The
 * encrypted key is reduced to a boolean (`has_api_key`) in SQL so the
 * bytea never crosses the repository boundary through this path.
 */
const SETTINGS_COLUMNS = `
  ai_enabled,
  call_budget_30d,
  ai_intent_factor_weight,
  (
    COALESCE(encrypted_leads_api_key, encrypted_content_suggestion_api_key, encrypted_gemini_api_key) IS NOT NULL
    OR COALESCE(encrypted_image_generation_api_key, encrypted_gemini_api_key) IS NOT NULL
  ) AS has_api_key,
  (COALESCE(encrypted_leads_api_key, encrypted_content_suggestion_api_key, encrypted_gemini_api_key) IS NOT NULL) AS has_leads_api_key,
  (COALESCE(encrypted_content_suggestion_api_key, encrypted_leads_api_key, encrypted_gemini_api_key) IS NOT NULL) AS has_content_suggestion_api_key,
  (COALESCE(encrypted_image_generation_api_key, encrypted_gemini_api_key) IS NOT NULL) AS has_image_generation_api_key,
  COALESCE(leads_api_base_url, '') AS text_api_base_url,
  COALESCE(image_generation_api_base_url, '') AS image_generation_api_base_url,
  COALESCE(text_model, 'gemini-2.5-flash-lite') AS text_model,
  COALESCE(image_model, 'gpt-image-1') AS image_model
`;

function keyColumn(purpose: AiKeyPurpose): string {
  switch (purpose) {
    case 'leads':
      return 'encrypted_leads_api_key';
    case 'content_suggestion':
      return 'encrypted_content_suggestion_api_key';
    case 'image_generation':
      return 'encrypted_image_generation_api_key';
  }
}

/**
 * Repository for the `team_ai_settings` table. All methods are team-scoped
 * (Tenant Guard, R2.8). Upserts use `INSERT ... ON CONFLICT (team_id) DO
 * UPDATE` so a Team's settings row is created on first write and mutated
 * thereafter; every write stamps `updated_at = now()`.
 */
export class TeamAiSettingsRepository {
  constructor(private readonly db: DbExecutor) {}

  /**
   * Read the non-sensitive AI settings for a Team. Returns sane defaults
   * (AI disabled, zero budget, weight 1.0, no key) when no row exists yet,
   * so callers need not special-case the "never configured" state.
   *
   * Never decrypts and never exposes the encrypted bytea.
   */
  async getForTeam(teamId: string): Promise<TeamAiSettings> {
    const rows = await query<TeamAiSettingsRow>(
      this.db,
      `SELECT ${SETTINGS_COLUMNS}
         FROM team_ai_settings
        WHERE team_id = $1`,
      [teamId],
    );
    if (rows.length === 0) return { ...DEFAULT_SETTINGS };
    const row = rows[0]!;
    return {
      aiEnabled: row.ai_enabled,
      callBudget30d: row.call_budget_30d,
      aiIntentFactorWeight: Number(row.ai_intent_factor_weight),
      hasApiKey: row.has_api_key,
      hasLeadsApiKey: row.has_leads_api_key,
      hasContentSuggestionApiKey: row.has_content_suggestion_api_key,
      hasImageGenerationApiKey: row.has_image_generation_api_key,
      textApiBaseUrl: row.text_api_base_url ?? '',
      imageGenerationApiBaseUrl: row.image_generation_api_base_url ?? '',
      textModel: row.text_model ?? 'gemini-2.5-flash-lite',
      imageModel: row.image_model ?? 'gpt-image-1',
    };
  }

  /**
   * INTERNAL: only call from {@link TeamAiSettingsService}.
   *
   * Reads the raw `encrypted_gemini_api_key` envelope for a Team. This is
   * the ONE access path that exposes the encrypted payload, mirroring
   * {@link TeamConnectorRepository.getEncryptedCredentialsForVault}. It MUST
   * NOT be re-exported from the repository barrel and MUST NOT be called
   * from API handlers, services, or workers other than the AI settings
   * service.
   *
   * Returns `null` when no row exists OR the column is null (both mean "no
   * key configured for this Team").
   */
  async getEncryptedApiKeyForVault(teamId: string, purpose: AiKeyPurpose = 'leads'): Promise<Buffer | null> {
    const expression =
      purpose === 'leads'
        ? 'COALESCE(encrypted_leads_api_key, encrypted_content_suggestion_api_key, encrypted_gemini_api_key)'
        : purpose === 'content_suggestion'
          ? 'COALESCE(encrypted_content_suggestion_api_key, encrypted_leads_api_key, encrypted_gemini_api_key)'
          : 'COALESCE(encrypted_image_generation_api_key, encrypted_gemini_api_key)';
    const rows = await query<{ encrypted_api_key: Buffer | null }>(
      this.db,
      `SELECT ${expression} AS encrypted_api_key
         FROM team_ai_settings
        WHERE team_id = $1`,
      [teamId],
    );
    if (rows.length === 0) return null;
    return rows[0]!.encrypted_api_key ?? null;
  }

  /**
   * Upsert the encrypted Gemini API key envelope for a Team. Pass `null`
   * to clear a stored key. The caller is responsible for envelope-encrypting
   * the secret first — this method never sees plaintext (R13.2).
   */
  async setEncryptedApiKey(teamId: string, envelope: Buffer | null, purpose: AiKeyPurpose = 'leads'): Promise<void> {
    const column = keyColumn(purpose);
    await query(
      this.db,
      `INSERT INTO team_ai_settings (team_id, ${column})
       VALUES ($1, $2)
       ON CONFLICT (team_id) DO UPDATE
         SET ${column} = EXCLUDED.${column},
             updated_at = now()`,
      [teamId, envelope],
    );
  }

  async setApiBaseUrl(teamId: string, purpose: AiKeyPurpose, baseUrl: string): Promise<void> {
    const column = purpose === 'image_generation' ? 'image_generation_api_base_url' : 'leads_api_base_url';
    await query(
      this.db,
      `INSERT INTO team_ai_settings (team_id, ${column})
       VALUES ($1, $2)
       ON CONFLICT (team_id) DO UPDATE
         SET ${column} = EXCLUDED.${column},
             updated_at = now()`,
      [teamId, baseUrl],
    );
  }

  /** Upsert the global AI toggle for a Team (R13.18). */
  async setAiEnabled(teamId: string, enabled: boolean): Promise<void> {
    await query(
      this.db,
      `INSERT INTO team_ai_settings (team_id, ai_enabled)
       VALUES ($1, $2)
       ON CONFLICT (team_id) DO UPDATE
         SET ai_enabled = EXCLUDED.ai_enabled,
             updated_at = now()`,
      [teamId, enabled],
    );
  }

  async setTextModel(teamId: string, model: string): Promise<void> {
    await query(
      this.db,
      `INSERT INTO team_ai_settings (team_id, text_model)
       VALUES ($1, $2)
       ON CONFLICT (team_id) DO UPDATE
         SET text_model = EXCLUDED.text_model,
             updated_at = now()`,
      [teamId, model],
    );
  }

  async setImageModel(teamId: string, model: string): Promise<void> {
    await query(
      this.db,
      `INSERT INTO team_ai_settings (team_id, image_model)
       VALUES ($1, $2)
       ON CONFLICT (team_id) DO UPDATE
         SET image_model = EXCLUDED.image_model,
             updated_at = now()`,
      [teamId, model],
    );
  }

  /**
   * Upsert the AI_Call_Budget for a Team (R13.14, R13.15). `n` must be a
   * non-negative integer; the DB CHECK (`call_budget_30d >= 0`) is the
   * backstop, but callers should validate before reaching SQL.
   */
  async setCallBudget30d(teamId: string, n: number): Promise<void> {
    await query(
      this.db,
      `INSERT INTO team_ai_settings (team_id, call_budget_30d)
       VALUES ($1, $2)
       ON CONFLICT (team_id) DO UPDATE
         SET call_budget_30d = EXCLUDED.call_budget_30d,
             updated_at = now()`,
      [teamId, n],
    );
  }

  /**
   * Upsert the `ai_intent_match` factor weight for a Team (R13.10). `w`
   * must be non-negative; the DB CHECK (`ai_intent_factor_weight >= 0`) is
   * the backstop.
   */
  async setAiIntentFactorWeight(teamId: string, w: number): Promise<void> {
    await query(
      this.db,
      `INSERT INTO team_ai_settings (team_id, ai_intent_factor_weight)
       VALUES ($1, $2)
       ON CONFLICT (team_id) DO UPDATE
         SET ai_intent_factor_weight = EXCLUDED.ai_intent_factor_weight,
             updated_at = now()`,
      [teamId, w],
    );
  }
}
