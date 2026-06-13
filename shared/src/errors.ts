/**
 * Stable application error categories.
 *
 * Keep these broad for HTTP/status handling. Use {@link AppErrorCode} for
 * the searchable, product-specific identifier shown in UI/logs.
 */
export type AppErrorCategory =
  | 'VALIDATION'
  | 'AUTH'
  | 'AUTHORIZATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'INTERNAL';

/**
 * Stable, searchable error identifiers.
 *
 * Prefix convention:
 * - API_*: generic request/transport/schema failures.
 * - AUTH_*: login/session/RBAC failures.
 * - CONTENT_*: carousel/content generation failures.
 * - AI_*: provider key/budget/model/provider failures.
 * - CONNECTOR_*, SCAN_*, LEAD_*, TEAM_*, PRIVACY_*, STORAGE_*: domain areas.
 */
export const APP_ERROR_CODES = [
  'API_VALIDATION_FAILED',
  'API_SCHEMA_VALIDATION_FAILED',
  'API_RESPONSE_PARSE_FAILED',
  'API_UNHANDLED_INTERNAL_ERROR',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_SESSION_MISSING',
  'AUTH_SESSION_EXPIRED',
  'AUTH_FORBIDDEN',
  'AUTH_TEAM_MISMATCH',
  'TEAM_NOT_FOUND',
  'TEAM_ROLE_INVALID',
  'TEAM_INVITE_INVALID',
  'TEAM_INVITE_EXPIRED',
  'CONNECTOR_CONFIG_INVALID',
  'CONNECTOR_NOT_FOUND',
  'CONNECTOR_ACTIVATION_FAILED',
  'CONNECTOR_CREDENTIAL_INVALID',
  'SCAN_CONFIG_INVALID',
  'SCAN_CONFIG_NOT_FOUND',
  'SCAN_JOB_ALREADY_RUNNING',
  'SCAN_CONNECTOR_FAILED',
  'LEAD_NOT_FOUND',
  'LEAD_DELETE_CONFIRMATION_REQUIRED',
  'LEAD_AI_REANALYZE_FAILED',
  'AI_API_KEY_MISSING',
  'AI_BUDGET_EXCEEDED',
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_ERROR',
  'AI_PROVIDER_QUOTA_EXCEEDED',
  'AI_PROVIDER_MALFORMED_OUTPUT',
  'AI_SETTINGS_INVALID',
  'AI_PROVIDER_BASE_URL_MISSING',
  'AI_PROVIDER_ENDPOINT_MISMATCH',
  'AI_PROVIDER_INSECURE_TRANSPORT',
  'CONTENT_BRAND_KIT_INVALID',
  'CONTENT_BRAND_KIT_NOT_FOUND',
  'CONTENT_MASTER_TEMPLATE_INVALID',
  'CONTENT_MASTER_TEMPLATE_NOT_FOUND',
  'CONTENT_PLAN_VALIDATION_ERROR',
  'CONTENT_LAYOUT_UNSATISFIABLE',
  'CONTENT_IMAGE_PROVIDER_ERROR',
  'CONTENT_IMAGE_PROVIDER_TIMEOUT',
  'CONTENT_IMAGE_BACKGROUND_UNCLEAN',
  'CONTENT_IMAGE_OFF_BRAND',
  'CONTENT_CHART_DATA_MISSING',
  'CONTENT_MOCKUP_MISSING',
  'CONTENT_UPLOAD_FAILED',
  'CONTENT_PRIVACY_VIOLATION',
  'CONTENT_JOB_NOT_FOUND',
  'CONTENT_JOB_FAILED',
  'CONTENT_REFERENCE_INVALID',
  'CONTENT_REFERENCE_NOT_FOUND',
  'PRIVACY_EXPORT_FAILED',
  'PRIVACY_DELETE_FAILED',
  'STORAGE_NOT_CONFIGURED',
  'STORAGE_UPLOAD_FAILED',
  'STORAGE_RESOURCE_NOT_FOUND',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export const DEFAULT_ERROR_CODE_BY_CATEGORY: Record<AppErrorCategory, AppErrorCode> = {
  VALIDATION: 'API_VALIDATION_FAILED',
  AUTH: 'AUTH_INVALID_CREDENTIALS',
  AUTHORIZATION: 'AUTH_FORBIDDEN',
  NOT_FOUND: 'STORAGE_RESOURCE_NOT_FOUND',
  CONFLICT: 'SCAN_JOB_ALREADY_RUNNING',
  RATE_LIMIT: 'AI_BUDGET_EXCEEDED',
  TIMEOUT: 'AI_PROVIDER_TIMEOUT',
  INTERNAL: 'API_UNHANDLED_INTERNAL_ERROR',
};

export const AI_UNAVAILABLE_ERROR_CODE: Record<string, AppErrorCode> = {
  no_api_key: 'AI_API_KEY_MISSING',
  budget_exceeded: 'AI_BUDGET_EXCEEDED',
  timeout: 'AI_PROVIDER_TIMEOUT',
  provider_error: 'AI_PROVIDER_ERROR',
  malformed_output: 'AI_PROVIDER_MALFORMED_OUTPUT',
  quota_exceeded: 'AI_PROVIDER_QUOTA_EXCEEDED',
};

export const CONTENT_FAILURE_ERROR_CODE: Record<string, AppErrorCode> = {
  validation_error: 'CONTENT_PLAN_VALIDATION_ERROR',
  budget_exceeded: 'AI_BUDGET_EXCEEDED',
  endpoint_mismatch: 'AI_PROVIDER_ENDPOINT_MISMATCH',
  insecure_transport: 'AI_PROVIDER_INSECURE_TRANSPORT',
  privacy_violation: 'CONTENT_PRIVACY_VIOLATION',
  background_unclean: 'CONTENT_IMAGE_BACKGROUND_UNCLEAN',
  missing_chart_data: 'CONTENT_CHART_DATA_MISSING',
  missing_mockup: 'CONTENT_MOCKUP_MISSING',
  upload_failed: 'CONTENT_UPLOAD_FAILED',
  off_brand: 'CONTENT_IMAGE_OFF_BRAND',
  provider_error: 'CONTENT_IMAGE_PROVIDER_ERROR',
  malformed_output: 'AI_PROVIDER_MALFORMED_OUTPUT',
  timeout: 'CONTENT_IMAGE_PROVIDER_TIMEOUT',
  layout_unsatisfiable: 'CONTENT_LAYOUT_UNSATISFIABLE',
};

export function isAppErrorCode(value: string): value is AppErrorCode {
  return (APP_ERROR_CODES as readonly string[]).includes(value);
}

export function appErrorCodeForCategory(category: AppErrorCategory): AppErrorCode {
  return DEFAULT_ERROR_CODE_BY_CATEGORY[category];
}

export function appErrorCodeForMessage(category: AppErrorCategory, message?: string): AppErrorCode {
  const normalized = (message ?? '').trim();
  if (isAppErrorCode(normalized)) return normalized;
  if (category === 'INTERNAL' && normalized in AI_UNAVAILABLE_ERROR_CODE) {
    return AI_UNAVAILABLE_ERROR_CODE[normalized]!;
  }
  if (normalized in CONTENT_FAILURE_ERROR_CODE) {
    return CONTENT_FAILURE_ERROR_CODE[normalized]!;
  }
  if (normalized === 'Missing session') return 'AUTH_SESSION_MISSING';
  if (normalized === 'Session expired or invalid') return 'AUTH_SESSION_EXPIRED';
  if (normalized === 'Invalid email or password') return 'AUTH_INVALID_CREDENTIALS';
  if (normalized === 'Resource not found') return 'STORAGE_RESOURCE_NOT_FOUND';
  if (normalized === 'provider_base_url_missing') return 'AI_PROVIDER_BASE_URL_MISSING';
  return appErrorCodeForCategory(category);
}

/**
 * Unified error shape ({@link AppError}) used across the app.
 *
 * `code` remains the broad category for backwards compatibility. `errorCode`
 * is the stable, searchable identifier that should be shown in UI/debug logs.
 */
export type AppError =
  | { code: 'VALIDATION'; messages: string[]; errorCode?: AppErrorCode }
  | { code: Exclude<AppErrorCategory, 'VALIDATION'>; message: string; errorCode?: AppErrorCode };
