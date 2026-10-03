import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { ROLE_LABELS } from '@assetflow/shared';
import { RequirePermission } from '../../components/route-guards';
import { FormError, SubmitButton, TextField } from '../../components/form';
import { errorMessage } from '../../lib/error-message';
import { zodResolver } from '../../lib/form-resolver';
import { useMembers, useRenameOrganisation } from '../../features/organisation/api';
import { useAuthStore } from '../../stores/auth-store';

const renameSchema = z.object({
  name: z.string().trim().min(1, 'Enter an organisation name.').max(120),
});

type RenameValues = z.infer<typeof renameSchema>;

function RenameForm() {
  const organisation = useAuthStore((state) => state.organisation);
  const refreshMe = useAuthStore((state) => state.refreshMe);
  const rename = useRenameOrganisation(organisation?.id ?? null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RenameValues>({
    resolver: zodResolver(renameSchema),
    defaultValues: { name: organisation?.name ?? '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setDone(false);
    try {
      await rename.mutateAsync(values.name);
      await refreshMe();
      setDone(true);
    } catch {
      setDone(false);
    }
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-4">
      {rename.isError ? (
        <FormError>{errorMessage(rename.error, 'Could not rename.')}</FormError>
      ) : null}
      {done ? (
        <p className="text-sm text-success" data-testid="rename-saved">
          Organisation renamed.
        </p>
      ) : null}

      <TextField label="Organisation name" error={errors.name?.message} {...register('name')} />
      <SubmitButton
        busy={isSubmitting || rename.isPending}
        busyLabel="Saving…"
        className="w-auto px-4"
      >
        Save name
      </SubmitButton>
    </form>
  );
}

export function OrganisationPage() {
  const organisation = useAuthStore((state) => state.organisation);
  const membership = useAuthStore((state) => state.membership);
  const members = useMembers(organisation?.id ?? null);

  if (!organisation) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold tracking-tight">Organisation</h1>
        <p className="mt-2 text-sm text-muted-fg">
          You are not a member of any organisation. Accept an invitation or create one from another
          session.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Organisation</h1>
        <p className="mt-1 text-sm text-muted-fg">Workspace details and settings.</p>
      </div>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Details</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-fg">Name</dt>
            <dd className="mt-1 text-sm font-medium" data-testid="org-name">
              {organisation.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-fg">Created</dt>
            <dd className="mt-1 text-sm font-medium">
              {new Date(organisation.createdAt).toLocaleDateString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-fg">Your role</dt>
            <dd className="mt-1 text-sm font-medium">
              {membership ? ROLE_LABELS[membership.role] : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-fg">Members</dt>
            <dd className="mt-1 text-sm font-medium" data-testid="member-count">
              {members.data ? members.data.length : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <RequirePermission permission="settings.manage">
        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">Rename</h2>
          <div className="mt-4">
            <RenameForm />
          </div>
        </section>
      </RequirePermission>
    </div>
  );
}
