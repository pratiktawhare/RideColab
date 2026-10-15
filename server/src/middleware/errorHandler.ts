import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '~/utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';
  const message =
    statusCode === 500 ? 'An unexpected error occurred' : (err.message ?? 'Something went wrong');

  if (statusCode === 500) {
    logger.error({ err, url: req.url, method: req.method }, 'Unhandled server error');
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details: null,
    },
  });
}

/** Helper to create typed app errors */
export function createError(message: string, statusCode: number, code: string): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
