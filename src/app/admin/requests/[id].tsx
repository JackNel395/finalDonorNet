/**
 * /admin/requests/[id] — thin route. Detail is a route rather than a modal, per
 * design-system/PATTERNS.md.
 */
import { AdminRequestDetailScreen } from '@/components/admin/request-detail';

export default function AdminRequestDetailRoute() {
  return <AdminRequestDetailScreen />;
}
