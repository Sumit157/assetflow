import type { AuthSessionResponse } from '@assetflow/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureAuth } from '../lib/api';
import { resetAuthStore, useAuthStore } from './auth-store';

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
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    emailVerified: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  organisation: { id: 'o1', name: 'Analytical Engines', createdAt: '2026-01-01T00:00:00.000Z' },
  membership: {
    organisationId: 'o1',
    userId: 'u1',
    role: 'ORG_ADMIN',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
  memberships: [
    { organisationId: 'o1', organisationName: 'Analytical Engines', role: 'ORG_ADMIN' },
  ],
  accessToken: 'access-1',
};

beforeEach(() => {
  resetAuthStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('boot', () => {
  it('resumes an existing session through the refresh cookie', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: session })));

    await useAuthStore.getState().boot();

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.user?.email).toBe('ada@example.test');
    expect(state.organisation?.name).toBe('Analytical Engines');
    expect(state.membership?.role).toBe('ORG_ADMIN');
    expect(state.accessToken).toBe('access-1');
  });

  it('falls back to anonymous when there is no session', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: { code: 'SESSION_EXPIRED', message: 'gone', requestId: 'r' } },
            401,
          ),
        ),
    );

    await useAuthStore.getState().boot();

    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('runs only once even when called concurrently', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: session }));
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([useAuthStore.getState().boot(), useAuthStore.getState().boot()]);

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is a no-op after the first boot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: session }));
    vi.stubGlobal('fetch', fetchMock);

    await useAuthStore.getState().boot();
    await useAuthStore.getState().boot();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('login and logout', () => {
  it('stores the session on successful login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: session })));

    await useAuthStore.getState().login('ada@example.test', 'correct horse battery');

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().accessToken).toBe('access-1');
  });

  it('propagates login failures without changing state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
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
      ),
    );

    await expect(useAuthStore.getState().login('ada@example.test', 'wrong')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });

    expect(useAuthStore.getState().status).toBe('booting');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('clears everything on logout even when the server call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: session })));
    await useAuthStore.getState().login('ada@example.test', 'correct horse battery');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(useAuthStore.getState().logout()).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });

    const state = useAuthStore.getState();
    expect(state.status).toBe('anonymous');
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });
});

describe('organisation switching', () => {
  it('applies the new active organisation from the response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: session })));
    await useAuthStore.getState().login('ada@example.test', 'correct horse battery');

    const second: AuthSessionResponse = {
      ...session,
      organisation: { id: 'o2', name: 'Second Org', createdAt: '2026-02-01T00:00:00.000Z' },
      membership: { ...session.membership!, organisationId: 'o2', role: 'VIEWER' },
      memberships: [
        ...(session.memberships ?? []),
        { organisationId: 'o2', organisationName: 'Second Org', role: 'VIEWER' },
      ],
      accessToken: 'access-2',
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: second })));

    await useAuthStore.getState().switchOrganisation('o2');

    expect(useAuthStore.getState().organisation?.id).toBe('o2');
    expect(useAuthStore.getState().membership?.role).toBe('VIEWER');
    expect(useAuthStore.getState().accessToken).toBe('access-2');
  });
});

describe('api bridge wiring', () => {
  it('feeds refreshed sessions into the store and clears on auth loss', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: session })));
    await useAuthStore.getState().login('ada@example.test', 'correct horse battery');

    configureAuth({
      getAccessToken: () => useAuthStore.getState().accessToken,
      onSessionRefreshed: (next) => useAuthStore.getState().applySession(next),
      onAuthLost: () => useAuthStore.getState().clear(),
    });

    const refreshed: AuthSessionResponse = { ...session, accessToken: 'access-9' };
    useAuthStore.getState().applySession(refreshed);
    expect(useAuthStore.getState().accessToken).toBe('access-9');

    useAuthStore.getState().clear();
    expect(useAuthStore.getState().status).toBe('anonymous');

    configureAuth(null);
  });
});
