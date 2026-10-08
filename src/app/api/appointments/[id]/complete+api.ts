/**
 * POST /api/appointments/[id]/complete — caller marks their own appointment
 * done. This is the one flow that records a real donation: it flips the
 * appointment to `completed`, inserts a `donations` row (feeding impact stats
 * and history), and advances the profile's `lastDonationDate` so the eligibility
 * countdown and the "eligible again" reminder run on real data, not seed data.
 *
 * All of that now lives in `completeAppointment` in
 * src/lib/server/appointments.ts, shared with the admin route so a visit
 * completed by staff and the same visit completed by the donor produce the same
 * donation record and the same countdown. This route owns only the ownership
 * question.
 */
import { completeAppointment, loadAppointment } from '@/lib/server/appointments';
import { forbidden, handle, json } from '@/lib/server/http';
import { toAppointment } from '@/lib/server/serialize';
import { requireSession } from '@/lib/server/session';

export const POST = handle(async (request, { id }) => {
  const { user } = await requireSession(request);

  const { apt, center } = await loadAppointment(id);
  if (apt.userId !== user.id) throw forbidden('Not your appointment');

  const row = await completeAppointment(apt, center);
  return json(toAppointment(row, center));
});
