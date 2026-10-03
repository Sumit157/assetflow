export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_TAKEN'
  | 'TOKEN_INVALID'
  | 'SESSION_EXPIRED'
  | 'ORGANISATION_REQUIRED';

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  details?: ApiErrorDetail[];
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}

export interface ApiSuccessEnvelope<T> {
  data: T;
}
