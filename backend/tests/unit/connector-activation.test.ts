/**
 * Unit tests for {@link ConnectorActivationService} (Task 6.4,
 * R3.4–R3.7).
 *
 * Covers the four state transitions of the activation flow:
 *
 * 1. Validator accepts → vault stores encrypted credential, repo's
 *    status becomes `available`, return is `ok({status:'available'})`
 *    (R3.4).
 * 2. Validator rejects → repo's status becomes
 *    `requires_configuration`, vault is NOT touched, return is
 *    `err(AUTHORIZATION)` (R3.6).
 * 3. Validator never resolves within {@link ACTIVATION_TIMEOUT_MS} →
 *    return is `err(TIMEOUT)`, neither the vault nor `upsertStatus`
 *    is called, prior status is preserved (R3.7).
 * 4. Validator accepts but vault.storeForTeam throws → return is
 *    `err(INTERNAL)`, status row is NOT mutated (R3.5).
 *
 * The collaborators are hand-rolled `vi.fn()` stubs (no real DB / no
 * real crypto) — the service under test only consumes their
 * narrow public methods.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDescriptor } from '@leads-generator/shared';

import {
  ACTIVATION_TIMEOUT_MS,
  ConnectorActivationService,
  type CredentialValidator,
} from '../../src/connector/activation.js';
import type { CredentialVaultService } from '../../src/auth/credential-vault-service.js';
import type { Connector_Registry } from '../../src/connector/registry.js';
import type { TeamConnectorRepository } from '../../src/repository/team-connector-repository.js';

/** Build a `TeamConnectorRepository` with only the methods the service uses. */
function makeRepoStub(initialRow: ConnectorDescriptor | null = null) {
  const get = vi.fn(async () => initialRow);
  const upsertStatus = vi.fn(async () => undefined);
  const repo = {
    get,
    upsertStatus,
    listForTeam: vi.fn(async () => {
      throw new Error('not used in activation tests');
    }),
    setEncryptedCredentials: vi.fn(async () => {
      throw new Error('not used in activation tests');
    }),
    clearEncryptedCredentials: vi.fn(async () => {
      throw new Error('not used in activation tests');
    }),
    getEncryptedCredentialsForVault: vi.fn(async () => {
      throw new Error('not used in activation tests');
    }),
  } as unknown as TeamConnectorRepository;
  return { repo, get, upsertStatus };
}

/** Vault stub exposing only `storeForTeam`. */
function makeVaultStub(opts: { failOnStore?: boolean } = {}) {
  const storeForTeam = vi.fn(async (_t: string, _s: string, _p: string) => {
    if (opts.failOnStore) {
      throw new Error('disk full');
    }
  });
  const vault = {
    storeForTeam,
    loadForTeam: vi.fn(async () => {
      throw new Error('not used in activation tests');
    }),
    deleteForTeam: vi.fn(async () => {
      throw new Error('not used in activation tests');
    }),
  } as unknown as CredentialVaultService;
  return { vault, storeForTeam };
}

/**
 * The Connector_Registry is wired into ActivationDeps for future use
 * (e.g. validating that the connector is installed before activation),
 * but the current implementation does not call any of its methods. We
 * still pass a stub so the DI shape is exercised.
 */
function makeRegistryStub(): Connector_Registry {
  return {} as unknown as Connector_Registry;
}

/** Validator that synchronously resolves with the given outcome. */
function acceptingValidator(): {
  validator: CredentialValidator;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(async () => ({ accepted: true }));
  return { validator: { validate: spy }, spy };
}

function rejectingValidator(): {
  validator: CredentialValidator;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(async () => ({ accepted: false }));
  return { validator: { validate: spy }, spy };
}

/**
 * Validator that only resolves once its `AbortSignal` aborts. Mirrors
 * the contract the real Source-API adapters must honor: forward the
 * signal to the underlying HTTP client and abort the outgoing call when
 * the deadline fires.
 */
function abortingValidator(): {
  validator: CredentialValidator;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(
    (_sourceId: string, _plaintext: string, signal: AbortSignal) =>
      new Promise<{ accepted: boolean }>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      }),
  );
  return { validator: { validate: spy }, spy };
}

