/**
 * backend/src/storage/index.ts
 *
 * Barrel for the storage module.  Exports ObjectStorage interface and
 * SupabaseObjectStorage implementation.
 */

export type { ObjectStorage, ObjectStorageConfig, SupabaseObjectStorageConfig } from './object-storage.js';
export { SupabaseObjectStorage, createObjectStorage, createObjectStorageFromEnv } from './object-storage.js';
