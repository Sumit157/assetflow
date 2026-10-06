import type { AssetCategoryPublic } from '@assetflow/types';
import { PERMISSIONS, hasPermission } from '@assetflow/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FormError, SubmitButton, TextField } from '../../components/form';
import { RequirePermission } from '../../components/route-guards';
import {
  useAssetCategories,
  useCreateAssetCategory,
  useDeleteAssetCategory,
  useUpdateAssetCategory,
} from '../../features/assets/api';
import { errorMessage } from '../../lib/error-message';
import { zodResolver } from '../../lib/form-resolver';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuthStore } from '../../stores/auth-store';

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a category name.').max(80),
  description: z.string().max(500, 'Description is too long.'),
});

type CategoryValues = z.infer<typeof categorySchema>;

function CategoryForm({
  initial,
  onDone,
  testId,
}: {
  initial?: AssetCategoryPublic;
  onDone: () => void;
  testId: string;
}) {
  const organisation = useAuthStore((state) => state.organisation);
  const orgId = organisation?.id ?? null;
  const createCategory = useCreateAssetCategory(orgId);
  const updateCategory = useUpdateAssetCategory(orgId, initial?.id ?? null);
  const mutation = initial ? updateCategory : createCategory;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: initial?.name ?? '',
      description: initial?.description ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const input = { name: values.name.trim(), description: values.description.trim() || null };
    try {
      if (initial) {
        await updateCategory.mutateAsync(input);
      } else {
        await createCategory.mutateAsync(input);
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
          {errorMessage(mutation.error, 'Could not save the category.')}
        </FormError>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Name"
          placeholder="Laptops"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Description"
          placeholder="Optional"
          error={errors.description?.message}
          {...register('description')}
        />
      </div>
      <div className="flex gap-3">
        <SubmitButton
          busy={isSubmitting || mutation.isPending}
          busyLabel="Saving…"
          className="w-auto px-4"
        >
          {initial ? 'Save' : 'Add category'}
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

function CategoryRow({ category }: { category: AssetCategoryPublic }) {
  const organisation = useAuthStore((state) => state.organisation);
  const role = useAuthStore((state) => state.membership?.role);
  const orgId = organisation?.id ?? null;
  const deleteCategory = useDeleteAssetCategory(orgId, category.id);
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
      await deleteCategory.mutateAsync();
    } catch {
      setConfirmingDelete(false);
    }
  };

  if (editing) {
    return (
      <li className="py-3" data-testid="category-row">
        <CategoryForm
          initial={category}
          testId={`edit-category-${category.id}`}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      className="flex flex-wrap items-center justify-between gap-3 py-3"
      data-testid="category-row"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{category.name}</p>
        <p className="text-xs text-muted-fg">
          {category.description ? `${category.description} · ` : ''}
          {category.assetCount} asset{category.assetCount === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {deleteCategory.isError ? (
          <p role="alert" className="text-xs text-danger">
            {errorMessage(deleteCategory.error, 'Could not delete this category.')}
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
            disabled={deleteCategory.isPending}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
          >
            {deleteCategory.isPending
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

function CategoriesContent() {
  const organisation = useAuthStore((state) => state.organisation);
  const role = useAuthStore((state) => state.membership?.role);
  const orgId = organisation?.id ?? null;
  const categories = useAssetCategories(orgId);
  const [creating, setCreating] = useState(false);
  const canCreate = Boolean(role && hasPermission(role, PERMISSIONS.ASSETS_CREATE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Asset categories</h1>
          <p className="mt-1 text-sm text-muted-fg">
            Group assets into categories such as laptops, vehicles or furniture.
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
            <h2 className="text-sm font-semibold">Add a category</h2>
            {!creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                data-testid="new-category"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
              >
                New category
              </button>
            ) : null}
          </div>
          {creating ? (
            <div className="mt-4">
              <CategoryForm testId="create-category" onDone={() => setCreating(false)} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">All categories</h2>
        {categories.isPending ? (
          <p className="mt-3 text-sm text-muted-fg">Loading categories…</p>
        ) : categories.isError ? (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger"
          >
            {errorMessage(categories.error, 'Could not load categories.')}
          </div>
        ) : categories.data.length === 0 ? (
          <p className="mt-3 text-sm text-muted-fg" data-testid="categories-empty">
            No categories yet. Add one above to start grouping assets.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border" data-testid="categories-list">
            {categories.data.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function AssetCategoriesPage() {
  return (
    <RequirePermission permission="assets.view">
      <CategoriesContent />
    </RequirePermission>
  );
}
