import type { LocationPublic } from '@assetflow/types';
import { PERMISSIONS, hasPermission } from '@assetflow/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormError, SubmitButton, TextField } from '../../components/form';
import { RequirePermission } from '../../components/route-guards';
import {
  useCreateLocation,
  useDeleteLocation,
  useLocations,
  useUpdateLocation,
} from '../../features/assets/api';
import { errorMessage } from '../../lib/error-message';
import { zodResolver } from '../../lib/form-resolver';
import { useAuthStore } from '../../stores/auth-store';

const locationSchema = z.object({
  name: z.string().trim().min(1, 'Enter a location name.').max(80),
  code: z.string().trim().max(30, 'Code is too long.'),
});

type LocationValues = z.infer<typeof locationSchema>;

function LocationForm({
  initial,
  onDone,
  testId,
}: {
  initial?: LocationPublic;
  onDone: () => void;
  testId: string;
}) {
  const organisation = useAuthStore((state) => state.organisation);
  const orgId = organisation?.id ?? null;
  const createLocation = useCreateLocation(orgId);
  const updateLocation = useUpdateLocation(orgId, initial?.id ?? null);
  const mutation = initial ? updateLocation : createLocation;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LocationValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: initial?.name ?? '',
      code: initial?.code ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const input = { name: values.name.trim(), code: values.code.trim() || null };
    try {
      if (initial) {
        await updateLocation.mutateAsync(input);
      } else {
        await createLocation.mutateAsync(input);
      }
      onDone();
    } catch {
      // Error surfaced below.
    }
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-4">
      {mutation.isError ? (
        <FormError testId={`${testId}-error`}>
          {errorMessage(mutation.error, 'Could not save the location.')}
        </FormError>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Name"
          placeholder="Head Office"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Code"
          placeholder="Optional, e.g. HQ-1"
          error={errors.code?.message}
          {...register('code')}
        />
      </div>
      <div className="flex gap-3">
        <SubmitButton
          busy={isSubmitting || mutation.isPending}
          busyLabel="Saving…"
          className="w-auto px-4"
        >
          {initial ? 'Save' : 'Add location'}
        </SubmitButton>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function LocationRow({ location }: { location: LocationPublic }) {
  const organisation = useAuthStore((state) => state.organisation);
  const role = useAuthStore((state) => state.membership?.role);
  const orgId = organisation?.id ?? null;
  const deleteLocation = useDeleteLocation(orgId, location.id);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canUpdate = Boolean(role && hasPermission(role, PERMISSIONS.ASSETS_UPDATE));
  const canDelete = Boolean(role && hasPermission(role, PERMISSIONS.ASSETS_DELETE));

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await deleteLocation.mutateAsync();
    } catch {
      setConfirmingDelete(false);
    }
  };

  if (editing) {
    return (
      <li className="py-3" data-testid="location-row">
        <LocationForm
          initial={location}
          testId={`edit-location-${location.id}`}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      className="flex flex-wrap items-center justify-between gap-3 py-3"
      data-testid="location-row"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {location.name}
          {location.code ? (
            <span className="ml-2 font-mono text-xs text-muted-fg">{location.code}</span>
          ) : null}
        </p>
        <p className="text-xs text-muted-fg">
          {location.assetCount} asset{location.assetCount === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {deleteLocation.isError ? (
          <p role="alert" className="text-xs text-danger">
            {errorMessage(deleteLocation.error, 'Could not delete this location.')}
          </p>
        ) : null}
        {canUpdate ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
          >
            Edit
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            onClick={() => void handleDelete()}
            onBlur={() => setConfirmingDelete(false)}
            disabled={deleteLocation.isPending}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
          >
            {deleteLocation.isPending
              ? 'Deleting…'
              : confirmingDelete
                ? 'Confirm delete?'
                : 'Delete'}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function LocationsContent() {
  const organisation = useAuthStore((state) => state.organisation);
  const role = useAuthStore((state) => state.membership?.role);
  const orgId = organisation?.id ?? null;
  const locations = useLocations(orgId);
  const [creating, setCreating] = useState(false);
  const canCreate = Boolean(role && hasPermission(role, PERMISSIONS.ASSETS_CREATE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Locations</h1>
          <p className="mt-1 text-sm text-muted-fg">
            Record where assets are stored: offices, floors, warehouses or rooms.
          </p>
        </div>
        <Link
          to="/app/assets"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          Back to assets
        </Link>
      </div>

      {canCreate ? (
        <section className="rounded-lg border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Add a location</h2>
            {!creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                data-testid="new-location"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
              >
                New location
              </button>
            ) : null}
          </div>
          {creating ? (
            <div className="mt-4">
              <LocationForm testId="create-location" onDone={() => setCreating(false)} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">All locations</h2>
        {locations.isPending ? (
          <p className="mt-3 text-sm text-muted-fg">Loading locations…</p>
        ) : locations.isError ? (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger"
          >
            {errorMessage(locations.error, 'Could not load locations.')}
          </div>
        ) : locations.data.length === 0 ? (
          <p className="mt-3 text-sm text-muted-fg" data-testid="locations-empty">
            No locations yet. Add one above to start tracking where assets live.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border" data-testid="locations-list">
            {locations.data.map((location) => (
              <LocationRow key={location.id} location={location} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function LocationsPage() {
  return (
    <RequirePermission permission="assets.view">
      <LocationsContent />
    </RequirePermission>
  );
}
