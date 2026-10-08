/**
 * /api/admin/centers/[id] — edit or remove one donation center.
 *
 *   PATCH  — update any subset of the center's fields.
 *   DELETE — remove a center, but only when nothing is booked against it.
 *
 * The DELETE guard is the important part. `appointments.centerId` is
 * `onDelete: 'cascade'`, so deleting a center with bookings would silently
 * destroy donors' appointments — they would simply find their confirmed
 * donation gone, with no notice and no record. So a center with future
 * bookings is refused with a 409 whose message points at the safe path:
 * turning `openNow` off takes it out of circulation without touching anyone's
 * calendar.
 */
import { eq } from 'drizzle-orm';

import { donationCenters } from '@/db/schema';
import { logAdminAction } from '@/lib/server/audit';
import { countUpcomingByCenter, validateCenterFields } from '@/lib/server/centers';
import { db } from '@/lib/server/db';
import { conflict, handle, json, notFound, readJson } from '@/lib/server/http';
import { cityDistanceKm, toAdminCenter } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { UpdateCenterBody } from '@/types/api';


type CenterUpdate = Partial<typeof donationCenters.$inferInsert>;

async function loadCenter(id: string) {
  const [row] = await db
    .select()
    .from(donationCenters)
    .where(eq(donationCenters.id, id))
    .limit(1);
  if (!row) throw notFound('Center not found');
  return row;
}

export const PATCH = handle(async (request, { id }) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<UpdateCenterBody>(request);
  const fields = validateCenterFields(body, true);

  const existing = await loadCenter(id);

  // Only fields the operator actually sent are written: a PATCH that omits
  // `needsUrgent` must not clear it.
  const set: CenterUpdate = {};
  if (fields.name !== undefined) set.name = fields.name;
  if (fields.kind !== undefined) set.kind = fields.kind;
  if (fields.address !== undefined) set.address = fields.address;
  if (fields.hours !== undefined) set.hours = fields.hours;
  if (fields.rating !== undefined) set.rating = fields.rating;
  if (fields.openNow !== undefined) set.openNow = fields.openNow;
  if (fields.latitude !== undefined) set.latitude = fields.latitude;
  if (fields.longitude !== undefined) set.longitude = fields.longitude;
  if (fields.needsUrgent !== undefined) set.needsUrgent = fields.needsUrgent;
  if (fields.city !== undefined) {
    set.city = fields.city;
    // The per-city fallback is derived from the name, so a move has to re-derive
    // it or the center keeps the old city's distance forever.
    set.distanceKm = cityDistanceKm(fields.city);
  }

  if (!Object.keys(set).length) {
    // Nothing to write, and an audit row saying nothing changed is noise.
    const upcoming = await countUpcomingByCenter([id]);
    return json(toAdminCenter(existing, upcoming.get(id) ?? 0));
  }

  /** Only the fields this request actually changed, for the audit snapshot. */
  const changed = Object.fromEntries(
    Object.keys(set).map((key) => [
      key,
      { from: existing[key as keyof typeof existing] ?? null, to: set[key as keyof CenterUpdate] ?? null },
    ]),
  );

  const [[updated]] = await db.batch([
    db.update(donationCenters).set(set).where(eq(donationCenters.id, id)).returning(),
    logAdminAction({
      actorId: user.id,
      action: 'center.update',
      targetType: 'center',
      targetId: id,
      metadata: { name: existing.name, changed },
    }),
  ]);

  const upcoming = await countUpcomingByCenter([id]);
  return json(toAdminCenter(updated, upcoming.get(id) ?? 0));
});

export const DELETE = handle(async (request, { id }) => {
  const { user } = await requireAdmin(request);
  const existing = await loadCenter(id);

  const upcoming = (await countUpcomingByCenter([id])).get(id) ?? 0;
  if (upcoming > 0) {
    throw conflict(
      `${existing.name} has ${upcoming} upcoming appointment${upcoming === 1 ? '' : 's'}. ` +
        'Deleting it would cancel those donations without telling anyone. ' +
        'Turn "Open now" off instead to take it out of circulation and keep the bookings intact.',
    );
  }

  // Audit first: the row is about to be gone, and so are any past appointments
  // that cascade with it, so this snapshot is the only remaining record.
  await logAdminAction({
    actorId: user.id,
    action: 'center.delete',
    targetType: 'center',
    targetId: id,
    metadata: {
      name: existing.name,
      kind: existing.kind,
      city: existing.city,
      address: existing.address,
      hours: existing.hours,
    },
  });

  await db.delete(donationCenters).where(eq(donationCenters.id, id));

  // 204: the center is gone, so there is no resource left to return.
  return new Response(null, { status: 204 });
});
