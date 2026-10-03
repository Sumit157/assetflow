import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { postForgotPassword } from '../../lib/api';
import { FormError, SubmitButton, TextField } from '../../components/form';
import { errorMessage } from '../../lib/error-message';
import { zodResolver } from '../../lib/form-resolver';

const forgotSchema = z.object({
  email: z.email('Enter a valid email address.'),
});

type ForgotValues = z.infer<typeof forgotSchema>;

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await postForgotPassword({ email: values.email });
      setSent(true);
    } catch (error) {
      setServerError(errorMessage(error, 'Could not process the request. Please try again.'));
    }
  });

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted-fg" data-testid="reset-sent">
            If an account exists for that address, a password reset link is on its way. The link
            expires in one hour.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-fg"
          >
            A
          </span>
          <span className="text-base font-semibold tracking-tight">AssetFlow</span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-fg">
            Enter your account email and we&apos;ll send you a reset link.
          </p>

          <form onSubmit={(event) => void onSubmit(event)} noValidate className="mt-5 space-y-4">
            {serverError ? <FormError>{serverError}</FormError> : null}

            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <SubmitButton busy={isSubmitting} busyLabel="Sending…">
              Send reset link
            </SubmitButton>
          </form>

          <p className="mt-4 text-center text-xs">
            <Link to="/login" className="text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
