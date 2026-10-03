import type { SessionPublic } from '@assetflow/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet } from '../../lib/api';

export function useSessions(enabled: boolean) {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: ({ signal }) => apiGet<SessionPublic[]>('/auth/sessions', signal),
    enabled,
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiDelete<null>(`/auth/sessions/${sessionId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
