/**
 * /api/admin/articles — list and create education articles.
 *
 * Published immediately: the Learn tab reads this table directly, and
 * `article/[id].tsx` selects from the same cached list, so a new article is
 * readable as soon as it is written.
 *
 * `body` is a `text[]` of paragraphs. There is no markup pipeline anywhere in
 * the app, so the editor is a paragraph list rather than a rich-text field.
 */
import { asc } from 'drizzle-orm';

import { educationArticles } from '@/db/schema';
import { logAdminAction } from '@/lib/server/audit';
import { validateArticleFields } from '@/lib/server/content';
import { db } from '@/lib/server/db';
import { handle, json, readJson } from '@/lib/server/http';
import { toArticle } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { AdminArticle, CreateArticleBody } from '@/types/api';

export const GET = handle(async (request) => {
  await requireAdmin(request);
  const rows = await db.select().from(educationArticles).orderBy(asc(educationArticles.title));
  const body: AdminArticle[] = rows.map(toArticle);
  return json(body);
});

export const POST = handle(async (request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<CreateArticleBody>(request);
  const fields = validateArticleFields(body, false);

  // Generated here so the audit insert can name its target in the same batch.
  const articleId = `art_${crypto.randomUUID()}`;

  const [[created]] = await db.batch([
    db
      .insert(educationArticles)
      .values({
        id: articleId,
        title: fields.title!,
        summary: fields.summary!,
        minutes: fields.minutes!,
        category: fields.category!,
        icon: fields.icon!,
        body: fields.body!,
      })
      .returning(),
    logAdminAction({
      actorId: user.id,
      action: 'article.create',
      targetType: 'article',
      targetId: articleId,
      metadata: {
        title: fields.title,
        category: fields.category,
        minutes: fields.minutes,
        paragraphs: fields.body?.length ?? 0,
      },
    }),
  ]);

  return json(toArticle(created), 201);
});
