import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '@assetflow/shared';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { postResetPassword } from '../../lib/api';
import { FormError, SubmitButton, TextField } from '../../components/form';
import { errorMessage } from '../../lib/error-message';
import { zodResolver } from '../../lib/form-resolver';

const resetSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(PASSWORD_MAX_LENGTH),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type ResetValues = z.infer<typeof resetSchema>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!token) return;
    setServerError(null);
    try {
      await postResetPassword({ token, password: values.password });
      setDone(true);
    } catch (error) {
      setServerError(errorMessage(error, 'Could not reset the password. Request a new link.'));
    }
  });

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Invalid reset link</h1>
          <p className="mt-2 text-sm text-muted-fg">This link is missing its token.</p>
          <Link
            to="/forgot-password"
            className="mt-4 inline-block text-sm text-primary hover:underline"
          >
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Password updated</h1>
          <p className="mt-2 text-sm text-muted-fg" data-testid="reset-done">
            Your password has been changed and other sessions were signed out.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm text-primary hover:underline">
            Sign in with your new password
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted-fg">Signing out everywhere else for safety.</p>

        <form onSubmit={(event) => void onSubmit(event)} noValidate className="mt-5 space-y-4">
          {serverError ? <FormError>{serverError}</FormError> : null}

          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            error={errors.password?.message}
            {...register('password')}
          />
          <TextField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <SubmitButton busy={isSubmitting} busyLabel="Updating…">
            Update password
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
