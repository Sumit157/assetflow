import type { RequestHandler } from 'express';
import { ERROR_CODES } from '@assetflow/shared';
import { HttpError } from '../lib/http-error.js';

/**
 * Binds org-scoped routes to the active organisation in the session.
 * The organisation id in the URL must match the one resolved from the
 * authenticated token; clients can never address another tenant directly.
 */
export const requireActiveOrganisation: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(new HttpError(401, ERROR_CODES.UNAUTHORIZED, 'Authentication required.'));
    return;
  }
  if (!req.auth.orgId) {
    next(
      new HttpError(
        403,
        ERROR_CODES.ORGANISATION_REQUIRED,
        'You do not have an active organisation.',
      ),
    );
    return;
  }
  if (req.params.id !== req.auth.orgId) {
    next(
      new HttpError(
        403,
        ERROR_CODES.FORBIDDEN,
        'You can only access your active organisation. Switch organisations to continue.',
      ),
    );
    return;
  }
  next();
};
