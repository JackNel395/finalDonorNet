/**
 * /api/requests — the emergency request feed.
 *   GET  → non-expired requests with responder counts and the caller's own
 *          response (replaces the old client-side respondedRequestIds).
 *          Overdue open requests are expired first — see request-expiry.ts.
 *          Fulfilled ones are still returned: the donor tab reads them for
 *          response history, and the feed hides them itself.
 *   POST → create a request owned by the caller.
 */
import { count, desc, eq, ne } from 'drizzle-orm';

import { emergencyRequests, responders } from '@/db/schema';
import { db } from '@/lib/server/db';
import { isValidLat, isValidLng } from '@/lib/geo';
import { badRequest, handle, json, readCoords, readJson } from '@/lib/server/http';
import { notifyMatchingDonors } from '@/lib/server/push';
import { expireOverdueRequests } from '@/lib/server/request-expiry';
import { cityDistanceKm, toEmergencyRequest } from '@/lib/server/serialize';
import { requireSession } from '@/lib/server/session';
import type { CreateRequestBody, RequestWithMine } from '@/types/api';

export const GET = handle(async (request) => {
  const { user } = await requireSession(request);
  const viewer = readCoords(request);

  // Close anything past its deadline first, so this read never shows it as live.
  await expireOverdueRequests();

  const rows = await db
    .select()
    .from(emergencyRequests)
    .where(ne(emergencyRequests.status, 'expired'))
    .orderBy(desc(emergencyRequests.postedAt));

  const counts = await db
    .select({ requestId: responders.requestId, c: count() })
    .from(responders)
    .groupBy(responders.requestId);
  const countByRequest = new Map(counts.map((x) => [x.requestId, Number(x.c)]));

  const mine = await db
    .select({ requestId: responders.requestId, status: responders.status })
    .from(responders)
    .where(eq(responders.userId, user.id));
  const mineByRequest = new Map(mine.map((x) => [x.requestId, x.status]));

  const feed: RequestWithMine[] = rows.map((r) => {
    const status = mineByRequest.get(r.id);
    return {
      ...toEmergencyRequest(r, countByRequest.get(r.id) ?? 0, viewer),
      myResponse: status ? { status } : null,
    };
  });
  return json(feed);
});

export const POST = handle(async (request) => {
  const { user } = await requireSession(request);
  const body = await readJson<CreateRequestBody>(request);

  if (!body.bloodType) throw badRequest('bloodType is required');
  if (!body.urgency) throw badRequest('urgency is required');
  const unitsNeeded = Math.max(1, Math.floor(Number(body.unitsNeeded) || 0));
  if (!body.hospital?.trim()) throw badRequest('hospital is required');
  if (!body.city?.trim()) throw badRequest('city is required');
  if (!body.contactPhone?.trim()) throw badRequest('contactPhone is required');

  const city = body.city.trim();
  const neededBy = body.neededBy ? new Date(body.neededBy) : new Date(Date.now() + 12 * 3_600_000);

  // Hospital coords are a nice-to-have: bad GPS must never block a blood
  // request, so invalid values are dropped and the city fallback stands.
  const hasCoords = isValidLat(body.latitude) && isValidLng(body.longitude);

  const [row] = await db
    .insert(emergencyRequests)
    .values({
      ownerId: user.id,
      patientInitials: body.patientInitials?.trim() || 'A.B.',
      bloodType: body.bloodType,
      unitsNeeded,
      urgency: body.urgency,
      hospital: body.hospital.trim(),
      city,
      distanceKm: cityDistanceKm(city),
      latitude: hasCoords ? body.latitude : null,
      longitude: hasCoords ? body.longitude : null,
      neededBy,
      contactName: body.contactName?.trim() || user.name || 'Requester',
      contactPhone: body.contactPhone.trim(),
      note: body.note?.trim() || null,
    })
    .returning();

  // Fire-and-forget: a push failure (Expo down, bad token) must never fail or
  // delay the blood request itself. Never awaited before the 201.
  void notifyMatchingDonors(row).catch((err) =>
    console.error('[push] fan-out failed', err),
  );

  const created: RequestWithMine = { ...toEmergencyRequest(row, 0), myResponse: null };
  return json(created, 201);
});
