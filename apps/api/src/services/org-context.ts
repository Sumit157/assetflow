import { ERROR_CODES } from '@assetflow/shared';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../types/auth-context.js';

/** Returns the active organisation id of the session, or throws 403. */
export function requireOrgId(claims: AuthContext): string {
  if (!claims.orgId) {
    throw new HttpError(
      403,
      ERROR_CODES.ORGANISATION_REQUIRED,
      'You do not have an active organisation.',
    );
  }
  return claims.orgId;
}
