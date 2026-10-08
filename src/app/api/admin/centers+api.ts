/**
 * /api/admin/centers — list and create donation centers.
 *
 * These are the first write routes `donation_centers` has ever had; until now
 * `scripts/seed.ts` was its only writer, which meant adding a center took a
 * developer with database access.
 *
 * Centers are public places, so unlike every other admin surface these
 * responses *do* carry exact coordinates — `toCenter` already emits them
 * unrounded to donors for the map. The privacy boundary this plan protects is
 * `profiles.latitude/longitude`, which is untouched here.
 */
import { asc } from 'drizzle-orm';

import { donationCenters } from '@/db/schema';
import { logAdminAction } from '@/lib/server/audit';
import { countUpcomingByCenter, validateCenterFields } from '@/lib/server/centers';
import { db } from '@/lib/server/db';
import { handle, json, readJson } from '@/lib/server/http';
import { cityDistanceKm, toAdminCenter } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { AdminCenter, CreateCenterBody } from '@/types/api';

export const GET = handle(async (request) => {
  await requireAdmin(request);

  const rows = await db.select().from(donationCenters).orderBy(asc(donationCenters.name));
  const upcoming = await countUpcomingByCenter(rows.map((r) => r.id));

  const body: AdminCenter[] = rows.map((r) => toAdminCenter(r, upcoming.get(r.id) ?? 0));
  return json(body);
});

export const POST = handle(async (request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<CreateCenterBody>(request);
  const fields = validateCenterFields(body, false);

  // Non-null assertions are safe: validateCenterFields with partial=false
  // throws on any missing required field.
  const city = fields.city!;

  // The id is generated here rather than left to the column's $defaultFn so the
  // audit insert can name its target in the same batch. Without it the audit
  // would have to wait for the insert to return, and a created center could
  // exist with no record of who created it.
  const centerId = `ctr_${crypto.randomUUID()}`;

  const [[created]] = await db.batch([
    db
      .insert(donationCenters)
      .values({
        id: centerId,
        name: fields.name!,
        kind: fields.kind!,
        address: fields.address!,
        city,
        hours: fields.hours!,
        rating: fields.rating ?? 0,
        openNow: fields.openNow ?? true,
        latitude: fields.latitude ?? null,
        longitude: fields.longitude ?? null,
        needsUrgent: fields.needsUrgent ?? null,
        // The stable per-city fallback every distance degrades to when either
        // end lacks coordinates. Seeded the same way scripts/seed.ts does it.
        distanceKm: cityDistanceKm(city),
      })
      .returning(),
    logAdminAction({
      actorId: user.id,
      action: 'center.create',
      targetType: 'center',
      targetId: centerId,
      metadata: {
        name: fields.name,
        kind: fields.kind,
        city,
        address: fields.address,
        hasCoordinates: fields.latitude != null && fields.longitude != null,
      },
    }),
  ]);

  // A brand-new center has no bookings yet.
  return json(toAdminCenter(created, 0), 201);
});
