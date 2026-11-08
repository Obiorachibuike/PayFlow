import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError, ErrorCodes, pgErrorCode, pgErrorConstraint } from '../utils/errors';

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
  message?: string;
}

function isPgError(error: unknown): error is PgError {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as PgError).code === 'string';
}

export class ApiError extends Error {}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: ErrorCodes.NOT_FOUND,
      message: `Route ${req.method} ${req.path} not found`,
    },
    requestId: req.requestId,
  });
}

/**
 * Single exit point for failures. Internal details (stack traces, SQL, provider
 * payloads) are never returned to clients in production.
 */
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      },
      requestId: req.requestId,
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error({ err: error, requestId: req.requestId }, error.message);
    }
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      requestId: req.requestId,
    });
    return;
  }

  const databaseCode = pgErrorCode(error) ?? (isPgError(error) ? error.code : undefined);

  if (databaseCode) {
    const mappings: Record<string, { status: number; code: string; message: string }> = {
      '23505': { status: 409, code: ErrorCodes.CONFLICT, message: 'This record already exists' },
      '23503': { status: 400, code: ErrorCodes.VALIDATION_ERROR, message: 'Related record not found' },
      '23514': { status: 400, code: ErrorCodes.VALIDATION_ERROR, message: 'Constraint violation' },
      '22P02': { status: 400, code: ErrorCodes.VALIDATION_ERROR, message: 'Malformed identifier' },
      '40001': { status: 409, code: ErrorCodes.CONFLICT, message: 'The transaction conflicted with another operation. Please retry.' },
    };
    const mapping = mappings[databaseCode];
    if (mapping) {
      logger.warn(
        { code: databaseCode, constraint: pgErrorConstraint(error), requestId: req.requestId },
        'Database constraint error',
      );
      res.status(mapping.status).json({
        error: { code: mapping.code, message: mapping.message },
        requestId: req.requestId,
      });
      return;
    }
  }

  logger.error({ err: error, requestId: req.requestId, path: req.path }, 'Unhandled error');

  res.status(500).json({
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'Something went wrong on our side. Please try again.',
      ...(env.NODE_ENV === 'development' && error instanceof Error ? { details: error.message } : {}),
    },
    requestId: req.requestId,
  });
}
