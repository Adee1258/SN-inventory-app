import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('[API Error]:', err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_FAILED',
      message: 'Request payload failed schema validation',
      issues: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as unknown as { code: string; meta?: { target?: string[] } };
    if (prismaErr.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'UNIQUE_CONSTRAINT_VIOLATION',
        message: `A record with this unique identifier already exists. Field(s): ${prismaErr.meta?.target?.join(', ')}`,
      });
    }
    if (prismaErr.code === 'P2003') {
      return res.status(400).json({
        success: false,
        error: 'FOREIGN_KEY_VIOLATION',
        message: 'Operation failed due to referencing a non-existent or restricted related record.',
      });
    }
  }

  // Business Logic Errors (e.g. INSUFFICIENT_STOCK, UNBALANCED_JOURNAL)
  if (err.message && (err.message.includes('INSUFFICIENT_STOCK') || err.message.includes('UNBALANCED_JOURNAL'))) {
    return res.status(400).json({
      success: false,
      error: 'BUSINESS_RULE_VIOLATION',
      message: err.message,
    });
  }

  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred on the local server.',
  });
}
