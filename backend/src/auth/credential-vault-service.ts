/**
 * CredentialVaultService — the only sanctioned bridge between
 * {@link CredentialVault} (pure crypto) and the database layer
 * ({@link TeamConnectorRepository}).
 *
 * Why this split:
 * - {@link CredentialVault} is pure: it knows nothing about teams,
 *   sources, or storage. That keeps it cheap to test and reusable for
 *   adjacent features (e.g. Task 17.2 stores a Gemini API key with the
 *   same envelope format).
 * - {@link TeamConnectorRepository} owns SQL and tenant-scoped lookups
 *   but never touches plaintext.
 * - This service composes both. It is the ONLY caller of
 *   `TeamConnectorRepository.getEncryptedCredentialsForVault`, per the
 *   "INTERNAL: only call from CredentialVaultService" contract on that
 *   method.
 *
 * Design refs:
 * - design.md → Components and Interfaces → Connector_Registry &
 *   Credential_Vault.
 * - design.md → Security → Kredensial connector (R3.4).
 *
 * Logging policy: this module never logs the plaintext, the ciphertext,
 * the team id (it's not sensitive on its own, but we keep the surface
 * minimal), or detailed error messages from decryption. Decryption
 * failures bubble up as the generic `Error('credential decryption
 * failed')` raised by {@link CredentialVault.decrypt}.
 */

import type { TeamConnectorRepository } from '../repository/team-connector-repository.js';

import type { CredentialVault } from './credential-vault.js';

/**
 * Thin, team-scoped CRUD over connector credentials. Each method takes
 * the same `(teamId, sourceId)` shape the rest of the connector layer
 * uses.
 */
export class CredentialVaultService {
  constructor(
    private readonly repo: TeamConnectorRepository,
    private readonly vault: CredentialVault,
  ) {}

  /**
   * Encrypt `plaintext` and persist the envelope for the given Team +
   * Source. Overwrites any previously stored credential.
   *
   * Plaintext never leaves this method as a string — the encrypted
   * Buffer is what reaches the repository.
   */
  async storeForTeam(teamId: string, sourceId: string, plaintext: string): Promise<void> {
    const envelope = this.vault.encrypt(plaintext);
    await this.repo.setEncryptedCredentials(teamId, sourceId, envelope);
  }

  /**
   * Load and decrypt the credential for a given Team + Source. Returns
   * `null` when no credentials are stored (either the connector row
   * doesn't exist or its `encrypted_credentials` column is null).
   *
   * Throws the generic `Error('credential decryption failed')` raised by
   * {@link CredentialVault.decrypt} on any structural / authentication
   * failure of the envelope.
   */
  async loadForTeam(teamId: string, sourceId: string): Promise<string | null> {
    const envelope = await this.repo.getEncryptedCredentialsForVault(teamId, sourceId);
    if (envelope === null) {
      return null;
    }
    return this.vault.decrypt(envelope);
  }

  /**
   * Clear the stored credential for a Team + Source. No-op if the
   * connector row doesn't exist (the underlying UPDATE simply matches
   * zero rows).
   */
  async deleteForTeam(teamId: string, sourceId: string): Promise<void> {
    await this.repo.clearEncryptedCredentials(teamId, sourceId);
  }
}
