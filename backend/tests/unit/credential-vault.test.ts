/**
 * Unit tests for {@link CredentialVault} (Task 6.1, R3.4).
 *
 * Covers the four behaviours required by the task:
 * 1. encrypt → decrypt round-trip succeeds for a variety of plaintexts.
 * 2. decrypt throws a generic error when the version byte is wrong.
 * 3. decrypt throws when the auth tag is corrupted.
 * 4. encrypt produces different outputs for the same plaintext (the
 *    nonce is fresh on every call, so two envelopes for the same
 *    plaintext should differ byte-for-byte).
 */

import { describe, it, expect } from 'vitest';

import { CredentialVault } from '../../src/auth/credential-vault.js';

/**
 * Deterministic 32-byte test key. We're not asserting on the master
 * key's value — just that the vault uses it consistently — so a fixed
 * `Buffer.alloc(32, 7)` makes failures reproducible without a global
 * env-var dance.
 */
const TEST_KEY = Buffer.alloc(32, 7);

/** Generic error string surfaced by all decryption failures. */
const GENERIC_ERROR = 'credential decryption failed';

describe('CredentialVault', () => {
  it('rejects master keys that are not 32 bytes', () => {
    expect(() => new CredentialVault(Buffer.alloc(16, 0))).toThrowError(
      'master key must be 32 bytes',
    );
    expect(() => new CredentialVault(Buffer.alloc(64, 0))).toThrowError(
      'master key must be 32 bytes',
    );
  });

  it('round-trips a variety of plaintexts (ASCII, unicode, empty, long)', () => {
    const vault = new CredentialVault(TEST_KEY);
    const plaintexts: ReadonlyArray<string> = [
      '',
      'hello',
      'sk-live-1234567890abcdef',
      // multi-byte UTF-8 (emoji + Indonesian characters)
      'tïṁ-α-key 🔐 — kunci API rahasia',
      // longer payload to exercise multiple cipher.update blocks
      'x'.repeat(4096),
      // JSON-shaped credential blob
      JSON.stringify({ apiKey: 'abc', secret: 'def', scopes: ['r', 'w'] }),
    ];

    for (const plaintext of plaintexts) {
      const envelope = vault.encrypt(plaintext);
      // Sanity: envelope is at least version + nonce + tag long.
      expect(envelope.length).toBeGreaterThanOrEqual(1 + 12 + 16);
      // Sanity: the version byte is 0x01.
      expect(envelope[0]).toBe(0x01);
      const decrypted = vault.decrypt(envelope);
      expect(decrypted).toBe(plaintext);
    }
  });

  it('produces different envelopes for the same plaintext (random nonce)', () => {
    const vault = new CredentialVault(TEST_KEY);
    const plaintext = 'same-secret';

    const a = vault.encrypt(plaintext);
    const b = vault.encrypt(plaintext);

    // Two encrypts of the same plaintext must yield different envelopes
    // because each one generates a fresh 12-byte nonce; if they ever
    // matched, AES-GCM nonce reuse would have catastrophic security
    // implications.
    expect(a.equals(b)).toBe(false);

    // Both must still decrypt back to the original plaintext.
    expect(vault.decrypt(a)).toBe(plaintext);
    expect(vault.decrypt(b)).toBe(plaintext);
  });

  it('throws a generic error when the version byte is wrong', () => {
    const vault = new CredentialVault(TEST_KEY);
    const envelope = vault.encrypt('payload');
    // Mutate version byte from 0x01 → 0x02.
    const tampered = Buffer.from(envelope);
    tampered[0] = 0x02;

    expect(() => vault.decrypt(tampered)).toThrowError(GENERIC_ERROR);
  });

  it('throws a generic error when the auth tag is corrupted', () => {
    const vault = new CredentialVault(TEST_KEY);
    const envelope = vault.encrypt('payload');
    // Flip a bit in the last byte (the auth tag occupies the trailing 16
    // bytes); GCM verification must reject this.
    const tampered = Buffer.from(envelope);
    const lastIndex = tampered.length - 1;
    tampered[lastIndex] = (tampered[lastIndex] ?? 0) ^ 0xff;

    expect(() => vault.decrypt(tampered)).toThrowError(GENERIC_ERROR);
  });

  it('throws a generic error when the envelope is truncated', () => {
    const vault = new CredentialVault(TEST_KEY);
    // Anything shorter than 1 + 12 + 16 = 29 bytes is structurally
    // invalid; a single zero byte must not even reach the cipher API.
    expect(() => vault.decrypt(Buffer.from([0x01]))).toThrowError(GENERIC_ERROR);
    expect(() => vault.decrypt(Buffer.alloc(0))).toThrowError(GENERIC_ERROR);
  });

  it('throws a generic error when ciphertext is corrupted', () => {
    const vault = new CredentialVault(TEST_KEY);
    const envelope = vault.encrypt('payload');
    // Flip a bit in the middle of the ciphertext region (just past the
    // version + nonce). GCM auth must catch this.
    const tampered = Buffer.from(envelope);
    const ciphertextStart = 1 + 12;
    if (tampered.length > ciphertextStart + 16) {
      tampered[ciphertextStart] = (tampered[ciphertextStart] ?? 0) ^ 0x01;
      expect(() => vault.decrypt(tampered)).toThrowError(GENERIC_ERROR);
    }
  });
});
