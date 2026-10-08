/**
 * Announcement and article queries and mutations.
 *
 * Every mutation invalidates the matching **donor-facing** key as well as the
 * admin one: content written here is published immediately, and the point of
 * these routes existing is that the home feed and Learn tab pick it up without
 * a seed run or a reload.
 *
 * Deliberately *not* re-exported from the `src/hooks/api` barrel: donor screens
 * import that barrel, and exporting admin hooks there would pull the console
 * into the native bundle.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/hooks/api/keys';
import { api, type ApiClientError } from '@/lib/api';
import type {
  AdminAnnouncement,
  AdminArticle,
  CreateAnnouncementBody,
  CreateArticleBody,
  UpdateAnnouncementBody,
  UpdateArticleBody,
} from '@/types/api';

// --- Announcements ---------------------------------------------------------

export function useAdminAnnouncements() {
  return useQuery({
    queryKey: qk.admin.announcements,
    queryFn: () => api.get<AdminAnnouncement[]>('/api/admin/announcements'),
    staleTime: 0,
  });
}

function useInvalidateAnnouncements() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.admin.announcements });
    // The donor home feed reads this table directly.
    qc.invalidateQueries({ queryKey: qk.announcements });
  };
}

export function useCreateAnnouncement() {
  const invalidate = useInvalidateAnnouncements();
  return useMutation<AdminAnnouncement, ApiClientError, CreateAnnouncementBody>({
    mutationFn: (body) => api.post<AdminAnnouncement>('/api/admin/announcements', body),
    onSettled: invalidate,
  });
}

export function useUpdateAnnouncement(id: string) {
  const invalidate = useInvalidateAnnouncements();
  return useMutation<AdminAnnouncement, ApiClientError, UpdateAnnouncementBody>({
    mutationFn: (body) => api.patch<AdminAnnouncement>(`/api/admin/announcements/${id}`, body),
    onSettled: invalidate,
  });
}

/** No optimistic removal: a failed delete must not briefly blank the feed. */
export function useDeleteAnnouncement() {
  const invalidate = useInvalidateAnnouncements();
  return useMutation<void, ApiClientError, string>({
    mutationFn: (id) => api.delete<void>(`/api/admin/announcements/${id}`),
    onSettled: invalidate,
  });
}

// --- Articles --------------------------------------------------------------

export function useAdminArticles() {
  return useQuery({
    queryKey: qk.admin.articles,
    queryFn: () => api.get<AdminArticle[]>('/api/admin/articles'),
    staleTime: 0,
  });
}

function useInvalidateArticles() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.admin.articles });
    // The donor Learn tab, and the article detail screen that selects from it.
    qc.invalidateQueries({ queryKey: qk.articles });
  };
}

export function useCreateArticle() {
  const invalidate = useInvalidateArticles();
  return useMutation<AdminArticle, ApiClientError, CreateArticleBody>({
    mutationFn: (body) => api.post<AdminArticle>('/api/admin/articles', body),
    onSettled: invalidate,
  });
}

export function useUpdateArticle(id: string) {
  const invalidate = useInvalidateArticles();
  return useMutation<AdminArticle, ApiClientError, UpdateArticleBody>({
    mutationFn: (body) => api.patch<AdminArticle>(`/api/admin/articles/${id}`, body),
    onSettled: invalidate,
  });
}

export function useDeleteArticle() {
  const invalidate = useInvalidateArticles();
  return useMutation<void, ApiClientError, string>({
    mutationFn: (id) => api.delete<void>(`/api/admin/articles/${id}`),
    onSettled: invalidate,
  });
}
