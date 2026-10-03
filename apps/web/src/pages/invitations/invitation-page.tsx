import type { InvitationPreview } from '@assetflow/types';
import { ROLE_LABELS } from '@assetflow/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiClientError, apiGet, postAcceptInvitation } from '../../lib/api';
import { FormError, SubmitButton } from '../../components/form';
import { errorMessage } from '../../lib/error-message';
import { useAuthStore } from '../../stores/auth-store';

export function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const switchOrganisation = useAuthStore((state) => state.switchOrganisation);
  const refreshMe = useAuthStore((state) => state.refreshMe);

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [joinedButStuck, setJoinedButStuck] = useState(false);

  const preview = useQuery({
    queryKey: ['invitation-preview', token],
    queryFn: ({ signal }) => apiGet<InvitationPreview>(`/invitations/${token ?? ''}`, signal),
    enabled: Boolean(token),
    retry: false,
  });

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    setAcceptError(null);
    let joined = false;
    try {
      const result = await postAcceptInvitation(token);
      joined = true;
      await switchOrganisation(result.organisation.id);
      navigate('/app', { replace: true });
    } catch (error) {
      if (joined) {
        await refreshMe().catch(() => undefined);
        setJoinedButStuck(true);
        setAcceptError(errorMessage(error, 'Joined the organisation, but switching to it failed.'));
        return;
      }
      setAcceptError(errorMessage(error, 'Could not accept this invitation.'));
    } finally {
      setAccepting(false);
    }
  };

  if (preview.isPending) {
    return (
      <div
        role="status"
        data-testid="invitation-loading"
        className="flex min-h-screen items-center justify-center bg-background"
      >
        <span className="text-sm text-muted-fg">Loading invitation…</span>
      </div>
    );
  }

  if (preview.isError) {
    const invalid = preview.error instanceof ApiClientError && preview.error.status === 400;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">
            {invalid ? 'Invitation unavailable' : 'Something went wrong'}
          </h1>
          <p className="mt-2 text-sm text-muted-fg" data-testid="invitation-error">
            {invalid
              ? 'This invitation link is invalid, revoked, or expired. Ask an administrator to send a new one.'
              : errorMessage(preview.error, 'Could not load this invitation.')}
          </p>
          {invalid ? null : (
            <button
              type="button"
              onClick={() => void preview.refetch()}
              className="mt-4 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const invitation = preview.data;
  const emailMatches = user && user.email.toLowerCase() === invitation.email.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">Invitation</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">
          Join {invitation.organisationName}
        </h1>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-fg">Role</dt>
            <dd className="font-medium">{ROLE_LABELS[invitation.role]}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-fg">Invited email</dt>
            <dd className="truncate font-medium">{invitation.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-fg">Status</dt>
            <dd className="font-medium capitalize">{invitation.status}</dd>
          </div>
        </dl>

        {acceptError ? (
          <div className="mt-4">
            <FormError>{acceptError}</FormError>
          </div>
        ) : null}

        {invitation.status === 'pending' ? (
          status === 'authenticated' ? (
            emailMatches || joinedButStuck ? (
              <div className="mt-5">
                <SubmitButton
                  busy={accepting}
                  busyLabel="Joining…"
                  disabled={accepting || joinedButStuck}
                  onClick={() => void accept()}
                >
                  Accept invitation
                </SubmitButton>
                {joinedButStuck ? (
                  <p className="mt-2 text-xs text-muted-fg">
                    You are a member now — choose the organisation from the switcher in the top bar.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-5 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <p>
                  This invitation was sent to <strong>{invitation.email}</strong>, but you are
                  signed in as <strong>{user?.email}</strong>.
                </p>
                <Link
                  to="/login"
                  state={{ from: `/invitations/${token}` }}
                  className="mt-2 inline-block text-sm text-primary hover:underline"
                >
                  Sign in with the invited account
                </Link>
              </div>
            )
          ) : (
            <div className="mt-5 space-y-3">
              <p className="text-sm text-muted-fg">
                Sign in or create an account with <strong>{invitation.email}</strong> to accept.
              </p>
              <Link
                to="/register"
                state={{ from: `/invitations/${token}` }}
                data-testid="invitation-register"
                className="block rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
              >
                Create an account
              </Link>
              <Link
                to="/login"
                state={{ from: `/invitations/${token}` }}
                className="block text-center text-sm text-primary hover:underline"
              >
                I already have an account
              </Link>
            </div>
          )
        ) : (
          <div className="mt-5">
            <p className="text-sm text-muted-fg" data-testid="invitation-inactive">
              {invitation.status === 'accepted'
                ? 'This invitation has already been accepted.'
                : invitation.status === 'expired'
                  ? 'This invitation has expired. Ask an administrator to send a new one.'
                  : 'This invitation was revoked.'}
            </p>
            <Link
              to={status === 'authenticated' ? '/app' : '/login'}
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              {status === 'authenticated' ? 'Go to AssetFlow' : 'Back to sign in'}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
