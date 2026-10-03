import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RequireAuth, RequirePermission } from './route-guards';
import { resetAuthStore, useAuthStore } from '../stores/auth-store';

function buildRouter(initialPath: string) {
  return createMemoryRouter(
    [
      { path: '/login', element: <div data-testid="login-page">Login</div> },
      {
        path: '/protected',
        element: <RequireAuth />,
        children: [
          {
            path: 'admin-only',
            element: (
              <RequirePermission permission="users.manage">
                <div data-testid="admin-content">Admin area</div>
              </RequirePermission>
            ),
          },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
}

function renderRoute(initialPath: string) {
  const router = buildRouter(initialPath);
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  resetAuthStore();
});

afterEach(() => {
  resetAuthStore();
});

describe('RequireAuth', () => {
  it('waits while the session is booting', () => {
    renderRoute('/protected/admin-only');
    expect(screen.getByTestId('boot-splash')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('redirects anonymous visitors to login', () => {
    useAuthStore.setState({ status: 'anonymous' });
    renderRoute('/protected/admin-only');
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('permission-denied')).not.toBeInTheDocument();
  });

  it('renders protected content for authenticated users', () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: {
        id: 'u1',
        name: 'Ada',
        email: 'ada@example.test',
        emailVerified: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      membership: {
        organisationId: 'o1',
        userId: 'u1',
        role: 'ORG_ADMIN',
        joinedAt: '2026-01-01T00:00:00.000Z',
      },
      accessToken: 'token',
    });

    renderRoute('/protected/admin-only');
    expect(screen.getByTestId('admin-content')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });
});

describe('RequirePermission', () => {
  it('shows a denial state when the role lacks the permission', () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: {
        id: 'u2',
        name: 'Vic',
        email: 'vic@example.test',
        emailVerified: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      membership: {
        organisationId: 'o1',
        userId: 'u2',
        role: 'VIEWER',
        joinedAt: '2026-01-01T00:00:00.000Z',
      },
      accessToken: 'token',
    });

    renderRoute('/protected/admin-only');
    expect(screen.getByTestId('permission-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
  });
});
