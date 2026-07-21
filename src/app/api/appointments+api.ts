/**
 * /api/appointments — the caller's donation appointments.
 *   GET  → the caller's appointments, joined to their center.
 *   POST → book an appointment { centerId, date, type }.
 */
import { and, desc, eq, gte, inArray } from 'drizzle-orm';

import { appointments, donationCenters, donations, profiles } from '@/db/schema';
import { computeEligibility, effectiveLastDonation, PH_DONATION_INTERVAL_DAYS } from '@/lib/blood';
import { DONATION_TYPES, isDonationType } from '@/lib/booking';
import { db } from '@/lib/server/db';
import { badRequest, conflict, handle, json, notFound, readJson } from '@/lib/server/http';
import { toAppointment } from '@/lib/server/serialize';
import { requireSession } from '@/lib/server/session';
import type { CreateAppointmentBody } from '@/types/api';

/**
 * Slack applied to the recovery-window check. The donor's calendar day is not
 * the server's, and the interval is counted in days, so a booking on the
 * donor-local eligible day can land a few hours before the stored instant.
 * The UI is the precise gate; this is the backstop against non-UI callers.
 */
const RECOVERY_SLACK_MS = 86_400_000;

export const GET = handle(async (request) => {
  const { user } = await requireSession(request);
  const rows = await db
    .select({ apt: appointments, center: donationCenters })
    .from(appointments)
    .innerJoin(donationCenters, eq(appointments.centerId, donationCenters.id))
    .where(eq(appointments.userId, user.id))
    .orderBy(desc(appointments.date));
  return json(rows.map((x) => toAppointment(x.apt, x.center)));
});

export const POST = handle(async (request) => {
  const { user } = await requireSession(request);
  const body = await readJson<CreateAppointmentBody>(request);

  if (!body.centerId) throw badRequest('centerId is required');
  if (!body.date) throw badRequest('date is required');

  const when = new Date(body.date);
  if (Number.isNaN(when.getTime())) throw badRequest('date must be a valid ISO datetime');

  const type = body.type ?? 'whole';
  if (!isDonationType(type)) throw badRequest(`type must be one of ${DONATION_TYPES.join(', ')}`);

  const now = new Date();
  if (when.getTime() <= now.getTime()) throw badRequest('Appointments cannot be booked in the past');

  const [center] = await db
    .select()
    .from(donationCenters)
    .where(eq(donationCenters.id, body.centerId));
  if (!center) throw notFound('Center not found');

  // A donor may hold one upcoming appointment at a time — see upcomingAppointment().
  const [clash] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.userId, user.id),
        inArray(appointments.status, ['confirmed', 'pending']),
        gte(appointments.date, now),
      ),
    )
    .limit(1);
  if (clash) {
    throw conflict('You already have an upcoming appointment. Cancel it before booking another.');
  }

  const [profile] = await db
    .select({ lastDonationDate: profiles.lastDonationDate })
    .from(profiles)
    .where(eq(profiles.userId, user.id));
  const [latestDonation] = await db
    .select({ date: donations.date })
    .from(donations)
    .where(eq(donations.userId, user.id))
    .orderBy(desc(donations.date))
    .limit(1);

  const lastDonationISO = effectiveLastDonation(
    { lastDonationDate: profile?.lastDonationDate?.toISOString() },
    latestDonation ? [{ date: latestDonation.date.toISOString() }] : [],
  );
  if (lastDonationISO) {
    const { nextEligibleDate } = computeEligibility(lastDonationISO, now);
    if (when.getTime() < nextEligibleDate.getTime() - RECOVERY_SLACK_MS) {
      throw conflict(
        `That date falls inside your ${PH_DONATION_INTERVAL_DAYS}-day recovery window after your last donation.`,
      );
    }
  }

  const [apt] = await db
    .insert(appointments)
    .values({ userId: user.id, centerId: body.centerId, date: when, type })
    .returning();

  return json(toAppointment(apt, center), 201);
});
