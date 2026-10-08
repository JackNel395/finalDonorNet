/**
 * Appointment state transitions, shared by the donor-facing routes
 * (`/api/appointments/[id]/cancel`, `/complete`) and the admin route
 * (`/api/admin/appointments/[id]`).
 *
 * Extracted rather than duplicated: completing an appointment is the one flow
 * that records a real donation and advances the eligibility countdown, and if
 * staff completing a visit produced a different end state from the donor
 * completing the same visit, the countdown and the impact stats would quietly
 * disagree about what happened. One implementation is the only way the two
 * callers cannot drift.
 *
 * The guards throw the same `conflict`/`notFound` envelopes both callers
 * already return, so neither owns an error path of its own. Ownership is *not*
 * checked here — the donor routes check `userId`, the admin route checks
 * `requireAdmin`, and those are different questions.
 *
 * neon-http has no interactive transactions, so the writes go through
 * `db.batch` — they commit together or not at all, including the caller's audit
 * row when one is passed.
 *
 * Server-only.
 */
import type { BatchItem } from 'drizzle-orm/batch';
import { eq } from 'drizzle-orm';

import {
  appointments,
  donationCenters,
  donations,
  profiles,
  user as authUser,
} from '@/db/schema';
import { db } from './db';
import { conflict, notFound } from './http';

type AppointmentRow = typeof appointments.$inferSelect;
type CenterRow = typeof donationCenters.$inferSelect;

/** An extra statement to commit alongside the transition — in practice, an audit insert. */
type ExtraWrite = BatchItem<'pg'>;

/** The appointment with its center, or a 404. */
export async function loadAppointment(id: string): Promise<{ apt: AppointmentRow; center: CenterRow }> {
  const [row] = await db
    .select({ apt: appointments, center: donationCenters })
    .from(appointments)
    .innerJoin(donationCenters, eq(appointments.centerId, donationCenters.id))
    .where(eq(appointments.id, id))
    .limit(1);
  if (!row) throw notFound('Appointment not found');
  return row;
}

/**
 * The appointment, its center, and its donor. The admin route needs the donor
 * named; the donor routes already know whose appointment it is.
 */
export async function loadAppointmentWithDonor(id: string) {
  const [row] = await db
    .select({
      apt: appointments,
      center: donationCenters,
      donorId: authUser.id,
      donorName: authUser.name,
      donorEmail: authUser.email,
      donorPhone: profiles.phone,
      donorBloodType: profiles.bloodType,
      donorAvatarColor: profiles.avatarColor,
    })
    .from(appointments)
    .innerJoin(donationCenters, eq(appointments.centerId, donationCenters.id))
    .innerJoin(authUser, eq(appointments.userId, authUser.id))
    .leftJoin(profiles, eq(profiles.userId, appointments.userId))
    .where(eq(appointments.id, id))
    .limit(1);
  if (!row) throw notFound('Appointment not found');
  return row;
}

/**
 * Cancel an appointment. Cancelling an already-cancelled booking is a conflict
 * rather than a silent success, so a double-submit is visible; a completed
 * visit cannot be un-happened.
 */
export async function cancelAppointment(
  apt: AppointmentRow,
  extra?: ExtraWrite,
): Promise<AppointmentRow> {
  if (apt.status === 'cancelled') throw conflict('Appointment already cancelled');
  if (apt.status === 'completed') throw conflict('A completed appointment cannot be cancelled');

  const update = db
    .update(appointments)
    .set({ status: 'cancelled' })
    .where(eq(appointments.id, apt.id))
    .returning();

  if (!extra) {
    const [row] = await update;
    return row;
  }
  const [[row]] = await db.batch([update, extra]);
  return row;
}

/**
 * Complete an appointment: flip it to `completed`, record a `donations` row
 * (feeding impact stats and history), and advance the profile's
 * `lastDonationDate` so the eligibility countdown and the "eligible again"
 * reminder run on real data.
 *
 * The countdown never moves backward: if a newer donation already exists, it
 * stands, and only the appointment and the donation row are written.
 */
export async function completeAppointment(
  apt: AppointmentRow,
  center: CenterRow,
  extra?: ExtraWrite,
): Promise<AppointmentRow> {
  // Idempotency guard: completing twice would create duplicate donation rows.
  if (apt.status === 'completed') throw conflict('Appointment already completed');
  if (apt.status === 'cancelled') throw conflict('A cancelled appointment cannot be completed');

  const [profile] = await db
    .select({ lastDonationDate: profiles.lastDonationDate })
    .from(profiles)
    .where(eq(profiles.userId, apt.userId));
  const advancesCountdown = !profile?.lastDonationDate || apt.date > profile.lastDonationDate;

  const writes: [ExtraWrite, ...ExtraWrite[]] = [
    db.update(appointments).set({ status: 'completed' }).where(eq(appointments.id, apt.id)).returning(),
    db.insert(donations).values({
      userId: apt.userId,
      date: apt.date,
      centerName: center.name,
      city: center.city,
      units: 1, // a whole-blood visit yields one unit; the model tracks units, not sessions
      type: apt.type,
    }),
  ];
  // A donor with no profile row has no countdown to advance.
  if (advancesCountdown && profile) {
    writes.push(
      db
        .update(profiles)
        .set({ lastDonationDate: apt.date, updatedAt: new Date() })
        .where(eq(profiles.userId, apt.userId)),
    );
  }
  if (extra) writes.push(extra);

  // The batch is assembled conditionally, so its result is a homogeneous array
  // rather than a tuple drizzle can map positionally. The first statement is
  // the `returning()` update above, which is the one result we read.
  const results = await db.batch(writes);
  return (results[0] as AppointmentRow[])[0];
}
