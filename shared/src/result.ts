/**
 * Generic Result<T, E> discriminated union used across the
 * `leads-generator-dashboard` feature for explicit success/failure flow.
 *
 * The convention is intentional: domain operations that can fail return
 * `Result<T>` instead of throwing so callers must handle both branches.
 * The default error type is {@link AppError} (see `./errors.ts`).
 */

import type { AppError } from './errors.js';

/**
 * Either a success carrying a value of type `T`, or a failure carrying an
 * error of type `E` (default: {@link AppError}).
 */
export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Construct a successful {@link Result}.
 */
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/**
 * Construct a failed {@link Result}.
 *
 * The success branch is widened to `never` so the returned value is
 * assignable to any `Result<T, E>` without losing type information about
 * the error payload.
 */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
