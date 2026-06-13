/**
 * ObjectStorage — Supabase Storage implementation.
 *
 * Design constraints (design.md § ObjectStorage, Requirements 1.5, 5.9, 5.11, 16.4, 16.5):
 *
 * - upload: namespaces the key as `${teamId}/${key}`, calls the Supabase
 *   Storage REST API with x-upsert: true, and on success returns the public
 *   URL. On failure it returns err({ code: 'INTERNAL', message: ... }).
 *   NEVER falls back to a base64 data-URI, NEVER uses a hardcoded project URL.
 *
 * - resolveForTeam: enforces per-Team isolation. A URL that does not belong
 *   to the requesting Team returns err({ code: 'NOT_FOUND', message:
 *   'Resource not found' }) — uniform, with no information leak.
 *
 * - Constructor throws (not silently) when supabaseUrl or serviceRoleKey is
 *   missing, ensuring fail-closed at startup (no hidden runtime surprises).
 *
 * Defects designed out (from supabase-storage.ts):
 *   1. `fallbackResponse` — returned base64 data-URI when upload failed.
 *   2. `getSupabaseUrl` default 'https://ioqazptafolroxwgkera.supabase.co' — hardcoded fallback.
 *   3. No tenant isolation — any caller could upload/access any path.
 */

import type { Result } from '@leads-generator/shared';
import { ok, err } from '@leads-generator/shared';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ObjectStorage {
  /**
   * Upload bytes to object storage under the Team's namespace.
   * Returns the public URL on success, or an AppError on failure.
   * NEVER falls back to base64 or a hardcoded URL.
   */
  upload(
    teamId: string,
    key: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<Result<string>>;

  /**
   * Resolve an object URL for a specific Team.
   * Returns the URL if it belongs to the requesting Team; otherwise returns
   * NOT_FOUND — uniform across cross-team and malformed-URL cases.
   */
  resolveForTeam(teamId: string, objectUrl: string): Promise<Result<string>>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SupabaseObjectStorageConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucketName: string;
}

/**
 * Alias for backward-compatibility with content/index.ts barrel.
 */
export type ObjectStorageConfig = SupabaseObjectStorageConfig;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SupabaseObjectStorage implements ObjectStorage {
  private readonly supabaseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly bucketName: string;

  /**
   * Throws an Error (not silently) when supabaseUrl or serviceRoleKey is
   * undefined/null (truly absent), so misconfiguration is discovered at
   * construction time. An empty-string credential is accepted here but will
   * cause `upload` to return `err` at call time (belt-and-braces runtime check).
   */
  constructor(config: SupabaseObjectStorageConfig) {
    if (config.supabaseUrl == null) {
      throw new Error(
        'SupabaseObjectStorage: supabaseUrl is required. ' +
          'Set SUPABASE_URL in the environment.',
      );
    }
    if (config.serviceRoleKey == null) {
      throw new Error(
        'SupabaseObjectStorage: serviceRoleKey is required. ' +
          'Set SUPABASE_SERVICE_ROLE_KEY in the environment.',
      );
    }
    this.supabaseUrl = config.supabaseUrl.replace(/\/$/, ''); // strip trailing slash
    this.serviceRoleKey = config.serviceRoleKey;
    this.bucketName = config.bucketName;
  }

  /**
   * Upload bytes under `${teamId}/${key}` in the configured bucket.
   *
   * Uses PUT with x-upsert: true so subsequent uploads of the same key
   * overwrite rather than conflict.  On any failure the method returns
   * err({ code: 'INTERNAL', message: … }) — no base64 fallback, no
   * hardcoded URL fallback.
   */
  async upload(
    teamId: string,
    key: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<Result<string>> {
    // Short-circuit if credentials are absent (belt-and-braces; constructor
    // should have thrown, but guard here too for subclass scenarios).
    if (!this.serviceRoleKey) {
      return err({
        code: 'INTERNAL' as const,
        message: 'Missing Supabase service-role key — upload aborted.',
      });
    }

    const namespacedKey = `${teamId}/${key}`;
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${namespacedKey}`;

    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.serviceRoleKey}`,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        body: bytes,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '(no body)');
        return err({
          code: 'INTERNAL' as const,
          message: `Supabase Storage upload failed (HTTP ${response.status}): ${detail}`,
        });
      }

      // Public URL — assumes bucket has public access enabled.
      const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${namespacedKey}`;
      return ok(publicUrl);
    } catch (cause: unknown) {
      const message =
        cause instanceof Error ? cause.message : String(cause);
      return err({
        code: 'INTERNAL' as const,
        message: `Supabase Storage upload threw: ${message}`,
      });
    }
  }

  /**
   * Restrict access to objects owned by the requesting Team.
   *
   * The URL produced by `upload` has the form:
   *   {supabaseUrl}/storage/v1/object/public/{bucket}/{teamId}/...
   *
   * We verify:
   *   1. The URL parses without error.
   *   2. Its origin matches this instance's supabaseUrl.
   *   3. Its pathname starts with `/storage/v1/object/public/{bucket}/{teamId}/`.
   *
   * Any mismatch — including a different team prefix, wrong host, wrong path
   * structure, or malformed URL — returns the same uniform NOT_FOUND so
   * callers cannot distinguish between "this object does not exist" and
   * "this object belongs to another team".
   */
  async resolveForTeam(teamId: string, objectUrl: string): Promise<Result<string>> {
    const notFound = err({
      code: 'NOT_FOUND' as const,
      message: 'Resource not found',
    });

    if (!objectUrl) {
      return notFound;
    }

    let parsed: URL;
    try {
      parsed = new URL(objectUrl);
    } catch {
      return notFound;
    }

    // Origin must match configured Supabase URL.
    let expectedBase: URL;
    try {
      expectedBase = new URL(this.supabaseUrl);
    } catch {
      return notFound;
    }

    if (parsed.origin !== expectedBase.origin) {
      return notFound;
    }

    // Path must be /storage/v1/object/public/{bucket}/{teamId}/...
    const expectedPrefix = `/storage/v1/object/public/${this.bucketName}/${teamId}/`;
    if (!parsed.pathname.startsWith(expectedPrefix)) {
      return notFound;
    }

    return ok(objectUrl);
  }
}

// ---------------------------------------------------------------------------
// Factory helper — reads from env, throws on misconfiguration
// ---------------------------------------------------------------------------

/**
 * Construct a SupabaseObjectStorage from the already-validated Env.
 * Throws (fail-closed) if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are
 * absent, surfacing the misconfiguration at startup rather than at runtime.
 */
export function createObjectStorageFromEnv(env: {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_BUCKET: string;
}): SupabaseObjectStorage {
  if (!env.SUPABASE_URL) {
    throw new Error(
      'createObjectStorageFromEnv: SUPABASE_URL is required in the environment.',
    );
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'createObjectStorageFromEnv: SUPABASE_SERVICE_ROLE_KEY is required in the environment.',
    );
  }
  return new SupabaseObjectStorage({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    bucketName: env.SUPABASE_BUCKET,
  });
}

/**
 * Alias for the factory function used by content/index.ts barrel.
 * Prefer `createObjectStorageFromEnv` in new code.
 */
export const createObjectStorage = createObjectStorageFromEnv;
