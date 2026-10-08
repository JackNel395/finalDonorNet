/**
 * GET /api/admin/requests/[id] — one request with its responder roster and its
 * audit trail. The roster carries donor contact details (the operational reason
 * the console exists) and no coordinates.
 */
import { and, count, desc, eq } from 'drizzle-orm';

import {
  adminAuditLog,
  emergencyRequests,
  profiles,
  responders,
  user as authUser,
} from '@/db/schema';
import { db } from '@/lib/server/db';
import { expireOverdueRequests } from '@/lib/server/request-expiry';
import { handle, json, notFound } from '@/lib/server/http';
import { toAdminRequest, toAdminResponder, toAuditEntry } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { AdminRequestDetail } from '@/types/api';

export const GET = handle(async (request, { id }) => {
  await requireAdmin(request);

  // Close anything past its deadline first, so this read never shows it as live.
  await expireOverdueRequests();

  const [row] = await db
    .select({ req: emergencyRequests, ownerName: authUser.name, ownerEmail: authUser.email })
    .from(emergencyRequests)
    .innerJoin(authUser, eq(emergencyRequests.ownerId, authUser.id))
    .where(eq(emergencyRequests.id, id))
    .limit(1);
  if (!row) throw notFound('Request not found');

  const [{ c }] = await db
    .select({ c: count() })
    .from(responders)
    .where(eq(responders.requestId, id));

  const roster = await db
    .select({
      id: responders.id,
      userId: responders.userId,
      status: responders.status,
      respondedAt: responders.respondedAt,
      fullName: authUser.name,
      email: authUser.email,
      phone: profiles.phone,
      bloodType: profiles.bloodType,
      city: profiles.city,
      latitude: profiles.latitude,
      longitude: profiles.longitude,
    })
    .from(responders)
    .innerJoin(authUser, eq(responders.userId, authUser.id))
    .leftJoin(profiles, eq(responders.userId, profiles.userId))
    .where(eq(responders.requestId, id))
    .orderBy(desc(responders.respondedAt));

  // Actor is a left join: a deleted admin's audit rows survive with a null
  // actorId, by design.
  const trail = await db
    .select({ entry: adminAuditLog, actorName: authUser.name })
    .from(adminAuditLog)
    .leftJoin(authUser, eq(adminAuditLog.actorId, authUser.id))
    .where(and(eq(adminAuditLog.targetType, 'request'), eq(adminAuditLog.targetId, id)))
    .orderBy(desc(adminAuditLog.createdAt));

  const requestCoords =
    row.req.latitude != null && row.req.longitude != null
      ? { latitude: row.req.latitude, longitude: row.req.longitude }
      : null;

  const body: AdminRequestDetail = {
    ...toAdminRequest(row.req, Number(c), { name: row.ownerName, email: row.ownerEmail }),
    responders: roster.map((x) =>
      toAdminResponder(
        {
          id: x.id,
          userId: x.userId,
          fullName: x.fullName,
          email: x.email,
          phone: x.phone,
          // A responder without a profile row is an incomplete signup; fall
          // back to the request's own type rather than dropping them from the
          // roster, which is what the donor-facing route does too.
          bloodType: x.bloodType ?? row.req.bloodType,
          city: x.city ?? '—',
          respondedAt: x.respondedAt,
          status: x.status,
          latitude: x.latitude,
          longitude: x.longitude,
        },
        row.req.distanceKm,
        requestCoords,
      ),
    ),
    auditTrail: trail.map((t) => toAuditEntry(t.entry, t.actorName)),
  };
  return json(body);
});
