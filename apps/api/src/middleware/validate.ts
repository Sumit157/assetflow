import type { RequestHandler } from 'express';
import { ERROR_CODES } from '@assetflow/shared';
import type { ZodType } from 'zod';
import { HttpError } from '../lib/http-error.js';

export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.') || 'body',
        message: issue.message,
      }));
      next(new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed.', details));
      return;
    }
    req.body = result.data;
    next();
  };
}
