/**
 * Connector activation state machine (Task 6.4, R3.4–R3.7).
 *
 * Design refs:
 * - design.md → Components and Interfaces → Connector_Registry &
 *   Credential_Vault: `activate(teamId, sourceId, apiCredentials)`.
 * - design.md → Mesin status aktivasi connector: validating →
 *   `available` (success), `requires_configuration` (rejected), or
 *   `prev_status` (timeout / storage failure).
 * - design.md → Error Handling → Connector aktivasi: rejected → R3.6
 *   message, timeout 30s → R3.7 preserve prev, storage failure → R3.5
 *   preserve prev.
 *
 * Why a dedicated service (and not a method on Connector_Registry):
 * the Registry is a thin in-memory map plus a read-only DB overlay
 * (see registry.ts). Activation pulls in three additional collaborators
 * (the credential vault service, the team-connector repo, and a
 * Source-API credential validator) and is the one place where the
 * credential plaintext travels through the platform. Keeping that
 * concentrated in one class makes the privacy story easy to audit.
 *
 * Logging policy: this module never logs `plaintext` — not on success
 * paths, not in error messages. The error messages returned to callers
 * are the static, generic strings required by R3.5–R3.7.
 */

import { err, ok, type AppError, type ConnectorStatus, type Result } from '@leads-generator/shared';

import type { CredentialVaultService } from '../auth/credential-vault-service.js';
import type { TeamConnectorRepository } from '../repository/team-connector-repository.js';

import type { Connector_Registry } from './registry.js';

/**
 * Maximum time (in milliseconds) the platform waits for the Source API
 * to accept or reject credentials during activation. R3.7 mandates 30s.
 *
 * Exposed as a named constant so tests (and other callers, e.g. the
 * Connector Admin API) reference the same value rather than hardcoding
 * `30_000` in multiple places.
 */
export const ACTIVATION_TIMEOUT_MS = 30_000;

/**
 * Adapter that performs the per-Source credential validation (a no-op
 * "auth probe" call against the Source's official API). Implementations
 * MUST forward `signal` to the underlying HTTP client and abort the
 * outgoing request when the signal aborts — otherwise the connector
 * could hang past {@link ACTIVATION_TIMEOUT_MS}.
 *
 * Connectors whose Source has no usable validation endpoint can either:
 * - return `{ accepted: true }` unconditionally (and rely on the first
 *   real `fetch` call during a Scan_Job to surface auth errors), or
 * - throw to fail activation, which we surface as a TIMEOUT-class
 *   failure that preserves the previous status.
 *
 * The interface is intentionally narrow (`accepted: boolean`) — we don't
 * want connector authors to invent extra status codes here.
 */
export interface CredentialValidator {
  validate(
    sourceId: string,
    plaintext: string,
    signal: AbortSignal,
  ): Promise<{ accepted: boolean }>;
}

/**
 * Collaborators required by {@link ConnectorActivationService}. All four
 * are injected to keep the service testable without standing up the
 * real DB / crypto stack.
 *
 * `now` is currently unused but reserved for future audit-log
 * integration (R11.8 will record activation attempts) and intentionally
 * accepted via DI rather than read off `Date.now()` so behaviour stays
 * deterministic in tests.
 */
export interface ActivationDeps {
  registry: Connector_Registry;
  vault: CredentialVaultService;
  repo: TeamConnectorRepository;
  validator: CredentialValidator;
  now?: () => Date;
}

/**
 * Successful activation payload. We return the `status` explicitly —
 * even though it is always `'available'` on the success branch — so the
 * caller can plumb it straight into a UI response without re-deriving
 * it from "Result.ok implies available".
 */
export interface ActivationSuccess {
  status: 'available';
}

/**
 * Connector activation orchestrator (R3.4–R3.7).
 *
 * The service performs four steps inside a 30-second deadline:
 *
 * 1. Read the existing per-Team status (so we can preserve it on
 *    R3.5/R3.7 failures).
 * 2. Validate the supplied credential against the Source API with a
 *    `setTimeout(30s)` AbortController.
 * 3. On rejection (R3.6): set status to `requires_configuration` and
 *    return `AUTHORIZATION`.
 * 4. On acceptance: encrypt + persist via the vault (R3.4) and set
 *    status to `available`. If the persist step throws (R3.5), keep
 *    the previous status and return `INTERNAL`.
 *
 * On timeout (R3.7) we abort the validator and return `TIMEOUT` without
 * touching the stored status.
 */
export class ConnectorActivationService {
  constructor(private readonly deps: ActivationDeps) {}

