import type { AssetCondition, AssetPublic } from '@assetflow/types';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { FormError, SubmitButton, TextField } from '../../components/form';
import { RequirePermission } from '../../components/route-guards';
import {
  ASSET_CONDITION_LABELS,
  useAsset,
  useAssetCategories,
  useCreateAsset,
  useLocations,
  useUpdateAsset,
} from '../../features/assets/api';
import { errorMessage } from '../../lib/error-message';
import { zodResolver } from '../../lib/form-resolver';
import { useAuthStore } from '../../stores/auth-store';

const assetFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name for this asset.').max(160),
  assetTag: z.string().trim().min(1, 'Enter an asset tag.').max(50),
  description: z.string().max(2000, 'Description is too long.'),
  serialNumber: z.string().max(100, 'Serial number is too long.'),
  categoryId: z.string(),
  locationId: z.string(),
  condition: z.enum(['good', 'fair', 'poor']),
});

type AssetFormValues = z.infer<typeof assetFormSchema>;

function toInput(values: AssetFormValues) {
  return {
    name: values.name.trim(),
    assetTag: values.assetTag.trim(),
    description: values.description.trim() || null,
    categoryId: values.categoryId || null,
    locationId: values.locationId || null,
    serialNumber: values.serialNumber.trim() || null,
    condition: values.condition,
  };
}

interface AssetFormProps {
  initial?: AssetPublic;
}

function AssetForm({ initial }: AssetFormProps) {
  const organisation = useAuthStore((state) => state.organisation);
  const orgId = organisation?.id ?? null;
  const navigate = useNavigate();
  const createAsset = useCreateAsset(orgId);
  const updateAsset = useUpdateAsset(orgId, initial?.id ?? null);
  const categories = useAssetCategories(orgId);
  const locations = useLocations(orgId);
  const mutation = initial ? updateAsset : createAsset;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      name: initial?.name ?? '',
      assetTag: initial?.assetTag ?? '',
      description: initial?.description ?? '',
      serialNumber: initial?.serialNumber ?? '',
      categoryId: initial?.categoryId ?? '',
      locationId: initial?.locationId ?? '',
      condition: initial?.condition ?? 'good',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (initial) {
        await updateAsset.mutateAsync(toInput(values));
        navigate(`/app/assets/${initial.id}`);
      } else {
        const created = await createAsset.mutateAsync(toInput(values));
        navigate(`/app/assets/${created.id}`);
      }
    } catch {
      // Error surfaced below.
    }
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-4">
      {mutation.isError ? (
        <FormError testId="asset-form-error">
          {errorMessage(mutation.error, 'Could not save the asset.')}
        </FormError>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Name"
          placeholder="Dell Latitude 5540"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Asset tag"
          placeholder="AST-0001"
          hint="Printed on the label; the barcode matches this tag."
          error={errors.assetTag?.message}
          {...register('assetTag')}
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          placeholder="Optional notes about this asset"
          className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-fg focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          {...register('description')}
        />
        {errors.description ? (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            {errors.description.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Serial number"
          placeholder="Optional"
          error={errors.serialNumber?.message}
          {...register('serialNumber')}
        />
        <div>
          <label htmlFor="condition" className="block text-sm font-medium">
            Condition
          </label>
          <select
            id="condition"
            className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            {...register('condition')}
          >
            {(Object.keys(ASSET_CONDITION_LABELS) as AssetCondition[]).map((condition) => (
              <option key={condition} value={condition}>
                {ASSET_CONDITION_LABELS[condition]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium">
            Category
          </label>
          <select
            id="categoryId"
            className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            {...register('categoryId')}
          >
            <option value="">No category</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="locationId" className="block text-sm font-medium">
            Location
          </label>
          <select
            id="locationId"
            className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            {...register('locationId')}
          >
            <option value="">No location</option>
            {(locations.data ?? []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <SubmitButton
          busy={isSubmitting || mutation.isPending}
          busyLabel={initial ? 'Saving…' : 'Creating…'}
          className="w-auto px-4"
        >
          {initial ? 'Save changes' : 'Create asset'}
        </SubmitButton>
        <button
          type="button"
          onClick={() => navigate(initial ? `/app/assets/${initial.id}` : '/app/assets')}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AssetFormPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const organisation = useAuthStore((state) => state.organisation);
  const orgId = organisation?.id ?? null;
  const asset = useAsset(orgId, assetId ?? null);
  const isEdit = Boolean(assetId);

  if (!isEdit) {
    return (
      <RequirePermission permission="assets.create">
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">New asset</h1>
            <p className="mt-1 text-sm text-muted-fg">Register a new asset in your inventory.</p>
          </div>
          <section className="rounded-lg border border-border bg-surface p-6">
            <AssetForm />
          </section>
        </div>
      </RequirePermission>
    );
  }

  if (asset.isPending) {
    return <p className="py-6 text-sm text-muted-fg">Loading asset…</p>;
  }

  if (asset.isError || !asset.data) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger"
      >
        {errorMessage(asset.error, 'Could not load this asset.')}
      </div>
    );
  }

  return (
    <RequirePermission permission="assets.update">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Edit asset</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {asset.data.name} · {asset.data.assetTag}
          </p>
        </div>
        <section className="rounded-lg border border-border bg-surface p-6">
          <AssetForm key={asset.data.id} initial={asset.data} />
        </section>
      </div>
    </RequirePermission>
  );
}
