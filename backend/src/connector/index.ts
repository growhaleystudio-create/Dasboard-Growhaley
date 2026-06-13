/**
 * Barrel for the Source_Connector module.
 *
 * Exposes the platform-side connector contract (which depends on
 * `AbortSignal`) plus the default normalization helper. Concrete
 * connectors live in sibling folders and import from this module.
 */

export { type Source_Connector, type ScanQuery } from './source-connector.js';
export {
  PUBLIC_FIELDS,
  type PublicField,
  type NormalizeContext,
  normalizeRawProspect,
} from './normalize.js';
export { Connector_Registry } from './registry.js';
export {
  ACTIVATION_TIMEOUT_MS,
  ConnectorActivationService,
  type ActivationDeps,
  type ActivationSuccess,
  type CredentialValidator,
} from './activation.js';
export { ExampleGoogleSearchConnector } from './example-google-search.js';