  /**
   * Validate the supplied credential against the Source API within
   * {@link ACTIVATION_TIMEOUT_MS}. State transitions:
   *
   * - accepted → encrypt + store, set status `available`, return `ok`.
   * - rejected → set status `requires_configuration`, return
   *   `AUTHORIZATION`.
   * - timeout (signal aborted) → preserve previous status, return
   *   `TIMEOUT`.
   * - validator throws unexpectedly (not via abort) → preserve previous
   *   status, return `INTERNAL` ("validation failed"). Treated like a
   *   timeout for state-preservation purposes per R3.7's spirit:
   *   when in doubt, leave the connector in its previous state.
   * - storeForTeam throws → preserve previous status, return
   *   `INTERNAL` ("failed to store credentials") per R3.5.
   *
   * `prevStatus` defaults to `'available'` (R3.2) when no
   * `team_connector` row exists yet, matching the Connector_Registry
   * default.
   */
  async activate(
    teamId: string,
    sourceId: string,
    plaintext: string,
  ): Promise<Result<ActivationSuccess>> {
    const existing = await this.deps.repo.get(teamId, sourceId);
    // R3.2: a Team that has never touched this connector is implicitly
    // 'available' — the Connector_Registry materializes the same default
    // when no row exists (see registry.ts → DEFAULT_STATUS).
    const _prevStatus: ConnectorStatus = existing?.status ?? 'available';

    const controller = new AbortController();
    const timer = setTimeout((): void => {
      controller.abort();
    }, ACTIVATION_TIMEOUT_MS);

    try {
      let validation: { accepted: boolean };
      try {
        validation = await this.deps.validator.validate(
          sourceId,
          plaintext,
          controller.signal,
        );
      } catch (cause) {
        // R3.7: timeout (the controller fired and the validator's
        // outgoing request aborted) — preserve previous status.
        if (controller.signal.aborted) {
          return err<AppError>({
            code: 'TIMEOUT',
            message: 'Validation timeout',
          });
        }
        // Validator failed for some non-timeout reason. Treat the same
        // way as a timeout for state-preservation: do NOT mutate the
        // stored status. The error code differs so callers can
        // distinguish a deadline miss from a generic validation error.
        // `cause` is intentionally not interpolated into the user-facing
        // message — it may carry adapter-specific detail we don't want
        // to leak to the API surface (and definitely not the plaintext).
        void cause;
        return err<AppError>({
          code: 'INTERNAL',
          message: 'Validation failed',
        });
      }

      // Validator returned, but the deadline may have fired
      // simultaneously (race). Treat any aborted state as TIMEOUT —
      // the deadline is authoritative.
      if (controller.signal.aborted) {
        return err<AppError>({
          code: 'TIMEOUT',
          message: 'Validation timeout',
        });
      }

      if (!validation.accepted) {
        // R3.6: API rejected the credentials. Move status to
        // `requires_configuration` so the Admin sees they must
        // re-enter credentials. The reason string is the same generic
        // 'credentials rejected' across all Sources — we never quote
        // upstream API messages because they may include identifiers
        // we don't want to surface to the UI.
        await this.deps.repo.upsertStatus(
          teamId,
          sourceId,
          'requires_configuration',
          'credentials rejected',
        );
        return err<AppError>({
          code: 'AUTHORIZATION',
          message: 'Credentials rejected',
        });
      }

      // R3.4: API accepted. Persist the encrypted credential FIRST,
      // then flip the status to `available`. Doing the storage step
      // first means a storage failure never leaves the connector in
      // a state where the UI says "available" but no credential is
      // present.
      try {
        await this.deps.vault.storeForTeam(teamId, sourceId, plaintext);
      } catch (cause) {
        // R3.5: storage failed → preserve previous status. Do NOT call
        // repo.upsertStatus; leaving the row untouched is precisely
        // how we preserve `prevStatus`.
        void cause;
        return err<AppError>({
          code: 'INTERNAL',
          message: 'Failed to store credentials',
        });
      }

      await this.deps.repo.upsertStatus(teamId, sourceId, 'available');
      return ok({ status: 'available' });
    } finally {
      // Always clear the deadline timer so it can't keep the event
      // loop alive past the activate() call (e.g., on the success
      // path) and so a late callback can't accidentally abort a
      // future, unrelated validator invocation if `controller` were
      // ever re-used.
      clearTimeout(timer);
    }
  }

  async remove(teamId: string, sourceId: string): Promise<void> {
    await this.deps.repo.remove(teamId, sourceId);
  }

  async listCredentialPresence(teamId: string): Promise<Array<{ sourceId: string; connected: boolean }>> {
    return this.deps.repo.listCredentialPresence(teamId);
  }
}
