import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthSessionResponse } from '@assetflow/types';
import { ApiClientError, apiGet, apiPost, configureAuth, postLogin } from './api';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

const session: AuthSessionResponse = {
  user: {
    id: 'u1',
    name: 'Ada',
    email: 'ada@example.test',
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  organisation: { id: 'o1', name: 'Org', createdAt: '2026-01-01T00:00:00.000Z' },
  membership: {
    organisationId: 'o1',
    userId: 'u1',
    role: 'ORG_ADMIN',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
  memberships: [{ organisationId: 'o1', organisationName: 'Org', role: 'ORG_ADMIN' }],
  accessToken: 'new-token',
};

afterEach(() => {
  vi.unstubAllGlobals();
  configureAuth(null);
});

describe('apiGet', () => {
  it('requests the API base path and unwraps the success envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { status: 'ok' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiGet<{ status: string }>('/health/live');

    expect(result).toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/health/live',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('throws ApiClientError with details from error envelopes', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: { code: 'NOT_FOUND', message: 'Asset not found', requestId: 'req-1' } },
            404,
          ),
        ),
    );

    const error = await apiGet('/assets/1').then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiClientError);
    if (error instanceof ApiClientError) {
      expect(error.code).toBe('NOT_FOUND');
      expect(error.status).toBe(404);
      expect(error.message).toBe('Asset not found');
      expect(error.requestId).toBe('req-1');
    }
  });

  it('maps non-envelope error responses to a generic client error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => '<html>bad gateway</html>',
      }),
    );

    const error = await apiGet('/health/live').then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiClientError);
    if (error instanceof ApiClientError) {
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.status).toBe(502);
    }
  });

  it('maps network failures to SERVICE_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    const error = await apiGet('/health/live').then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiClientError);
    if (error instanceof ApiClientError) {
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.status).toBe(0);
    }
  });

  it('rejects success responses without a data envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ unexpected: true })));

    const error = await apiGet('/health/live').then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiClientError);
    if (error instanceof ApiClientError) {
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.message).toContain('unexpected response format');
    }
  });
});

describe('authenticated requests', () => {
  function bridge(initialToken: string | null) {
    let currentToken = initialToken;
    const onSessionRefreshed = vi.fn((next: AuthSessionResponse) => {
      currentToken = next.accessToken;
    });
    const onAuthLost = vi.fn();
    configureAuth({
      getAccessToken: () => currentToken,
      onSessionRefreshed,
      onAuthLost,
    });
    return { onSessionRefreshed, onAuthLost };
  }

  it('sends the bearer token when one exists', async () => {
    bridge('abc123');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await apiGet('/organisations');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer abc123');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const { onSessionRefreshed, onAuthLost } = bridge('stale-token');
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(jsonResponse({ data: session }));
      }
      if (headers.authorization === 'Bearer stale-token') {
        return Promise.resolve(
          jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'nope', requestId: 'r' } }, 401),
        );
      }
      return Promise.resolve(jsonResponse({ data: { allowed: true } }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiGet<{ allowed: boolean }>('/organisations');

    expect(result).toEqual({ allowed: true });
    expect(onSessionRefreshed).toHaveBeenCalledWith(session);
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it('shares a single refresh across concurrent 401s', async () => {
    const { onSessionRefreshed } = bridge('stale-token');
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      if (url.includes('/auth/refresh')) {
        return new Promise((resolve: (value: ReturnType<typeof jsonResponse>) => void) => {
          setTimeout(() => resolve(jsonResponse({ data: session })), 10);
        });
      }
      if (headers.authorization === 'Bearer stale-token') {
        return Promise.resolve(
          jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'nope', requestId: 'r' } }, 401),
        );
      }
      return Promise.resolve(jsonResponse({ data: { ok: 1 } }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([apiGet('/a'), apiGet('/b')]);

    expect(first).toEqual({ ok: 1 });
    expect(second).toEqual({ ok: 1 });
    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
    expect(onSessionRefreshed).toHaveBeenCalledTimes(1);
  });

  it('reports auth loss when the refresh fails', async () => {
    const { onSessionRefreshed, onAuthLost } = bridge('stale-token');
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse(
              { error: { code: 'SESSION_EXPIRED', message: 'gone', requestId: 'r' } },
              401,
            ),
          );
        }
        return Promise.resolve(
          jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'nope', requestId: 'r' } }, 401),
        );
      }),
    );

    const error = await apiGet('/organisations').then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiClientError);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(onSessionRefreshed).not.toHaveBeenCalled();
  });

  it('does not attempt a refresh for login failures', async () => {
    const { onAuthLost } = bridge(null);
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Wrong email or password',
            requestId: 'r',
          },
        },
        401,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const error = await postLogin({ email: 'a@b.test', password: 'x' }).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiClientError);
    if (error instanceof ApiClientError) {
      expect(error.code).toBe('INVALID_CREDENTIALS');
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it('still posts bodies as JSON', async () => {
    bridge(null);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: null }));
    vi.stubGlobal('fetch', fetchMock);

    await apiPost('/auth/forgot-password', { email: 'a@b.test' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.test' }));
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });
});
