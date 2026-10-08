/**
 * Request-moderation queries. Deliberately *not* re-exported from the
 * `src/hooks/api` barrel: donor screens import that barrel, and exporting admin
 * hooks there would pull the console into the native bundle.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toSearchParams } from '@/hooks/api/admin/query-params';
import { qk } from '@/hooks/api/keys';
import { api } from '@/lib/api';
import type {
  AdminRequest,
  AdminRequestDetail,
  AdminRequestFilters,
  AdminRequestListResponse,
  ModerateRequestBody,
} from '@/types/api';

export function useAdminRequests(filters: AdminRequestFilters = {}) {
  return useQuery({
    queryKey: qk.admin.requests(filters),
    queryFn: () =>
      api.get<AdminRequestListResponse>(`/api/admin/requests${toSearchParams(filters)}`),
    // Moderation decisions are made against what is on screen, so a stale page
    // is worse than a refetch.
    staleTime: 0,
  });
}

export function useAdminRequest(id: string) {
  return useQuery({
    queryKey: qk.admin.request(id),
    queryFn: () => api.get<AdminRequestDetail>(`/api/admin/requests/${id}`),
    enabled: !!id,
  });
}

/**
 * No optimistic update: a moderation action's real outcome — including a 409 for
 * a transition that no longer makes sense — must be read back from the server
 * rather than assumed. Invalidating on settle covers both the success and the
 * conflict case.
 */
export function useModerateRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ModerateRequestBody) =>
      api.post<AdminRequest>(`/api/admin/requests/${id}/moderate`, body),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.admin.request(id) });
      // Every filtered list is affected: a status change can move a row in or
      // out of any of them.
      qc.invalidateQueries({ queryKey: ['admin', 'requests'] });
    },
  });
}
