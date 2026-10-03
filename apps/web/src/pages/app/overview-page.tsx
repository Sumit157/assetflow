import { ROLE_LABELS } from '@assetflow/shared';
import { useState } from 'react';
import { HealthPanel } from '../../features/health/HealthPanel';
import { postResendVerification } from '../../lib/api';
import { useAuthStore } from '../../stores/auth-store';

export function OverviewPage() {
  const user = useAuthStore((state) => state.user);
  const organisation = useAuthStore((state) => state.organisation);
  const membership = useAuthStore((state) => state.membership);
  const refreshMe = useAuthStore((state) => state.refreshMe);

  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const resend = async () => {
    setResendState('sending');
    try {
      await postResendVerification();
      setResendState('sent');
      await refreshMe().catch(() => undefined);
    } catch {
      setResendState('error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Welcome back, {user?.name?.split(' ')[0] ?? 'there'}
        </h1>
        <p className="mt-1 text-sm text-muted-fg">
          {organisation
            ? `${organisation.name}${membership ? ` · ${ROLE_LABELS[membership.role]}` : ''}`
            : 'You are not a member of an organisation yet.'}
        </p>
      </div>

      {user && !user.emailVerified ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3"
          data-testid="verify-banner"
        >
          <p className="text-sm">
            Your email address is unverified. Check your inbox for the verification link.
          </p>
          {resendState === 'sent' ? (
            <p className="text-sm text-success" data-testid="verify-resent">
              A new link is on its way.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void resend()}
              disabled={resendState === 'sending'}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
            >
              {resendState === 'sending' ? 'Sending…' : 'Resend email'}
            </button>
          )}
          {resendState === 'error' ? (
            <p role="alert" className="w-full text-xs text-danger">
              Could not send the email. Try again shortly.
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 text-sm font-semibold">System status</h2>
        <HealthPanel />
      </div>
    </div>
  );
}
