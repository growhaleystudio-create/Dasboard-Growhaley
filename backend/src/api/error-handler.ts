import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  appErrorCodeForCategory,
  appErrorCodeForMessage,
  type AppError,
  type AppErrorCategory,
  type AppErrorCode,
} from '@leads-generator/shared';

/**
 * Global error handler for Fastify.
 * Maps our domain `AppError` cases to appropriate HTTP status codes.
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Handle standard Fastify validation errors (e.g. from schema parsing)
  if ((error as any).validation) {
    return reply.status(400).send({
      code: 'FASTIFY_SCHEMA_VALIDATION',
      errorCode: 'API_SCHEMA_VALIDATION_FAILED',
      error: 'Bad Request',
      messages: (error as any).validation.map((v: any) => v.message || 'Validation error'),
    });
  }

  // If the error has a "code" that matches our AppError structure
  if (error && typeof error === 'object' && 'code' in error && isAppErrorCategory((error as { code?: unknown }).code)) {
    const appError = error as unknown as AppError;
    const errorCode = resolveErrorCode(appError);
    
    switch (appError.code) {
      case 'VALIDATION':
        return reply.status(400).send({
          code: 'VALIDATION',
          errorCode,
          error: 'Bad Request',
          messages: appError.messages,
        });
      case 'AUTH':
        return reply.status(401).send({
          code: 'AUTH',
          errorCode,
          error: 'Unauthorized',
          message: appError.message || 'Authentication required',
        });
      case 'AUTHORIZATION':
        return reply.status(403).send({
          code: 'AUTHORIZATION',
          errorCode,
          error: 'Forbidden',
          message: appError.message || 'Insufficient permissions',
        });
      case 'NOT_FOUND':
        return reply.status(404).send({
          code: 'NOT_FOUND',
          errorCode,
          error: 'Not Found',
          message: appError.message || 'Resource not found',
        });
      case 'CONFLICT':
        return reply.status(409).send({
          code: 'CONFLICT',
          errorCode,
          error: 'Conflict',
          message: appError.message || 'Resource conflict',
        });
      case 'RATE_LIMIT':
        return reply.status(429).send({
          code: 'RATE_LIMIT',
          errorCode,
          error: 'Too Many Requests',
          message: appError.message || 'Rate limit exceeded',
        });
      case 'TIMEOUT':
        return reply.status(504).send({
          code: 'TIMEOUT',
          errorCode,
          error: 'Gateway Timeout',
          message: appError.message || 'Request timed out',
        });
      case 'INTERNAL':
      default:
        request.log.error(appError);
        return reply.status(500).send({
          code: appError.code || 'INTERNAL',
          errorCode,
          error: 'Internal Server Error',
          message: appError.message || 'An unexpected error occurred',
        });
    }
  }

  // Fallback for native errors
  request.log.error(error);
  return reply.status(500).send({
    code: 'UNHANDLED_INTERNAL_ERROR',
    errorCode: 'API_UNHANDLED_INTERNAL_ERROR',
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
}

function resolveErrorCode(appError: AppError): AppErrorCode {
  if (appError.errorCode) return appError.errorCode;
  if (appError.code === 'VALIDATION') return appErrorCodeForCategory('VALIDATION');
  return appErrorCodeForMessage(appError.code as AppErrorCategory, appError.message);
}

function isAppErrorCategory(value: unknown): value is AppErrorCategory {
  return (
    value === 'VALIDATION' ||
    value === 'AUTH' ||
    value === 'AUTHORIZATION' ||
    value === 'NOT_FOUND' ||
    value === 'CONFLICT' ||
    value === 'RATE_LIMIT' ||
    value === 'TIMEOUT' ||
    value === 'INTERNAL'
  );
}
