/**
 * /api/admin/appointments
 *   GET  → every booking, filtered and paginated, with its center and its donor named.
 *   POST → book on a donor's behalf { donorId, centerId, date, type }.
 *
 * Donor contact details are included for the same operational reason the
 * responder roster carries them: staff cannot ask about a missed slot or
 * confirm a visit without them. No coordinate is emitted — the center's address
 * is the location that matters here, and it is public.
 *
 * POST exists because a donor who phones the center is still a booking the
 * center has to keep. It applies exactly the same guards as the donor's own
 * `POST /api/appointments` — one upcoming appointment at a time, no past dates,
 * no booking inside the recovery window — because a slot staff created and a
 * slot the donor created are the same row, and a console that could quietly
 * break those rules would make the donor app's eligibility copy a lie.
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, type SQL } from 'drizzle-orm';

import {
  appointments,
  donations,
  donationCenters,
  profiles,
  user as authUser,
} from '@/db/schema';
import { computeEligibility, effectiveLastDonation, PH_DONATION_INTERVAL_DAYS } from '@/lib/blood';
import { DONATION_TYPES, isDonationType } from '@/lib/booking';
import { logAdminAction } from '@/lib/server/audit';
import { db } from '@/lib/server/db';
import {
  badRequest,
  conflict,
  handle,
  json,
  notFound,
  readDate,
  readEnum,
  readInt,
  readJson,
} from '@/lib/server/http';
import { toAdminAppointment } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { AdminAppointmentListResponse, CreateAdminAppointmentBody } from '@/types/api';
import type { Appointment } from '@/types/domain';

const STATUSES: Appointment['status'][] = ['confirmed', 'pending', 'completed', 'cancelled'];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Same slack the donor route applies to the recovery window: the donor's
 * calendar day is not the server's, and the interval is counted in days.
 */
const RECOVERY_SLACK_MS = 86_400_000;

export const GET = handle(async (request) => {
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const status = readEnum<Appointment['status']>(searchParams, 'status', STATUSES);
  const centerId = searchParams.get('centerId')?.trim();
  const q = searchParams.get('q')?.trim();
  const dateFrom = readDate(searchParams, 'dateFrom');
  const dateTo = readDate(searchParams, 'dateTo');
  const limit = readInt(searchParams, 'limit', MAX_LIMIT) ?? DEFAULT_LIMIT;
  const offset = readInt(searchParams, 'offset') ?? 0;

  // An inverted range returns nothing, which looks identical to "no bookings"
  // — a filter staff can't tell apart from an empty result is worse than a 400.
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw badRequest('dateFrom must be on or before dateTo');
  }

  const filters: SQL[] = [];
  if (status) filters.push(eq(appointments.status, status));
  if (centerId) filters.push(eq(appointments.centerId, centerId));
  if (dateFrom) filters.push(gte(appointments.date, dateFrom));
  if (dateTo) filters.push(lte(appointments.date, dateTo));
  if (q) {
    // One box over the three things printed in the row — who, where, and the
    // id staff read back over the phone — so the operator does not have to
    // know which column their scrap of text belongs to.
    const like = `%${q}%`;
    filters.push(
      or(
        ilike(authUser.name, like),
        ilike(authUser.email, like),
        ilike(donationCenters.name, like),
        ilike(donationCenters.city, like),
        ilike(appointments.id, like),
      )!,
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  // The count shares the joins: `q` filters on the joined donor and center, so
  // counting over `appointments` alone would report a total the page contents
  // contradict.
  const scoped = (q
    ? db
        .select({ c: count() })
        .from(appointments)
        .innerJoin(donationCenters, eq(appointments.centerId, donationCenters.id))
        .innerJoin(authUser, eq(appointments.userId, authUser.id))
    : db.select({ c: count() }).from(appointments)
  ).where(where);

  const rows = await db
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
    // Left join: a donor can book before completing a profile, and hiding their
    // appointment would hide a real booking the center is expecting.
    .leftJoin(profiles, eq(profiles.userId, appointments.userId))
    .where(where)
    // Soonest first: the bookings staff act on are the ones about to happen.
    .orderBy(desc(appointments.date), asc(appointments.id))
    .limit(limit)
    .offset(offset);

  const [{ c: total }] = await scoped;

  const body: AdminAppointmentListResponse = {
    rows: rows.map((r) =>
      toAdminAppointment(r.apt, r.center, {
        id: r.donorId,
        name: r.donorName,
        email: r.donorEmail,
        phone: r.donorPhone,
        bloodType: r.donorBloodType,
        avatarColor: r.donorAvatarColor,
      }),
    ),
    total: Number(total),
  };
  return json(body);
});

export const POST = handle(async (request) => {
  const { user: actor } = await requireAdmin(request);
  const body = await readJson<CreateAdminAppointmentBody>(request);

  if (!body.donorId) throw badRequest('donorId is required');
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

  const [donor] = await db
    .select({
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      phone: profiles.phone,
      bloodType: profiles.bloodType,
      avatarColor: profiles.avatarColor,
      lastDonationDate: profiles.lastDonationDate,
    })
    .from(authUser)
    .leftJoin(profiles, eq(profiles.userId, authUser.id))
    .where(eq(authUser.id, body.donorId));
  if (!donor) throw notFound('Donor not found');

  // A donor may hold one upcoming appointment at a time — see upcomingAppointment().
  const [clash] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.userId, donor.id),
        inArray(appointments.status, ['confirmed', 'pending']),
        gte(appointments.date, now),
      ),
    )
    .limit(1);
  if (clash) {
    throw conflict(
      `${donor.name} already has an upcoming appointment. Cancel it before booking another.`,
    );
  }

  const [latestDonation] = await db
    .select({ date: donations.date })
    .from(donations)
    .where(eq(donations.userId, donor.id))
    .orderBy(desc(donations.date))
    .limit(1);

  const lastDonationISO = effectiveLastDonation(
    { lastDonationDate: donor.lastDonationDate?.toISOString() },
    latestDonation ? [{ date: latestDonation.date.toISOString() }] : [],
  );
  if (lastDonationISO) {
    const { nextEligibleDate } = computeEligibility(lastDonationISO, now);
    if (when.getTime() < nextEligibleDate.getTime() - RECOVERY_SLACK_MS) {
      throw conflict(
        `That date falls inside ${donor.name}'s ${PH_DONATION_INTERVAL_DAYS}-day recovery window after their last donation.`,
      );
    }
  }

  // The id is generated here rather than left to the column's $defaultFn so the
  // audit insert can name its target in the same batch — the same reason
  // `POST /api/admin/centers` does it. Without it a booking staff made could
  // exist with no record of who made it.
  const aptId = `apt_${crypto.randomUUID()}`;

  const insert = db
    .insert(appointments)
    .values({ id: aptId, userId: donor.id, centerId: center.id, date: when, type })
    .returning();

  // Booking for someone else is an admin mutation like any other, so the audit
  // row commits with the insert rather than after it.
  const audit = logAdminAction({
    actorId: actor.id,
    action: 'appointment.create',
    targetType: 'appointment',
    targetId: aptId,
    metadata: {
      donorId: donor.id,
      donorEmail: donor.email,
      centerId: center.id,
      centerName: center.name,
      date: when.toISOString(),
      type,
    },
  });

  const [[apt]] = await db.batch([insert, audit]);

  return json(
    toAdminAppointment(apt, center, {
      id: donor.id,
      name: donor.name,
      email: donor.email,
      phone: donor.phone,
      bloodType: donor.bloodType,
      avatarColor: donor.avatarColor,
    }),
    201,
  );
});
