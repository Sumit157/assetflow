import type { AuthSessionResponse } from '@assetflow/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { resetAuthStore } from './stores/auth-store';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function errorResponse(code: string, message: string, status: number) {
  return jsonResponse({ error: { code, message, requestId: 'req-1' } }, status);
}

const session: AuthSessionResponse = {
  user: {
    id: 'u1',
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    emailVerified: true,
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

function routeFetch(handlers: Record<string, (init?: RequestInit) => unknown>) {
  return vi.fn((url: unknown, init?: RequestInit) => {
    const target = String(url);
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (target.includes(pattern)) {
        return Promise.resolve(handler(init) as never);
      }
    }
    return Promise.resolve(jsonResponse({ data: null }));
  });
}

beforeEach(() => {
  resetAuthStore();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App boot', () => {
  it('shows a loading splash until the session check settles', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)) as unknown as typeof fetch);

    render(<App />);

    expect(screen.getByTestId('boot-splash')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('redirects anonymous visitors to the login page', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        '/auth/refresh': () => errorResponse('SESSION_EXPIRED', 'No session', 401),
      }),
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('sends an authenticated visitor to the overview', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        '/auth/refresh': () => jsonResponse({ data: session }),
        '/health/ready': () =>
          jsonResponse({
            data: { status: 'ready', dependencies: { mongo: 'up', redis: 'up' } },
          }),
        '/health/live': () =>
          jsonResponse({
            data: { status: 'ok', timestamp: '2026-10-02T10:00:00.000Z', uptimeSeconds: 42 },
          }),
      }),
    );

    render(<App />);

    expect(await screen.findByText('Welcome back, Ada')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/app');
    expect(await screen.findByTestId('status-badge')).toHaveTextContent('Operational');
    expect(screen.getByText('Analytical Engines · Organisation admin')).toBeInTheDocument();
  });

  it('redirects deep links to login and returns after signing in', async () => {
    window.history.replaceState({}, '', '/app/members');
    vi.stubGlobal(
      'fetch',
      routeFetch({
        '/auth/refresh': () => errorResponse('SESSION_EXPIRED', 'No session', 401),
        '/auth/login': () => jsonResponse({ data: session }),
        '/organisations/o1/members': () => jsonResponse({ data: [] }),
        '/organisations/o1/invitations': () => jsonResponse({ data: [] }),
        '/health/ready': () =>
          jsonResponse({
            data: { status: 'ready', dependencies: { mongo: 'up', redis: 'up' } },
          }),
        '/health/live': () =>
          jsonResponse({
            data: { status: 'ok', timestamp: '2026-10-02T10:00:00.000Z', uptimeSeconds: 42 },
          }),
      }),
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Members' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/app/members');
  });

  it('shows the login form validation errors before any request', async () => {
    const fetchMock = vi.fn((url: unknown) => {
      if (String(url).includes('/auth/refresh')) {
        return Promise.resolve(errorResponse('SESSION_EXPIRED', 'No session', 401));
      }
      return Promise.resolve(jsonResponse({ data: null }));
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    window.history.replaceState({}, '', '/login');

    render(<App />);

    await screen.findByRole('heading', { name: 'Sign in' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    const loginCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/login'));
    expect(loginCalls).toHaveLength(0);
  });

  it('signs out through the user menu', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        '/auth/refresh': () => jsonResponse({ data: session }),
        '/auth/logout': () => jsonResponse({ data: null }),
        '/health/ready': () =>
          jsonResponse({
            data: { status: 'ready', dependencies: { mongo: 'up', redis: 'up' } },
          }),
        '/health/live': () =>
          jsonResponse({
            data: { status: 'ok', timestamp: '2026-10-02T10:00:00.000Z', uptimeSeconds: 42 },
          }),
      }),
    );

    render(<App />);

    await screen.findByText('Welcome back, Ada');
    await userEvent.click(screen.getByTestId('user-menu-button'));
    await userEvent.click(screen.getByTestId('sign-out'));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('keeps the theme toggle working in the shell', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        '/auth/refresh': () => jsonResponse({ data: session }),
        '/health/ready': () =>
          jsonResponse({
            data: { status: 'ready', dependencies: { mongo: 'up', redis: 'up' } },
          }),
        '/health/live': () =>
          jsonResponse({
            data: { status: 'ok', timestamp: '2026-10-02T10:00:00.000Z', uptimeSeconds: 42 },
          }),
      }),
    );

    render(<App />);

    await screen.findByText('Welcome back, Ada');
    const toggle = screen.getByRole('button', { name: 'Switch to dark theme' });
    await userEvent.click(toggle);

    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('assetflow-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
  });
});
