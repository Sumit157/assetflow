import type {
  AssetCategoryPublic,
  AssetCondition,
  AssetHistory,
  AssetListQuery,
  AssetPublic,
  AssetSortField,
  AssetStatus,
  LocationPublic,
  Paginated,
} from '@assetflow/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';

export type AssetListParams = Partial<
  Pick<
    AssetListQuery,
    | 'page'
    | 'limit'
    | 'q'
    | 'status'
    | 'categoryId'
    | 'locationId'
    | 'assignedTo'
    | 'sortBy'
    | 'sortDir'
  >
>;

export interface AssetFormInput {
  name: string;
  assetTag: string;
  description: string | null;
  categoryId: string | null;
  locationId: string | null;
  serialNumber: string | null;
  condition: AssetCondition;
}

export interface AssignInput {
  assignedToUserId: string;
  notes: string | null;
}

export interface ReturnInput {
  condition: AssetCondition | null;
  notes: string | null;
}

export interface TransferInput {
  toUserId: string;
  notes: string | null;
}

export interface RetireInput {
  reason: string | null;
}

export interface CategoryFormInput {
  name: string;
  description: string | null;
}

export interface LocationFormInput {
  name: string;
  code: string | null;
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export function useAssets(orgId: string | null, params: AssetListParams) {
  return useQuery({
    queryKey: ['assets', orgId, params],
    queryFn: ({ signal }) =>
      apiGet<Paginated<AssetPublic>>(`/assets${queryString(params)}`, signal),
    enabled: Boolean(orgId),
  });
}

export function useAsset(orgId: string | null, assetId: string | null) {
  return useQuery({
    queryKey: ['asset', orgId, assetId],
    queryFn: ({ signal }) => apiGet<AssetPublic>(`/assets/${assetId}`, signal),
    enabled: Boolean(orgId && assetId),
  });
}

export function useAssetHistory(orgId: string | null, assetId: string | null) {
  return useQuery({
    queryKey: ['asset-history', orgId, assetId],
    queryFn: ({ signal }) => apiGet<AssetHistory>(`/assets/${assetId}/history`, signal),
    enabled: Boolean(orgId && assetId),
  });
}

function useInvalidateAssetData(orgId: string | null, assetId?: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['assets', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['asset', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['asset-history', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['asset-categories', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['locations', orgId] });
    if (assetId) {
      void queryClient.invalidateQueries({ queryKey: ['asset', orgId, assetId] });
      void queryClient.invalidateQueries({ queryKey: ['asset-history', orgId, assetId] });
    }
  };
}

export function useCreateAsset(orgId: string | null) {
  const invalidate = useInvalidateAssetData(orgId);
  return useMutation({
    mutationFn: (input: AssetFormInput) => apiPost<AssetPublic>('/assets', input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAsset(orgId: string | null, assetId: string | null) {
  const invalidate = useInvalidateAssetData(orgId, assetId ?? undefined);
  return useMutation({
    mutationFn: (input: Partial<AssetFormInput>) =>
      apiPatch<AssetPublic>(`/assets/${assetId}`, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteAsset(orgId: string | null, assetId: string | null) {
  const invalidate = useInvalidateAssetData(orgId, assetId ?? undefined);
  return useMutation({
    mutationFn: () => apiDelete<null>(`/assets/${assetId}`),
    onSuccess: () => invalidate(),
  });
}

export function useAssignAsset(orgId: string | null, assetId: string | null) {
  const invalidate = useInvalidateAssetData(orgId, assetId ?? undefined);
  return useMutation({
    mutationFn: (input: AssignInput) => apiPost<AssetPublic>(`/assets/${assetId}/assign`, input),
    onSuccess: () => invalidate(),
  });
}

export function useReturnAsset(orgId: string | null, assetId: string | null) {
  const invalidate = useInvalidateAssetData(orgId, assetId ?? undefined);
  return useMutation({
    mutationFn: (input: ReturnInput) =>
      apiPost<AssetPublic>(`/assets/${assetId}/return`, {
        ...(input.condition ? { condition: input.condition } : {}),
        notes: input.notes,
      }),
    onSuccess: () => invalidate(),
  });
}

export function useTransferAsset(orgId: string | null, assetId: string | null) {
  const invalidate = useInvalidateAssetData(orgId, assetId ?? undefined);
  return useMutation({
    mutationFn: (input: TransferInput) =>
      apiPost<AssetPublic>(`/assets/${assetId}/transfer`, input),
    onSuccess: () => invalidate(),
  });
}

export function useRetireAsset(orgId: string | null, assetId: string | null) {
  const invalidate = useInvalidateAssetData(orgId, assetId ?? undefined);
  return useMutation({
    mutationFn: (input: RetireInput) => apiPost<AssetPublic>(`/assets/${assetId}/retire`, input),
    onSuccess: () => invalidate(),
  });
}

export function useAssetCategories(orgId: string | null) {
  return useQuery({
    queryKey: ['asset-categories', orgId],
    queryFn: ({ signal }) => apiGet<AssetCategoryPublic[]>('/asset-categories', signal),
    enabled: Boolean(orgId),
  });
}

export function useCreateAssetCategory(orgId: string | null) {
  const invalidate = useInvalidateAssetData(orgId);
  return useMutation({
    mutationFn: (input: CategoryFormInput) =>
      apiPost<AssetCategoryPublic>('/asset-categories', input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAssetCategory(orgId: string | null, categoryId: string | null) {
  const invalidate = useInvalidateAssetData(orgId);
  return useMutation({
    mutationFn: (input: Partial<CategoryFormInput>) =>
      apiPatch<AssetCategoryPublic>(`/asset-categories/${categoryId}`, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteAssetCategory(orgId: string | null, categoryId: string | null) {
  const invalidate = useInvalidateAssetData(orgId);
  return useMutation({
    mutationFn: () => apiDelete<null>(`/asset-categories/${categoryId}`),
    onSuccess: () => invalidate(),
  });
}

export function useLocations(orgId: string | null) {
  return useQuery({
    queryKey: ['locations', orgId],
    queryFn: ({ signal }) => apiGet<LocationPublic[]>('/locations', signal),
    enabled: Boolean(orgId),
  });
}

export function useCreateLocation(orgId: string | null) {
  const invalidate = useInvalidateAssetData(orgId);
  return useMutation({
    mutationFn: (input: LocationFormInput) => apiPost<LocationPublic>('/locations', input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateLocation(orgId: string | null, locationId: string | null) {
  const invalidate = useInvalidateAssetData(orgId);
  return useMutation({
    mutationFn: (input: Partial<LocationFormInput>) =>
      apiPatch<LocationPublic>(`/locations/${locationId}`, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteLocation(orgId: string | null, locationId: string | null) {
  const invalidate = useInvalidateAssetData(orgId);
  return useMutation({
    mutationFn: () => apiDelete<null>(`/locations/${locationId}`),
    onSuccess: () => invalidate(),
  });
}

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  available: 'Available',
  assigned: 'Assigned',
  retired: 'Retired',
};

export const ASSET_CONDITION_LABELS: Record<AssetCondition, string> = {
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

export const ASSET_SORT_FIELDS: AssetSortField[] = ['createdAt', 'name', 'assetTag'];
