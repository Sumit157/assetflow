import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '../lib/cn';

interface TextFieldProps extends ComponentPropsWithoutRef<'input'> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, id, ...inputProps }: TextFieldProps) {
  const inputId = id ?? inputProps.name;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors',
          'placeholder:text-muted-fg focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30',
          error && 'border-danger focus-visible:border-danger focus-visible:ring-danger/30',
        )}
        {...inputProps}
      />
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-muted-fg">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      role="alert"
      data-testid={testId ?? 'form-error'}
      className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
    >
      {children}
    </div>
  );
}

export function SubmitButton({
  busy,
  busyLabel = 'Working…',
  children,
  disabled,
  className,
  ...buttonProps
}: ComponentPropsWithoutRef<'button'> & { busy?: boolean; busyLabel?: string }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className={cn(
        'inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...buttonProps}
    >
      {busy ? busyLabel : children}
    </button>
  );
}
