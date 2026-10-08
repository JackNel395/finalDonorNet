/**
 * Donation-center queries and mutations — the first write path this table has
 * ever had from inside the product.
 *
 * Deliberately *not* re-exported from the `src/hooks/api` barrel: donor screens
 * import that barrel, and exporting admin hooks there would pull the console
 * into the native bundle.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/hooks/api/keys';
import { api, type ApiClientError } from '@/lib/api';
import type { AdminCenter, CreateCenterBody, UpdateCenterBody } from '@/types/api';

export function useAdminCenters() {
  return useQuery({
    queryKey: qk.admin.centers,
    queryFn: () => api.get<AdminCenter[]>('/api/admin/centers'),
    staleTime: 0,
  });
}

/**
 * Every center mutation invalidates the donor-facing `centers` key as well as
 * the admin one. A new or edited center has to show up in the donor app's
 * center list and in the booking picker without a reload — that is the whole
 * point of these routes existing.
 */
function useInvalidateCenters() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.admin.centers });
    qc.invalidateQueries({ queryKey: qk.centers });
  };
}

export function useCreateCenter() {
  const invalidate = useInvalidateCenters();
  return useMutation<AdminCenter, ApiClientError, CreateCenterBody>({
    mutationFn: (body) => api.post<AdminCenter>('/api/admin/centers', body),
    onSettled: invalidate,
  });
}

export function useUpdateCenter(id: string) {
  const invalidate = useInvalidateCenters();
  return useMutation<AdminCenter, ApiClientError, UpdateCenterBody>({
    mutationFn: (body) => api.patch<AdminCenter>(`/api/admin/centers/${id}`, body),
    onSettled: invalidate,
  });
}

/**
 * Deleting a center. The server refuses with 409 when future appointments
 * reference it, so there is no optimistic removal: a row must not disappear
 * from the table and then come back when the server says no.
 */
export function useDeleteCenter() {
  const invalidate = useInvalidateCenters();
  const qc = useQueryClient();
  return useMutation<void, ApiClientError, string>({
    mutationFn: (id) => api.delete<void>(`/api/admin/centers/${id}`),
    onSettled: () => {
      invalidate();
      // A deleted center cascades to its past appointments, so the admin
      // appointment lists are stale too.
      qc.invalidateQueries({ queryKey: ['admin', 'appointments'] });
    },
  });
}
