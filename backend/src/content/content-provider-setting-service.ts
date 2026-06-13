/**
 * ContentProviderSettingService — Admin-only service for managing the
 * per-Team AI provider endpoint configuration.
 *
 * Design references:
 * - design.md → Components and Interfaces → ProviderEndpointResolver &
 *   ContentProviderSettingService (R14)
 * - design.md → Prinsip Desain Utama → "Endpoint sengaja": endpoint
 *   dikonfigurasi eksplisit, tidak pernah disimpulkan dari kunci API.
 *
 * Rules:
 * - `set`: validates baseUrl starts with 'https://' and kind is valid,
 *   upserts the setting, and writes a `content_manage` Audit_Log entry
 *   (R14.1, R14.2).
 * - `get`: returns the stored setting or the google_official default when
 *   no setting has been configured yet (R14.1).
 * - NO logic that infers provider kind from API key shape — endpoint is
 *   resolved exclusively from the stored setting.
 *
 * Requirements: 14.1, 14.2
 */

import type { ProviderSetting } from '@leads-generator/shared';
import { err, ok, type Result } from '@leads-generator/shared';

import type { AuditLog } from '../privacy/audit-log.js';
import type { ContentProviderSettingRepository } from '../repository/content-provider-setting-repository.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SETTING: Omit<ProviderSetting, 'teamId'> = {
  kind: 'google_official',
  baseUrl: 'https://generativelanguage.googleapis.com',
};

const VALID_KINDS: ReadonlySet<string> = new Set(['google_official', 'third_party_proxy']);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ContentProviderSettingService {
  constructor(
    private readonly deps: {
      repo: ContentProviderSettingRepository;
      audit: Pick<AuditLog, 'record'>;
    },
  ) {}

  /**
   * Set (upsert) the AI provider endpoint for a Team.
   *
   * Validates:
   * - `baseUrl` is non-empty and starts with `https://` (R14.3, R14.5)
   * - `kind` is one of the allowed values
   *
   * On success, persists the setting and emits a `content_manage` audit
   * entry with metadata `{ kind, baseUrl, op: 'set' }` (R14.2).
   *
   * Admin-only — the caller is responsible for enforcing RBAC before
   * invoking this method.
   *
   * Requirements: 14.1, 14.2
   */
  async set(
    teamId: string,
    actorId: string,
    setting: {
      kind: 'google_official' | 'third_party_proxy';
      baseUrl: string;
    },
  ): Promise<Result<ProviderSetting>> {
    const { kind, baseUrl } = setting;

    // Validate: baseUrl must be non-empty and use HTTPS (R14.5)
    if (!baseUrl || !baseUrl.startsWith('https://')) {
      return err({
        code: 'VALIDATION',
        messages: ['AI provider endpoint must use HTTPS'],
      });
    }

    // Validate: kind must be one of the allowed values
    if (!VALID_KINDS.has(kind)) {
      return err({
        code: 'VALIDATION',
        messages: [`AI provider kind must be one of: ${[...VALID_KINDS].join(', ')}`],
      });
    }

    // Persist
    const stored = await this.deps.repo.upsert(teamId, kind, baseUrl);

    // Audit (R14.2)
    await this.deps.audit.record({
      teamId,
      actorId,
      action: 'content_manage',
      objectType: 'content_provider_setting',
      objectId: teamId,
      metadata: { kind, baseUrl, op: 'set' },
    });

    return ok(stored);
  }

  /**
   * Get the AI provider endpoint for a Team.
   *
   * Returns the persisted setting when one exists. Falls back to the
   * `google_official` default when no setting has been configured yet,
   * so callers always receive a usable endpoint (R14.1).
   *
   * Requirements: 14.1
   */
  async get(teamId: string): Promise<Result<ProviderSetting>> {
    const stored = await this.deps.repo.findByTeam(teamId);

    if (stored === null) {
      return ok({
        teamId,
        ...DEFAULT_SETTING,
      });
    }

    return ok(stored);
  }
}
