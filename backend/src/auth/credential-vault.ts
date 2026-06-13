/**
 * Credential_Vault — envelope-style symmetric encryption for connector
 * credentials at rest (Task 6.1, R3.4).
 *
 * Design refs:
 * - design.md → Components and Interfaces → Connector_Registry &
 *   Credential_Vault.
 * - design.md → Security → Kredensial connector: "dienkripsi at-rest
 *   memakai envelope encryption …; plaintext tidak pernah ditulis ke log".
 * - design.md → Privacy considerations.
 *
 * Envelope layout (single Buffer, byte-for-byte):
 *
 *   [ version(1) ][ nonce(12) ][ ciphertext(N) ][ authTag(16) ]
 *
 * - `version` is currently `0x01`; future migrations bump it.
 * - `nonce` is a fresh random 12-byte IV, mandatory for AES-GCM.
 * - `ciphertext` is whatever AES-256-GCM produces for the plaintext.
 * - `authTag` is the 16-byte GCM MAC.
 *
 * This module is intentionally pure crypto: it knows nothing about teams,
 * sources, databases, or logging. Callers are responsible for storing the
 * returned Buffer (the {@link CredentialVaultService} below wraps the
 * {@link TeamConnectorRepository} for that purpose). On any decryption
 * error this module throws a generic `Error('credential decryption
 * failed')`; it never logs plaintext, ciphertext, the master key, or
 * detailed error context, so failures cannot leak secret material via
 * logs.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { decodeMasterKey, type Env } from '../config/env.js';

/** Current envelope version. Bump when the layout/algorithm changes. */
const VERSION = 0x01;
/** AES-GCM nonce length in bytes (recommended 96-bit). */
const NONCE_LEN = 12;
/** AES-GCM authentication tag length in bytes (full 128-bit tag). */
const TAG_LEN = 16;
/** Length of the version prefix in bytes. */
const VERSION_LEN = 1;
/** Required master key length in bytes (AES-256). */
const KEY_LEN = 32;
/** Generic, side-channel-free error surfaced for any decryption failure. */
const DECRYPT_ERROR_MESSAGE = 'credential decryption failed';

/**
 * Pure envelope-encryption primitive. Construct with the 32-byte master
 * key from {@link decodeMasterKey}; expose only `encrypt` / `decrypt`.
 *
 * The class deliberately holds no DB, logger, or service dependencies so
 * unit tests can exercise it with a synthetic key and so it can be reused
 * by sibling features (e.g. Task 17.2 — Gemini API key storage) without
 * coupling.
 */
export class CredentialVault {
  /**
   * @param masterKey 32-byte master key. Stored by reference; callers
   *   should treat the buffer as sensitive (do not log or serialise).
   * @throws Error if the key length is wrong.
   */
  constructor(private readonly masterKey: Buffer) {
    if (masterKey.length !== KEY_LEN) {
      throw new Error('master key must be 32 bytes');
    }
  }

  /**
   * Encrypt `plaintext` (UTF-8) and return the full envelope as a Buffer
   * suitable for storage in a `bytea` column.
   *
   * Each call generates a fresh random nonce, so encrypting the same
   * plaintext twice produces different envelopes (an important property
   * for AES-GCM and a tested invariant in `credential-vault.test.ts`).
   */
  encrypt(plaintext: string): Buffer {
    const nonce = randomBytes(NONCE_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from([VERSION]), nonce, ciphertext, authTag]);
  }

  /**
   * Decrypt an envelope produced by {@link encrypt} and return the
   * original UTF-8 plaintext.
   *
   * Any structural problem (wrong version, truncated buffer, GCM auth
   * failure) surfaces as the SAME generic error — see
   * `DECRYPT_ERROR_MESSAGE` — so an attacker probing decrypt cannot
   * distinguish failure modes.
   */
  decrypt(envelope: Buffer): string {
    // Quickly bail on inputs too short to even contain version + nonce + tag.
    const minLen = VERSION_LEN + NONCE_LEN + TAG_LEN;
    if (envelope.length < minLen) {
      throw new Error(DECRYPT_ERROR_MESSAGE);
    }
    if (envelope[0] !== VERSION) {
      throw new Error(DECRYPT_ERROR_MESSAGE);
    }

    const nonce = envelope.subarray(VERSION_LEN, VERSION_LEN + NONCE_LEN);
    const tagStart = envelope.length - TAG_LEN;
    const ciphertext = envelope.subarray(VERSION_LEN + NONCE_LEN, tagStart);
    const authTag = envelope.subarray(tagStart);

    try {
      const decipher = createDecipheriv('aes-256-gcm', this.masterKey, nonce);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString('utf8');
    } catch {
      // Intentionally swallow the underlying error — never log it.
      throw new Error(DECRYPT_ERROR_MESSAGE);
    }
  }
}

/**
 * Build a {@link CredentialVault} from the application config. Resolves
 * the master key via {@link decodeMasterKey} so the dev/test fallback
 * (deterministic placeholder + one-time warning) and production strict
 * mode (throw on missing) are honoured uniformly.
 */
export function createCredentialVault(env: Env): CredentialVault {
  return new CredentialVault(decodeMasterKey(env));
}