describe('ConnectorActivationService.activate (R3.4–R3.7)', () => {
  it('R3.4: accepted credentials → vault stores, status becomes available', async () => {
    const { repo, get, upsertStatus } = makeRepoStub({
      sourceId: 'fiverr',
      displayName: 'Fiverr',
      status: 'requires_configuration',
    });
    const { vault, storeForTeam } = makeVaultStub();
    const { validator, spy: validatorSpy } = acceptingValidator();

    const svc = new ConnectorActivationService({
      registry: makeRegistryStub(),
      vault,
      repo,
      validator,
    });

    const result = await svc.activate('team-1', 'fiverr', 'sk-secret');

    expect(result).toEqual({ ok: true, value: { status: 'available' } });
    // Validator received the (sourceId, plaintext, signal) triple.
    expect(validatorSpy).toHaveBeenCalledTimes(1);
    expect(validatorSpy.mock.calls[0]?.[0]).toBe('fiverr');
    expect(validatorSpy.mock.calls[0]?.[1]).toBe('sk-secret');
    expect(validatorSpy.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);

    // Storage happened with the same triple.
    expect(storeForTeam).toHaveBeenCalledTimes(1);
    expect(storeForTeam).toHaveBeenCalledWith('team-1', 'fiverr', 'sk-secret');

    // Status row was bumped to 'available' (no unavailableReason on the
    // success path).
    expect(upsertStatus).toHaveBeenCalledTimes(1);
    expect(upsertStatus).toHaveBeenCalledWith('team-1', 'fiverr', 'available');

    // Existing status was read up front.
    expect(get).toHaveBeenCalledWith('team-1', 'fiverr');
  });

  it('R3.4: works when no row exists yet (default available per R3.2)', async () => {
    const { repo, upsertStatus } = makeRepoStub(null);
    const { vault, storeForTeam } = makeVaultStub();
    const { validator } = acceptingValidator();

    const svc = new ConnectorActivationService({
      registry: makeRegistryStub(),
      vault,
      repo,
      validator,
    });

    const result = await svc.activate('team-1', 'fiverr', 'sk');
    expect(result).toEqual({ ok: true, value: { status: 'available' } });
    expect(storeForTeam).toHaveBeenCalledTimes(1);
    expect(upsertStatus).toHaveBeenCalledWith('team-1', 'fiverr', 'available');
  });

  it('R3.6: rejected credentials → status moves to requires_configuration, vault untouched', async () => {
    const { repo, upsertStatus } = makeRepoStub({
      sourceId: 'fiverr',
      displayName: 'Fiverr',
      status: 'available',
    });
    const { vault, storeForTeam } = makeVaultStub();
    const { validator } = rejectingValidator();

    const svc = new ConnectorActivationService({
      registry: makeRegistryStub(),
      vault,
      repo,
      validator,
    });

    const result = await svc.activate('team-1', 'fiverr', 'bad-key');

    expect(result).toEqual({
      ok: false,
      error: { code: 'AUTHORIZATION', message: 'Credentials rejected' },
    });
    // Vault was NEVER given the rejected credential. This is the
    // privacy-critical assertion on the rejection path: a bad key
    // must not be persisted, even encrypted.
    expect(storeForTeam).not.toHaveBeenCalled();
    // Status row flipped to `requires_configuration` with the canonical
    // reason string.
    expect(upsertStatus).toHaveBeenCalledTimes(1);
    expect(upsertStatus).toHaveBeenCalledWith(
      'team-1',
      'fiverr',
      'requires_configuration',
      'credentials rejected',
    );
  });

  describe('with fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('R3.7: validator never resolves before 30s → TIMEOUT, status preserved', async () => {
      const { repo, upsertStatus } = makeRepoStub({
        sourceId: 'fiverr',
        displayName: 'Fiverr',
        status: 'available', // prevStatus we expect to be preserved
      });
      const { vault, storeForTeam } = makeVaultStub();
      const { validator } = abortingValidator();

      const svc = new ConnectorActivationService({
        registry: makeRegistryStub(),
        vault,
        repo,
        validator,
      });

      const promise = svc.activate('team-1', 'fiverr', 'pending-key');
      // Fast-forward past the activation deadline so the AbortController
      // fires and the abortingValidator() rejects with `aborted`.
      await vi.advanceTimersByTimeAsync(ACTIVATION_TIMEOUT_MS + 1);

      const result = await promise;

      expect(result).toEqual({
        ok: false,
        error: { code: 'TIMEOUT', message: 'Validation timeout' },
      });
      // R3.7: status must be preserved — no upsert, no store.
      expect(upsertStatus).not.toHaveBeenCalled();
      expect(storeForTeam).not.toHaveBeenCalled();
    });
  });

  it('R3.5: vault.storeForTeam throws → INTERNAL, status preserved', async () => {
    const { repo, upsertStatus } = makeRepoStub({
      sourceId: 'fiverr',
      displayName: 'Fiverr',
      status: 'available', // prevStatus we expect to be preserved
    });
    const { vault, storeForTeam } = makeVaultStub({ failOnStore: true });
    const { validator } = acceptingValidator();

    const svc = new ConnectorActivationService({
      registry: makeRegistryStub(),
      vault,
      repo,
      validator,
    });

    const result = await svc.activate('team-1', 'fiverr', 'sk');

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: 'Failed to store credentials' },
    });
    // Vault attempt was made, but ...
    expect(storeForTeam).toHaveBeenCalledTimes(1);
    // ... the status row was NOT mutated (R3.5: pertahankan status).
    expect(upsertStatus).not.toHaveBeenCalled();
  });
});
