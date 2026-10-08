/**
 * Donor-account queries and mutations. Deliberately *not* re-exported from the
 * `src/hooks/api` barrel: donor screens import that barrel, and exporting admin
 * hooks there would pull the console into the native bundle.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/hooks/api/keys';
import { api, type ApiClientError } from '@/lib/api';
import { toSearchParams } from '@/hooks/api/admin/query-params';
import type {
  AdminDonor,
  AdminDonorDetail,
  AdminDonorFilters,
  AdminDonorListResponse,
  DonorStatusBody,
  UpdateDonorBody,
} from '@/types/api';

export function useAdminUsers(
  filters: AdminDonorFilters = {},
  /**
   * False holds the request. For a picker that should not fetch the whole
   * account list before the operator has typed anything to narrow it by —
   * a hook cannot be called conditionally, so the condition lives here.
   */
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: qk.admin.users(filters),
    queryFn: () => api.get<AdminDonorListResponse>(`/api/admin/users${toSearchParams(filters)}`),
    enabled: options.enabled ?? true,
    // Account decisions are made against what is on screen, so a stale page is
    // worse than a refetch.
    staleTime: 0,
  });
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: qk.admin.user(id),
    queryFn: () => api.get<AdminDonorDetail>(`/api/admin/users/${id}`),
    enabled: !!id,
  });
}

/** Invalidate this account and every filtered list it could appear in. */
function useInvalidateUser(id: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.admin.user(id) });
    qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  };
}

/**
 * Correcting the last-donation date. No optimistic update: this value drives
 * the donor's eligibility countdown, so the stored result is read back rather
 * than assumed — a rejected future date must not briefly appear accepted.
 */
export function useUpdateDonor(id: string) {
  const invalidate = useInvalidateUser(id);
  return useMutation<AdminDonor, ApiClientError, UpdateDonorBody>({
    mutationFn: (body) => api.patch<AdminDonor>(`/api/admin/users/${id}`, body),
    onSettled: invalidate,
  });
}

/**
 * Suspend, reactivate, or delete. `delete` returns 204, so the mutation's data
 * is undefined on that branch — callers navigate away rather than re-render a
 * record that no longer exists.
 */
export function useDonorStatus(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateUser(id);
  return useMutation<AdminDonor | undefined, ApiClientError, DonorStatusBody>({
    mutationFn: (body) => api.post<AdminDonor | undefined>(`/api/admin/users/${id}/status`, body),
    onSettled: (_data, _err, variables) => {
      if (variables.action === 'delete') {
        // The account is gone; drop its detail entry instead of refetching a 404.
        qc.removeQueries({ queryKey: qk.admin.user(id) });
        qc.invalidateQueries({ queryKey: ['admin', 'users'] });
        return;
      }
      invalidate();
    },
  });
}
