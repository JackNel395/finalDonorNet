/**
 * POST /api/appointments/[id]/cancel — caller cancels their own appointment.
 *
 * The transition itself lives in src/lib/server/appointments.ts, shared with the
 * admin route so staff cancelling a booking and a donor cancelling the same
 * booking cannot produce different end states. This route owns only the
 * ownership question.
 */
import { cancelAppointment, loadAppointment } from '@/lib/server/appointments';
import { forbidden, handle, json } from '@/lib/server/http';
import { toAppointment } from '@/lib/server/serialize';
import { requireSession } from '@/lib/server/session';

export const POST = handle(async (request, { id }) => {
  const { user } = await requireSession(request);

  const { apt, center } = await loadAppointment(id);
  if (apt.userId !== user.id) throw forbidden('Not your appointment');

  const row = await cancelAppointment(apt);
  return json(toAppointment(row, center));
});
