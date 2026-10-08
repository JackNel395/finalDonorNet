/**
 * /admin/appointments — thin route. All console UI, and the staff access gate, live in
 * src/components/admin outside src/app, so the platform split there keeps them
 * out of the native bundle.
 */
import { AdminAppointmentsList } from '@/components/admin/appointments-list';

export default function AdminAppointmentsScreen() {
  return <AdminAppointmentsList />;
}
