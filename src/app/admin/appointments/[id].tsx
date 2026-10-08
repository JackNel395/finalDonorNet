/**
 * /admin/appointments/[id] — thin route. Detail is a route rather than a modal,
 * per design-system/PATTERNS.md.
 */
import { AdminAppointmentDetailScreen } from '@/components/admin/appointment-detail';

export default function AdminAppointmentDetailRoute() {
  return <AdminAppointmentDetailScreen />;
}
