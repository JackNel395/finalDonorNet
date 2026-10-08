/**
 * Announcement and article validation, shared by the create and update routes.
 *
 * It lives here rather than in a route file for the same reason
 * `src/lib/server/centers.ts` does: `POST` and `PATCH` must enforce identical
 * rules, and a route importing another route's `+api.ts` would evaluate that
 * module's exports as a side effect.
 *
 * These two tables feed donor-facing surfaces directly — announcements the home
 * feed, articles the Learn tab — so anything stored here is published the moment
 * it is written. There is no draft state in v1.
 *
 * Server-only.
 */
import { isArticleIcon, ARTICLE_ICONS } from '@/lib/article-icons';
import type { CreateAnnouncementBody, CreateArticleBody } from '@/types/api';
import type { Announcement, EducationArticle } from '@/types/domain';
import { badRequest } from './http';

const TONES: Announcement['tone'][] = ['brand', 'info', 'success', 'warning'];
const CATEGORIES: EducationArticle['category'][] = ['eligibility', 'process', 'health', 'myths'];

/** Caps that keep a pasted essay out of a home-feed badge. */
const MAX_TITLE = 120;
const MAX_TAG = 32;
const MAX_ANNOUNCEMENT_BODY = 2000;
const MAX_SUMMARY = 300;
const MAX_PARAGRAPH = 4000;
const MAX_PARAGRAPHS = 40;
const MAX_MINUTES = 120;

/**
 * A required, non-empty, length-capped string.
 *
 * `partial` allows the field to be absent (a PATCH that doesn't mention it);
 * a field that is *present* is always validated, so an edit cannot store an
 * empty title that create would have refused.
 */
function text(
  value: unknown,
  field: string,
  max: number,
  partial: boolean,
): string | undefined {
  if (value === undefined) {
    if (!partial) throw badRequest(`${field} is required`);
    return undefined;
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw badRequest(`${field} must not be empty`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw badRequest(`${field} must be ${max} characters or fewer`);
  }
  return trimmed;
}

export function validateAnnouncementFields(
  body: Partial<CreateAnnouncementBody>,
  partial: boolean,
) {
  const title = text(body.title, 'title', MAX_TITLE, partial);
  const announcementBody = text(body.body, 'body', MAX_ANNOUNCEMENT_BODY, partial);
  const tag = text(body.tag, 'tag', MAX_TAG, partial);

  let tone: Announcement['tone'] | undefined;
  if (body.tone !== undefined) {
    if (!TONES.includes(body.tone)) throw badRequest(`tone must be one of: ${TONES.join(', ')}`);
    tone = body.tone;
  } else if (!partial) {
    throw badRequest('tone is required');
  }

  let date: Date | undefined;
  if (body.date !== undefined) {
    const parsed = new Date(body.date);
    if (Number.isNaN(parsed.getTime())) throw badRequest('date must be a valid ISO date');
    date = parsed;
  }

  return { title, body: announcementBody, tag, tone, date };
}

export function validateArticleFields(body: Partial<CreateArticleBody>, partial: boolean) {
  const title = text(body.title, 'title', MAX_TITLE, partial);
  const summary = text(body.summary, 'summary', MAX_SUMMARY, partial);

  let category: EducationArticle['category'] | undefined;
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category)) {
      throw badRequest(`category must be one of: ${CATEGORIES.join(', ')}`);
    }
    category = body.category;
  } else if (!partial) {
    throw badRequest('category is required');
  }

  let minutes: number | undefined;
  if (body.minutes !== undefined) {
    if (typeof body.minutes !== 'number' || !Number.isInteger(body.minutes) || body.minutes < 1) {
      throw badRequest('minutes must be a whole number of at least 1');
    }
    if (body.minutes > MAX_MINUTES) throw badRequest(`minutes must be ${MAX_MINUTES} or fewer`);
    minutes = body.minutes;
  } else if (!partial) {
    throw badRequest('minutes is required');
  }

  let icon: string | undefined;
  if (body.icon !== undefined) {
    // Checked against the curated list, not just "is a string": `learn.tsx`
    // renders the stored value straight into <Ionicons name>, so a name that
    // isn't a real glyph shows as blank space with no error anywhere.
    if (!isArticleIcon(body.icon)) {
      throw badRequest(`icon must be one of: ${ARTICLE_ICONS.join(', ')}`);
    }
    icon = body.icon;
  } else if (!partial) {
    throw badRequest('icon is required');
  }

  let paragraphs: string[] | undefined;
  if (body.body !== undefined) {
    if (!Array.isArray(body.body)) throw badRequest('body must be an array of paragraphs');
    // Blank paragraphs are dropped rather than rejected: the editor is a list of
    // text boxes and a trailing empty one is the normal state of typing.
    const cleaned = body.body
      .map((para) => (typeof para === 'string' ? para.trim() : ''))
      .filter(Boolean);
    if (!cleaned.length) throw badRequest('body must have at least one paragraph');
    if (cleaned.length > MAX_PARAGRAPHS) {
      throw badRequest(`body must have ${MAX_PARAGRAPHS} paragraphs or fewer`);
    }
    const tooLong = cleaned.find((para) => para.length > MAX_PARAGRAPH);
    if (tooLong) throw badRequest(`each paragraph must be ${MAX_PARAGRAPH} characters or fewer`);
    paragraphs = cleaned;
  } else if (!partial) {
    throw badRequest('body is required');
  }

  return { title, summary, minutes, category, icon, body: paragraphs };
}
