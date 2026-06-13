/**
 * Backend environment configuration loader.
 *
 * Parses and validates `process.env` against a strict zod schema so the rest
 * of the codebase can rely on typed, normalised values (Design: Architecture
 * → Pilihan Teknologi & Alasan; Error Handling — fail fast on misconfig).
 *
 * Notes on behaviour:
 * - `dotenv` is invoked unconditionally at module load. When `.env` is
 *   missing it is a no-op, so production deployments that inject env vars
 *   via the orchestrator are unaffected.
 * - {@link loadEnv} memoises the parsed result. Tests can call
 *   {@link resetEnvCache} between cases to re-read `process.env`.
 */

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load `.env` once at module import. dotenv silently no-ops when the file
// is absent, so this is safe in containerised environments too.
loadDotenv();

/**
 * Length, in bytes, of the master encryption key used by Credential_Vault
 * (Task 6.1). 32 bytes = 256 bits = the key length AES-256-GCM expects.
 */
export const MASTER_KEY_BYTE_LENGTH = 32;

/**
 * Regex matching the union of standard base64 and base64url alphabets
 * (plus optional padding). We accept either spelling so operators don't
 * have to care which one their secret manager emits.
 */
const BASE64_ANY_PATTERN = /^[A-Za-z0-9+/=_-]+$/;

/**
 * Decode a base64-or-base64url string into a Buffer. Returns `null` if the
 * input does not decode to exactly {@link MASTER_KEY_BYTE_LENGTH} bytes.
 *
 * Used by both the schema's `superRefine` (length validation) and
 * {@link decodeMasterKey} (consumer-side decode).
 */
function decodeBase64Any(value: string): Buffer | null {
  // Node's Buffer.from accepts both base64 and base64url; normalise here so
  // either alphabet round-trips identically.
  const normalised = value.replace(/-/g, '+').replace(/_/g, '/');
  // Re-pad to a multiple of 4 if base64url stripped padding.
  const padded =
    normalised.length % 4 === 0
      ? normalised
      : normalised + '='.repeat(4 - (normalised.length % 4));
  try {
    return Buffer.from(padded, 'base64');
  } catch {
    return null;
  }
}

/**
 * Memo so we only emit the dev-key warning once per process even if
 * {@link loadEnv} is called repeatedly (e.g. by tests resetting the cache).
 */
let devKeyWarningEmitted = false;

/**
 * Print the dev-master-key warning to stderr exactly once. Production
 * misconfiguration is rejected upstream by the schema, so this only fires
 * in development/test where a deterministic placeholder key is acceptable.
 */
function warnDevMasterKeyOnce(): void {
  if (devKeyWarningEmitted) return;
  devKeyWarningEmitted = true;
  // eslint-disable-next-line no-console -- intentional one-time bootstrap warning.
  console.warn('Using DEV master key — DO NOT use in production');
}

const EnvSchema = z
  .object({
    /** PostgreSQL connection string used by the application and migrations. */
    DATABASE_URL: z.string().url(),
    /** Redis connection string used for sessions and BullMQ queues. */
    REDIS_URL: z.string().url(),
    /** Standard Node.js environment flag. */
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** HTTP port for the API server. */
    PORT: z.coerce.number().int().positive().default(3000),
    /**
     * Base64 (standard or url-safe) encoded 32-byte key used as the
     * master encryption key for Credential_Vault envelope encryption
     * (Task 6.1, R3.4). Optional in `development`/`test` (a deterministic
     * dev-only placeholder is substituted with a one-time stderr warning);
     * REQUIRED in `production` — startup throws if missing.
     */
    MASTER_ENCRYPTION_KEY: z
      .string()
      .regex(BASE64_ANY_PATTERN, 'must be base64 or base64url encoded')
      .optional(),
    /** Supabase connection variables for storage. */
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_BUCKET: z.string().default('content-assets'),
  })
  .superRefine((env, ctx) => {
    // Production must have a master key set, full stop.
    if (env.NODE_ENV === 'production' && env.MASTER_ENCRYPTION_KEY === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MASTER_ENCRYPTION_KEY'],
        message: 'MASTER_ENCRYPTION_KEY is required in production',
      });
      return;
    }
    // When provided (any env), it MUST decode to exactly 32 bytes.
    if (env.MASTER_ENCRYPTION_KEY !== undefined) {
      const decoded = decodeBase64Any(env.MASTER_ENCRYPTION_KEY);
      if (decoded === null || decoded.length !== MASTER_KEY_BYTE_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MASTER_ENCRYPTION_KEY'],
          message: `must decode to ${MASTER_KEY_BYTE_LENGTH} bytes`,
        });
      }
    }
  });

/** Strongly-typed shape of the validated backend environment. */
export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Parse and validate the current `process.env` and return a typed config.
 *
 * The result is cached after the first successful parse. Throws a
 * descriptive {@link Error} (not an `AppError`) if validation fails so the
 * process can crash fast at startup before any side effects run.
 */
export function loadEnv(): Env {
  if (cached) {
    return cached;
  }
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Clear the cached environment. Intended for test setups that mutate
 * `process.env` between cases. Production code should not call this.
 *
 * Also resets the one-time dev-master-key warning gate so tests can
 * exercise the warning path more than once when desired.
 */
export function resetEnvCache(): void {
  cached = null;
  devKeyWarningEmitted = false;
}

/**
 * Resolve the master encryption key as a 32-byte Buffer.
 *
 * - When `env.MASTER_ENCRYPTION_KEY` is set the schema has already
 *   validated that it decodes to exactly 32 bytes; we decode and return.
 * - When unset (only allowed in `development` / `test`) we substitute a
 *   deterministic placeholder (`Buffer.alloc(32, 1)`) and emit a one-time
 *   stderr warning. This makes local dev and unit tests painless without
 *   silently weakening production.
 *
 * Throws if invoked with `NODE_ENV === 'production'` and no key is set —
 * the schema rejects that case earlier, but this guard is belt-and-braces.
 */
export function decodeMasterKey(env: Env): Buffer {
  if (env.MASTER_ENCRYPTION_KEY !== undefined) {
    const decoded = decodeBase64Any(env.MASTER_ENCRYPTION_KEY);
    // The schema guarantees this; assert here so the buffer type is safe.
    if (decoded === null || decoded.length !== MASTER_KEY_BYTE_LENGTH) {
      throw new Error('Invalid master encryption key length');
    }
    return decoded;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('MASTER_ENCRYPTION_KEY is required in production');
  }
  warnDevMasterKeyOnce();
  return Buffer.alloc(MASTER_KEY_BYTE_LENGTH, 1);
}
