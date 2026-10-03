import type { MemberPublic, MembershipRole, OrganisationPublic } from '@assetflow/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch } from '../../lib/api';

export function useMembers(orgId: string | null) {
  return useQuery({
    queryKey: ['members', orgId],
    queryFn: ({ signal }) => apiGet<MemberPublic[]>(`/organisations/${orgId}/members`, signal),
    enabled: Boolean(orgId),
  });
}

export function useUpdateMemberRole(orgId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; role: MembershipRole }) =>
      apiPatch<null>(`/organisations/${orgId}/members/${input.userId}`, { role: input.role }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members', orgId] });
    },
  });
}

export function useRemoveMember(orgId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiDelete<null>(`/organisations/${orgId}/members/${userId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['invitations', orgId] });
    },
  });
}

export function useRenameOrganisation(orgId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiPatch<OrganisationPublic>(`/organisations/${orgId}`, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members', orgId] });
    },
  });
}
