import { ROLE_LABELS } from '@assetflow/shared';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ThemeToggle } from './theme-toggle';
import { errorMessage } from '../lib/error-message';
import { cn } from '../lib/cn';
import { useAuthStore } from '../stores/auth-store';

const NAV_ITEMS = [
  { to: '/app', end: true, label: 'Overview' },
  { to: '/app/assets', label: 'Assets' },
  { to: '/app/organisation', label: 'Organisation' },
  { to: '/app/members', label: 'Members' },
  { to: '/app/account', label: 'Account' },
];

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-primary/10 text-primary' : 'text-muted-fg hover:bg-muted hover:text-fg',
  );
}

export function AppShell() {
  const user = useAuthStore((state) => state.user);
  const organisation = useAuthStore((state) => state.organisation);
  const membership = useAuthStore((state) => state.membership);
  const memberships = useAuthStore((state) => state.memberships);
  const switchOrganisation = useAuthStore((state) => state.switchOrganisation);
  const logout = useAuthStore((state) => state.logout);

  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shellError, setShellError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const handleSwitch = async (organisationId: string) => {
    if (!organisationId || organisationId === organisation?.id) return;
    setSwitching(true);
    setShellError(null);
    try {
      await switchOrganisation(organisationId);
    } catch (error) {
      setShellError(errorMessage(error, 'Could not switch organisation.'));
    } finally {
      setSwitching(false);
    }
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout().catch(() => undefined);
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-fg"
            >
              A
            </span>
            <span className="text-sm font-semibold tracking-tight">AssetFlow</span>
          </div>

          <div className="flex items-center gap-3">
            {memberships.length > 1 ? (
              <label className="flex items-center gap-2">
                <span className="sr-only">Active organisation</span>
                <select
                  aria-label="Active organisation"
                  value={organisation?.id ?? ''}
                  disabled={switching}
                  onChange={(event) => void handleSwitch(event.target.value)}
                  className="max-w-40 truncate rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium outline-none focus-visible:border-primary sm:max-w-56"
                >
                  {memberships.map((item) => (
                    <option key={item.organisationId} value={item.organisationId}>
                      {item.organisationName}
                    </option>
                  ))}
                </select>
              </label>
            ) : organisation ? (
              <span className="hidden max-w-56 truncate text-xs font-medium text-muted-fg sm:block">
                {organisation.name}
              </span>
            ) : null}

            <ThemeToggle />

            <div className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                data-testid="user-menu-button"
                className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
              >
                <span className="max-w-32 truncate">{user?.name ?? 'Account'}</span>
                <span aria-hidden="true" className="text-muted-fg">
                  ▾
                </span>
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  data-testid="user-menu"
                  className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-surface p-3 shadow-lg"
                >
                  <p className="truncate text-sm font-medium">{user?.name}</p>
                  <p className="truncate text-xs text-muted-fg">{user?.email}</p>
                  <p className="mt-2 text-xs text-muted-fg">
                    Role: {membership ? ROLE_LABELS[membership.role] : 'No active organisation'}
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleLogout()}
                    data-testid="sign-out"
                    className="mt-3 w-full rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {shellError ? (
        <div
          role="alert"
          className="border-b border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger"
        >
          {shellError}
        </div>
      ) : null}

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <aside aria-label="Sections" className="hidden w-48 shrink-0 md:block">
          <nav className="sticky top-20 space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
