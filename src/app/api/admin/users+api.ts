/**
 * GET /api/admin/users — every account, searchable and paginated.
 *
 * Accounts without a `profiles` row are included on purpose: a signup that
 * never finished onboarding is exactly the kind of thing staff are looking for,
 * and an inner join would hide it. The join is therefore a left join and every
 * profile-owned field is optional in the response.
 *
 * No coordinate is emitted. `requireAdmin` is the security boundary.
 */
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
} from 'drizzle-orm';

import { profiles, pushTokens, user as authUser } from '@/db/schema';
import { db } from '@/lib/server/db';
import { handle, json, readEnum, readInt } from '@/lib/server/http';
import { toAdminDonor } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { AdminDonorListResponse, AdminDonorStatus } from '@/types/api';
import { BLOOD_TYPES, type BloodType } from '@/types/domain';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DONOR_STATUSES: AdminDonorStatus[] = ['active', 'suspended', 'incomplete'];

export const GET = handle(async (request) => {
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  const bloodType = readEnum<BloodType>(searchParams, 'bloodType', BLOOD_TYPES);
  const city = searchParams.get('city')?.trim();
  const status = readEnum<AdminDonorStatus>(searchParams, 'status', DONOR_STATUSES);
  const limit = readInt(searchParams, 'limit', MAX_LIMIT) ?? DEFAULT_LIMIT;
  const offset = readInt(searchParams, 'offset') ?? 0;

  const filters: SQL[] = [];
  if (q) {
    // One box across the three things staff actually have to hand: a name from
    // a phone call, an email from a report, a number from a text message.
    const term = `%${q}%`;
    const match = or(
      ilike(authUser.name, term),
      ilike(authUser.email, term),
      ilike(profiles.phone, term),
    );
    if (match) filters.push(match);
  }
  if (bloodType) filters.push(eq(profiles.bloodType, bloodType));
  if (city) filters.push(ilike(profiles.city, `%${city}%`));
  // `banned` is nullable in the auth plugin's schema, so "not suspended" has to
  // admit NULL as well as false — `ne(banned, true)` would drop every row that
  // was never banned at all.
  if (status === 'suspended') filters.push(eq(authUser.banned, true));
  if (status === 'active') {
    filters.push(or(eq(authUser.banned, false), isNull(authUser.banned))!);
    filters.push(isNotNull(profiles.userId));
  }
  if (status === 'incomplete') filters.push(isNull(profiles.userId));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({ u: authUser, p: profiles })
    .from(authUser)
    .leftJoin(profiles, eq(profiles.userId, authUser.id))
    .where(where)
    .orderBy(desc(authUser.createdAt), asc(authUser.id))
    .limit(limit)
    .offset(offset);

  const [{ c: total }] = await db
    .select({ c: count() })
    .from(authUser)
    .leftJoin(profiles, eq(profiles.userId, authUser.id))
    .where(where);

  // Device counts for this page only, grouped in one query rather than per row.
  const ids = rows.map((r) => r.u.id);
  const deviceRows = ids.length
    ? await db
        .select({ userId: pushTokens.userId, c: count() })
        .from(pushTokens)
        .where(inArray(pushTokens.userId, ids))
        .groupBy(pushTokens.userId)
    : [];
  const devicesByUser = new Map(deviceRows.map((d) => [d.userId, Number(d.c)]));

  const body: AdminDonorListResponse = {
    rows: rows.map((r) => toAdminDonor(r.u, r.p, devicesByUser.get(r.u.id) ?? 0)),
    total: Number(total),
  };
  return json(body);
});
