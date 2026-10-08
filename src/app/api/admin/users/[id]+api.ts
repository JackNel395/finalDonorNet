/**
 * /api/admin/users/[id]
 *
 *   GET   — one account with its donation history, appointments, the requests
 *           it responded to, its registered devices, and its audit trail.
 *   PATCH — correct `lastDonationDate`, the one editable profile field in v1.
 *
 * `lastDonationDate` is editable because it drives the eligibility countdown
 * (`computeEligibility`): a wrong value either blocks a willing donor for
 * months or invites one back before the interval has elapsed. Every other
 * profile field belongs to the donor.
 *
 * No coordinate is emitted by either verb.
 */
import { and, desc, eq } from 'drizzle-orm';

import {
  adminAuditLog,
  appointments,
  donationCenters,
  donations,
  emergencyRequests,
  profiles,
  pushTokens,
  responders,
  user as authUser,
} from '@/db/schema';
import { logAdminAction } from '@/lib/server/audit';
import { db } from '@/lib/server/db';
import { badRequest, conflict, handle, json, notFound, readJson } from '@/lib/server/http';
import {
  toAdminDonor,
  toAppointment,
  toAuditEntry,
  toDonation,
} from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { AdminDonorDetail, UpdateDonorBody } from '@/types/api';

const MAX_REASON = 500;

/** The account plus its profile, or a 404. Shared by both verbs. */
async function loadAccount(id: string) {
  const [row] = await db
    .select({ u: authUser, p: profiles })
    .from(authUser)
    .leftJoin(profiles, eq(profiles.userId, authUser.id))
    .where(eq(authUser.id, id))
    .limit(1);
  if (!row) throw notFound('Account not found');
  return row;
}

async function countDevices(id: string) {
  const rows = await db
    .select({ id: pushTokens.id })
    .from(pushTokens)
    .where(eq(pushTokens.userId, id));
  return rows.length;
}

export const GET = handle(async (request, { id }) => {
  await requireAdmin(request);
  const { u, p } = await loadAccount(id);

  const donationRows = await db
    .select()
    .from(donations)
    .where(eq(donations.userId, id))
    .orderBy(desc(donations.date));

  const appointmentRows = await db
    .select({ apt: appointments, center: donationCenters })
    .from(appointments)
    .innerJoin(donationCenters, eq(appointments.centerId, donationCenters.id))
    .where(eq(appointments.userId, id))
    .orderBy(desc(appointments.date));

  const responseRows = await db
    .select({
      id: responders.id,
      requestId: responders.requestId,
      status: responders.status,
      respondedAt: responders.respondedAt,
      hospital: emergencyRequests.hospital,
      city: emergencyRequests.city,
      bloodType: emergencyRequests.bloodType,
      urgency: emergencyRequests.urgency,
      requestStatus: emergencyRequests.status,
    })
    .from(responders)
    .innerJoin(emergencyRequests, eq(responders.requestId, emergencyRequests.id))
    .where(eq(responders.userId, id))
    .orderBy(desc(responders.respondedAt));

  const deviceRows = await db
    .select({ id: pushTokens.id, platform: pushTokens.platform, updatedAt: pushTokens.updatedAt })
    .from(pushTokens)
    .where(eq(pushTokens.userId, id))
    .orderBy(desc(pushTokens.updatedAt));

  // Left join on the actor: a deleted admin's rows survive with a null actorId.
  const trail = await db
    .select({ entry: adminAuditLog, actorName: authUser.name })
    .from(adminAuditLog)
    .leftJoin(authUser, eq(adminAuditLog.actorId, authUser.id))
    .where(and(eq(adminAuditLog.targetType, 'user'), eq(adminAuditLog.targetId, id)))
    .orderBy(desc(adminAuditLog.createdAt));

  const body: AdminDonorDetail = {
    ...toAdminDonor(u, p, deviceRows.length),
    donations: donationRows.map(toDonation),
    appointments: appointmentRows.map((r) => toAppointment(r.apt, r.center)),
    responses: responseRows.map((r) => ({
      id: r.id,
      requestId: r.requestId,
      hospital: r.hospital,
      city: r.city,
      bloodType: r.bloodType,
      urgency: r.urgency,
      requestStatus: r.requestStatus,
      status: r.status,
      respondedAt: r.respondedAt.toISOString(),
    })),
    devices: deviceRows.map((d) => ({
      id: d.id,
      platform: d.platform,
      updatedAt: d.updatedAt.toISOString(),
    })),
    auditTrail: trail.map((t) => toAuditEntry(t.entry, t.actorName)),
  };
  return json(body);
});

export const PATCH = handle(async (request, { id }) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<UpdateDonorBody>(request);

  if (!('lastDonationDate' in body)) {
    throw badRequest('lastDonationDate is required (send null to clear it)');
  }

  const reason = body.reason?.trim() || undefined;
  if (reason && reason.length > MAX_REASON) {
    throw badRequest(`reason must be ${MAX_REASON} characters or fewer`);
  }

  let next: Date | null = null;
  if (body.lastDonationDate !== null) {
    if (typeof body.lastDonationDate !== 'string') {
      throw badRequest('lastDonationDate must be an ISO date string or null');
    }
    const parsed = new Date(body.lastDonationDate);
    if (Number.isNaN(parsed.getTime())) {
      throw badRequest('lastDonationDate must be a valid ISO date');
    }
    // A future donation date would hand the donor a countdown that has not
    // started, and no amount of correcting fixes a date that hasn't happened.
    if (parsed.getTime() > Date.now()) {
      throw badRequest('A last-donation date cannot be in the future');
    }
    next = parsed;
  }

  const { u, p } = await loadAccount(id);
  // There is no profile row to write to, and creating one here would invent a
  // blood type and city the donor never gave.
  if (!p) {
    throw conflict('This account has not completed its donor profile yet, so there is no donation date to correct');
  }

  const [[updated]] = await db.batch([
    db
      .update(profiles)
      .set({ lastDonationDate: next, updatedAt: new Date() })
      .where(eq(profiles.userId, id))
      .returning(),
    logAdminAction({
      actorId: user.id,
      action: 'user.update_last_donation',
      targetType: 'user',
      targetId: id,
      reason,
      metadata: {
        email: u.email,
        from: p.lastDonationDate ? p.lastDonationDate.toISOString() : null,
        to: next ? next.toISOString() : null,
      },
    }),
  ]);

  return json(toAdminDonor(u, updated, await countDevices(id)));
});
