/**
 * /api/admin/appointments/[id]
 *   GET  → one booking, with its center and its donor named.
 *   POST → staff cancel or complete it.
 *
 * Both transitions come from src/lib/server/appointments.ts, the same functions
 * the donor-facing routes call. That is the whole point: completing a visit from
 * here records the `donations` row and advances the donor's `lastDonationDate`
 * exactly as the donor's own tap would, so the eligibility countdown and the
 * impact stats cannot disagree about what happened depending on who pressed the
 * button.
 *
 * One route rather than two, so the audit write cannot be omitted — and because
 * the transitions accept an extra statement, the audit row commits in the same
 * `db.batch` as the mutation.
 */
import { logAdminAction } from '@/lib/server/audit';
import {
  cancelAppointment,
  completeAppointment,
  loadAppointmentWithDonor,
} from '@/lib/server/appointments';
import { badRequest, handle, json, readJson } from '@/lib/server/http';
import { toAdminAppointment } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { AppointmentActionBody, AppointmentAdminAction } from '@/types/api';

const ACTIONS: AppointmentAdminAction[] = ['cancel', 'complete'];

const MAX_REASON = 500;

/**
 * The detail route reads one booking rather than hunting it out of a filtered
 * page: a link to an appointment has to work on its own, including after the
 * list's filters have moved on from it.
 */
export const GET = handle(async (request, { id }) => {
  await requireAdmin(request);
  const row = await loadAppointmentWithDonor(id);
  return json(
    toAdminAppointment(row.apt, row.center, {
      id: row.donorId,
      name: row.donorName,
      email: row.donorEmail,
      phone: row.donorPhone,
      bloodType: row.donorBloodType,
      avatarColor: row.donorAvatarColor,
    }),
  );
});

export const POST = handle(async (request, { id }) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<AppointmentActionBody>(request);

  if (!body.action || !ACTIONS.includes(body.action)) {
    throw badRequest(`action must be one of: ${ACTIONS.join(', ')}`);
  }
  const action = body.action;

  const reason = body.reason?.trim() || undefined;
  if (reason && reason.length > MAX_REASON) {
    throw badRequest(`reason must be ${MAX_REASON} characters or fewer`);
  }

  const row = await loadAppointmentWithDonor(id);
  const { apt, center } = row;

  const audit = logAdminAction({
    actorId: user.id,
    action: `appointment.${action}`,
    targetType: 'appointment',
    targetId: apt.id,
    reason,
    metadata: {
      from: apt.status,
      to: action === 'cancel' ? 'cancelled' : 'completed',
      centerId: center.id,
      centerName: center.name,
      donorId: row.donorId,
      donorEmail: row.donorEmail,
      date: apt.date.toISOString(),
      type: apt.type,
    },
  });

  // The guards live in the shared transitions, so a 409 here says the same
  // thing it says to a donor: this booking is already in that state.
  const updated =
    action === 'cancel'
      ? await cancelAppointment(apt, audit)
      : await completeAppointment(apt, center, audit);

  return json(
    toAdminAppointment(updated, center, {
      id: row.donorId,
      name: row.donorName,
      email: row.donorEmail,
      phone: row.donorPhone,
      bloodType: row.donorBloodType,
      avatarColor: row.donorAvatarColor,
    }),
  );
});
