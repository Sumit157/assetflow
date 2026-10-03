import type { RequestHandler } from 'express';
import type { Permission } from '@assetflow/types';
import { ERROR_CODES, hasPermission } from '@assetflow/shared';
import { HttpError } from '../lib/http-error.js';

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new HttpError(401, ERROR_CODES.UNAUTHORIZED, 'Authentication required.'));
      return;
    }
    if (!hasPermission(req.auth.role, permission)) {
      next(
        new HttpError(
          403,
          ERROR_CODES.FORBIDDEN,
          'You do not have permission to perform this action.',
        ),
      );
      return;
    }
    next();
  };
}
