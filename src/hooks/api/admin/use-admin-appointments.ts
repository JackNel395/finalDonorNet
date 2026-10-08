/**
 * Appointment queries and the staff cancel/complete action.
 *
 * Deliberately *not* re-exported from the `src/hooks/api` barrel: donor screens
 * import that barrel, and exporting admin hooks there would pull the console
 * into the native bundle.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toSearchParams } from '@/hooks/api/admin/query-params';
import { qk } from '@/hooks/api/keys';
import { api, type ApiClientError } from '@/lib/api';
import type {
  AdminAppointment,
  AdminAppointmentFilters,
  AdminAppointmentListResponse,
  AppointmentActionBody,
  CreateAdminAppointmentBody,
} from '@/types/api';

export function useAdminAppointments(filters: AdminAppointmentFilters = {}) {
  return useQuery({
    queryKey: qk.admin.appointments(filters),
    queryFn: () =>
      api.get<AdminAppointmentListResponse>(`/api/admin/appointments${toSearchParams(filters)}`),
    staleTime: 0,
  });
}

/**
 * One booking by id. The detail route reads it directly rather than picking it
 * out of a cached page, so a link to an appointment opens on its own.
 */
export function useAdminAppointment(id: string) {
  return useQuery({
    queryKey: qk.admin.appointment(id),
    queryFn: () => api.get<AdminAppointment>(`/api/admin/appointments/${id}`),
    enabled: !!id,
    staleTime: 0,
  });
}

/**
 * Book on a donor's behalf. The server applies the donor route's own guards, so
 * a 409 here is the real reason the booking cannot stand — an existing upcoming
 * appointment, or the donor's recovery window — and is shown verbatim.
 */
export function useCreateAdminAppointment() {
  const qc = useQueryClient();
  return useMutation<AdminAppointment, ApiClientError, CreateAdminAppointmentBody>({
    mutationFn: (body) => api.post<AdminAppointment>('/api/admin/appointments', body),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'appointments'] });
      // A new booking changes the center's upcoming count, which governs
      // whether it can be deleted.
      qc.invalidateQueries({ queryKey: qk.admin.centers });
    },
  });
}

/**
 * Cancel or complete a booking. No optimistic update: completing records a
 * donation and advances the donor's eligibility countdown, so the real outcome
 * — including a 409 for a transition that no longer applies — is read back from
 * the server rather than assumed.
 */
export function useAppointmentAction(id: string) {
  const qc = useQueryClient();
  return useMutation<AdminAppointment, ApiClientError, AppointmentActionBody>({
    mutationFn: (body) => api.post<AdminAppointment>(`/api/admin/appointments/${id}`, body),
    onSettled: () => {
      // Every filtered list is affected: a status change can move a row in or
      // out of any of them. The same prefix covers the detail query for this
      // booking, which has just changed status.
      qc.invalidateQueries({ queryKey: ['admin', 'appointments'] });
      // Completing writes a donation row and moves the donor's last-donation
      // date, both of which the account detail shows.
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      // The center's upcoming-booking count is what governs whether it can be
      // deleted, so it changes too.
      qc.invalidateQueries({ queryKey: qk.admin.centers });
    },
  });
}
