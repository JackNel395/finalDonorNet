/**
 * /api/admin/articles/[id] — edit or remove one education article.
 *
 * Deleting is a real delete: nothing references an article and no donor state
 * depends on one. The audit row is written first and keeps the full body, which
 * is the only surviving copy afterwards.
 */
import { eq } from 'drizzle-orm';

import { educationArticles } from '@/db/schema';
import { logAdminAction } from '@/lib/server/audit';
import { validateArticleFields } from '@/lib/server/content';
import { db } from '@/lib/server/db';
import { handle, json, notFound, readJson } from '@/lib/server/http';
import { toArticle } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { UpdateArticleBody } from '@/types/api';

type ArticleUpdate = Partial<typeof educationArticles.$inferInsert>;

async function loadArticle(id: string) {
  const [row] = await db
    .select()
    .from(educationArticles)
    .where(eq(educationArticles.id, id))
    .limit(1);
  if (!row) throw notFound('Article not found');
  return row;
}

export const PATCH = handle(async (request, { id }) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<UpdateArticleBody>(request);
  const fields = validateArticleFields(body, true);

  const existing = await loadArticle(id);

  const set: ArticleUpdate = {};
  if (fields.title !== undefined) set.title = fields.title;
  if (fields.summary !== undefined) set.summary = fields.summary;
  if (fields.minutes !== undefined) set.minutes = fields.minutes;
  if (fields.category !== undefined) set.category = fields.category;
  if (fields.icon !== undefined) set.icon = fields.icon;
  if (fields.body !== undefined) set.body = fields.body;

  if (!Object.keys(set).length) {
    return json(toArticle(existing));
  }

  // The body is a paragraph array; recording it field-by-field would bury the
  // row, so it is summarized by paragraph count instead.
  const changed = Object.fromEntries(
    Object.keys(set).map((key) =>
      key === 'body'
        ? ['body', { fromParagraphs: existing.body.length, toParagraphs: fields.body?.length ?? 0 }]
        : [
            key,
            {
              from: existing[key as keyof typeof existing] ?? null,
              to: set[key as keyof ArticleUpdate] ?? null,
            },
          ],
    ),
  );

  const [[updated]] = await db.batch([
    db.update(educationArticles).set(set).where(eq(educationArticles.id, id)).returning(),
    logAdminAction({
      actorId: user.id,
      action: 'article.update',
      targetType: 'article',
      targetId: id,
      metadata: { title: existing.title, changed },
    }),
  ]);

  return json(toArticle(updated));
});

export const DELETE = handle(async (request, { id }) => {
  const { user } = await requireAdmin(request);
  const existing = await loadArticle(id);

  await logAdminAction({
    actorId: user.id,
    action: 'article.delete',
    targetType: 'article',
    targetId: id,
    metadata: {
      title: existing.title,
      summary: existing.summary,
      category: existing.category,
      minutes: existing.minutes,
      icon: existing.icon,
      body: existing.body,
    },
  });

  await db.delete(educationArticles).where(eq(educationArticles.id, id));

  return new Response(null, { status: 204 });
});
