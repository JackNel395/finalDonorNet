/**
 * /api/admin/announcements — list and create announcements.
 *
 * Until now `scripts/seed.ts` was the only writer. Anything created here is
 * **published immediately**: the donor home feed reads this table directly and
 * shows the newest row, so there is no draft state to hide behind.
 */
import { desc } from 'drizzle-orm';

import { announcements } from '@/db/schema';
import { logAdminAction } from '@/lib/server/audit';
import { validateAnnouncementFields } from '@/lib/server/content';
import { db } from '@/lib/server/db';
import { handle, json, readJson } from '@/lib/server/http';
import { toAnnouncement } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { AdminAnnouncement, CreateAnnouncementBody } from '@/types/api';

export const GET = handle(async (request) => {
  await requireAdmin(request);
  const rows = await db.select().from(announcements).orderBy(desc(announcements.date));
  const body: AdminAnnouncement[] = rows.map(toAnnouncement);
  return json(body);
});

export const POST = handle(async (request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<CreateAnnouncementBody>(request);
  const fields = validateAnnouncementFields(body, false);

  // Generated here so the audit insert can name its target in the same batch;
  // otherwise a published announcement could exist with no record of who wrote
  // it. Same reasoning as the center-create route.
  const announcementId = `ann_${crypto.randomUUID()}`;

  const [[created]] = await db.batch([
    db
      .insert(announcements)
      .values({
        id: announcementId,
        title: fields.title!,
        body: fields.body!,
        tag: fields.tag!,
        tone: fields.tone!,
        // Defaults to now: an announcement is published when it is written.
        ...(fields.date ? { date: fields.date } : {}),
      })
      .returning(),
    logAdminAction({
      actorId: user.id,
      action: 'announcement.create',
      targetType: 'announcement',
      targetId: announcementId,
      metadata: { title: fields.title, tag: fields.tag, tone: fields.tone },
    }),
  ]);

  return json(toAnnouncement(created), 201);
});
