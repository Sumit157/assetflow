import { useQuery } from '@tanstack/react-query';
import type { HealthLive, HealthReady } from '@assetflow/types';
import { apiGet } from '../../lib/api';

export function useHealthLive() {
  return useQuery({
    queryKey: ['health', 'live'],
    queryFn: ({ signal }) => apiGet<HealthLive>('/health/live', signal),
    refetchInterval: 30_000,
  });
}

export function useHealthReady() {
  return useQuery({
    queryKey: ['health', 'ready'],
    queryFn: ({ signal }) => apiGet<HealthReady>('/health/ready', signal),
    refetchInterval: 30_000,
  });
}
