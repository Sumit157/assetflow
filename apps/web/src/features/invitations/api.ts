import type { InvitationPublic, MembershipRole } from '@assetflow/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '../../lib/api';

export function useInvitations(orgId: string | null) {
  return useQuery({
    queryKey: ['invitations', orgId],
    queryFn: ({ signal }) =>
      apiGet<InvitationPublic[]>(`/organisations/${orgId}/invitations`, signal),
    enabled: Boolean(orgId),
  });
}

export function useCreateInvitation(orgId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: MembershipRole }) =>
      apiPost<InvitationPublic>(`/organisations/${orgId}/invitations`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invitations', orgId] });
    },
  });
}

export function useRevokeInvitation(orgId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiDelete<null>(`/organisations/${orgId}/invitations/${invitationId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invitations', orgId] });
    },
  });
}
