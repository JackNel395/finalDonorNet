/**
 * Console gate query. Deliberately *not* re-exported from `src/hooks/api`:
 * that barrel is imported by donor screens, and exporting admin hooks there
 * would pull the console into the native bundle. Admin components import from
 * this path directly.
 */
import { useQuery } from '@tanstack/react-query';

import { qk } from '@/hooks/api/keys';
import { api, ApiClientError } from '@/lib/api';
import type { AdminMeResponse } from '@/types/api';

/**
 * Resolves whether the signed-in user may use the console. A 403 is a real,
 * terminal state ("signed in, not staff"), not a transient failure, so it is
 * never retried — same reasoning as `useProfile`'s treatment of 404. A 401 is
 * equally terminal: the root gate handles the no-session case.
 */
export function useAdminMe(enabled = true) {
  return useQuery({
    queryKey: qk.admin.me,
    queryFn: () => api.get<AdminMeResponse>('/api/admin/me'),
    enabled,
    retry: (count, err) =>
      !(err instanceof ApiClientError && (err.status === 403 || err.status === 401)) && count < 1,
  });
}
