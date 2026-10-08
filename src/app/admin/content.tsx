/**
 * /admin/content — thin route. All console UI, and the staff access gate, live in
 * src/components/admin outside src/app, so the platform split there keeps them
 * out of the native bundle.
 */
import { AdminAnnouncements } from '@/components/admin/content-announcements';

export default function AdminContentScreen() {
  return <AdminAnnouncements />;
}
