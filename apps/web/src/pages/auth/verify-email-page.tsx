import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { ApiClientError, postResendVerification, postVerifyEmail } from '../../lib/api';
import { FormError, SubmitButton } from '../../components/form';
import { errorMessage } from '../../lib/error-message';
import { useAuthStore } from '../../stores/auth-store';

type VerifyState = 'verifying' | 'done' | 'failed';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<VerifyState>(token ? 'verifying' : 'failed');
  const [message, setMessage] = useState<string | null>(
    token ? null : 'This verification link is missing its token.',
  );
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    void (async () => {
      try {
        await postVerifyEmail({ token });
        setState('done');
        if (useAuthStore.getState().status === 'authenticated') {
          await useAuthStore.getState().refreshMe();
        }
      } catch (error) {
        setState('failed');
        setMessage(errorMessage(error, 'Could not verify this email address.'));
      }
    })();
  }, [token]);

  const resend = async () => {
    setResendState('sending');
    try {
      await postResendVerification();
      setResendState('sent');
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'CONFLICT') {
        setResendState('sent');
        return;
      }
      setResendState('error');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
        {state === 'verifying' ? (
          <div role="status" data-testid="verifying">
            <h1 className="text-lg font-semibold tracking-tight">Verifying your email…</h1>
            <p className="mt-2 text-sm text-muted-fg">One moment.</p>
          </div>
        ) : null}

        {state === 'done' ? (
          <div data-testid="verify-done">
            <h1 className="text-lg font-semibold tracking-tight">Email verified</h1>
            <p className="mt-2 text-sm text-muted-fg">
              Your address is confirmed. You&apos;re all set.
            </p>
            <Link to="/app" className="mt-4 inline-block text-sm text-primary hover:underline">
              Continue to AssetFlow
            </Link>
          </div>
        ) : null}

        {state === 'failed' ? (
          <div data-testid="verify-failed">
            <h1 className="text-lg font-semibold tracking-tight">Verification failed</h1>
            {message ? <FormError testId="verify-error">{message}</FormError> : null}
            <div className="mt-4 space-y-3">
              <Link to="/login" className="inline-block text-sm text-primary hover:underline">
                Back to sign in
              </Link>
              {status === 'authenticated' ? (
                <div>
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
                      className="mt-2"
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
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
