import type { ApiErrorCode, ApiErrorEnvelope } from '@assetflow/types';

export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  TOKEN_INVALID: 'TOKEN_INVALID',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  ORGANISATION_REQUIRED: 'ORGANISATION_REQUIRED',
} as const satisfies Record<ApiErrorCode, ApiErrorCode>;

export {
  ROLES,
  ASSIGNABLE_ROLES,
  PERMISSIONS,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  permissionsForRole,
  hasPermission,
} from './rbac.js';

export { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from './auth-rules.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MIN_PAGE = 1;

export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const error = (value as { error: unknown }).error;
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { code, message, requestId } = error as Record<string, unknown>;
  return typeof code === 'string' && typeof message === 'string' && typeof requestId === 'string';
}
