import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ERROR_CODES } from '@assetflow/shared';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

interface BodyParserError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
  body?: unknown;
}

function asBodyParserError(error: unknown): BodyParserError | null {
  if (error instanceof SyntaxError && 'body' in error) {
    return error as BodyParserError;
  }
  if (typeof error === 'object' && error !== null && 'type' in error) {
    return error as BodyParserError;
  }
  return null;
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `Route ${req.method} ${req.path} not found`,
      requestId: req.id,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = req.id ?? 'unknown';

  if (res.headersSent) {
    logger.error('error after headers sent', { requestId, error });
    res.end();
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        requestId,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  const bodyError = asBodyParserError(error);
  if (bodyError?.type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: ERROR_CODES.PAYLOAD_TOO_LARGE,
        message: 'Request payload too large',
        requestId,
      },
    });
    return;
  }
  if (bodyError) {
    res.status(400).json({
      error: {
        code: ERROR_CODES.BAD_REQUEST,
        message: 'Malformed JSON in request body',
        requestId,
      },
    });
    return;
  }

  logger.error('unhandled request error', { requestId, error });
  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message:
        env.NODE_ENV === 'development' && error instanceof Error
          ? error.message
          : 'Internal server error',
      requestId,
    },
  });
};
