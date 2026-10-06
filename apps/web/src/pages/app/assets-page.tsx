import type { AssetPublic, AssetStatus, Paginated } from '@assetflow/types';
import { PERMISSIONS, hasPermission } from '@assetflow/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RequirePermission } from '../../components/route-guards';
import {
  ASSET_CONDITION_LABELS,
  ASSET_STATUS_LABELS,
  useAssetCategories,
  useAssets,
  useLocations,
} from '../../features/assets/api';
import { errorMessage } from '../../lib/error-message';
import { cn } from '../../lib/cn';
import { useAuthStore } from '../../stores/auth-store';

const STATUS_STYLES: Record<AssetStatus, string> = {
  available: 'bg-success/10 text-success',
  assigned: 'bg-primary/10 text-primary',
  retired: 'bg-muted text-muted-fg',
};

export function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span
      data-testid="asset-status"
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_STYLES[status],
      )}
    >
      {ASSET_STATUS_LABELS[status]}
    </span>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function selectClass() {
  return 'rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-primary';
}

function AssetFilters({
  q,
  onQ,
  status,
  onStatus,
  categoryId,
  onCategoryId,
  locationId,
  onLocationId,
  categories,
  locations,
}: {
  q: string;
  onQ: (value: string) => void;
  status: AssetStatus | '';
  onStatus: (value: AssetStatus | '') => void;
  categoryId: string;
  onCategoryId: (value: string) => void;
  locationId: string;
  onLocationId: (value: string) => void;
  categories: { id: string; name: string }[];
  locations: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1">
        <label htmlFor="asset-search" className="block text-xs font-medium text-muted-fg">
          Search
        </label>
        <input
          id="asset-search"
          type="search"
          value={q}
          onChange={(event) => onQ(event.target.value)}
          placeholder="Name, tag, serial or barcode"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>
      <div>
        <label htmlFor="asset-status-filter" className="block text-xs font-medium text-muted-fg">
          Status
        </label>
        <select
          id="asset-status-filter"
          value={status}
          onChange={(event) => onStatus(event.target.value as AssetStatus | '')}
          className={cn('mt-1', selectClass())}
        >
          <option value="">All</option>
          <option value="available">Available</option>
          <option value="assigned">Assigned</option>
          <option value="retired">Retired</option>
        </select>
      </div>
      <div>
        <label htmlFor="asset-category-filter" className="block text-xs font-medium text-muted-fg">
          Category
        </label>
        <select
          id="asset-category-filter"
          value={categoryId}
          onChange={(event) => onCategoryId(event.target.value)}
          className={cn('mt-1', selectClass())}
        >
          <option value="">All</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="asset-location-filter" className="block text-xs font-medium text-muted-fg">
          Location
        </label>
        <select
          id="asset-location-filter"
          value={locationId}
          onChange={(event) => onLocationId(event.target.value)}
          className={cn('mt-1', selectClass())}
        >
          <option value="">All</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AssetTable({ data }: { data: Paginated<AssetPublic> }) {
  if (data.items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-fg" data-testid="assets-empty">
        No assets match the current filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-fg">
            <th className="py-2 pr-4 font-medium">Asset</th>
            <th className="py-2 pr-4 font-medium">Category</th>
            <th className="py-2 pr-4 font-medium">Location</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Assigned to</th>
            <th className="py-2 font-medium">Condition</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.items.map((asset) => (
            <tr key={asset.id} data-testid="asset-row">
              <td className="py-3 pr-4">
                <Link
                  to={`/app/assets/${asset.id}`}
                  className="text-sm font-medium hover:text-primary hover:underline"
                >
                  {asset.name}
                </Link>
                <p className="font-mono text-xs text-muted-fg">{asset.assetTag}</p>
              </td>
              <td className="py-3 pr-4 text-sm text-muted-fg">{asset.categoryName ?? '—'}</td>
              <td className="py-3 pr-4 text-sm text-muted-fg">{asset.locationName ?? '—'}</td>
              <td className="py-3 pr-4">
                <StatusBadge status={asset.status} />
              </td>
              <td className="py-3 pr-4 text-sm text-muted-fg">{asset.assignedToName ?? '—'}</td>
              <td className="py-3 text-sm text-muted-fg">
                {ASSET_CONDITION_LABELS[asset.condition]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssetsContent() {
  const organisation = useAuthStore((state) => state.organisation);
  const role = useAuthStore((state) => state.membership?.role);
  const orgId = organisation?.id ?? null;

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AssetStatus | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  const debouncedQ = useDebouncedValue(q, 300);

  const categories = useAssetCategories(orgId);
  const locations = useLocations(orgId);
  const assets = useAssets(orgId, {
    page,
    limit: 20,
    ...(debouncedQ.trim() ? { q: debouncedQ.trim() } : {}),
    ...(status ? { status } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(locationId ? { locationId } : {}),
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status, categoryId, locationId]);

  const canCreate = Boolean(role && hasPermission(role, PERMISSIONS.ASSETS_CREATE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Assets</h1>
          <p className="mt-1 text-sm text-muted-fg">
            Track equipment, assignments and locations across your organisation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/app/assets/categories"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Categories
          </Link>
          <Link
            to="/app/assets/locations"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Locations
          </Link>
          {canCreate ? (
            <Link
              to="/app/assets/new"
              data-testid="new-asset"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
            >
              New asset
            </Link>
          ) : null}
        </div>
      </div>

      <section className="rounded-lg border border-border bg-surface p-6">
        <AssetFilters
          q={q}
          onQ={setQ}
          status={status}
          onStatus={setStatus}
          categoryId={categoryId}
          onCategoryId={setCategoryId}
          locationId={locationId}
          onLocationId={setLocationId}
          categories={categories.data ?? []}
          locations={locations.data ?? []}
        />

        <div className="mt-5">
          {assets.isPending ? (
            <p className="py-6 text-center text-sm text-muted-fg">Loading assets…</p>
          ) : assets.isError ? (
            <div
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger"
            >
              {errorMessage(assets.error, 'Could not load assets.')}
            </div>
          ) : (
            <>
              <AssetTable data={assets.data} />
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-xs text-muted-fg">
                  {assets.data.total} asset{assets.data.total === 1 ? '' : 's'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || assets.isFetching}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-muted-fg">
                    Page {assets.data.page} of {assets.data.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= assets.data.totalPages || assets.isFetching}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function AssetsPage() {
  return (
    <RequirePermission permission="assets.view">
      <AssetsContent />
    </RequirePermission>
  );
}
