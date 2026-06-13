/**
 * Barrel for the Auth_Service module.
 *
 * Re-exports the session store contract and Redis implementation along
 * with the idle-timeout constant and `validateSession` helper. Login,
 * logout, account locking, and RBAC live in sibling modules added by
 * later tasks.
 *
 * Design refs: design.md → Components and Interfaces → Auth_Service.
 */

export {
  SESSION_IDLE_TIMEOUT_SECONDS,
  RedisSessionStore,
  type SessionStore,
  type SessionRedis,
} from './session-store.js';
export { validateSession } from './validate-session.js';
export { CredentialVault, createCredentialVault } from './credential-vault.js';
export { CredentialVaultService } from './credential-vault-service.js';
export { TeamAiSettingsService } from './team-ai-settings-service.js';
export {
  SESSION_COOKIE_NAME,
  parseSessionCookie,
  buildSessionCookie,
  type BuildSessionCookieOptions,
} from './session-cookie.js';
export {
  authPlugin,
  requireAuth,
  type AuthPluginOptions,
  type ProtectionMode,
  type RequireAuthOptions,
} from './auth-plugin.js';
