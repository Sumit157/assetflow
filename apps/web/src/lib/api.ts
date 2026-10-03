import type {
  ApiErrorDetail,
  ApiSuccessEnvelope,
  AuthSessionResponse,
  MembershipPublic,
  OrganisationPublic,
} from '@assetflow/types';
import { isApiErrorEnvelope } from '@assetflow/shared';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: ApiErrorDetail[];

  constructor(
    status: number,
    code: string,
    message: string,
    options?: { requestId?: string; details?: ApiErrorDetail[] },
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    if (options?.requestId) this.requestId = options.requestId;
    if (options?.details) this.details = options.details;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export interface AuthBridge {
  getAccessToken(): string | null;
  onSessionRefreshed(session: AuthSessionResponse): void;
  onAuthLost(): void;
}

let authBridge: AuthBridge | null = null;

export function configureAuth(bridge: AuthBridge | null): void {
  authBridge = bridge;
}

export function resetAuthClient(): void {
  refreshInFlight = null;
}

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
  withAuth?: boolean;
  allowRefreshRetry?: boolean;
}

interface ResponseLike {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

let refreshInFlight: Promise<AuthSessionResponse | null> | null = null;

export function ensureSession(): Promise<AuthSessionResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = request<AuthSessionResponse>('POST', '/auth/refresh', {
      withAuth: false,
      allowRefreshRetry: false,
    })
      .then((session) => {
        authBridge?.onSessionRefreshed(session);
        return session;
      })
      .catch(() => {
        authBridge?.onAuthLost();
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function parseResponse<T>(response: ResponseLike): Promise<T> {
  const raw = await response.text();

  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : undefined;
  } catch {
    parsed = undefined;
  }

  if (!response.ok) {
    if (isApiErrorEnvelope(parsed)) {
      const { code, message, requestId, details } = parsed.error;
      throw new ApiClientError(response.status, code, message, { requestId, details });
    }
    throw new ApiClientError(
      response.status,
      'INTERNAL_ERROR',
      `Request failed with status ${response.status}`,
    );
  }

  if (parsed && typeof parsed === 'object' && 'data' in parsed) {
    return (parsed as ApiSuccessEnvelope<T>).data;
  }

  throw new ApiClientError(
    response.status,
    'INTERNAL_ERROR',
    'The API returned an unexpected response format',
  );
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const withAuth = options.withAuth ?? true;
  const allowRefreshRetry = options.allowRefreshRetry ?? true;

  const send = async (): Promise<ResponseLike> => {
    const headers: Record<string, string> = { accept: 'application/json' };
    const token = withAuth ? authBridge?.getAccessToken() : null;
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['content-type'] = 'application/json';

    try {
      return (await fetch(`${API_BASE_URL}/api/v1${path}`, {
        method,
        headers,
        credentials: 'include',
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      })) as unknown as ResponseLike;
    } catch {
      throw new ApiClientError(
        0,
        'SERVICE_UNAVAILABLE',
        'Could not reach the API. Check your connection and try again.',
      );
    }
  };

  let response = await send();

  if (response.status === 401 && withAuth && allowRefreshRetry && authBridge !== null) {
    const session = await ensureSession();
    if (session) {
      response = await send();
    }
  }

  return parseResponse<T>(response);
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>('GET', path, { signal });
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, { body });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PATCH', path, { body });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}

export interface AuthRequestOptions {
  signal?: AbortSignal;
}

export function postLogin(
  body: { email: string; password: string },
  options?: AuthRequestOptions,
): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>('POST', '/auth/login', {
    body,
    withAuth: false,
    allowRefreshRetry: false,
    signal: options?.signal,
  });
}

export function postRegister(
  body: { name: string; email: string; password: string; organisationName: string },
  options?: AuthRequestOptions,
): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>('POST', '/auth/register', {
    body,
    withAuth: false,
    allowRefreshRetry: false,
    signal: options?.signal,
  });
}

export function postLogout(): Promise<null> {
  return request<null>('POST', '/auth/logout', {
    withAuth: false,
    allowRefreshRetry: false,
  });
}

export function postForgotPassword(body: { email: string }): Promise<null> {
  return request<null>('POST', '/auth/forgot-password', {
    body,
    withAuth: false,
    allowRefreshRetry: false,
  });
}

export function postResetPassword(body: { token: string; password: string }): Promise<null> {
  return request<null>('POST', '/auth/reset-password', {
    body,
    withAuth: false,
    allowRefreshRetry: false,
  });
}

export function postVerifyEmail(body: { token: string }): Promise<null> {
  return request<null>('POST', '/auth/verify-email', {
    body,
    withAuth: false,
    allowRefreshRetry: false,
  });
}

export function postResendVerification(): Promise<null> {
  return request<null>('POST', '/auth/resend-verification', { body: {} });
}

export function postSwitchOrganisation(organisationId: string): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>('POST', '/auth/switch-org', {
    body: { organisationId },
  });
}

export function postAcceptInvitation(token: string): Promise<{
  organisation: OrganisationPublic;
  membership: MembershipPublic;
}> {
  return request('POST', '/invitations/accept', {
    body: { token },
    allowRefreshRetry: false,
  });
}
