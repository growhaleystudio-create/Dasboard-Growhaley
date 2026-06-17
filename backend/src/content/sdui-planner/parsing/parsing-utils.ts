/**
 * parsing-utils.ts — Utility functions for parsing and error handling
 */

import type { AppError } from '@leads-generator/shared';
import type { SduiPlannerError } from '../types.js';

/**
 * Extracts error message from AppError.
 */
export function extractErrorMessage(error: AppError): string {
  return error.code === 'VALIDATION' ? error.messages.join(', ') : error.message;
}

/**
 * Maps wrapper error message to SduiPlannerError.
 */
export function mapWrapperError(message: string): SduiPlannerError {
  switch (message) {
    case 'budget_exceeded':
      return { kind: 'budget_exceeded' };
    case 'endpoint_mismatch':
      return { kind: 'endpoint_mismatch' };
    case 'insecure_transport':
      return { kind: 'insecure_transport' };
    case 'privacy_violation':
      return { kind: 'privacy_violation' };
    case 'timeout':
      return { kind: 'timeout' };
    default:
      return { kind: 'provider_error', message };
  }
}
