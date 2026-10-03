import type { AuthSessionResponse } from '@assetflow/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './login-page';
import { resetAuthStore, useAuthStore } from '../../stores/auth-store';

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
  accessToken: 'access-1',
};

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/app', element: <div data-testid="app-home">App home</div> },
    ],
    { initialEntries: ['/login'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  resetAuthStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('validates fields before calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces invalid credentials from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Wrong email or password',
              requestId: 'r-1',
            },
          },
          401,
        ),
      ),
    );

    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByTestId('form-error')).toHaveTextContent('Wrong email or password');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(useAuthStore.getState().status).not.toBe('authenticated');
  });

  it('signs in and redirects to the app', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: session })));

    const router = renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByTestId('app-home')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().accessToken).toBe('access-1');
  });

  it('keeps the loading label busy while the request runs', async () => {
    let resolveLogin: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLogin = resolve;
          }),
      ),
    );

    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();
    resolveLogin?.(jsonResponse({ data: session }));
    expect(await screen.findByTestId('app-home')).toBeInTheDocument();
  });
});
