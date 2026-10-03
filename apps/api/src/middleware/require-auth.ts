import type { RequestHandler } from 'express';
import { ERROR_CODES } from '@assetflow/shared';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../types/auth-context.js';

export function requireAuth(verify: (token: string) => AuthContext | null): RequestHandler {
  return (req, _res, next) => {
    const header = req.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
    const context = token ? verify(token) : null;
    if (!context) {
      next(new HttpError(401, ERROR_CODES.UNAUTHORIZED, 'Authentication required.'));
      return;
    }
    req.auth = context;
    next();
  };
}
