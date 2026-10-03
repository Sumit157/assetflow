import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '@assetflow/shared';
import { ApiClientError } from '../../lib/api';
import { FormError, SubmitButton, TextField } from '../../components/form';
import { errorMessage } from '../../lib/error-message';
import { zodResolver } from '../../lib/form-resolver';
import { useAuthStore } from '../../stores/auth-store';

const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(100),
    email: z.email('Enter a valid email address.'),
    organisationName: z
      .string()
      .trim()
      .min(1, 'Enter an organisation name.')
      .max(120, 'Organisation name is too long.'),
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

type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const status = useAuthStore((state) => state.status);
  const registerAccount = useAuthStore((state) => state.register);
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      organisationName: '',
      password: '',
      confirmPassword: '',
    },
  });

  if (status === 'authenticated') {
    return <Navigate to="/app" replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await registerAccount({
        name: values.name,
        email: values.email,
        password: values.password,
        organisationName: values.organisationName,
      });
      navigate('/app', { replace: true });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'EMAIL_TAKEN') {
        setError('email', { message: 'An account with this email address already exists.' });
        return;
      }
      setServerError(errorMessage(error, 'Could not create your account. Please try again.'));
      const details = error instanceof ApiClientError ? (error.details ?? []) : [];
      const knownFields = ['name', 'email', 'organisationName', 'password'] as const;
      for (const detail of details) {
        const field = knownFields.find((name) => name === detail.path);
        if (field) setError(field, { message: detail.message });
      }
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
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
          <h1 className="text-lg font-semibold tracking-tight">Create your workspace</h1>
          <p className="mt-1 text-sm text-muted-fg">
            One account, one organisation — you can be invited to others later.
          </p>

          <form onSubmit={(event) => void onSubmit(event)} noValidate className="mt-5 space-y-4">
            {serverError ? <FormError>{serverError}</FormError> : null}

            <TextField
              label="Your name"
              autoComplete="name"
              error={errors.name?.message}
              {...register('name')}
            />
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              error={errors.email?.message}
              {...register('email')}
            />
            <TextField
              label="Organisation name"
              autoComplete="organization"
              placeholder="Acme Inc"
              error={errors.organisationName?.message}
              {...register('organisationName')}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="new-password"
              hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
              error={errors.password?.message}
              {...register('password')}
            />
            <TextField
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <SubmitButton busy={isSubmitting} busyLabel="Creating…">
              Create account
            </SubmitButton>
          </form>

          <p className="mt-4 text-center text-xs">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
