/**
 * /admin/broadcast — thin route. All console UI, and the staff access gate, live in
 * src/components/admin outside src/app, so the platform split there keeps them
 * out of the native bundle.
 */
import { AdminBroadcast } from '@/components/admin/broadcast';

export default function AdminBroadcastScreen() {
  return <AdminBroadcast />;
}
