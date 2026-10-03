import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { hasPermission } from '@assetflow/shared';
import type { Permission } from '@assetflow/types';
import { useAuthStore } from '../stores/auth-store';

function BootSplash() {
  return (
    <div
      role="status"
      data-testid="boot-splash"
      className="flex min-h-screen items-center justify-center bg-background"
    >
      <span className="text-sm text-muted-fg">Loading AssetFlow…</span>
    </div>
  );
}

export function AuthBoot() {
  const boot = useAuthStore((state) => state.boot);
  useEffect(() => {
    void boot();
  }, [boot]);
  return null;
}

export function RootLayout() {
  return (
    <>
      <AuthBoot />
      <Outlet />
    </>
  );
}

export function HomeRedirect() {
  const status = useAuthStore((state) => state.status);
  if (status === 'booting') return <BootSplash />;
  return <Navigate to={status === 'authenticated' ? '/app' : '/login'} replace />;
}

export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();
  if (status === 'booting') return <BootSplash />;
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/app'} replace />;
  }
  return <>{children}</>;
}

export function RequireAuth() {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();
  if (status === 'booting') return <BootSplash />;
  if (status === 'anonymous') {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  return <Outlet />;
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const role = useAuthStore((state) => state.membership?.role);
  if (role && hasPermission(role, permission)) {
    return <>{children}</>;
  }
  return (
    <div
      role="alert"
      data-testid="permission-denied"
      className="rounded-lg border border-warning/40 bg-warning/10 p-6"
    >
      <h2 className="text-sm font-semibold text-warning">You do not have access to this page</h2>
      <p className="mt-1 text-sm text-muted-fg">
        Ask an organisation administrator to change your role if you need it.
      </p>
    </div>
  );
}
