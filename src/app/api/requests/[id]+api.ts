/**
 * /api/requests/[id] — a single emergency request. The responder roster (with
 * display details) is included only for the owner; everyone else gets the
 * public fields plus the aggregate responders count.
 */
import { and, count, eq } from 'drizzle-orm';

import { emergencyRequests, profiles, responders, user as authUser } from '@/db/schema';
import { db } from '@/lib/server/db';
import { expireOverdueRequests } from '@/lib/server/request-expiry';
import { handle, json, notFound, readCoords } from '@/lib/server/http';
import { toEmergencyRequest, toResponder } from '@/lib/server/serialize';
import { requireSession } from '@/lib/server/session';
import type { RequestWithMine } from '@/types/api';

export const GET = handle(async (request, { id }) => {
  const { user } = await requireSession(request);
  const viewer = readCoords(request);

  // Close anything past its deadline first, so this read never shows it as live.
  await expireOverdueRequests();

  const [row] = await db.select().from(emergencyRequests).where(eq(emergencyRequests.id, id));
  if (!row) throw notFound('Request not found');

  const [{ c }] = await db
    .select({ c: count() })
    .from(responders)
    .where(eq(responders.requestId, id));

  const [mine] = await db
    .select({ status: responders.status })
    .from(responders)
    .where(and(eq(responders.requestId, id), eq(responders.userId, user.id)));

  const result: RequestWithMine = {
    ...toEmergencyRequest(row, Number(c), viewer),
    myResponse: mine ? { status: mine.status } : null,
  };

  if (row.ownerId === user.id) {
    const roster = await db
      .select({
        id: responders.id,
        status: responders.status,
        respondedAt: responders.respondedAt,
        fullName: authUser.name,
        bloodType: profiles.bloodType,
        city: profiles.city,
        avatarColor: profiles.avatarColor,
        latitude: profiles.latitude,
        longitude: profiles.longitude,
      })
      .from(responders)
      .innerJoin(authUser, eq(responders.userId, authUser.id))
      .leftJoin(profiles, eq(responders.userId, profiles.userId))
      .where(eq(responders.requestId, id));

    result.responders = roster.map((x) =>
      toResponder(
        {
          id: x.id,
          fullName: x.fullName,
          bloodType: x.bloodType ?? row.bloodType,
          city: x.city ?? '—',
          avatarColor: x.avatarColor,
          respondedAt: x.respondedAt,
          status: x.status,
          latitude: x.latitude,
          longitude: x.longitude,
        },
        row.distanceKm,
        row.latitude != null && row.longitude != null
          ? { latitude: row.latitude, longitude: row.longitude }
          : null,
      ),
    );
  }

  return json(result);
});
