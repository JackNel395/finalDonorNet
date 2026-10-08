/**
 * /api/admin/announcements/[id] — edit or remove one announcement.
 *
 * Unlike an emergency request, deleting here is a real delete. Nothing
 * references an announcement, no donor has acted on one, and an obsolete notice
 * in the home feed is worse than its absence — so there is no soft-delete to
 * preserve. The audit row is written first and carries the full text, which is
 * the only remaining record afterwards.
 */
import { eq } from 'drizzle-orm';

import { announcements } from '@/db/schema';
import { logAdminAction } from '@/lib/server/audit';
import { validateAnnouncementFields } from '@/lib/server/content';
import { db } from '@/lib/server/db';
import { handle, json, notFound, readJson } from '@/lib/server/http';
import { toAnnouncement } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { UpdateAnnouncementBody } from '@/types/api';

type AnnouncementUpdate = Partial<typeof announcements.$inferInsert>;

async function loadAnnouncement(id: string) {
  const [row] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
  if (!row) throw notFound('Announcement not found');
  return row;
}

export const PATCH = handle(async (request, { id }) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<UpdateAnnouncementBody>(request);
  const fields = validateAnnouncementFields(body, true);

  const existing = await loadAnnouncement(id);

  // Only fields the operator actually sent are written.
  const set: AnnouncementUpdate = {};
  if (fields.title !== undefined) set.title = fields.title;
  if (fields.body !== undefined) set.body = fields.body;
  if (fields.tag !== undefined) set.tag = fields.tag;
  if (fields.tone !== undefined) set.tone = fields.tone;
  if (fields.date !== undefined) set.date = fields.date;

  if (!Object.keys(set).length) {
    // Nothing to write, and an audit row saying nothing changed is noise.
    return json(toAnnouncement(existing));
  }

  const changed = Object.fromEntries(
    Object.keys(set).map((key) => [
      key,
      {
        from: existing[key as keyof typeof existing] ?? null,
        to: set[key as keyof AnnouncementUpdate] ?? null,
      },
    ]),
  );

  const [[updated]] = await db.batch([
    db.update(announcements).set(set).where(eq(announcements.id, id)).returning(),
    logAdminAction({
      actorId: user.id,
      action: 'announcement.update',
      targetType: 'announcement',
      targetId: id,
      metadata: { title: existing.title, changed },
    }),
  ]);

  return json(toAnnouncement(updated));
});

export const DELETE = handle(async (request, { id }) => {
  const { user } = await requireAdmin(request);
  const existing = await loadAnnouncement(id);

  // Audit first: the row is about to be gone, so this snapshot is the only
  // surviving copy of what was published.
  await logAdminAction({
    actorId: user.id,
    action: 'announcement.delete',
    targetType: 'announcement',
    targetId: id,
    metadata: {
      title: existing.title,
      body: existing.body,
      tag: existing.tag,
      tone: existing.tone,
      date: existing.date.toISOString(),
    },
  });

  await db.delete(announcements).where(eq(announcements.id, id));

  // 204: the announcement is gone, so there is no resource left to return.
  return new Response(null, { status: 204 });
});
