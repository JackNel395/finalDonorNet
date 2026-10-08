import type {
  AdminAppointmentFilters,
  AdminDonorFilters,
  AdminRequestFilters,
} from '@/types/api';

/** Centralized query keys so hooks and invalidations stay in sync. */
export const qk = {
  profile: ['profile'] as const,
  requests: ['requests'] as const,
  request: (id: string) => ['requests', id] as const,
  appointments: ['appointments'] as const,
  donations: ['donations'] as const,
  centers: ['centers'] as const,
  announcements: ['announcements'] as const,
  articles: ['articles'] as const,
  // Device state, not an endpoint: coords live here rather than in the data
  // keys, so GPS jitter can't fragment the cache or break optimistic updates.
  location: ['location'] as const,
  // Notification permission + registration state, same device-state rationale.
  push: ['push'] as const,
  // Donation-preparation reminder preference: device state, not an endpoint —
  // a local notification schedule only ever exists on this install.
  prepReminders: ['prep-reminders'] as const,
  // Operations console (web-only). Grouped so an admin screen never defines an
  // inline key array and the whole console can be invalidated as one subtree.
  admin: {
    me: ['admin', 'me'] as const,
    trends: ['admin', 'overview', 'trends'] as const,
    // Filters are part of the key here, unlike `location` in the donor app:
    // they change the server's result set, so two filter combinations are two
    // different cached results.
    requests: (filters: AdminRequestFilters = {}) => ['admin', 'requests', filters] as const,
    request: (id: string) => ['admin', 'requests', id] as const,
    users: (filters: AdminDonorFilters = {}) => ['admin', 'users', filters] as const,
    user: (id: string) => ['admin', 'users', id] as const,
    // Centers are a single unpaginated list, so unlike the other areas the key
    // takes no filters: the console filters the fetched rows in place.
    centers: ['admin', 'centers'] as const,
    appointments: (filters: AdminAppointmentFilters = {}) =>
      ['admin', 'appointments', filters] as const,
    appointment: (id: string) => ['admin', 'appointments', id] as const,
    // Content is two short unpaginated lists, so neither key takes filters.
    announcements: ['admin', 'announcements'] as const,
    articles: ['admin', 'articles'] as const,
  },
};
