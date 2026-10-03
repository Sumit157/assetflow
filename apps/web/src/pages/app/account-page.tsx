import { ROLE_LABELS } from '@assetflow/shared';
import { useState } from 'react';
import { SubmitButton } from '../../components/form';
import { postResendVerification } from '../../lib/api';
import { useSessions, useRevokeSession } from '../../features/sessions/api';
import { errorMessage } from '../../lib/error-message';
import { useAuthStore } from '../../stores/auth-store';

export function AccountPage() {
  const user = useAuthStore((state) => state.user);
  const organisation = useAuthStore((state) => state.organisation);
  const membership = useAuthStore((state) => state.membership);
  const memberships = useAuthStore((state) => state.memberships);

  const sessions = useSessions(Boolean(user));
  const revokeSession = useRevokeSession();
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const resend = async () => {
    setResendState('sending');
    try {
      await postResendVerification();
      setResendState('sent');
    } catch {
      setResendState('error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-fg">Your profile and active sessions.</p>
      </div>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Profile</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-fg">Name</dt>
            <dd className="mt-1 text-sm font-medium">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-fg">Email</dt>
            <dd className="mt-1 text-sm font-medium">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-fg">
              Email status
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {user?.emailVerified ? (
                <span className="text-success" data-testid="email-verified">
                  Verified
                </span>
              ) : (
                <span className="text-warning" data-testid="email-unverified">
                  Unverified
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-fg">
              Organisation
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {organisation
                ? `${organisation.name}${membership ? ` · ${ROLE_LABELS[membership.role]}` : ''}`
                : 'None'}
              {memberships.length > 1 ? (
                <span className="ml-1 text-xs text-muted-fg">
                  ({memberships.length} memberships)
                </span>
              ) : null}
            </dd>
          </div>
        </dl>

        {user && !user.emailVerified ? (
          <div className="mt-4 border-t border-border pt-4">
            {resendState === 'sent' ? (
              <p className="text-sm text-success" data-testid="resend-sent">
                A new verification link is on its way.
              </p>
            ) : (
              <SubmitButton
                busy={resendState === 'sending'}
                busyLabel="Sending…"
                disabled={resendState === 'sending'}
                onClick={() => void resend()}
                className="w-auto px-4"
              >
                Resend verification email
              </SubmitButton>
            )}
            {resendState === 'error' ? (
              <p role="alert" className="mt-2 text-xs text-danger">
                Could not send the email. Try again shortly.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Active sessions</h2>
        <p className="mt-1 text-xs text-muted-fg">
          Signing out on another device revokes its session immediately.
        </p>

        {sessions.isPending ? (
          <p className="mt-3 text-sm text-muted-fg">Loading sessions…</p>
        ) : sessions.isError ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {errorMessage(sessions.error, 'Could not load sessions.')}
          </p>
        ) : sessions.data.length === 0 ? (
          <p className="mt-3 text-sm text-muted-fg">No active sessions.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border" data-testid="sessions-list">
            {sessions.data.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {session.userAgent ?? 'Unknown device'}
                    {session.current ? (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        This device
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-fg">
                    Signed in {new Date(session.createdAt).toLocaleString()}
                    {session.ip ? ` · ${session.ip}` : ''}
                  </p>
                </div>
                {session.current ? null : (
                  <button
                    type="button"
                    onClick={() => void revokeSession.mutate(session.id)}
                    disabled={revokeSession.isPending}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    {revokeSession.isPending && revokeSession.variables === session.id
                      ? 'Revoking…'
                      : 'Sign out'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {revokeSession.isError ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {errorMessage(revokeSession.error, 'Could not revoke that session.')}
          </p>
        ) : null}
      </section>
    </div>
  );
}
