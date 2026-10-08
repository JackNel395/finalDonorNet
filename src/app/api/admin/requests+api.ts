/**
 * GET /api/admin/requests — every emergency request, filtered and paginated.
 *
 * Unlike the donor feed this includes expired rows: moderation needs to see
 * what was taken down, not only what is live. `requireAdmin` is the security
 * boundary; the console's own gate is cosmetic.
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, or, type SQL } from 'drizzle-orm';

import { emergencyRequests, responders, user as authUser } from '@/db/schema';
import { db } from '@/lib/server/db';
import { expireOverdueRequests } from '@/lib/server/request-expiry';
import { handle, json, readEnum, readInt } from '@/lib/server/http';
import { toAdminRequest } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { AdminRequestListResponse } from '@/types/api';
import { BLOOD_TYPES, type BloodType, type RequestStatus, type Urgency } from '@/types/domain';

const STATUSES: RequestStatus[] = ['open', 'partial', 'fulfilled', 'expired'];
const URGENCIES: Urgency[] = ['critical', 'urgent', 'moderate', 'routine'];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export const GET = handle(async (request) => {
  await requireAdmin(request);

  // So the queue's Open/Closed counts and filters match what donors see.
  await expireOverdueRequests();

  const { searchParams } = new URL(request.url);
  const status = readEnum<RequestStatus>(searchParams, 'status', STATUSES);
  const urgency = readEnum<Urgency>(searchParams, 'urgency', URGENCIES);
  const bloodType = readEnum<BloodType>(searchParams, 'bloodType', BLOOD_TYPES);
  const q = searchParams.get('q')?.trim();
  const city = searchParams.get('city')?.trim();
  const postedWithinDays = readInt(searchParams, 'postedWithinDays');
  const sort = readEnum<'newest' | 'oldest'>(searchParams, 'sort', ['newest', 'oldest']) ?? 'newest';
  const limit = readInt(searchParams, 'limit', MAX_LIMIT) ?? DEFAULT_LIMIT;
  const offset = readInt(searchParams, 'offset') ?? 0;

  const filters: SQL[] = [];
  if (status) filters.push(eq(emergencyRequests.status, status));
  if (urgency) filters.push(eq(emergencyRequests.urgency, urgency));
  if (bloodType) filters.push(eq(emergencyRequests.bloodType, bloodType));
  // Substring match: staff type a partial city, not an exact stored value.
  if (city) filters.push(ilike(emergencyRequests.city, `%${city}%`));
  // One box over the fields staff actually have to hand when someone phones in
  // about a request: where it is, who it is for, or the id off the console.
  // Patient initials are matched because that is the only patient identifier
  // this app stores — deliberately, so a name never enters the database.
  if (q) {
    filters.push(
      or(
        ilike(emergencyRequests.hospital, `%${q}%`),
        ilike(emergencyRequests.city, `%${q}%`),
        ilike(emergencyRequests.patientInitials, `%${q}%`),
        ilike(emergencyRequests.id, `%${q}%`),
      )!,
    );
  }
  if (postedWithinDays != null) {
    filters.push(
      gte(emergencyRequests.postedAt, new Date(Date.now() - postedWithinDays * 86_400_000)),
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({ req: emergencyRequests, ownerName: authUser.name, ownerEmail: authUser.email })
    .from(emergencyRequests)
    .innerJoin(authUser, eq(emergencyRequests.ownerId, authUser.id))
    .where(where)
    .orderBy(sort === 'oldest' ? asc(emergencyRequests.postedAt) : desc(emergencyRequests.postedAt))
    .limit(limit)
    .offset(offset);

  // Total for the same filter set, so the pager reports the result set rather
  // than the page.
  const [{ c: total }] = await db
    .select({ c: count() })
    .from(emergencyRequests)
    .where(where);

  // Responder counts for this page only — the feed route's ungrouped scan over
  // every responder row doesn't pay off once the table is paginated.
  const ids = rows.map((r) => r.req.id);
  const counts = ids.length
    ? await db
        .select({ requestId: responders.requestId, c: count() })
        .from(responders)
        .where(inArray(responders.requestId, ids))
        .groupBy(responders.requestId)
    : [];
  const countByRequest = new Map(counts.map((x) => [x.requestId, Number(x.c)]));

  const body: AdminRequestListResponse = {
    rows: rows.map((r) =>
      toAdminRequest(r.req, countByRequest.get(r.req.id) ?? 0, {
        name: r.ownerName,
        email: r.ownerEmail,
      }),
    ),
    total: Number(total),
  };
  return json(body);
});
