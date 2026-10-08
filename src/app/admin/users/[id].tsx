/**
 * /admin/users/[id] — thin route. All console UI, and the staff access gate, live in
 * src/components/admin outside src/app, so the platform split there keeps them
 * out of the native bundle.
 */
import { AdminUserDetailScreen } from '@/components/admin/user-detail';

export default function AdminUserDetailRoute() {
  return <AdminUserDetailScreen />;
}
