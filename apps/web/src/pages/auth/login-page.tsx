import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { FormError, SubmitButton, TextField } from '../../components/form';
import { errorMessage } from '../../lib/error-message';
import { zodResolver } from '../../lib/form-resolver';
import { useAuthStore } from '../../stores/auth-store';

const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const status = useAuthStore((state) => state.status);
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  if (status === 'authenticated') {
    return <Navigate to={from} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (error) {
      setServerError(errorMessage(error, 'Could not sign you in. Please try again.'));
    }
  });

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
          <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-fg">Access your organisation&apos;s assets.</p>

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
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />

            <SubmitButton busy={isSubmitting} busyLabel="Signing in…">
              Sign in
            </SubmitButton>
          </form>

          <div className="mt-4 flex items-center justify-between text-xs">
            <Link to="/forgot-password" className="text-primary hover:underline">
              Forgot password?
            </Link>
            <Link to="/register" className="text-primary hover:underline">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
