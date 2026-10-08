/**
 * Movement behind the overview tiles. Like every hook in this directory it is
 * not re-exported from `src/hooks/api` — that barrel reaches donor screens, and
 * an export here would pull the console into the native bundle.
 *
 * Longer `staleTime` than the counts beside it on purpose: a weekly bucket does
 * not change between two glances at a dashboard, and refetching it on every
 * window focus would cost four grouped aggregates for a line that looks the
 * same.
 */
import { useQuery } from '@tanstack/react-query';

import { qk } from '@/hooks/api/keys';
import { api } from '@/lib/api';
import type { AdminTrendsResponse } from '@/types/api';

const FIVE_MINUTES = 5 * 60 * 1000;

export function useAdminTrends() {
  return useQuery({
    queryKey: qk.admin.trends,
    queryFn: () => api.get<AdminTrendsResponse>('/api/admin/overview/trends'),
    staleTime: FIVE_MINUTES,
  });
}
