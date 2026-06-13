/**
 * backend/src/storage/object-storage.ts
 *
 * Canonical re-export of the ObjectStorage interface and SupabaseObjectStorage
 * implementation from the content module.
 *
 * Consumers should import from this path rather than from the content module
 * directly; the content module path is considered an implementation detail.
 */

export type { ObjectStorage, ObjectStorageConfig, SupabaseObjectStorageConfig } from '../content/object-storage.js';
export {
  SupabaseObjectStorage,
  createObjectStorage,
  createObjectStorageFromEnv,
} from '../content/object-storage.js';
