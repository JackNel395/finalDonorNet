/**
 * /admin/centers — thin route. All console UI, and the staff access gate, live in
 * src/components/admin outside src/app, so the platform split there keeps them
 * out of the native bundle.
 */
import { AdminCentersList } from '@/components/admin/centers-list';

export default function AdminCentersScreen() {
  return <AdminCentersList />;
}
